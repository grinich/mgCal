import { describe, expect, it } from 'vitest'
import { parseIcs } from '../src/data/ics'

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`

describe('parseIcs', () => {
  it('reads a timed event with a TZID', () => {
    const [ev] = parseIcs(
      wrap(
        [
          'BEGIN:VEVENT',
          'SUMMARY:Design review',
          'LOCATION:Conf Rm B',
          'DTSTART;TZID=America/New_York:20260310T090000',
          'DTEND;TZID=America/New_York:20260310T100000',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    )
    expect(ev?.summary).toBe('Design review')
    expect(ev?.location).toBe('Conf Rm B')
    expect(ev?.start).toEqual({ dateTime: '2026-03-10T09:00:00', timeZone: 'America/New_York' })
    expect(ev?.end).toEqual({ dateTime: '2026-03-10T10:00:00', timeZone: 'America/New_York' })
  })

  it('keeps UTC times as UTC, with no timeZone field', () => {
    const [ev] = parseIcs(
      wrap(['BEGIN:VEVENT', 'SUMMARY:Standup', 'DTSTART:20260310T163000Z', 'DTEND:20260310T164500Z', 'END:VEVENT'].join('\r\n')),
    )
    expect(ev?.start).toEqual({ dateTime: '2026-03-10T16:30:00Z' })
    expect(ev?.start?.timeZone).toBeUndefined()
  })

  it('treats VALUE=DATE as all-day with an exclusive end', () => {
    const [ev] = parseIcs(
      wrap(
        ['BEGIN:VEVENT', 'SUMMARY:Offsite', 'DTSTART;VALUE=DATE:20260310', 'DTEND;VALUE=DATE:20260313', 'END:VEVENT'].join('\r\n'),
      ),
    )
    expect(ev?.start).toEqual({ date: '2026-03-10' })
    expect(ev?.end).toEqual({ date: '2026-03-13' })
  })

  it('defaults a missing DTEND to one hour, or one day when all-day', () => {
    const [timed] = parseIcs(wrap(['BEGIN:VEVENT', 'DTSTART:20260310T160000Z', 'END:VEVENT'].join('\r\n')))
    expect(timed?.end?.dateTime).toBe('2026-03-10T17:00:00.000Z')

    const [allDay] = parseIcs(wrap(['BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260310', 'END:VEVENT'].join('\r\n')))
    expect(allDay?.end).toEqual({ date: '2026-03-11' })
  })

  it('unfolds continuation lines and unescapes text', () => {
    const [ev] = parseIcs(
      wrap(
        [
          'BEGIN:VEVENT',
          'DTSTART:20260310T160000Z',
          'DTEND:20260310T170000Z',
          'SUMMARY:A very long title that the',
          '  exporter folded',
          'DESCRIPTION:line one\\nline two\\; and a semicolon\\, plus a comma',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    )
    expect(ev?.summary).toBe('A very long title that the exporter folded')
    expect(ev?.description).toBe('line one\nline two; and a semicolon, plus a comma')
  })

  it('collects RRULEs and prefixes them the way the Calendar API expects', () => {
    const [ev] = parseIcs(
      wrap(
        [
          'BEGIN:VEVENT',
          'DTSTART:20260310T160000Z',
          'DTEND:20260310T163000Z',
          'RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=8',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    )
    expect(ev?.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=8'])
  })

  it('reads every VEVENT in a multi-event file', () => {
    const one = ['BEGIN:VEVENT', 'SUMMARY:One', 'DTSTART:20260310T160000Z', 'DTEND:20260310T170000Z', 'END:VEVENT']
    const two = ['BEGIN:VEVENT', 'SUMMARY:Two', 'DTSTART:20260311T160000Z', 'DTEND:20260311T170000Z', 'END:VEVENT']
    const evs = parseIcs(wrap([...one, ...two].join('\r\n')))
    expect(evs.map((e) => e.summary)).toEqual(['One', 'Two'])
  })

  it('drops events with an unparseable or missing DTSTART instead of importing junk', () => {
    expect(parseIcs(wrap(['BEGIN:VEVENT', 'SUMMARY:No start', 'END:VEVENT'].join('\r\n')))).toEqual([])
    expect(
      parseIcs(wrap(['BEGIN:VEVENT', 'DTSTART:not-a-date', 'SUMMARY:Bad', 'END:VEVENT'].join('\r\n'))),
    ).toEqual([])
  })

  it('returns nothing for input that isn’t a calendar at all', () => {
    expect(parseIcs('')).toEqual([])
    expect(parseIcs('just some text\r\nwith no vevent')).toEqual([])
  })

  it('caps very long descriptions', () => {
    const [ev] = parseIcs(
      wrap(
        [
          'BEGIN:VEVENT',
          'DTSTART:20260310T160000Z',
          'DTEND:20260310T170000Z',
          `DESCRIPTION:${'x'.repeat(9000)}`,
          'END:VEVENT',
        ].join('\r\n'),
      ),
    )
    expect(ev?.description?.length).toBe(4000)
  })
})
