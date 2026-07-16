import { deleteEventScoped, rsvpEvent } from '../../data/outbox'
import type { EventRow, GAttendee } from '../../data/types'
import { askScope, calendarById, editor, openEdit, selectedEvent, selectedKey } from '../state/signals'
import { fmtTime } from '../time'
import { chipColor } from '../views/EventChip'

const RSVP_LABEL: Record<string, string> = {
  accepted: 'Going',
  declined: 'Not going',
  tentative: 'Maybe',
  needsAction: '',
}

function timeLabel(ev: EventRow): string {
  const s = new Date(ev.startMs)
  const dateStr = s.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  if (ev.allDay) return dateStr
  return `${dateStr} · ${fmtTime(ev.startMs)} – ${fmtTime(ev.endMs)}`
}

function guestIcon(a: GAttendee): string {
  switch (a.responseStatus) {
    case 'accepted':
      return '✓'
    case 'declined':
      return '✗'
    case 'tentative':
      return '?'
    default:
      return '·'
  }
}

export function EventPopover() {
  const ev = selectedEvent()
  if (!ev || editor.value) return null
  const cal = calendarById.value.get(ev.calendarId)
  const self = ev.attendees?.find((a) => a.self)
  const guests = (ev.attendees ?? []).filter((a) => !a.email?.endsWith('resource.calendar.google.com'))

  return (
    <div class="peek" style={{ '--c': chipColor(ev) }}>
      <div class="peek-head">
        <span class="peek-dot" />
        <div class="peek-title">{ev.summary || '(no title)'}</div>
        <button class="icon-btn" title="Close (Esc)" onClick={() => (selectedKey.value = null)}>
          ✕
        </button>
      </div>
      <div class="peek-time">{timeLabel(ev)}</div>
      {ev.recurringEventId && <div class="peek-row muted">↻ Repeats</div>}
      {ev.location && <div class="peek-row">📍 {ev.location}</div>}
      {cal && <div class="peek-row muted">{cal.summary}</div>}
      {ev.hangoutLink && (
        <a class="btn accent peek-meet" href={ev.hangoutLink} target="_blank" rel="noreferrer">
          Join Google Meet
        </a>
      )}
      {guests.length > 0 && (
        <div class="peek-guests">
          <div class="peek-guests-title">{guests.length} guests</div>
          {guests.slice(0, 12).map((a) => (
            <div key={a.email} class={'peek-guest rsvp-' + (a.responseStatus ?? 'needsAction')}>
              <span class="peek-guest-icon">{guestIcon(a)}</span>
              <span class="peek-guest-name">
                {a.displayName || a.email}
                {a.organizer ? ' (organizer)' : ''}
              </span>
            </div>
          ))}
          {guests.length > 12 && <div class="peek-row muted">+{guests.length - 12} more</div>}
        </div>
      )}
      {self && (
        <div class="peek-rsvp">
          <span class="muted">Going?</span>
          {(['accepted', 'tentative', 'declined'] as const).map((r) => (
            <button
              key={r}
              class={'btn' + (self.responseStatus === r ? ' accent' : '')}
              onClick={() => void rsvpEvent(ev, r)}
            >
              {RSVP_LABEL[r]}
            </button>
          ))}
        </div>
      )}
      {ev.description && <div class="peek-desc" dangerouslySetInnerHTML={{ __html: sanitize(ev.description) }} />}
      <div class="peek-actions">
        <button class="btn" onClick={() => openEdit(ev)}>
          Edit
        </button>
        <button
          class="btn danger"
          onClick={() => {
            void askScope(ev, 'delete').then((scope) => {
              if (!scope) return
              void deleteEventScoped(ev, scope)
              selectedKey.value = null
            })
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

/** Google descriptions may contain limited HTML; keep only safe inline tags. */
function sanitize(html: string): string {
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const ALLOWED = new Set(['A', 'B', 'I', 'EM', 'STRONG', 'U', 'BR', 'P', 'UL', 'OL', 'LI', 'SPAN', 'DIV'])
  const walk = (node: Element | DocumentFragment) => {
    for (const el of [...node.querySelectorAll('*')]) {
      if (!ALLOWED.has(el.tagName)) {
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
  }
  walk(tpl.content)
  return tpl.innerHTML
}
