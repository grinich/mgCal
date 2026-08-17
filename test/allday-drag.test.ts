import { describe, expect, it } from 'vitest'
import { allDayDragSpan } from '../src/app/views/layout'

// All-day spans are [local midnight, exclusive local midnight). Helpers keep
// the assertions readable as dates rather than epoch numbers.
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime()
const span = (from: number, to: number) => ({ startMs: from, endMs: to })
const asDates = (s: { startMs: number; endMs: number }) => [
  new Date(s.startMs).toString(),
  new Date(s.endMs).toString(),
]

describe('allDayDragSpan', () => {
  const jul = span(day(2026, 7, 6), day(2026, 7, 9)) // Mon 6th – Wed 8th, 3 days

  it('moves both ends by the same number of days', () => {
    expect(allDayDragSpan(jul, 'move', 2)).toEqual(span(day(2026, 7, 8), day(2026, 7, 11)))
    expect(allDayDragSpan(jul, 'move', -3)).toEqual(span(day(2026, 7, 3), day(2026, 7, 6)))
  })

  it('is a no-op at zero delta, so a click-with-jiggle stays a click', () => {
    expect(allDayDragSpan(jul, 'move', 0)).toEqual(jul)
    expect(allDayDragSpan(jul, 'start', 0)).toEqual(jul)
    expect(allDayDragSpan(jul, 'end', 0)).toEqual(jul)
  })

  it('resizes one edge and leaves the other alone', () => {
    expect(allDayDragSpan(jul, 'start', -2)).toEqual(span(day(2026, 7, 4), day(2026, 7, 9)))
    expect(allDayDragSpan(jul, 'end', 4)).toEqual(span(day(2026, 7, 6), day(2026, 7, 13)))
  })

  it('never lets an edge cross (or meet) the other — one day is the floor', () => {
    const oneDay = span(day(2026, 7, 6), day(2026, 7, 7))
    // Dragging the start way right, or the end way left, bottoms out at 1 day.
    expect(allDayDragSpan(jul, 'start', 99)).toEqual(span(day(2026, 7, 8), day(2026, 7, 9)))
    expect(allDayDragSpan(jul, 'end', -99)).toEqual(span(day(2026, 7, 6), day(2026, 7, 7)))
    expect(allDayDragSpan(oneDay, 'start', 5)).toEqual(oneDay)
    expect(allDayDragSpan(oneDay, 'end', -5)).toEqual(oneDay)
  })

  // TZ is pinned to America/Los_Angeles by vitest.config.ts. Nov 1 2026 is the
  // 25-hour fall-back day: shifting by n*DAY would land an all-day chip on
  // 11pm the day before and drop it into the wrong column.
  it('stays pinned to local midnight across a DST transition', () => {
    const beforeFallBack = span(day(2026, 10, 31), day(2026, 11, 1))
    const moved = allDayDragSpan(beforeFallBack, 'move', 2)
    expect(asDates(moved)).toEqual(asDates(span(day(2026, 11, 2), day(2026, 11, 3))))
    expect(new Date(moved.startMs).getHours()).toBe(0)
    expect(new Date(moved.endMs).getHours()).toBe(0)

    const acrossSpring = allDayDragSpan(span(day(2026, 3, 7), day(2026, 3, 8)), 'end', 3)
    expect(new Date(acrossSpring.endMs).getHours()).toBe(0)
    expect(asDates(acrossSpring)).toEqual(asDates(span(day(2026, 3, 7), day(2026, 3, 11))))
  })

  it('shifts a multi-day timed event by whole days, keeping its wall clock', () => {
    // Long timed events share the strip; they must keep their time of day.
    const timed = span(new Date(2026, 6, 6, 10, 30).getTime(), new Date(2026, 6, 7, 14, 0).getTime())
    const moved = allDayDragSpan(timed, 'move', 1)
    expect(asDates(moved)).toEqual([
      new Date(2026, 6, 7, 10, 30).toString(),
      new Date(2026, 6, 8, 14, 0).toString(),
    ])
  })
})
