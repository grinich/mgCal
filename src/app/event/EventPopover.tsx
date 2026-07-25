import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { deleteEventScoped, rsvpEvent } from '../../data/outbox'
import type { EventRow, GAttendee } from '../../data/types'
import { askScope, calendarById, editor, openEdit, selectedAnchor, selectedEvent, selectedKey } from '../state/signals'
import { DAY, fmtTime } from '../time'
import { chipColor } from '../views/EventChip'
import { eventColorLabel } from '../colors'
import { locationHref } from '../location'
import { ZoomIcon, ZoomJoinLink, zoomLink } from '../zoom'

const W = 340

const RSVP_LABEL: Record<string, string> = { accepted: 'Yes', tentative: 'Maybe', declined: 'No' }

function Icon({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d={d} />
    </svg>
  )
}

/** Heuristic: the API doesn't flag Google Groups among attendees, but list
 * addresses and team-ish display names are a strong signal. */
export function isGroupAttendee(a: GAttendee): boolean {
  const local = (a.email ?? '').split('@')[0]?.toLowerCase() ?? ''
  if (/^(team|all|everyone|staff|employees|eng(ineering)?|members)$/.test(local)) return true
  if (local.includes('-') && !!a.displayName) return true // e.g. developer-success@
  return !!a.displayName && /(team|employees|group|staff|everyone|managers|engineers|success)/i.test(a.displayName)
}

const I = {
  clock: 'M8 4.5V8l2.3 1.4 M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0z',
  pin: 'M8 14.5s4.7-4.1 4.7-7.8a4.7 4.7 0 1 0-9.4 0C3.3 10.4 8 14.5 8 14.5z M8 8.2a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z',
  people: 'M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M1.5 13.5c0-2.2 2-3.7 4.5-3.7s4.5 1.5 4.5 3.7 M11 7.3a2.3 2.3 0 0 0 0-4.5 M12 10.2c1.5.4 2.5 1.5 2.5 3',
  notes: 'M3 3h10 M3 6.5h10 M3 10h6.5',
  cal: 'M3 3.5h10v10H3z M3 6.5h10 M6 2v2.5 M10 2v2.5',
  repeat: 'M11 2.5l2 2-2 2 M13 4.5H5.5a3 3 0 0 0-3 3v.5 M5 13.5l-2-2 2-2 M3 11.5h7.5a3 3 0 0 0 3-3V8',
  chevron: 'M5 6.5l3 3 3-3',
  pencil: 'M9.5 3.2l3.3 3.3-7.3 7.3-3.6.3.3-3.6 7.3-7.3z M8.3 4.4l3.3 3.3',
  trash: 'M2.5 4h11 M5.5 4V2.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4 M4 4l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4 M6.7 7v4 M9.3 7v4',
  close: 'M3.5 3.5l9 9 M12.5 3.5l-9 9',
  video: 'M2 4.5h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z M11 7l4-2.2v6.4L11 9',
}

const AVATAR_COLORS = ['#4f6bed', '#188038', '#f4511e', '#8e24aa', '#0b8043', '#e67c73', '#f6bf26', '#039be5']

function avatarColor(email: string): string {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!
}

function initials(a: GAttendee): string {
  const src = a.displayName || a.email || '?'
  const parts = src.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function whenLines(ev: EventRow): [string, string?] {
  const s = new Date(ev.startMs)
  const dateOf = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  if (ev.allDay) {
    const endIncl = ev.endMs - DAY
    if (endIncl <= ev.startMs) return [s.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }), 'All day']
    return [`${dateOf(ev.startMs)} – ${dateOf(endIncl)}`, 'All day']
  }
  const sameDay = new Date(ev.endMs).toDateString() === s.toDateString()
  const dateStr = s.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const timeStr = sameDay
    ? `${fmtTime(ev.startMs)} – ${fmtTime(ev.endMs)}`
    : `${dateOf(ev.startMs)} ${fmtTime(ev.startMs)} – ${dateOf(ev.endMs)} ${fmtTime(ev.endMs)}`
  return [dateStr, timeStr]
}

export function EventPopover() {
  const ev = selectedEvent()
  if (!ev || editor.value) return null
  return <Popover key={`${ev.calendarId}|${ev.id}`} ev={ev} />
}

type GroupState = string[] | 'loading' | 'error' | undefined

function Popover({ ev }: { ev: EventRow }) {
  const ref = useRef<HTMLDivElement>(null)
  const [guestsExpanded, setGuestsExpanded] = useState(false)
  const [groupMembers, setGroupMembers] = useState<Record<string, GroupState>>({})

  function toggleGroup(email: string): void {
    const cur = groupMembers[email]
    if (cur && cur !== 'error') {
      setGroupMembers({ ...groupMembers, [email]: undefined })
      return
    }
    setGroupMembers({ ...groupMembers, [email]: 'loading' })
    chrome.runtime
      .sendMessage({ type: 'expandGroup', email })
      .then((r: { ok?: boolean; members?: string[] }) =>
        setGroupMembers((m) => ({ ...m, [email]: r?.ok && Array.isArray(r.members) ? r.members : 'error' })),
      )
      .catch(() => setGroupMembers((m) => ({ ...m, [email]: 'error' })))
  }
  const [pos, setPos] = useState<{ left: number; top: number; visibility?: string }>({
    left: -9999, top: 0, visibility: 'hidden',
  })

  useLayoutEffect(() => {
    const a = selectedAnchor.value
    const h = ref.current?.offsetHeight ?? 400
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (!a) {
      setPos({ left: vw - W - 16, top: 60 })
      return
    }
    let left = a.x + a.w + 10
    if (left + W > vw - 8) left = a.x - W - 10
    if (left < 8) left = Math.min(Math.max(8, a.x + a.w / 2 - W / 2), vw - W - 8)
    const top = Math.min(Math.max(8, a.y), Math.max(8, vh - h - 12))
    setPos({ left, top })
  }, [ev])

  // Click outside closes (chips manage their own selection toggling).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('.peek, .chip, .lane-chip, .month-chip, .search-result, .overlay')) return
      selectedKey.value = null
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  const cal = calendarById.value.get(ev.calendarId)
  const self = ev.attendees?.find((a) => a.self)
  const guests = (ev.attendees ?? []).filter((a) => !a.email?.endsWith('resource.calendar.google.com'))
  const groups = guests.filter(isGroupAttendee)
  const people = guests.filter((a) => !isGroupAttendee(a))
  const shownPeople = guestsExpanded ? people : people.slice(0, 8)
  const collapsible = people.length > 8
  const counts = { accepted: 0, declined: 0, tentative: 0, needsAction: 0 }
  for (const g of people) counts[g.responseStatus ?? 'needsAction']++
  const [dateStr, timeStr] = whenLines(ev)

  const del = () => {
    void askScope(ev, 'delete').then((scope) => {
      if (!scope) return
      void deleteEventScoped(ev, scope)
      selectedKey.value = null
    })
  }

  return (
    <div class="peek" ref={ref} style={{ width: `${W}px`, ...pos, '--c': chipColor(ev) }}>
      <div class="peek-toolbar">
        <button class="icon-btn" title="Edit (e)" onClick={() => openEdit(ev)}>
          <Icon d={I.pencil} size={14} />
        </button>
        <button class="icon-btn" title="Delete (⌫)" onClick={del}>
          <Icon d={I.trash} size={14} />
        </button>
        <div class="peek-toolbar-sep" />
        <button class="icon-btn" title="Close (Esc)" onClick={() => (selectedKey.value = null)}>
          <Icon d={I.close} size={13} />
        </button>
      </div>

      <div class="peek-head">
        <span class="peek-swatch" />
        <div class="peek-head-text">
          <div class="peek-title">{ev.summary || '(no title)'}</div>
          <div class="peek-date">{dateStr}</div>
          {timeStr && <div class="peek-timerange">{timeStr}</div>}
        </div>
      </div>

      {ev.recurringEventId && (
        <div class="peek-row">
          <span class="peek-icon"><Icon d={I.repeat} /></span>
          <span class="muted">Repeats</span>
        </div>
      )}

      {zoomLink(ev) && (
        <ZoomJoinLink cls="peek-meet zoom" url={zoomLink(ev)!}>
          <ZoomIcon size={15} />
          Join Zoom
        </ZoomJoinLink>
      )}

      {ev.hangoutLink && (
        <a class="peek-meet" href={ev.hangoutLink} target="_blank" rel="noreferrer">
          <Icon d={I.video} />
          Join video call
        </a>
      )}

      {ev.location && (
        <div class="peek-row">
          <span class="peek-icon"><Icon d={I.pin} /></span>
          <a class="peek-row-text peek-loc-link" href={locationHref(ev.location)} target="_blank" rel="noreferrer">
            {ev.location}
          </a>
        </div>
      )}

      {guests.length > 0 && (
        <div class="peek-row">
          <span class="peek-icon"><Icon d={I.people} /></span>
          <div class="peek-guests">
            <button
              class="peek-guest-summary"
              disabled={!collapsible}
              onClick={() => setGuestsExpanded(!guestsExpanded)}
            >
              {guests.length} guest{guests.length > 1 ? 's' : ''}
              <span class="muted">
                {[
                  counts.accepted && `${counts.accepted} yes`,
                  counts.declined && `${counts.declined} no`,
                  counts.tentative && `${counts.tentative} maybe`,
                  counts.needsAction && `${counts.needsAction} awaiting`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {collapsible && (
                <span class={'peek-chevron' + (guestsExpanded ? ' open' : '')}>
                  <Icon d={I.chevron} size={13} />
                </span>
              )}
            </button>
            <div class="peek-guest-list">
              {groups.map((a) => {
                const state = groupMembers[a.email]
                return (
                  <div key={a.email}>
                    <button class="peek-guest peek-guest-btn" onClick={() => toggleGroup(a.email)}>
                      <span class="peek-avatar peek-avatar-group">
                        <Icon d={I.people} size={11} />
                      </span>
                      <span class="peek-guest-name">{a.displayName || a.email}</span>
                      <span class="peek-guest-tag">group</span>
                      <span class={'peek-chevron' + (Array.isArray(state) ? ' open' : '')}>
                        <Icon d={I.chevron} size={12} />
                      </span>
                    </button>
                    {state === 'loading' && <div class="peek-member muted">Loading members…</div>}
                    {state === 'error' && <div class="peek-member muted">Couldn't load members</div>}
                    {Array.isArray(state) && (
                      <div class="peek-members">
                        {state.length ? (
                          state.map((m) => (
                            <div key={m} class="peek-member">
                              <span class="peek-avatar peek-avatar-sm" style={{ background: avatarColor(m) }}>
                                {initials({ email: m })}
                              </span>
                              {m}
                            </div>
                          ))
                        ) : (
                          <div class="peek-member muted">No visible members</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {shownPeople.map((a) => (
                <div key={a.email} class="peek-guest">
                  <span class="peek-avatar" style={{ background: avatarColor(a.email ?? '') }}>
                    {initials(a)}
                    <span class={'peek-rsvp-dot ' + (a.responseStatus ?? 'needsAction')} />
                  </span>
                  <span class={'peek-guest-name' + (a.responseStatus === 'declined' ? ' declined' : '')}>
                    {a.displayName || a.email}
                  </span>
                  {a.organizer && <span class="peek-guest-tag">organizer</span>}
                </div>
              ))}
              {collapsible && !guestsExpanded && (
                <button class="peek-more-btn" onClick={() => setGuestsExpanded(true)}>
                  <span class="peek-chevron"><Icon d={I.chevron} size={13} /></span>
                  {people.length - 8} more
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {ev.description && (
        <div class="peek-row">
          <span class="peek-icon"><Icon d={I.notes} /></span>
          <DescriptionHtml html={ev.description} />
        </div>
      )}

      {cal && (
        <div class="peek-row">
          <span class="peek-icon"><Icon d={I.cal} /></span>
          <span class="peek-row-text muted">
            {cal.summary}
            {eventColorLabel(ev.colorId) && (
              <span class="peek-color-tag">
                <span class="peek-color-dot" />
                {eventColorLabel(ev.colorId)}
              </span>
            )}
          </span>
        </div>
      )}

      {self && (
        <div class="peek-rsvp-bar">
          <span class="muted">Going?</span>
          <div class="view-switch">
            {(['accepted', 'tentative', 'declined'] as const).map((r) => (
              <button
                key={r}
                class={'seg' + (self.responseStatus === r ? ' active' : '')}
                onClick={() => void rsvpEvent(ev, r)}
              >
                {RSVP_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const ALLOWED_TAGS = new Set(['A', 'B', 'I', 'EM', 'STRONG', 'U', 'BR', 'P', 'UL', 'OL', 'LI', 'SPAN', 'DIV'])

/**
 * Google descriptions may contain limited HTML; keep only safe inline tags.
 *
 * Event descriptions are fully attacker-controlled — anyone who can send you an
 * invite picks their contents — so this returns a live DocumentFragment rather
 * than an HTML string, and DescriptionHtml appends it directly. Serializing back
 * to a string and letting the DOM re-parse it is what makes hand-rolled
 * sanitizers vulnerable to mutation XSS (a tag that survives the allowlist can
 * re-parse into something else entirely); never reintroduce that round trip.
 *
 * Parsing happens inside a <template>, whose content is inert: scripts don't
 * run and no subresource requests fire while we're inspecting it.
 */
function sanitizeDescription(html: string): DocumentFragment {
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  // Snapshot before mutating: unwrapping a node leaves its descendants in place,
  // and they're already in this list, so each one still gets checked.
  for (const el of [...tpl.content.querySelectorAll('*')]) {
    // Namespaced elements (SVG/MathML) report a case-sensitive tagName and so
    // never match the uppercase allowlist — they get unwrapped, as intended.
    if (!ALLOWED_TAGS.has(el.tagName)) {
      el.replaceWith(...el.childNodes)
      continue
    }
    for (const attr of [...el.attributes]) {
      if (el.tagName === 'A' && attr.name === 'href' && /^https?:/i.test(attr.value)) continue
      el.removeAttribute(attr.name)
    }
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noreferrer')
    }
  }
  return tpl.content
}

function DescriptionHtml({ html }: { html: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    el.replaceChildren(sanitizeDescription(html))
  }, [html])
  return <div class="peek-desc" ref={host} />
}
