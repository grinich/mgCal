import { describe, expect, it } from 'vitest'
import { initialAnchor } from '../src/app/state/signals'

// Aug 2026: Sat 15, Sun 16, Mon 17 … Fri 21, Sat 22, Sun 23.
const SAT = new Date(2026, 7, 15, 9, 30)
const SUN = new Date(2026, 7, 16, 9, 30)
const WED = new Date(2026, 7, 19, 9, 30)

describe('initialAnchor', () => {
  it('opens week view on the week ahead once the weekend trails the week', () => {
    expect(initialAnchor(SAT, 'week', 0).getDate()).toBe(22)
    expect(initialAnchor(SAT, 'week', 1).getDate()).toBe(22)
    expect(initialAnchor(SUN, 'week', 1).getDate()).toBe(23)
  })

  it('stays put on a Sunday that opens the week — the work week is still ahead', () => {
    expect(initialAnchor(SUN, 'week', 0).getTime()).toBe(SUN.getTime())
  })

  it('keeps the time of day, so the grid still scrolls to the same place', () => {
    const a = initialAnchor(SAT, 'week', 0)
    expect([a.getHours(), a.getMinutes()]).toEqual([9, 30])
  })

  it('opens on today midweek', () => {
    expect(initialAnchor(WED, 'week', 0).getTime()).toBe(WED.getTime())
    expect(initialAnchor(WED, 'week', 1).getTime()).toBe(WED.getTime())
  })

  it('leaves day and month views on today, even on a weekend', () => {
    expect(initialAnchor(SAT, 'day', 0).getTime()).toBe(SAT.getTime())
    expect(initialAnchor(SUN, 'month', 1).getTime()).toBe(SUN.getTime())
  })

  it('rolls into the next month when the weekend ends one', () => {
    const a = initialAnchor(new Date(2026, 7, 29), 'week', 0) // Sat Aug 29
    expect([a.getMonth(), a.getDate()]).toEqual([8, 5]) // Sat Sep 5
  })
})
