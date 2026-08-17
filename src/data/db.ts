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

// Bump DB_VERSION when the schema changes and add a matching `case` below. The
// cache is disposable — a wrong migration is recoverable by clearing sync tokens
// and re-baselining — but users' queued outbox writes are NOT, so migrations
// must never drop the outbox or settings stores.
const DB_NAME = 'gcal' // unchanged across the mgCal rename: renaming orphans existing caches
const DB_VERSION = 1

export function db(): Promise<DB> {
  dbPromise ??= openDB<GcalDB>(DB_NAME, DB_VERSION, {
    upgrade(d, oldVersion) {
      // Falls through, so a browser on any older version replays every step.
      switch (oldVersion) {
        case 0: {
          const events = d.createObjectStore('events', { keyPath: ['calendarId', 'id'] })
          events.createIndex('byStart', 'startMs')
          events.createIndex('byCalStart', ['calendarId', 'startMs'])
          events.createIndex('byMaster', 'recurringEventId')
          d.createObjectStore('calendars', { keyPath: 'id' })
          const outbox = d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
          outbox.createIndex('byEvent', ['calendarId', 'eventId'])
          d.createObjectStore('syncState', { keyPath: 'calendarId' })
          d.createObjectStore('settings', { keyPath: 'key' })
        }
      }
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

/** Re-derive an all-day row's startMs/endMs against the CURRENT zone, or null
 * if they already agree.
 *
 * Timed events are absolute instants, but an all-day date is timezone-less and
 * parseGTime pins it to local midnight — so the cached ms only mean anything in
 * the zone that computed them. Incremental sync rewrites a row only when the
 * event changes on the server, so once the browser moves zones every untouched
 * all-day row keeps the old zone's midnights and its chip lands on the wrong
 * day. The stored Google `date` is zone-free and still authoritative. */
export function reanchorAllDay(row: EventRow): EventRow | null {
  if (!row.allDay) return null
  const startMs = parseGTime(row.start) ?? row.startMs
  const endMs = parseGTime(row.end) ?? startMs
  if (startMs === row.startMs && endMs === row.endMs) return null
  return { ...row, startMs, endMs }
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

/** Zone the cached all-day midnights were computed in. Unset on caches written
 * before this existed, which is why the first run always sweeps. */
const TZ_KEY = 'allDayZone'

/** Repair every cached all-day row after the browser changes timezone (travel,
 * or an OS zone fix). Cheap and idempotent: it re-derives from each row's own
 * Google date rather than re-fetching, and no-ops once the zone matches.
 * Returns how many rows moved. See reanchorAllDay for why this is needed. */
export async function reanchorForLocalZone(): Promise<number> {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if ((await getSetting<string>(TZ_KEY)) === zone) return 0
  const d = await db()
  const fixed = (await d.getAll('events')).map(reanchorAllDay).filter((r): r is EventRow => r !== null)
  if (fixed.length) {
    const tx = d.transaction('events', 'readwrite')
    await Promise.all(fixed.map((row) => tx.store.put(row)))
    await tx.done
  }
  await setSetting(TZ_KEY, zone)
  return fixed.length
}
