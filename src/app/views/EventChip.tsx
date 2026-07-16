import type { EventRow } from '../../data/types'
import { eventColorHex, textOnColor } from '../colors'
import { calendarById, openEdit, selectedAnchor, selectedKey } from '../state/signals'
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

/** Locations are often URLs (Zoom links) or long room lists — compact them. */
function cleanLocation(loc: string): string {
  const first = loc.split(',')[0]!.trim()
  if (/^https?:\/\//i.test(first)) {
    try {
      return new URL(first).hostname.replace(/^www\./, '')
    } catch {
      return first
    }
  }
  return loc
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
        '--ct': textOnColor(c),
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
      {ev.location && height >= 50 && <div class="chip-loc">📍 {cleanLocation(ev.location)}</div>}
      {/* Hover card: expands below the title "tab", so neighboring tabs on the
          same row stay reachable as the cursor travels across. */}
      <div class="chip-card">
        <div class="chip-card-title">{ev.summary || '(no title)'}</div>
        <div class="chip-time">
          {fmtTime(ev.startMs)} – {fmtTime(ev.endMs)}
        </div>
        {ev.location && <div class="chip-card-loc">📍 {cleanLocation(ev.location)}</div>}
      </div>
      {geom && canEdit(ev) && (
        <div class="resize-handle" onPointerDown={(e) => startEventDrag(e, ev, 'resize', geom)} />
      )}
    </div>
  )
}
