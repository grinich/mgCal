import { describe, expect, it } from 'vitest'
import { titleDate } from '../src/app/state/signals'

// Sep/Oct 2026: Mon 28, Tue 29, Wed 30, Thu Oct 1 … Sat 3, Sun 4.
const SAT_OCT_3 = new Date(2026, 9, 3, 9, 30)
const SUN_OCT_4 = new Date(2026, 9, 4, 9, 30)
const month = (d: Date) => d.getMonth()
const SEP = 8
const OCT = 9

describe('titleDate', () => {
  it('names a week by its first day on screen, not by the anchor', () => {
    // Monday-start: Mon Sep 28 – Sun Oct 4 contains Oct 3 and Oct 4 alike.
    expect(month(titleDate('week', SAT_OCT_3, 1))).toBe(SEP)
    expect(month(titleDate('week', SUN_OCT_4, 1))).toBe(SEP)
    // Sunday-start: Sun Sep 27 – Sat Oct 3 is September; Sun Oct 4 opens October.
    expect(month(titleDate('week', SAT_OCT_3, 0))).toBe(SEP)
    expect(month(titleDate('week', SUN_OCT_4, 0))).toBe(OCT)
  })

  it('leaves day and month views on the anchor itself', () => {
    expect(titleDate('day', SAT_OCT_3, 1).getTime()).toBe(SAT_OCT_3.getTime())
    expect(titleDate('month', SAT_OCT_3, 1).getTime()).toBe(SAT_OCT_3.getTime())
  })
})
