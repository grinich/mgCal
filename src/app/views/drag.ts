import { signal } from '@preact/signals'
import { patchEventScoped } from '../../data/outbox'
import type { EventRow, GDateTime } from '../../data/types'
import { askScope, openCreate, selectedKey } from '../state/signals'
import { addDays, MIN } from '../time'
import { allDayDragSpan } from './layout'

const SNAP = 15 * MIN

export interface EventDrag {
  kind: 'event'
  ev: EventRow
  mode: 'move' | 'resize'
  startMs: number
  endMs: number
  moved: boolean
}

export interface CreateDrag {
  kind: 'create'
  anchorMs: number
  startMs: number
  endMs: number
  moved: boolean
}

export interface AllDayCreateDrag {
  kind: 'create-allday'
  anchorIdx: number
  startIdx: number
  endIdx: number // inclusive day index into the visible days
  moved: boolean
}

export const drag = signal<EventDrag | CreateDrag | AllDayCreateDrag | null>(null)

let justDragged = false
export function wasDragged(): boolean {
  return justDragged
}

export interface GridGeom {
  /** Pointer position → absolute ms on the grid (clamped to the visible days). */
  timeAt(e: PointerEvent): number
}

export function makeGeom(inner: HTMLElement, days: Date[], gutterPx: number): GridGeom {
  return {
    timeAt(e: PointerEvent): number {
      const rect = inner.getBoundingClientRect()
      const colW = (rect.width - gutterPx) / days.length
      const dayIdx = Math.max(0, Math.min(days.length - 1, Math.floor((e.clientX - rect.left - gutterPx) / colW)))
      const frac = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
      // Grid rows are wall-clock hours: build the time via Date fields, not
      // dayStart + frac*24h, which drifts an hour on DST-transition days.
      const d = days[dayIdx]!
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, Math.round(frac * 24 * 60)).getTime()
    },
  }
}

function snap(ms: number): number {
  return Math.round(ms / SNAP) * SNAP
}

function toGTime(ms: number, allDay: boolean): GDateTime {
  if (allDay) {
    const d = new Date(ms)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return { date: `${y}-${m}-${dd}` }
  }
  return { dateTime: new Date(ms).toISOString() }
}

/** While a drag is live, body.ev-dragging suppresses every chip hover card —
 * otherwise cards pop under the moving cursor and bury the drop target. */
function setDragging(on: boolean): void {
  document.body.classList.toggle('ev-dragging', on)
}

/** Capture so the grid keeps receiving moves (and other elements stop
 * hovering) even when the cursor crosses popovers or leaves the window.
 * Throws on already-released or synthetic pointers — never fatal. */
function capturePointer(e: PointerEvent): void {
  try {
    ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
  } catch {
    /* drag still works, just without capture */
  }
}

/** End of an event drag: push the new span, unless the chip landed exactly
 * where it started (a jiggle, or a drag walked back to the anchor) — that
 * stays a plain click so selection still toggles. */
function commitEventDrag(ev: EventRow, cur: EventDrag): void {
  if (!cur.moved || (cur.startMs === ev.startMs && cur.endMs === ev.endMs)) return
  justDragged = true
  setTimeout(() => (justDragged = false), 0)
  void askScope(ev, 'edit').then((scope) => {
    if (!scope) return // cancelled: chip snaps back (no local write happened)
    void patchEventScoped(ev, { start: toGTime(cur.startMs, ev.allDay), end: toGTime(cur.endMs, ev.allDay) }, scope)
  })
}

export function startEventDrag(e: PointerEvent, ev: EventRow, mode: 'move' | 'resize', geom: GridGeom): void {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  capturePointer(e)
  const grabOffset = geom.timeAt(e) - ev.startMs
  const duration = ev.endMs - ev.startMs
  drag.value = { kind: 'event', ev, mode, startMs: ev.startMs, endMs: ev.endMs, moved: false }
  setDragging(true)

  const onMove = (me: PointerEvent) => {
    const t = geom.timeAt(me)
    const cur = drag.value
    if (cur?.kind !== 'event') return
    if (mode === 'move') {
      const s = snap(t - grabOffset)
      if (s !== cur.startMs) drag.value = { ...cur, startMs: s, endMs: s + duration, moved: true }
    } else {
      const end = Math.max(ev.startMs + SNAP, snap(t))
      if (end !== cur.endMs) drag.value = { ...cur, endMs: end, moved: true }
    }
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    setDragging(false)
    const cur = drag.value
    drag.value = null
    if (cur?.kind === 'event') commitEventDrag(ev, cur)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

/** Move or resize an existing chip in the all-day strip. The strip's geometry
 * is whole days, so everything works off a day-index DELTA from the grab
 * point rather than an absolute day: that keeps a chip whose real start or end
 * is off-screen (clipsLeft/clipsRight) moving by the amount actually dragged.
 * `edge` picks what the drag adjusts — the whole span, or one end of it. */
export function startAllDayEventDrag(
  e: PointerEvent,
  ev: EventRow,
  edge: 'move' | 'start' | 'end',
  days: Date[],
  lane: HTMLElement,
): void {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  capturePointer(e)
  const idxAt = (pe: PointerEvent): number => {
    const rect = lane.getBoundingClientRect()
    const i = Math.floor(((pe.clientX - rect.left) / rect.width) * days.length)
    return Math.max(0, Math.min(days.length - 1, i))
  }
  const anchorIdx = idxAt(e)
  drag.value = {
    kind: 'event',
    ev,
    mode: edge === 'move' ? 'move' : 'resize',
    startMs: ev.startMs,
    endMs: ev.endMs,
    moved: false,
  }
  setDragging(true)

  const onMove = (me: PointerEvent) => {
    const cur = drag.value
    if (cur?.kind !== 'event') return
    const { startMs, endMs } = allDayDragSpan(ev, edge, idxAt(me) - anchorIdx)
    if (startMs !== cur.startMs || endMs !== cur.endMs) drag.value = { ...cur, startMs, endMs, moved: true }
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    setDragging(false)
    const cur = drag.value
    drag.value = null
    if (cur?.kind === 'event') commitEventDrag(ev, cur)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

/** Drag across the all-day strip (or the days header) to create a
 * (multi-)day all-day event. The element under the pointer spans every day
 * column — minus gutterPx of leading gutter — so day index comes from the
 * pointer's horizontal fraction of it. clickCreates makes a plain click
 * create a one-day event (header dates) instead of deselecting (strip). */
export function startAllDayCreateDrag(
  e: PointerEvent,
  days: Date[],
  opts?: { gutterPx?: number; clickCreates?: boolean },
): void {
  if (e.button !== 0) return
  const lane = e.currentTarget as HTMLElement // snapshot: currentTarget is null after dispatch
  const gutter = opts?.gutterPx ?? 0
  // The gutter is a label, not a day. Without this, a click on the header's
  // blank corner clamped to index 0 and quick-added an event on the first day.
  if (e.clientX - lane.getBoundingClientRect().left < gutter) return
  capturePointer(e)
  const idxAt = (pe: PointerEvent): number => {
    const rect = lane.getBoundingClientRect()
    const i = Math.floor(((pe.clientX - rect.left - gutter) / (rect.width - gutter)) * days.length)
    return Math.max(0, Math.min(days.length - 1, i))
  }
  const anchor = idxAt(e)
  drag.value = { kind: 'create-allday', anchorIdx: anchor, startIdx: anchor, endIdx: anchor, moved: false }
  setDragging(true)

  const onMove = (me: PointerEvent) => {
    const cur = drag.value
    if (cur?.kind !== 'create-allday') return
    const i = idxAt(me)
    // A few px of intent also counts as a drag, so a deliberate same-day drag
    // creates a one-day event while a sloppy click still just deselects.
    const moved = cur.moved || i !== cur.anchorIdx || Math.abs(me.clientX - e.clientX) > 4
    const s = Math.min(cur.anchorIdx, i)
    const en = Math.max(cur.anchorIdx, i)
    if (s !== cur.startIdx || en !== cur.endIdx || moved !== cur.moved) {
      drag.value = { ...cur, startIdx: s, endIdx: en, moved }
    }
  }
  const onUp = (ue: PointerEvent) => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    setDragging(false)
    const cur = drag.value
    drag.value = null
    if (cur?.kind !== 'create-allday') return
    if (cur.moved || opts?.clickCreates) {
      justDragged = true
      setTimeout(() => (justDragged = false), 0)
      const startMs = days[cur.startIdx]!.getTime()
      const endMs = addDays(days[cur.endIdx]!, 1).getTime() // exclusive, as all-day ends are
      openCreate(startMs, endMs, true, { x: ue.clientX, y: ue.clientY })
    } else {
      selectedKey.value = null
    }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

export function startCreateDrag(e: PointerEvent, geom: GridGeom): void {
  if (e.button !== 0) return
  capturePointer(e)
  const anchor = Math.floor(geom.timeAt(e) / SNAP) * SNAP
  drag.value = { kind: 'create', anchorMs: anchor, startMs: anchor, endMs: anchor + SNAP, moved: false }
  setDragging(true)

  const onMove = (me: PointerEvent) => {
    const t = snap(geom.timeAt(me))
    const cur = drag.value
    if (cur?.kind !== 'create') return
    const s = Math.min(cur.anchorMs, t)
    const end = Math.max(cur.anchorMs + SNAP, t)
    if (s !== cur.startMs || end !== cur.endMs) drag.value = { ...cur, startMs: s, endMs: end, moved: true }
  }
  const onUp = (ue: PointerEvent) => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    setDragging(false)
    const cur = drag.value
    drag.value = null
    if (cur?.kind !== 'create') return
    if (cur.moved) {
      justDragged = true
      setTimeout(() => (justDragged = false), 0)
      openCreate(cur.startMs, cur.endMs, false, { x: ue.clientX, y: ue.clientY })
    } else {
      selectedKey.value = null
    }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
