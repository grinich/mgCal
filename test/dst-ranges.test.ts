import { describe, expect, it } from 'vitest'
import { rangeForView } from '../src/app/state/signals'
import { addDays, startOfDay } from '../src/app/time'

// Tests pin TZ=America/Los_Angeles. In 2026: DST ends Sun Nov 1 (a 25-hour day,
// so that week is 169h) and starts Sun Mar 8 (23-hour day, 167h week).
const FALL_BACK = new Date(2026, 10, 1)
const SPRING_FWD = new Date(2026, 2, 8)
const H = 3600_000

const hours = (r: { startMs: number; endMs: number }) => (r.endMs - r.startMs) / H

describe('rangeForView across DST boundaries', () => {
  it('covers a whole 25-hour day', () => {
    const r = rangeForView('day', FALL_BACK)
    expect(hours(r)).toBe(25)
    expect(new Date(r.endMs).getTime()).toBe(addDays(startOfDay(FALL_BACK), 1).getTime())
  })

  it('covers a whole 23-hour day', () => {
    expect(hours(rangeForView('day', SPRING_FWD))).toBe(23)
  })

  it('ends a fall-back week at midnight, not an hour short', () => {
    const r = rangeForView('week', FALL_BACK)
    expect(hours(r)).toBe(169)
    const end = new Date(r.endMs)
    expect([end.getHours(), end.getDate(), end.getMonth()]).toEqual([0, 8, 10])
  })

  it('ends a spring-forward week at midnight, not an hour over', () => {
    const r = rangeForView('week', SPRING_FWD)
    expect(hours(r)).toBe(167)
    const end = new Date(r.endMs)
    expect([end.getHours(), end.getDate(), end.getMonth()]).toEqual([0, 15, 2])
  })

  it('keeps an event in the last hour of a fall-back Saturday in range', () => {
    const r = rangeForView('week', FALL_BACK)
    const lateSaturday = new Date(2026, 10, 7, 23, 30).getTime()
    expect(lateSaturday).toBeLessThan(r.endMs) // +7*DAY used to stop at 23:00
  })

  it('month grids stay whole weeks', () => {
    for (const d of [FALL_BACK, SPRING_FWD]) {
      const r = rangeForView('month', d)
      expect(hours(r) % 24).not.toBe(0) // the DST hour is inside the grid
      const end = new Date(r.endMs)
      expect(end.getHours()).toBe(0)
    }
  })
})

describe('all-day inclusive end across DST', () => {
  // An all-day event's endMs is exclusive (midnight after the last day).
  // Displaying it means stepping back one CALENDAR day.
  const endIncl = (exclusiveMs: number) => addDays(new Date(exclusiveMs), -1)

  it('lands on the right last day when that day is only 23 hours', () => {
    // Mar 7–8 all-day: exclusive end is Mon Mar 9 00:00.
    const exclusive = new Date(2026, 2, 9).getTime()
    expect(endIncl(exclusive).getDate()).toBe(8)
    // The old arithmetic fell back into Mar 7 at 23:00.
    expect(new Date(exclusive - 24 * H).getDate()).toBe(7)
  })

  it('lands on the right last day when that day is 25 hours', () => {
    const exclusive = new Date(2026, 10, 2).getTime() // Nov 1 all-day
    expect(endIncl(exclusive).getDate()).toBe(1)
  })
})
