import { describe, expect, it } from 'vitest'
import {
  getCount,
  presetRule,
  replaceCount,
  stripCount,
  truncateRecurrence,
  untilBefore,
} from '../src/data/rrule'

describe('untilBefore', () => {
  it('backs a timed split point off by one second, in UTC basic format', () => {
    expect(untilBefore({ dateTime: '2026-03-10T17:30:00.000Z' })).toBe('20260310T172959Z')
  })

  it('uses the previous day for all-day series, with no time part', () => {
    expect(untilBefore({ date: '2026-03-10' })).toBe('20260309')
  })

  it('crosses a month boundary when the split is on the 1st', () => {
    expect(untilBefore({ date: '2026-03-01' })).toBe('20260228')
  })
})

describe('truncateRecurrence', () => {
  it('replaces an existing UNTIL rather than appending a second one', () => {
    const out = truncateRecurrence(['RRULE:FREQ=WEEKLY;UNTIL=20270101T000000Z'], '20260310T172959Z')
    expect(out).toEqual(['RRULE:FREQ=WEEKLY;UNTIL=20260310T172959Z'])
  })

  it('converts a COUNT bound into an UNTIL bound', () => {
    const out = truncateRecurrence(['RRULE:FREQ=DAILY;COUNT=10'], '20260310')
    expect(out).toEqual(['RRULE:FREQ=DAILY;UNTIL=20260310'])
    expect(getCount(out)).toBeUndefined()
  })

  it('preserves BYDAY and leaves non-RRULE lines (EXDATE) untouched', () => {
    const out = truncateRecurrence(
      ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'EXDATE;TZID=America/Los_Angeles:20260316T090000'],
      '20260310',
    )
    expect(out[0]).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260310')
    expect(out[1]).toBe('EXDATE;TZID=America/Los_Angeles:20260316T090000')
  })
})

describe('COUNT helpers', () => {
  it('reads COUNT only when present, and not from a lookalike value', () => {
    expect(getCount(['RRULE:FREQ=DAILY;COUNT=7'])).toBe(7)
    expect(getCount(['RRULE:FREQ=DAILY;INTERVAL=2'])).toBeUndefined()
    // BYSETPOS=-1 must not be mistaken for a COUNT bound.
    expect(getCount(['RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=FR'])).toBeUndefined()
  })

  it('strips COUNT without disturbing the rest of the rule', () => {
    expect(stripCount(['RRULE:FREQ=WEEKLY;COUNT=5;BYDAY=TU'])).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU'])
  })

  it('rebalances COUNT for the tail series, dropping any UNTIL', () => {
    expect(replaceCount(['RRULE:FREQ=DAILY;COUNT=10;UNTIL=20270101'], 4)).toEqual([
      'RRULE:FREQ=DAILY;COUNT=4',
    ])
  })
})

describe('presetRule', () => {
  it('anchors a weekly rule to the start date’s weekday', () => {
    // 2026-03-10 is a Tuesday.
    expect(presetRule('weekly', new Date(2026, 2, 10))).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU'])
  })

  it('has no rule for a non-repeating event', () => {
    expect(presetRule('none', new Date(2026, 2, 10))).toBeUndefined()
  })

  it('builds a Mon-Fri rule for the weekdays preset', () => {
    expect(presetRule('weekdays', new Date(2026, 2, 10))).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'])
  })
})
