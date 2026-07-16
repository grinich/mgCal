import type { EventRow } from '../../data/types'
import { calendarById, selectedKey } from '../state/signals'
import { fmtTime } from '../time'

export function eventKey(e: EventRow): string {
  return `${e.calendarId}|${e.id}`
}

export function chipColor(e: EventRow): string {
  return calendarById.value.get(e.calendarId)?.backgroundColor ?? 'var(--accent)'
}

export function isDeclined(e: EventRow): boolean {
  return e.attendees?.some((a) => a.self && a.responseStatus === 'declined') ?? false
}

/** Timed event chip, absolutely positioned by the caller. */
export function EventChip({
  ev,
  top,
  height,
  col,
  cols,
}: {
  ev: EventRow
  top: number
  height: number
  col: number
  cols: number
}) {
  const c = chipColor(ev)
  const key = eventKey(ev)
  const selected = selectedKey.value === key
  const compact = height < 32
  return (
    <div
      class={
        'chip' +
        (selected ? ' selected' : '') +
        (isDeclined(ev) ? ' declined' : '') +
        (ev.pending ? ' pending' : '')
      }
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${(col / cols) * 100}% + 1px)`,
        width: `calc(${100 / cols}% - 3px)`,
        '--c': c,
      }}
      onClick={(e) => {
        e.stopPropagation()
        selectedKey.value = selected ? null : key
      }}
    >
      <div class="chip-title">{ev.summary || '(no title)'}</div>
      {!compact && <div class="chip-time">{fmtTime(ev.startMs)}</div>}
    </div>
  )
}
