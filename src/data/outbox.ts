// Page-side write API: apply edits to the local cache instantly, queue ops in
// the persistent outbox, and kick the service worker to push them.
import { db, normalizeEvent } from './db'
import { newEventId } from './ids'
import type { EventRow, GEvent, OutboxOp } from './types'

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
