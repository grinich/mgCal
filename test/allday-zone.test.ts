import { describe, expect, it } from 'vitest'
import { layoutLanes } from '../src/app/views/layout'
import { normalizeEvent, reanchorAllDay } from '../src/data/db'
import { addDays } from '../src/app/time'
import type { EventRow } from '../src/data/types'

// Real Google payloads for the week of Mon 2026-08-03 (tests pin TZ=Pacific).
const REAL = [
  { summary: 'Black Hat', start: { date: '2026-08-01' }, end: { date: '2026-08-07' } },
  { summary: 'DEMO NIGHT', start: { date: '2026-08-05' }, end: { date: '2026-08-06' } },
  { summary: 'Defcon', start: { date: '2026-08-06' }, end: { date: '2026-08-10' } },
  { summary: 'Sea Ranch', start: { date: '2026-08-06' }, end: { date: '2026-08-10' } },
  { summary: 'Stay Panoramic', start: { date: '2026-08-06' }, end: { date: '2026-08-09' } },
  { summary: 'Outside Lands', start: { date: '2026-08-07' }, end: { date: '2026-08-10' } },
  { summary: 'Stay Ohlson', start: { date: '2026-08-08' }, end: { date: '2026-08-11' } },
  { summary: 'Stern Grove', start: { date: '2026-08-09' }, end: { date: '2026-08-10' } },
]

const row = (e: (typeof REAL)[number]): EventRow =>
  normalizeEvent({ id: e.summary, ...e } as never, 'cal', 0)

/** The same row as cached by a browser sitting in UTC: parseGTime anchored the
 * date to UTC midnight, which is 17:00 the previous day in Pacific. */
const cachedInUtc = (e: (typeof REAL)[number]): EventRow => {
  const utc = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return { ...row(e), startMs: utc(e.start.date), endMs: utc(e.end.date) }
}

const week = () => Array.from({ length: 7 }, (_, i) => addDays(new Date(2026, 7, 3), i))
const spans = (rows: EventRow[]) =>
  Object.fromEntries(layoutLanes(rows, week()).map((l) => [l.ev.summary, [l.startCol, l.span]]))

const CORRECT = {
  'Black Hat': [0, 4], // starts Jul 31, clipped to the row
  'DEMO NIGHT': [2, 1], // single day: Wed
  Defcon: [3, 4],
  'Sea Ranch': [3, 4],
  'Stay Panoramic': [3, 3],
  'Outside Lands': [4, 3],
  'Stay Ohlson': [5, 2],
  'Stern Grove': [6, 1], // single day: Sun
}

describe('all-day rows across a timezone change', () => {
  it('places rows normalized in the viewing zone on their true columns', () => {
    expect(spans(REAL.map(row))).toEqual(CORRECT)
  })

  it('misrenders rows cached under another zone: a day early and a day long', () => {
    // Every row stale but Outside Lands, which the server re-sent (so it was
    // re-normalized locally) — this is exactly the reported screenshot.
    const rows = REAL.map((e) => (e.summary === 'Outside Lands' ? row(e) : cachedInUtc(e)))
    expect(spans(rows)).toEqual({
      'Black Hat': [0, 4], // start is off-row either way, so it looks fine
      'DEMO NIGHT': [1, 2],
      Defcon: [2, 5],
      'Sea Ranch': [2, 5],
      'Stay Panoramic': [2, 4],
      'Outside Lands': [4, 3], // the one re-synced row, correct
      'Stay Ohlson': [4, 3],
      'Stern Grove': [5, 2],
    })
  })

  it('reanchorAllDay repairs those rows from their stored date', () => {
    const repaired = REAL.map((e) => reanchorAllDay(cachedInUtc(e)) ?? cachedInUtc(e))
    expect(spans(repaired)).toEqual(CORRECT)
  })

  it('leaves rows alone once they match the local zone', () => {
    expect(REAL.map((e) => reanchorAllDay(row(e)))).toEqual(REAL.map(() => null))
  })

  it('never touches timed events, whose ms are absolute', () => {
    const timed = normalizeEvent(
      {
        id: 't',
        summary: 'timed',
        start: { dateTime: '2026-08-06T09:00:00-07:00' },
        end: { dateTime: '2026-08-06T10:00:00-07:00' },
      } as never,
      'cal',
      0,
    )
    expect(reanchorAllDay(timed)).toBeNull()
  })
})
