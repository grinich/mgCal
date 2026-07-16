import type { EventRow } from '../../data/types'
import { DAY, HOUR, HOUR_H } from '../time'

export interface Positioned {
  ev: EventRow
  top: number
  height: number
  leftPct: number
  widthPct: number
  z: number
}

/** Timed events for one day column: cluster overlap partitioning with a
 * Google-style cascade — chips expand ~70% into the next column's slot and
 * later columns stack on top, so titles stay readable in dense clusters. */
export function layoutDay(events: EventRow[], dayStartMs: number): Positioned[] {
  const dayEndMs = dayStartMs + DAY
  const items = events
    .map((ev) => {
      const start = Math.max(ev.startMs, dayStartMs)
      const end = Math.min(Math.max(ev.endMs, ev.startMs + 15 * 60_000), dayEndMs)
      return { ev, start, end }
    })
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const out: Positioned[] = []
  let cluster: { ev: EventRow; start: number; end: number; col: number }[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (!cluster.length) return
    const cols = Math.max(...cluster.map((c) => c.col)) + 1
    const slot = 100 / cols
    for (const c of cluster) {
      // Nearest column to the right containing a chip that overlaps in time —
      // we may expand up to 70% into its slot (it will render on top of us).
      let next = cols
      for (const o of cluster) {
        if (o.col > c.col && o.col < next && o.start < c.end && o.end > c.start) next = o.col
      }
      const leftPct = c.col * slot
      const widthPct =
        next < cols
          ? Math.min(100 - leftPct, (next - c.col) * slot + slot * 0.7)
          : 100 - leftPct
      out.push({
        ev: c.ev,
        top: ((c.start - dayStartMs) / HOUR) * HOUR_H,
        height: Math.max(((c.end - c.start) / HOUR) * HOUR_H - 2, 17),
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
    // greedy: first column whose last event has ended
    const colEnds: number[] = []
    for (const c of cluster) colEnds[c.col] = Math.max(colEnds[c.col] ?? 0, c.end)
    let col = 0
    while ((colEnds[col] ?? 0) > it.start) col++
    cluster.push({ ...it, col })
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  flush()
  return out
}

export interface Lane {
  ev: EventRow
  lane: number
  startCol: number // 0-based day index
  span: number // number of day columns
  clipsLeft: boolean
  clipsRight: boolean
}

/** All-day / multi-day chips across a row of `numDays` starting at rowStartMs. */
export function layoutLanes(events: EventRow[], rowStartMs: number, numDays: number): Lane[] {
  const rowEndMs = rowStartMs + numDays * DAY
  const items = events
    .filter((e) => e.startMs < rowEndMs && e.endMs > rowStartMs)
    .sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs)
  const laneEnds: number[] = []
  const out: Lane[] = []
  for (const ev of items) {
    const startCol = Math.max(0, Math.floor((ev.startMs - rowStartMs) / DAY))
    // exclusive end; timed multi-day events round up to whole days
    const endCol = Math.min(numDays, Math.ceil((ev.endMs - rowStartMs) / DAY))
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

/** Split events into all-day-row events vs timed events. */
export function splitAllDay(events: EventRow[]): { allDay: EventRow[]; timed: EventRow[] } {
  const allDay: EventRow[] = []
  const timed: EventRow[] = []
  for (const e of events) {
    if (e.allDay || e.endMs - e.startMs >= DAY) allDay.push(e)
    else timed.push(e)
  }
  return { allDay, timed }
}
