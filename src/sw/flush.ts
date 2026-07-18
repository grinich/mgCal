import { api, ApiError } from '../google/api'
import { AuthError } from '../google/auth'
import { db, getSetting, normalizeEvent, parseGTime, setSetting, shiftGTime, type DB } from '../data/db'
import { getCount, replaceCount, stripCount, truncateRecurrence, untilBefore } from '../data/rrule'
import type { GAttendee, GDateTime, GEvent, OutboxOp, SplitPayload } from '../data/types'

export interface ConflictRecord {
  id: string
  calendarId: string
  eventId: string
  summary: string
  opType: OutboxOp['opType']
  payload: Record<string, unknown>
  freshEtag?: string
  message: string
  ts: number
}

let flushing = false
let lastJanitor = 0

export async function flushOutbox(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    await flushInner()
  } finally {
    flushing = false
  }
}

async function flushInner(): Promise<void> {
  const d = await db()
  const ops = await d.getAll('outbox') // ascending seq
  if (!ops.length) {
    await janitor(d)
    return
  }
  const blocked = new Set<string>()
  const changed = new Set<string>()

  for (const op of ops) {
    const ek = `${op.calendarId}|${op.eventId}`
    if (blocked.has(ek)) continue
    if (op.nextAttemptMs > Date.now()) {
      blocked.add(ek) // per-event head-of-line: later ops must wait too
      continue
    }
    try {
      await execOp(d, op)
      changed.add(op.calendarId)
    } catch (e) {
      blocked.add(ek)
      if (e instanceof AuthError) break
      // 401 after the token-refresh retry: auth is broken, not this op — hold
      // everything for re-auth rather than converting edits into conflicts.
      if (e instanceof ApiError && e.status === 401) break
      if (e instanceof ApiError && e.status === 412) {
        await onConflict(d, op, 'This event changed on the server while your edit was pending.')
        changed.add(op.calendarId)
        continue
      }
      if (e instanceof ApiError && !e.isRetryable) {
        await onConflict(d, op, `Google rejected this edit: ${e.message}`)
        changed.add(op.calendarId)
        continue
      }
      // Retryable (rate limit / 5xx / network): back off and stop the flush.
      op.attempts += 1
      op.nextAttemptMs = Date.now() + Math.min(5000 * 2 ** op.attempts, 15 * 60_000) + Math.random() * 1000
      op.lastError = String(e)
      await d.put('outbox', op)
      break
    }
  }
  if (changed.size) broadcast({ type: 'db-updated', calendarIds: [...changed] })
}

function evPath(op: Pick<OutboxOp, 'calendarId'>): string {
  return `/calendars/${encodeURIComponent(op.calendarId)}/events`
}

async function genFor(d: DB, calendarId: string): Promise<number> {
  return (await d.get('syncState', calendarId))?.baselineGen ?? 0
}

async function opsFor(d: DB, calendarId: string, eventId: string): Promise<OutboxOp[]> {
  return d.getAllFromIndex('outbox', 'byEvent', IDBKeyRange.only([calendarId, eventId]))
}

async function execOp(d: DB, op: OutboxOp): Promise<void> {
  if (op.opType === 'splitRecurring') {
    await execSplitRecurring(d, op)
    // Truncating the old series drops its tail instances, but Google emits no
    // `cancelled` for plain (non-exception) projections — so refetch the series
    // to purge the orphaned local rows rather than just clearing pending flags.
    await restoreSeries(d, op.calendarId, op.eventId)
    await d.delete('outbox', op.seq!)
    return
  }

  const sentPayload = JSON.stringify(op.payload)
  let server: GEvent | undefined

  switch (op.opType) {
    case 'create': {
      try {
        server = await api<GEvent>(evPath(op), {
          method: 'POST',
          query: { conferenceDataVersion: 1, sendUpdates: 'all' },
          body: op.payload,
        })
      } catch (e) {
        // 409: a previous attempt landed — idempotent success.
        if (e instanceof ApiError && e.status === 409) {
          server = await api<GEvent>(`${evPath(op)}/${op.eventId}`)
        } else throw e
      }
      break
    }
    case 'patch': {
      if (op.master) {
        // Scope=all edit: the master isn't cached — fetch it, apply the
        // instance's time shift to the master's own first-occurrence times.
        const masterPath = `${evPath(op)}/${op.eventId}`
        const master = await api<GEvent>(masterPath)
        const body: Record<string, unknown> = { ...op.payload }
        if (op.timeDelta) {
          body.start = shiftGTime(master.start, op.timeDelta.startMs)
          body.end = shiftGTime(master.end, op.timeDelta.endMs)
        }
        server = await api<GEvent>(masterPath, {
          method: 'PATCH',
          query: { conferenceDataVersion: 1, sendUpdates: 'all' },
          body,
          ifMatch: master.etag,
        })
      } else {
        server = await api<GEvent>(`${evPath(op)}/${op.eventId}`, {
          method: 'PATCH',
          query: { conferenceDataVersion: 1, sendUpdates: 'all' },
          body: op.payload,
          ifMatch: op.ifMatchEtag,
        })
      }
      break
    }
    case 'delete': {
      try {
        await api<void>(`${evPath(op)}/${op.eventId}`, {
          method: 'DELETE',
          query: { sendUpdates: 'all' },
          ifMatch: op.ifMatchEtag,
        })
      } catch (e) {
        const gone = e instanceof ApiError && (e.status === 404 || e.status === 410)
        if (!gone) throw e
      }
      await d.delete('events', [op.calendarId, op.eventId])
      if (op.master) await purgeSiblings(d, op.calendarId, op.eventId)
      await d.delete('outbox', op.seq!)
      return
    }
    case 'rsvp': {
      // Fetch fresh attendees so we never clobber other guests' responses.
      const fresh = await api<GEvent>(`${evPath(op)}/${op.eventId}`)
      const response = op.payload.response as GAttendee['responseStatus']
      const attendees = (fresh.attendees ?? []).map((a) => (a.self ? { ...a, responseStatus: response } : a))
      server = await api<GEvent>(`${evPath(op)}/${op.eventId}`, {
        method: 'PATCH',
        body: { attendees },
        ifMatch: fresh.etag,
      })
      break
    }
  }

  // ---- success bookkeeping ----
  // The page may have coalesced more edits into this op while it was in
  // flight — only treat the op as settled if the payload we sent is current.
  const cur = await d.get('outbox', op.seq!)
  const payloadChanged = !!cur && JSON.stringify(cur.payload) !== sentPayload
  const remaining = (await opsFor(d, op.calendarId, op.eventId)).filter((o) => o.seq !== op.seq)
  const row = await d.get('events', [op.calendarId, op.eventId])

  // Recurrence masters are never stored as rows (the grid shows expanded
  // instances only) — drop optimistic stand-ins and reconcile siblings.
  const isMaster = op.master || !!server?.recurrence?.length
  if (isMaster) {
    if (op.opType === 'create') await d.delete('events', [op.calendarId, op.eventId])
    // A master retime changes every instance's id (occurrence start moves), and
    // Google won't send `cancelled` for the vanished old-id projections — so
    // refetch the series to drop orphans instead of only clearing pending.
    if (op.master) await restoreSeries(d, op.calendarId, op.eventId)
  } else if (server) {
    if (!row) {
      // Deleted locally while this op was in flight: the event now exists on
      // the server with no local trace — push a compensating delete.
      if (!cur && !remaining.some((o) => o.opType === 'delete')) {
        await d.add('outbox', {
          opType: 'delete',
          calendarId: op.calendarId,
          eventId: op.eventId,
          payload: {},
          ifMatchEtag: server.etag,
          attempts: 0,
          nextAttemptMs: 0,
          createdMs: Date.now(),
        })
      }
    } else if (!remaining.length && !payloadChanged) {
      await d.put('events', normalizeEvent(server, op.calendarId, await genFor(d, op.calendarId)))
    } else {
      // Later/merged edits still pending: keep optimistic fields, refresh etags
      // everywhere so queued ops don't 412 against their own ancestor.
      row.etag = server.etag
      await d.put('events', row)
      for (const r of remaining) {
        if (r.ifMatchEtag) {
          r.ifMatchEtag = server.etag
          await d.put('outbox', r)
        }
      }
    }
  }

  if (payloadChanged && cur) {
    cur.ifMatchEtag = server?.etag ?? cur.ifMatchEtag
    if (cur.opType === 'create') cur.opType = 'patch' // it exists now; remaining delta is a patch
    await d.put('outbox', cur)
  } else if (cur) {
    await d.delete('outbox', cur.seq!)
  }
}

const CLONE_FIELDS = [
  'summary',
  'description',
  'location',
  'attendees',
  'reminders',
  'colorId',
  'transparency',
  'visibility',
  'recurrence',
] as const

function withTz(g: GDateTime | undefined, tz: string | undefined): GDateTime | undefined {
  if (g?.dateTime && !g.timeZone && tz) return { ...g, timeZone: tz }
  return g
}

/** Count series instances that start before splitMs (for COUNT rebalancing). */
async function countInstancesBefore(op: OutboxOp, splitMs: number): Promise<number> {
  let count = 0
  let pageToken: string | undefined
  do {
    const resp = await api<{ items?: unknown[]; nextPageToken?: string }>(
      `${evPath(op)}/${op.eventId}/instances`,
      { query: { maxResults: 250, timeMax: new Date(splitMs).toISOString(), pageToken } },
    )
    count += resp.items?.length ?? 0
    pageToken = resp.nextPageToken
  } while (pageToken && count < 5000)
  return count
}

/**
 * "This and following". Phase 0 creates the tail series FIRST (a failure
 * leaves the original series intact and retryable; truncating first could
 * permanently orphan future occurrences). Phase 1 truncates the original
 * master's RRULE before the split point. Both phases are idempotent.
 */
async function execSplitRecurring(d: DB, op: OutboxOp): Promise<void> {
  const p = op.payload as unknown as SplitPayload
  const masterPath = `${evPath(op)}/${op.eventId}`

  if (!op.phase || op.phase < 1) {
    const master = await api<GEvent>(masterPath)
    if (!master.recurrence?.length) throw new ApiError(400, 'badSplit', 'Event is not a recurring master')
    const tz = master.start?.timeZone

    // Splitting at the first instance means the whole series: Google rejects
    // an UNTIL before DTSTART, and this matches Google Calendar's own behavior.
    const splitMs = parseGTime(p.instanceOriginalStart) ?? 0
    const masterStartMs = parseGTime(master.start) ?? 0
    if (splitMs <= masterStartMs) {
      if (p.deleteOnly) {
        try {
          await api<void>(masterPath, { method: 'DELETE', query: { sendUpdates: 'all' }, ifMatch: master.etag })
        } catch (e) {
          if (!(e instanceof ApiError && (e.status === 404 || e.status === 410))) throw e
        }
      } else {
        await api<GEvent>(masterPath, {
          method: 'PATCH',
          query: { conferenceDataVersion: 1, sendUpdates: 'all' },
          body: { ...p.fields, start: withTz(p.newStart, tz), end: withTz(p.newEnd, tz) },
          ifMatch: master.etag,
        })
      }
      return
    }

    let createTail = !p.deleteOnly
    if (createTail) {
      const snapshot: Partial<GEvent> = {}
      for (const f of CLONE_FIELDS) if (master[f] !== undefined) (snapshot as Record<string, unknown>)[f] = master[f]
      let recurrence = stripCount(master.recurrence)
      const count = getCount(master.recurrence)
      if (count !== undefined) {
        const consumed = await countInstancesBefore(op, splitMs)
        const left = count - consumed
        if (left <= 0) createTail = false // COUNT exhausted before the split — nothing to recreate
        else recurrence = replaceCount(master.recurrence, left)
      }
      if (createTail) {
        try {
          await api<GEvent>(evPath(op), {
            method: 'POST',
            query: { conferenceDataVersion: 1, sendUpdates: 'all' },
            body: {
              ...snapshot,
              ...p.fields,
              id: p.newId,
              start: withTz(p.newStart, tz),
              end: withTz(p.newEnd, tz),
              recurrence,
            },
          })
        } catch (e) {
          // 409: the tail already exists from a previous attempt.
          if (!(e instanceof ApiError && e.status === 409)) throw e
        }
      }
    }
    op.phase = 1
    await d.put('outbox', op)
  }

  // Phase 1: truncate the original series. Re-fetch for a current etag.
  const fresh = await api<GEvent>(masterPath)
  if (fresh.recurrence?.length) {
    const until = untilBefore(p.instanceOriginalStart)
    await api<GEvent>(masterPath, {
      method: 'PATCH',
      query: { sendUpdates: 'all' },
      body: { recurrence: truncateRecurrence(fresh.recurrence, until) },
      ifMatch: fresh.etag,
    })
  }
}

async function purgeSiblings(d: DB, calendarId: string, masterId: string): Promise<void> {
  const rows = (await d.getAllFromIndex('events', 'byMaster', IDBKeyRange.only(masterId))).filter(
    (r) => r.calendarId === calendarId,
  )
  for (const row of rows) {
    if ((await opsFor(d, calendarId, row.id)).length) continue // pending per-instance edit owns it
    await d.delete('events', [calendarId, row.id])
  }
}

/** Refetch a series' instances and make the local rows match exactly. Used
 * after a master op (success OR conflict): incremental sync alone can't fix it,
 * because retiming/truncating a series changes which instance ids exist and
 * Google emits no `cancelled` for the vanished plain projections — so stale
 * local rows would orphan. Rows carrying their own pending per-instance op are
 * left untouched (that edit hasn't flushed yet and owns its row). */
async function restoreSeries(d: DB, calendarId: string, masterId: string): Promise<void> {
  const s = await d.get('syncState', calendarId)
  const gen = s?.baselineGen ?? 0
  const hasOwnOp = async (id: string) => (await opsFor(d, calendarId, id)).length > 0
  const items: GEvent[] = []
  let pageToken: string | undefined
  try {
    do {
      const resp = await api<{ items?: GEvent[]; nextPageToken?: string }>(
        `/calendars/${encodeURIComponent(calendarId)}/events/${masterId}/instances`,
        {
          query: {
            maxResults: 250,
            pageToken,
            timeMin: s?.windowStartMs ? new Date(s.windowStartMs).toISOString() : undefined,
            timeMax: s?.windowEndMs ? new Date(s.windowEndMs).toISOString() : undefined,
          },
        },
      )
      items.push(...(resp.items ?? []))
      pageToken = resp.nextPageToken
    } while (pageToken)
  } catch {
    // Series gone (or unreadable) server-side — drop the local copies.
    await purgeSiblings(d, calendarId, masterId)
    return
  }
  const seen = new Set(items.map((i) => i.id))
  const rows = (await d.getAllFromIndex('events', 'byMaster', IDBKeyRange.only(masterId))).filter(
    (r) => r.calendarId === calendarId,
  )
  for (const row of rows) {
    if (!seen.has(row.id) && !(await hasOwnOp(row.id))) await d.delete('events', [calendarId, row.id])
  }
  for (const item of items) {
    if (await hasOwnOp(item.id)) continue // a queued per-instance edit still owns this row
    if (item.status === 'cancelled') await d.delete('events', [calendarId, item.id])
    else await d.put('events', normalizeEvent(item, calendarId, gen))
  }
}

/** Clear pending flags orphaned by a crash between row and op writes; without
 * this a stuck flag would shield the row from sync forever. */
async function janitor(d: DB): Promise<void> {
  if (Date.now() - lastJanitor < 60_000) return
  lastJanitor = Date.now()
  const rows = await d.getAll('events')
  const changed = new Set<string>()
  for (const row of rows) {
    if (!row.pending) continue
    if ((await opsFor(d, row.calendarId, row.id)).length) continue
    if (row.recurringEventId && (await opsFor(d, row.calendarId, row.recurringEventId)).length) continue
    row.pending = undefined
    await d.put('events', row)
    changed.add(row.calendarId)
  }
  if (changed.size) broadcast({ type: 'db-updated', calendarIds: [...changed] })
}

/** Server wins locally; the edit is preserved in a conflict record for retry. */
async function onConflict(d: DB, op: OutboxOp, message: string): Promise<void> {
  await d.delete('outbox', op.seq!)
  let server: GEvent | undefined
  try {
    server = await api<GEvent>(`${evPath(op)}/${op.eventId}`)
  } catch {
    /* deleted or inaccessible */
  }
  const row = await d.get('events', [op.calendarId, op.eventId])
  const isMaster = op.master || !!server?.recurrence?.length
  if (isMaster) {
    // Never store masters as rows; refetch the series so optimistic sibling
    // edits (which incremental sync won't correct) snap back to server truth.
    await d.delete('events', [op.calendarId, op.eventId])
    await restoreSeries(d, op.calendarId, op.eventId)
  } else if (server && server.status !== 'cancelled') {
    await d.put('events', normalizeEvent(server, op.calendarId, await genFor(d, op.calendarId)))
  } else {
    await d.delete('events', [op.calendarId, op.eventId])
  }
  const summary =
    (op.payload.summary as string | undefined) ??
    ((op.payload as unknown as SplitPayload).fields?.summary as string | undefined) ??
    server?.summary ??
    row?.summary ??
    '(no title)'
  const conflicts = (await getSetting<ConflictRecord[]>('conflicts')) ?? []
  conflicts.push({
    id: `${op.seq}-${Date.now()}`,
    calendarId: op.calendarId,
    eventId: op.eventId,
    summary,
    opType: op.opType,
    payload: op.payload,
    freshEtag: server?.etag,
    message,
    ts: Date.now(),
  })
  await setSetting('conflicts', conflicts.slice(-20))
  broadcast({ type: 'write-conflict' })
}

function broadcast(msg: Record<string, unknown>): void {
  chrome.runtime.sendMessage(msg).catch(() => {})
}
