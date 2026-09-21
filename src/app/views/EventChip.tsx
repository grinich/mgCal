import type { EventRow } from '../../data/types'
import { chipTextColor, eventColorHex } from '../colors'
import { cleanLocation, locationHref } from '../location'
import { calendarById, clearSelection, openEdit, selectedKey, setSelected } from '../state/signals'
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

export function toggleSelect(e: EventRow): void {
  if (wasDragged()) return
  const k = eventKey(e)
  if (selectedKey.value === k) clearSelection()
  else setSelected(k)
}

function canEdit(e: EventRow): boolean {
  // Server enforces real permissions; this just avoids futile drags on read-only calendars.
  return true
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
  // Below one comfortable text line, scale the font to the chip instead of
  // overflowing into the neighbor below.
  const tiny = height < 17
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
        (tiny ? ' tiny' : '') +
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
        ...(tiny ? { '--chip-fs': `${Math.max(8, Math.floor(height) - 4)}px` } : null),
      }}
      onPointerDown={(e) => geom && canEdit(ev) && startEventDrag(e, ev, 'move', geom)}
      onClick={(e) => {
        e.stopPropagation()
        toggleSelect(ev)
      }}
      onDblClick={(e) => {
        e.stopPropagation()
        openEdit(ev)
      }}
    >
      <div class="chip-title">{ev.summary || '(no title)'}</div>
      <div class="chip-time">{fmtTime(ev.startMs)}</div>
      {ev.location && height >= 50 && <LocationLink loc={ev.location} cls="chip-loc" />}
      {geom && canEdit(ev) && (
        <div class="resize-handle" onPointerDown={(e) => startEventDrag(e, ev, 'resize', geom)} />
      )}
    </div>
  )
}
