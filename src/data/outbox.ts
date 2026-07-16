// Page-side write API: apply edits to the local cache instantly, queue ops in
// the persistent outbox, and kick the service worker to push them.
import { db, normalizeEvent, parseGTime, shiftGTime } from './db'
import { newEventId } from './ids'
import type { EventRow, GDateTime, GEvent, OutboxOp, SplitPayload } from './types'

function kick(): void {
  chrome.runtime.sendMessage({ type: 'kick' }).catch(() => {})
}

async function opsForEvent(calendarId: string, eventId: string): Promise<OutboxOp[]> {
  const d = await db()
  return d.getAllFromIndex('outbox', 'byEvent', IDBKeyRange.only([calendarId, eventId]))
}

/** Create: optimistic local row + queued POST with a client-generated id. */
export async function createEvent(
  calendarId: string,
  fields: Partial<GEvent> & { start: GEvent['start']; end: GEvent['end'] },
): Promise<string> {
  const d = await db()
  const id = newEventId()
  const payload: GEvent = {
    id,
    etag: '',
    status: 'confirmed',
    ...fields,
  }
  const row = normalizeEvent(payload, calendarId, 0)
  row.pending = 'create'
  await d.put('events', row)
  await d.add('outbox', {
    opType: 'create',
    calendarId,
    eventId: id,
    payload: payload as unknown as Record<string, unknown>,
    attempts: 0,
    nextAttemptMs: 0,
    createdMs: Date.now(),
  })
  kick()
  return id
}

/** Patch: merge into the local row; coalesce into queued create/patch ops. */
export async function patchEvent(ev: EventRow, patch: Partial<GEvent>): Promise<void> {
  const d = await db()
  const existing = await d.get('events', [ev.calendarId, ev.id])
  if (!existing) return

  const merged: GEvent = { ...(existing as GEvent), ...patch }
  const row = normalizeEvent(merged, ev.calendarId, existing.baselineGen)
  row.pending = existing.pending === 'create' ? 'create' : 'update'
  row.ephemeral = existing.ephemeral
  await d.put('events', row)

  const ops = await opsForEvent(ev.calendarId, ev.id)
  const open = ops.find((o) => o.opType === 'create' || o.opType === 'patch')
  if (open) {
    open.payload = { ...open.payload, ...patch }
    await d.put('outbox', open)
  } else {
    await d.add('outbox', {
      opType: 'patch',
      calendarId: ev.calendarId,
      eventId: ev.id,
      payload: patch as Record<string, unknown>,
      ifMatchEtag: existing.etag || undefined,
      attempts: 0,
      nextAttemptMs: 0,
      createdMs: Date.now(),
    })
  }
  kick()
}

/** Delete: hide locally (pending flag) + queued DELETE. Unsynced creates vanish. */
export async function deleteEvent(ev: EventRow): Promise<void> {
  const d = await db()
  const ops = await opsForEvent(ev.calendarId, ev.id)
  const unsyncedCreate = ops.find((o) => o.opType === 'create')

  if (unsyncedCreate) {
    // Never reached the server: drop everything locally.
    for (const o of ops) await d.delete('outbox', o.seq!)
    await d.delete('events', [ev.calendarId, ev.id])
    return
  }

  for (const o of ops) await d.delete('outbox', o.seq!) // superseded edits
  const existing = await d.get('events', [ev.calendarId, ev.id])
  if (existing) {
    existing.pending = 'delete' // filtered from views; row survives sync until flush
    await d.put('events', existing)
  }
  await d.add('outbox', {
    opType: 'delete',
    calendarId: ev.calendarId,
    eventId: ev.id,
    payload: {},
    ifMatchEtag: ev.etag || undefined,
    attempts: 0,
    nextAttemptMs: 0,
    createdMs: Date.now(),
  })
  kick()
}

// ---------- recurring scopes ----------

export type RecurringScope = 'this' | 'following' | 'all'

async function siblingRows(calendarId: string, masterId: string): Promise<EventRow[]> {
  const d = await db()
  const rows = await d.getAllFromIndex('events', 'byMaster', IDBKeyRange.only(masterId))
  return rows.filter((r) => r.calendarId === calendarId)
}

/** Optimistic approximation for series edits; the next sync reconciles exactly. */
async function shiftSiblings(
  ev: EventRow,
  rest: Partial<GEvent>,
  startDelta: number,
  endDelta: number,
  fromMs?: number,
): Promise<void> {
  const d = await db()
  const rows = await siblingRows(ev.calendarId, ev.recurringEventId!)
  for (const row of rows) {
    if (fromMs !== undefined && row.startMs < fromMs) continue
    const merged: GEvent = { ...(row as GEvent), ...rest }
    if (startDelta || endDelta) {
      merged.start = shiftGTime(row.start, startDelta)
      merged.end = shiftGTime(row.end, endDelta)
    }
    const next = normalizeEvent(merged, row.calendarId, row.baselineGen)
    next.pending = row.pending
    next.ephemeral = row.ephemeral
    await d.put('events', next)
  }
}

export async function patchEventScoped(ev: EventRow, patch: Partial<GEvent>, scope: RecurringScope): Promise<void> {
  if (scope === 'this' || !ev.recurringEventId) return patchEvent(ev, patch)
  const d = await db()
  const masterId = ev.recurringEventId
  const { start, end, ...rest } = patch
  const startDelta = start ? (parseGTime(start) ?? ev.startMs) - ev.startMs : 0
  const endDelta = end ? (parseGTime(end) ?? ev.endMs) - ev.endMs : 0

  if (scope === 'all') {
    await shiftSiblings(ev, rest, startDelta, endDelta)
    await d.add('outbox', {
      opType: 'patch',
      calendarId: ev.calendarId,
      eventId: masterId,
      master: true,
      payload: rest as Record<string, unknown>,
      timeDelta: startDelta || endDelta ? { startMs: startDelta, endMs: endDelta } : undefined,
      attempts: 0,
      nextAttemptMs: 0,
      createdMs: Date.now(),
    })
  } else {
    // 'following': server-side master split, optimistic local shift from here on
    await shiftSiblings(ev, rest, startDelta, endDelta, ev.startMs)
    const payload: SplitPayload = {
      instanceOriginalStart: ev.originalStartTime ?? ev.start ?? { dateTime: new Date(ev.startMs).toISOString() },
      newStart: (start as GDateTime | undefined) ?? ev.start,
      newEnd: (end as GDateTime | undefined) ?? ev.end,
      fields: rest,
      newId: newEventId(),
    }
    await d.add('outbox', {
      opType: 'splitRecurring',
      calendarId: ev.calendarId,
      eventId: masterId,
      master: true,
      payload,
      attempts: 0,
      nextAttemptMs: 0,
      createdMs: Date.now(),
    })
  }
  kick()
}

export async function deleteEventScoped(ev: EventRow, scope: RecurringScope): Promise<void> {
  if (scope === 'this' || !ev.recurringEventId) return deleteEvent(ev)
  const d = await db()
  const masterId = ev.recurringEventId
  const rows = await siblingRows(ev.calendarId, masterId)
  const fromMs = scope === 'following' ? ev.startMs : undefined
  for (const row of rows) {
    if (fromMs !== undefined && row.startMs < fromMs) continue
    await d.delete('events', [row.calendarId, row.id])
  }

  if (scope === 'all') {
    await d.add('outbox', {
      opType: 'delete',
      calendarId: ev.calendarId,
      eventId: masterId,
      master: true,
      payload: {},
      attempts: 0,
      nextAttemptMs: 0,
      createdMs: Date.now(),
    })
  } else {
    const payload: SplitPayload = {
      instanceOriginalStart: ev.originalStartTime ?? ev.start ?? { dateTime: new Date(ev.startMs).toISOString() },
      fields: {},
      newId: '',
      deleteOnly: true,
    }
    await d.add('outbox', {
      opType: 'splitRecurring',
      calendarId: ev.calendarId,
      eventId: masterId,
      master: true,
      payload,
      attempts: 0,
      nextAttemptMs: 0,
      createdMs: Date.now(),
    })
  }
  kick()
}

/** RSVP: patch own attendee responseStatus (attendees resolved at flush time). */
export async function rsvpEvent(
  ev: EventRow,
  response: 'accepted' | 'declined' | 'tentative',
): Promise<void> {
  const d = await db()
  const existing = await d.get('events', [ev.calendarId, ev.id])
  if (!existing?.attendees) return
  existing.attendees = existing.attendees.map((a) => (a.self ? { ...a, responseStatus: response } : a))
  if (existing.pending !== 'create') existing.pending = 'update'
  await d.put('events', existing)

  const ops = await opsForEvent(ev.calendarId, ev.id)
  const open = ops.find((o) => o.opType === 'rsvp')
  if (open) {
    open.payload = { response }
    await d.put('outbox', open)
  } else {
    await d.add('outbox', {
      opType: 'rsvp',
      calendarId: ev.calendarId,
      eventId: ev.id,
      payload: { response },
      attempts: 0,
      nextAttemptMs: 0,
      createdMs: Date.now(),
    })
  }
  kick()
}
