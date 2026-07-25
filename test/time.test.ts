import { describe, expect, it } from 'vitest'
import { addDays, addMonths, isSameDay, startOfDay, startOfWeek, wallHours } from '../src/app/time'

// TZ is pinned to America/Los_Angeles by vitest.config.ts. In 2026 that means
// DST starts Sun Mar 8 (a 23-hour day) and ends Sun Nov 1 (a 25-hour day) —
// the transitions that caused the date-drift and chip-positioning bugs.
const SPRING_FORWARD = new Date(2026, 2, 8)
const FALL_BACK = new Date(2026, 10, 1)

describe('addDays across DST', () => {
  it('advances the calendar date over spring forward, not a fixed 24 hours', () => {
    const from = new Date(2026, 2, 7, 12, 0)
    const next = addDays(from, 1)
    expect(next.getDate()).toBe(8)
    expect(next.getHours()).toBe(12) // same wall clock, despite the 23-hour day
  })

  it('advances the calendar date over fall back', () => {
    const next = addDays(new Date(2026, 9, 31, 12, 0), 1)
    expect(next.getMonth()).toBe(10)
    expect(next.getDate()).toBe(1)
    expect(next.getHours()).toBe(12)
  })

  it('walks a full week through a transition without skipping or repeating a day', () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(2026, 2, 5), i).getDate())
    expect(days).toEqual([5, 6, 7, 8, 9, 10, 11])
  })

  it('steps backwards across a transition too', () => {
    expect(addDays(new Date(2026, 2, 8, 12, 0), -1).getDate()).toBe(7)
  })
})

describe('startOfDay / startOfWeek', () => {
  it('lands on local midnight even on a short day', () => {
    const s = startOfDay(new Date(2026, 2, 8, 15, 30))
    expect(s.getHours()).toBe(0)
    expect(s.getDate()).toBe(8)
  })

  it('finds Sunday by default and Monday when asked', () => {
    // 2026-03-11 is a Wednesday.
    const wed = new Date(2026, 2, 11, 9, 0)
    expect(startOfWeek(wed).getDate()).toBe(8)
    expect(startOfWeek(wed).getDay()).toBe(0)
    expect(startOfWeek(wed, 1).getDate()).toBe(9)
    expect(startOfWeek(wed, 1).getDay()).toBe(1)
  })

  it('is idempotent when the day already starts the week', () => {
    expect(startOfWeek(SPRING_FORWARD).getDate()).toBe(8)
    expect(startOfWeek(FALL_BACK, 0).getDate()).toBe(1)
  })
})

describe('addMonths', () => {
  it('moves month by month', () => {
    expect(addMonths(new Date(2026, 0, 15), 1).getMonth()).toBe(1)
  })

  it('rolls the year over', () => {
    const d = addMonths(new Date(2026, 11, 15), 1)
    expect(d.getFullYear()).toBe(2027)
    expect(d.getMonth()).toBe(0)
  })
})

describe('isSameDay', () => {
  it('separates adjacent days and matches within one', () => {
    expect(isSameDay(new Date(2026, 2, 8, 0, 30), new Date(2026, 2, 8, 23, 30))).toBe(true)
    expect(isSameDay(new Date(2026, 2, 8, 23, 59), new Date(2026, 2, 9, 0, 1))).toBe(false)
  })

  it('does not match the same day-of-month in a different month or year', () => {
    expect(isSameDay(new Date(2026, 2, 8), new Date(2026, 3, 8))).toBe(false)
    expect(isSameDay(new Date(2026, 2, 8), new Date(2027, 2, 8))).toBe(false)
  })
})

describe('wallHours', () => {
  const dayStart = startOfDay(SPRING_FORWARD).getTime()
  const dayEnd = startOfDay(addDays(SPRING_FORWARD, 1)).getTime()

  it('positions by the wall clock on a 23-hour day', () => {
    // Elapsed-time math would report 10 here, pushing the chip an hour late.
    const nineAm = new Date(2026, 2, 8, 9, 0).getTime()
    expect(wallHours(nineAm, dayStart, dayEnd)).toBe(9)
  })

  it('handles a 25-hour day the same way', () => {
    const start = startOfDay(FALL_BACK).getTime()
    const end = startOfDay(addDays(FALL_BACK, 1)).getTime()
    expect(wallHours(new Date(2026, 10, 1, 9, 0).getTime(), start, end)).toBe(9)
  })

  it('includes fractional minutes', () => {
    expect(wallHours(new Date(2026, 2, 8, 9, 30).getTime(), dayStart, dayEnd)).toBe(9.5)
  })

  it('clamps events that start before or end after the day', () => {
    expect(wallHours(dayStart - 5 * 3600_000, dayStart, dayEnd)).toBe(0)
    expect(wallHours(dayEnd + 5 * 3600_000, dayStart, dayEnd)).toBe(24)
  })
})
