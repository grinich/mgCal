import { api, ApiError } from '../google/api'
import { AuthError } from '../google/auth'
import { db, getSetting, normalizeEvent, setSetting, shiftGTime, type DB } from '../data/db'
import { stripCount, truncateRecurrence, untilBefore } from '../data/rrule'
import type { GAttendee, GEvent, OutboxOp, SplitPayload } from '../data/types'

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
  if (!ops.length) return
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

async function execOp(d: DB, op: OutboxOp): Promise<void> {
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
    case 'splitRecurring': {
      await execSplitRecurring(d, op)
      // The op mutates its own payload (phase snapshot); skip generic
      // coalescing bookkeeping — a split is never coalesced into.
      await d.delete('outbox', op.seq!)
      return
    }
  }

  // Recurrence masters are never stored as rows (the grid shows expanded
  // instances only) — drop the optimistic stand-in and let sync fill in.
  if (server?.recurrence?.length || op.master) {
    if (op.opType === 'create') await d.delete('events', [op.calendarId, op.eventId])
    server = undefined
  }

  // Success bookkeeping. The page may have coalesced more edits into this op
  // while it was in flight — only remove it if the payload we sent is current.
  const cur = await d.get('outbox', op.seq!)
  if (cur && JSON.stringify(cur.payload) !== sentPayload) {
    cur.ifMatchEtag = server?.etag ?? cur.ifMatchEtag
    if (cur.opType === 'create') cur.opType = 'patch' // it exists now; remaining delta is a patch
    await d.put('outbox', cur)
  } else if (cur) {
    await d.delete('outbox', cur.seq!)
  }

  if (server) {
    const remaining = await d.getAllFromIndex('outbox', 'byEvent', IDBKeyRange.only([op.calendarId, op.eventId]))
    const row = await d.get('events', [op.calendarId, op.eventId])
    if (!remaining.length) {
      await d.put('events', normalizeEvent(server, op.calendarId, row?.baselineGen ?? 0))
    } else if (row) {
      row.etag = server.etag // keep optimistic fields; later ops still pending
      await d.put('events', row)
    }
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

/**
 * "This and following": truncate the master's RRULE before the split instance,
 * then (unless deleting) create a new series starting at the edited instance.
 * Resumable: phase 1 = master truncated; the payload snapshots the master so a
 * killed worker can still build the new series without re-reading pre-split state.
 */
async function execSplitRecurring(d: DB, op: OutboxOp): Promise<void> {
  const p = op.payload as unknown as SplitPayload
  const masterPath = `${evPath(op)}/${op.eventId}`

  if (!op.phase || op.phase < 1) {
    const master = await api<GEvent>(masterPath)
    if (!master.recurrence?.length) throw new ApiError(400, 'badSplit', 'Event is not a recurring master')
    const snapshot: Partial<GEvent> = {}
    for (const f of CLONE_FIELDS) if (master[f] !== undefined) (snapshot as any)[f] = master[f]
    const until = untilBefore(p.instanceOriginalStart)
    await api<GEvent>(masterPath, {
      method: 'PATCH',
      query: { sendUpdates: 'all' },
      body: { recurrence: truncateRecurrence(master.recurrence, until) },
      ifMatch: master.etag,
    })
    op.phase = 1
    p.masterSnapshot = snapshot
    await d.put('outbox', op)
  }

  if (p.deleteOnly) return

  const snap = (p.masterSnapshot ?? {}) as Partial<GEvent>
  const body: Record<string, unknown> = {
    ...snap,
    ...p.fields,
    id: p.newId,
    start: p.newStart,
    end: p.newEnd,
    recurrence: stripCount((snap.recurrence ?? []) as string[]),
  }
  try {
    await api<GEvent>(evPath(op), {
      method: 'POST',
      query: { conferenceDataVersion: 1, sendUpdates: 'all' },
      body,
    })
  } catch (e) {
    // 409: new series already created by a previous attempt.
    if (!(e instanceof ApiError && e.status === 409)) throw e
  }
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
  if (server && server.status !== 'cancelled') {
    await d.put('events', normalizeEvent(server, op.calendarId, row?.baselineGen ?? 0))
  } else {
    await d.delete('events', [op.calendarId, op.eventId])
  }
  const summary =
    (op.payload.summary as string | undefined) ?? server?.summary ?? row?.summary ?? '(no title)'
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
