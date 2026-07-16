import { api, ApiError } from '../google/api'
import { AuthError } from '../google/auth'
import { db, normalizeEvent, type DB } from '../data/db'
import type { CalendarRow, GEvent, SyncStateRow } from '../data/types'

const DAY = 24 * 3600 * 1000
const WINDOW_BACK_MS = 365 * DAY
const WINDOW_FWD_MS = 365 * DAY
const REBASELINE_MS = 30 * DAY
const CAL_LIST_INTERVAL_MS = 60_000
// Fast-poll governor: primary calendar every tick, others every ~5s.
const PRIMARY_MIN_POLL_MS = 900
const OTHER_MIN_POLL_MS = 5000

interface EventsPage {
  items?: GEvent[]
  nextPageToken?: string
  nextSyncToken?: string
}

interface CalListEntry {
  id: string
  summary: string
  summaryOverride?: string
  backgroundColor?: string
  foregroundColor?: string
  accessRole: CalendarRow['accessRole']
  primary?: boolean
  selected?: boolean
  timeZone?: string
  defaultReminders?: { method: string; minutes: number }[]
}

interface GlobalRow extends SyncStateRow {
  lastCalListMs?: number
  backoffUntil?: number
  rateAttempts?: number
}

export type SyncMode = 'fast' | 'full'

// MV3 runs a single service worker instance, so an in-memory guard is enough
// to coalesce overlapping kicks; crash-resumability comes from persisted state.
let inFlight = false

export async function syncAll(mode: SyncMode): Promise<void> {
  if (inFlight) return
  inFlight = true
  try {
    await syncAllInner(mode)
  } finally {
    inFlight = false
  }
}

async function syncAllInner(mode: SyncMode): Promise<void> {
  const d = await db()
  const g = ((await d.get('syncState', '$global')) ?? {
    calendarId: '$global',
    phase: 'idle',
    baselineGen: 0,
  }) as GlobalRow

  if (g.backoffUntil && Date.now() < g.backoffUntil) return

  if (!g.lastCalListMs || Date.now() - g.lastCalListMs > CAL_LIST_INTERVAL_MS || mode === 'full') {
    try {
      await syncCalendarList(d)
      g.lastCalListMs = Date.now()
      await d.put('syncState', g)
      broadcast({ type: 'db-updated', calendarIds: ['$calendars'] })
    } catch (e) {
      if (!(await handleSyncError(d, g, e))) return
    }
  }

  const cals = await d.getAll('calendars')
  // Primary first so the calendar you look at most syncs freshest.
  cals.sort((a, b) => Number(!!b.primary) - Number(!!a.primary))
  const changed: string[] = []

  for (const cal of cals) {
    if (cal.accessRole === 'freeBusyReader') continue // no event details available
    const s: SyncStateRow = (await d.get('syncState', cal.id)) ?? {
      calendarId: cal.id,
      phase: 'idle',
      baselineGen: 0,
    }
    if (mode === 'fast' && s.phase === 'incremental' && s.lastSyncedAt) {
      const minPoll = cal.primary ? PRIMARY_MIN_POLL_MS : OTHER_MIN_POLL_MS
      if (Date.now() - s.lastSyncedAt < minPoll) continue
    }
    try {
      if (await syncCalendar(d, cal, s)) changed.push(cal.id)
      if (g.rateAttempts) {
        g.rateAttempts = 0
        g.backoffUntil = undefined
        await d.put('syncState', g)
      }
    } catch (e) {
      if (!(await handleSyncError(d, g, e, s))) break
    }
  }

  if (changed.length) broadcast({ type: 'db-updated', calendarIds: changed })
}

/** Returns false when the whole sync pass should stop (auth/rate-limit). */
async function handleSyncError(d: DB, g: GlobalRow, e: unknown, s?: SyncStateRow): Promise<boolean> {
  if (e instanceof AuthError) return false // authNeeded flag already set for the UI
  if (e instanceof ApiError && e.isRetryable) {
    g.rateAttempts = (g.rateAttempts ?? 0) + 1
    g.backoffUntil = Date.now() + Math.min(2000 * 2 ** g.rateAttempts, 15 * 60_000)
    await d.put('syncState', g)
    return false
  }
  console.error('sync error', s?.calendarId, e)
  if (s) {
    s.error = String(e)
    await d.put('syncState', s)
  }
  return true // other calendars may still work
}

/** Sync one calendar. Returns true if local data changed. */
async function syncCalendar(d: DB, cal: CalendarRow, s: SyncStateRow): Promise<boolean> {
  const path = `/calendars/${encodeURIComponent(cal.id)}/events`
  let changed = 0
  const needsBaseline =
    !s.syncToken || s.phase === 'full' || !s.baselinedAt || Date.now() - s.baselinedAt > REBASELINE_MS

  if (needsBaseline) {
    if (s.phase !== 'full') {
      s.phase = 'full'
      s.baselineGen += 1
      s.windowStartMs = Date.now() - WINDOW_BACK_MS
      s.windowEndMs = Date.now() + WINDOW_FWD_MS
      s.pageToken = undefined
      await d.put('syncState', s)
    }
    for (;;) {
      const resp = await api<EventsPage>(path, {
        query: {
          singleEvents: true,
          maxResults: 250,
          timeMin: new Date(s.windowStartMs!).toISOString(),
          timeMax: new Date(s.windowEndMs!).toISOString(),
          pageToken: s.pageToken,
        },
      })
      changed += await upsertPage(d, cal.id, resp.items ?? [], s.baselineGen)
      if (resp.nextPageToken) {
        // Persist after every page so a killed worker resumes mid-baseline.
        s.pageToken = resp.nextPageToken
        await d.put('syncState', s)
        broadcast({ type: 'db-updated', calendarIds: [cal.id] }) // progressive paint during first sync
      } else {
        changed += await sweepStale(d, cal.id, s.baselineGen)
        s.syncToken = resp.nextSyncToken
        s.pageToken = undefined
        s.phase = 'incremental'
        s.baselinedAt = Date.now()
        s.lastSyncedAt = Date.now()
        s.error = undefined
        await d.put('syncState', s)
        break
      }
    }
    return changed > 0
  }

  // Incremental: the token freezes the baseline's window server-side.
  for (;;) {
    let resp: EventsPage
    try {
      resp = await api<EventsPage>(path, {
        query: {
          singleEvents: true,
          maxResults: 250,
          syncToken: s.syncToken,
          pageToken: s.pageToken,
        },
      })
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) {
        // Token expired — full resync. Old rows stay until the sweep.
        s.syncToken = undefined
        s.pageToken = undefined
        s.phase = 'idle'
        await d.put('syncState', s)
        return syncCalendar(d, cal, s)
      }
      throw e
    }
    changed += await upsertPage(d, cal.id, resp.items ?? [], s.baselineGen)
    if (resp.nextPageToken) {
      s.pageToken = resp.nextPageToken
      await d.put('syncState', s)
    } else {
      s.syncToken = resp.nextSyncToken ?? s.syncToken
      s.pageToken = undefined
      s.lastSyncedAt = Date.now()
      s.error = undefined
      await d.put('syncState', s)
      break
    }
  }
  return changed > 0
}

/** Upsert one page of events. Returns count of real changes. */
async function upsertPage(d: DB, calendarId: string, items: GEvent[], gen: number): Promise<number> {
  if (!items.length) return 0
  const tx = d.transaction('events', 'readwrite')
  let changed = 0
  for (const e of items) {
    const key: [string, string] = [calendarId, e.id]
    const existing = await tx.store.get(key)
    if (existing?.pending) continue // local unpushed edit wins until the flush resolves it
    if (e.status === 'cancelled') {
      if (existing) {
        await tx.store.delete(key)
        changed++
      }
    } else {
      if (!existing || existing.etag !== e.etag) changed++
      await tx.store.put(normalizeEvent(e, calendarId, gen)) // always put: baselineGen must advance
    }
  }
  await tx.done
  return changed
}

/** After a completed baseline, drop rows the baseline didn't see. */
async function sweepStale(d: DB, calendarId: string, gen: number): Promise<number> {
  const tx = d.transaction('events', 'readwrite')
  const idx = tx.store.index('byCalStart')
  let removed = 0
  let cur = await idx.openCursor(IDBKeyRange.bound([calendarId, -Infinity], [calendarId, Infinity]))
  while (cur) {
    const v = cur.value
    if (v.baselineGen !== gen && !v.ephemeral && !v.pending) {
      await cur.delete()
      removed++
    }
    cur = await cur.continue()
  }
  await tx.done
  return removed
}

async function syncCalendarList(d: DB): Promise<void> {
  const items: CalListEntry[] = []
  let pageToken: string | undefined
  do {
    const resp = await api<{ items?: CalListEntry[]; nextPageToken?: string }>('/users/me/calendarList', {
      query: { maxResults: 250, pageToken },
    })
    items.push(...(resp.items ?? []))
    pageToken = resp.nextPageToken
  } while (pageToken)

  const existing = await d.getAll('calendars')
  const byId = new Map(existing.map((c) => [c.id, c]))
  const seen = new Set(items.map((i) => i.id))

  const tx = d.transaction('calendars', 'readwrite')
  for (const it of items) {
    const prev = byId.get(it.id)
    await tx.store.put({
      id: it.id,
      summary: it.summaryOverride ?? it.summary,
      backgroundColor: it.backgroundColor,
      foregroundColor: it.foregroundColor,
      accessRole: it.accessRole,
      primary: it.primary,
      timeZone: it.timeZone,
      defaultReminders: it.defaultReminders,
      hidden: prev?.hidden ?? it.selected === false, // seed from Google's "selected" checkbox
    })
  }
  for (const c of existing) {
    if (!seen.has(c.id)) await tx.store.delete(c.id)
  }
  await tx.done

  // Purge data for calendars that disappeared.
  for (const c of existing) {
    if (seen.has(c.id)) continue
    await d.delete('syncState', c.id)
    const etx = d.transaction('events', 'readwrite')
    const idx = etx.store.index('byCalStart')
    let cur = await idx.openCursor(IDBKeyRange.bound([c.id, -Infinity], [c.id, Infinity]))
    while (cur) {
      await cur.delete()
      cur = await cur.continue()
    }
    await etx.done
  }
}

function broadcast(msg: { type: string; calendarIds: string[] }): void {
  // No listeners (no open app tab) is normal — swallow the connection error.
  chrome.runtime.sendMessage(msg).catch(() => {})
}
