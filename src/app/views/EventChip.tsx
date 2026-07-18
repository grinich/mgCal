import { useState } from 'preact/hooks'
import { patchEventScoped, rsvpEvent } from '../../data/outbox'
import type { EventRow } from '../../data/types'
import { chipTextColor, EVENT_COLORS, eventColorHex } from '../colors'
import { cleanLocation, locationHref } from '../location'
import { askScope, calendarById, openEdit, selectedAnchor, selectedKey } from '../state/signals'
import { fmtTime } from '../time'
import { drag, startEventDrag, wasDragged, type GridGeom } from './drag'

export function eventKey(e: EventRow): string {
  return `${e.calendarId}|${e.id}`
}

export function chipColor(e: EventRow): string {
  return (
    eventColorHex(e.colorId) ?? calendarById.value.get(e.calendarId)?.backgroundColor ?? 'var(--accent)'
  )
}

export function isDeclined(e: EventRow): boolean {
  return e.attendees?.some((a) => a.self && a.responseStatus === 'declined') ?? false
}

export function toggleSelect(e: EventRow, el?: HTMLElement): void {
  if (wasDragged()) return
  const k = eventKey(e)
  if (selectedKey.value === k) {
    selectedKey.value = null
    selectedAnchor.value = null
  } else {
    selectedKey.value = k
    if (el) {
      const r = el.getBoundingClientRect()
      selectedAnchor.value = { x: r.x, y: r.y, w: r.width, h: r.height }
    } else {
      selectedAnchor.value = null
    }
  }
}

function canEdit(e: EventRow): boolean {
  // Server enforces real permissions; this just avoids futile drags on read-only calendars.
  return true
}

/** Color + category pill in the hover card; click to reassign the colorId. */
function CategoryPicker({ ev }: { ev: EventRow }) {
  const [open, setOpen] = useState(false)
  const current = ev.colorId ? EVENT_COLORS[ev.colorId] : undefined
  const calColor = calendarById.value.get(ev.calendarId)?.backgroundColor ?? 'var(--accent)'

  const set = (colorId: string) => {
    setOpen(false)
    if ((ev.colorId ?? '') === colorId) return
    void askScope(ev, 'edit').then((scope) => {
      if (!scope) return
      // Empty = revert to calendar color (null clears server-side).
      void patchEventScoped(ev, { colorId: (colorId || null) as unknown as string }, scope)
    })
  }

  return (
    <div class="cat-pick" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <button class="cat-btn" title="Change category" onClick={() => setOpen(!open)}>
        <span class="cat-dot" style={{ background: current?.hex ?? calColor }} />
        <span class="cat-label">{current ? (current.label ?? current.name) : 'Category'}</span>
        <span class="cat-chev">▾</span>
      </button>
      {open && (
        <div class="cat-menu">
          <button class={'cat-item' + (!ev.colorId ? ' active' : '')} onClick={() => set('')}>
            <span class="cat-dot" style={{ background: calColor }} />
            Calendar default
          </button>
          {Object.values(EVENT_COLORS).map((c) => (
            <button
              key={c.id}
              class={'cat-item' + (ev.colorId === c.id ? ' active' : '')}
              onClick={() => set(c.id)}
            >
              <span class="cat-dot" style={{ background: c.hex }} />
              {c.label ?? c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function LocationLink({ loc, cls }: { loc: string; cls: string }) {
  return (
    <a
      class={cls}
      href={locationHref(loc)}
      target="_blank"
      rel="noreferrer"
      title={loc}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      📍 {cleanLocation(loc)}
    </a>
  )
}

/** Timed event chip, absolutely positioned by the caller. */
export function EventChip({
  ev,
  top,
  height,
  leftPct,
  widthPct,
  z,
  geom,
}: {
  ev: EventRow
  top: number
  height: number
  leftPct: number
  widthPct: number
  z: number
  geom?: GridGeom
}) {
  const c = chipColor(ev)
  const key = eventKey(ev)
  const selected = selectedKey.value === key
  const compact = height < 32
  const d = drag.value
  const beingDragged = d?.kind === 'event' && eventKey(d.ev) === key
  const declined = isDeclined(ev)
  const self = ev.attendees?.find((a) => a.self)
  const needsAction = !declined && self?.responseStatus === 'needsAction'
  const tentative = !declined && self?.responseStatus === 'tentative'

  return (
    <div
      class={
        'chip' +
        (compact ? ' compact' : '') +
        (selected ? ' selected' : '') +
        (declined ? ' declined' : '') +
        (needsAction ? ' needs-action' : '') +
        (tentative ? ' tentative' : '') +
        (ev.pending ? ' pending' : '') +
        (beingDragged ? ' dragging' : '')
      }
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPct}% + 1px)`,
        width: `calc(${widthPct}% - 3px)`,
        '--z': z,
        '--c': c,
        '--ct': chipTextColor(c),
      }}
      onPointerDown={(e) => geom && canEdit(ev) && startEventDrag(e, ev, 'move', geom)}
      onClick={(e) => {
        e.stopPropagation()
        toggleSelect(ev, e.currentTarget as HTMLElement)
      }}
      onDblClick={(e) => {
        e.stopPropagation()
        openEdit(ev)
      }}
    >
      <div class="chip-title">{ev.summary || '(no title)'}</div>
      <div class="chip-time">{fmtTime(ev.startMs)}</div>
      {ev.location && height >= 50 && <LocationLink loc={ev.location} cls="chip-loc" />}
      {/* Hover card: expands below the title "tab", so neighboring tabs on the
          same row stay reachable as the cursor travels across. */}
      <div class="chip-card">
        <div class="chip-card-row1">
          <div class="chip-card-title">{ev.summary || '(no title)'}</div>
          <CategoryPicker ev={ev} />
        </div>
        <div class="chip-time">
          {fmtTime(ev.startMs)} – {fmtTime(ev.endMs)}
        </div>
        {ev.location && <LocationLink loc={ev.location} cls="chip-card-loc" />}
        {self && (
          <div
            class="chip-card-rsvp"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <span class="chip-rsvp-label">Going?</span>
            <button
              class={'chip-rsvp-btn' + (self.responseStatus === 'accepted' ? ' active' : '')}
              onClick={() => void rsvpEvent(ev, 'accepted')}
            >
              Yes
            </button>
            <button
              class={'chip-rsvp-btn' + (declined ? ' active' : '')}
              onClick={() => void rsvpEvent(ev, 'declined')}
            >
              No
            </button>
          </div>
        )}
      </div>
      {geom && canEdit(ev) && (
        <div class="resize-handle" onPointerDown={(e) => startEventDrag(e, ev, 'resize', geom)} />
      )}
    </div>
  )
}
