import type { EventRow } from '../../data/types'
import { addDays, DAY, hourH, wallHours } from '../time'

export interface Positioned {
  ev: EventRow
  top: number
  height: number
  leftPct: number
  widthPct: number
  z: number
}

/** Timed events for one day column. Overlap clusters lay out as a Google-style
 * cascade: chips expand ~70% into the next slot and later columns stack on
 * top, so a dense cluster gets narrow but every event stays on the grid — a
 * meeting is never collapsed out of sight behind a counter. */
export function layoutDay(events: EventRow[], dayStartMs: number, dayEndMs: number): Positioned[] {
  const items = events
    .map((ev) => {
      const start = Math.max(ev.startMs, dayStartMs)
      const end = Math.min(Math.max(ev.endMs, ev.startMs + 15 * 60_000), dayEndMs)
      return { ev, start, end }
    })
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const chips: Positioned[] = []
  let cluster: { ev: EventRow; start: number; end: number; col: number }[] = []
  let clusterEnd = -Infinity

  const yOf = (ms: number) => wallHours(ms, dayStartMs, dayEndMs) * hourH.value

  const flush = () => {
    if (!cluster.length) return
    // First-fit in start order: the classic interval-graph colouring, which
    // also puts the earliest event leftmost.
    const colIntervals: { start: number; end: number }[][] = []
    for (const c of cluster) {
      let col = 0
      while (colIntervals[col]?.some((iv) => iv.start < c.end && iv.end > c.start)) col++
      ;(colIntervals[col] ??= []).push({ start: c.start, end: c.end })
      c.col = col
    }
    const cols = Math.max(...cluster.map((c) => c.col)) + 1
    const slot = 100 / cols

    for (const c of cluster) {
      // Nearest column to the right whose chip overlaps in time — we may
      // expand up to 70% into its slot (it renders on top of us).
      let next = cols
      for (const o of cluster) {
        if (o.col > c.col && o.col < next && o.start < c.end && o.end > c.start) next = o.col
      }
      const leftPct = c.col * slot
      const widthPct =
        next < cols ? Math.min(100 - leftPct, (next - c.col) * slot + slot * 0.7) : 100 - leftPct
      chips.push({
        ev: c.ev,
        top: yOf(c.start),
        // True slot height, tiny floor only: padding a chip up to a readable
        // minimum makes back-to-back short events overlap even though their
        // TIMES don't — instead EventChip shrinks its text to fit.
        height: Math.max(yOf(c.end) - yOf(c.start) - 2, 7),
        leftPct,
        widthPct,
        z: 2 + c.col,
      })
    }

    cluster = []
    clusterEnd = -Infinity
  }

  for (const it of items) {
    if (it.start >= clusterEnd) flush()
    cluster.push({ ...it, col: 0 })
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  flush()
  return chips
}

export interface Lane {
  ev: EventRow
  lane: number
  startCol: number // 0-based day index
  span: number // number of day columns
  clipsLeft: boolean
  clipsRight: boolean
}

/** All-day / multi-day chips across a row of day columns. Columns come from
 * real day boundaries (not rowStartMs + n*DAY), so DST-length days don't
 * shift chips into the wrong column. */
export function layoutLanes(events: EventRow[], days: Date[]): Lane[] {
  const numDays = days.length
  // bounds[i] = start of column i; bounds[numDays] = end of the row
  const bounds = [...days.map((d) => d.getTime()), addDays(days[numDays - 1]!, 1).getTime()]
  const rowStartMs = bounds[0]!
  const rowEndMs = bounds[numDays]!
  const items = events
    .filter((e) => e.startMs < rowEndMs && e.endMs > rowStartMs)
    .sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs)
  const laneEnds: number[] = []
  const out: Lane[] = []
  for (const ev of items) {
    let startCol = 0
    while (startCol < numDays - 1 && ev.startMs >= bounds[startCol + 1]!) startCol++
    // exclusive end; timed multi-day events round up to whole days
    let endCol = startCol + 1
    while (endCol < numDays && bounds[endCol]! < ev.endMs) endCol++
    let lane = 0
    while ((laneEnds[lane] ?? -1) > startCol - 1) lane++
    laneEnds[lane] = endCol - 1
    out.push({
      ev,
      lane,
      startCol,
      span: Math.max(1, endCol - startCol),
      clipsLeft: ev.startMs < rowStartMs,
      clipsRight: ev.endMs > rowEndMs,
    })
  }
  return out
}

/** Where an all-day chip's span lands after dragging `edge` by `n` whole days.
 * Shifts by calendar days, not n*DAY: a DST week has a 23- or 25-hour day and
 * an all-day chip has to stay pinned to local midnight across it. Ends are
 * exclusive, so a one-day event has start === end - 1 day — that's as close as
 * either edge may come to the other. */
export function allDayDragSpan(
  span: { startMs: number; endMs: number },
  edge: 'move' | 'start' | 'end',
  n: number,
): { startMs: number; endMs: number } {
  const shift = (ms: number, k: number): number => addDays(new Date(ms), k).getTime()
  if (edge === 'move') return { startMs: shift(span.startMs, n), endMs: shift(span.endMs, n) }
  if (edge === 'start') {
    return { startMs: Math.min(shift(span.startMs, n), shift(span.endMs, -1)), endMs: span.endMs }
  }
  return { startMs: span.startMs, endMs: Math.max(shift(span.endMs, n), shift(span.startMs, 1)) }
}

/** Does this event belong in the all-day strip rather than the hour grid?
 * All-day events plus anything spanning a full day or more. */
export function inAllDayRow(e: EventRow): boolean {
  return e.allDay || e.endMs - e.startMs >= DAY
}

/** Split events into all-day-row events vs timed events. */
export function splitAllDay(events: EventRow[]): { allDay: EventRow[]; timed: EventRow[] } {
  const allDay: EventRow[] = []
  const timed: EventRow[] = []
  for (const e of events) {
    if (inAllDayRow(e)) allDay.push(e)
    else timed.push(e)
  }
  return { allDay, timed }
}
