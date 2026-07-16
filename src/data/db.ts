import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CalendarRow, EventRow, GEvent, OutboxOp, SyncStateRow } from './types'

interface GcalDB extends DBSchema {
  events: {
    key: [string, string]
    value: EventRow
    indexes: { byStart: number; byCalStart: [string, number]; byMaster: string }
  }
  calendars: { key: string; value: CalendarRow }
  outbox: {
    key: number
    value: OutboxOp
    indexes: { byEvent: [string, string] }
  }
  syncState: { key: string; value: SyncStateRow }
  settings: { key: string; value: { key: string; value: unknown } }
}

export type DB = IDBPDatabase<GcalDB>

let dbPromise: Promise<DB> | undefined

export function db(): Promise<DB> {
  dbPromise ??= openDB<GcalDB>('gcal', 1, {
    upgrade(d) {
      const events = d.createObjectStore('events', { keyPath: ['calendarId', 'id'] })
      events.createIndex('byStart', 'startMs')
      events.createIndex('byCalStart', ['calendarId', 'startMs'])
      events.createIndex('byMaster', 'recurringEventId')
      d.createObjectStore('calendars', { keyPath: 'id' })
      const outbox = d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
      outbox.createIndex('byEvent', ['calendarId', 'eventId'])
      d.createObjectStore('syncState', { keyPath: 'calendarId' })
      d.createObjectStore('settings', { keyPath: 'key' })
    },
  })
  return dbPromise
}

/** Convert a Google event to a local row with precomputed range fields. */
export function normalizeEvent(e: GEvent, calendarId: string, baselineGen: number): EventRow {
  const allDay = !!e.start?.date
  const startMs = parseGTime(e.start) ?? 0
  const endMs = parseGTime(e.end) ?? startMs
  const searchText = [
    e.summary,
    e.location,
    e.description,
    ...(e.attendees ?? []).flatMap((a) => [a.displayName, a.email]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return {
    ...e,
    calendarId,
    startMs,
    endMs,
    allDay,
    updatedMs: e.updated ? Date.parse(e.updated) : 0,
    baselineGen,
    searchText,
  }
}

export function parseGTime(t?: { date?: string; dateTime?: string }): number | undefined {
  if (t?.dateTime) return Date.parse(t.dateTime)
  if (t?.date) {
    // All-day dates are timezone-less; anchor to local midnight for display.
    const [y, m, d] = t.date.split('-').map(Number)
    return new Date(y!, m! - 1, d!).getTime()
  }
  return undefined
}

/** Shift a Google date/dateTime by deltaMs, preserving all-day-ness and timeZone.
 * The timeZone must survive: recurring-event writes require start/end.timeZone. */
export function shiftGTime(
  g: { date?: string; dateTime?: string; timeZone?: string } | undefined,
  deltaMs: number,
): { date?: string; dateTime?: string; timeZone?: string } | undefined {
  if (!g) return undefined
  const ms = (parseGTime(g) ?? 0) + deltaMs
  if (g.date) {
    const d = new Date(ms)
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    }
  }
  return g.timeZone
    ? { dateTime: new Date(ms).toISOString(), timeZone: g.timeZone }
    : { dateTime: new Date(ms).toISOString() }
}

/** Events overlapping [startMs, endMs), across all calendars. */
export async function eventsInRange(startMs: number, endMs: number): Promise<EventRow[]> {
  const d = await db()
  // Back-pad catches long multi-day events whose start precedes the range.
  const PAD = 35 * 24 * 3600 * 1000
  const rows = await d.getAllFromIndex('events', 'byStart', IDBKeyRange.bound(startMs - PAD, endMs, false, true))
  return rows.filter((r) => r.endMs > startMs && r.status !== 'cancelled' && r.pending !== 'delete')
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const d = await db()
  const row = await d.get('settings', key)
  return row?.value as T | undefined
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const d = await db()
  await d.put('settings', { key, value })
}
