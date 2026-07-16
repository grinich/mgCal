import type { EventRow } from '../../data/types'
import { calendarById, openEdit, selectedAnchor, selectedKey } from '../state/signals'
import { fmtTime } from '../time'
import { drag, startEventDrag, wasDragged, type GridGeom } from './drag'

export function eventKey(e: EventRow): string {
  return `${e.calendarId}|${e.id}`
}

export function chipColor(e: EventRow): string {
  return calendarById.value.get(e.calendarId)?.backgroundColor ?? 'var(--accent)'
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

/** Timed event chip, absolutely positioned by the caller. */
export function EventChip({
  ev,
  top,
  height,
  col,
  cols,
  geom,
}: {
  ev: EventRow
  top: number
  height: number
  col: number
  cols: number
  geom?: GridGeom
}) {
  const c = chipColor(ev)
  const key = eventKey(ev)
  const selected = selectedKey.value === key
  const compact = height < 32
  const d = drag.value
  const beingDragged = d?.kind === 'event' && eventKey(d.ev) === key

  return (
    <div
      class={
        'chip' +
        (selected ? ' selected' : '') +
        (isDeclined(ev) ? ' declined' : '') +
        (ev.pending ? ' pending' : '') +
        (beingDragged ? ' dragging' : '')
      }
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${(col / cols) * 100}% + 1px)`,
        width: `calc(${100 / cols}% - 3px)`,
        '--c': c,
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
      {!compact && <div class="chip-time">{fmtTime(ev.startMs)}</div>}
      {geom && canEdit(ev) && (
        <div class="resize-handle" onPointerDown={(e) => startEventDrag(e, ev, 'resize', geom)} />
      )}
    </div>
  )
}
