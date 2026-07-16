import { signal } from '@preact/signals'
import { db, getSetting, setSetting } from '../../data/db'
import { deleteEvent, patchEvent } from '../../data/outbox'
import type { ConflictRecord } from '../../sw/flush'
import type { GEvent } from '../../data/types'

export const conflicts = signal<ConflictRecord[]>([])

export async function loadConflicts(): Promise<void> {
  conflicts.value = (await getSetting<ConflictRecord[]>('conflicts')) ?? []
}

export async function dismissConflict(id: string): Promise<void> {
  const next = conflicts.value.filter((c) => c.id !== id)
  await setSetting('conflicts', next)
  conflicts.value = next
}

/** "Retry with my version": re-apply the failed payload on top of the fresh server copy. */
export async function retryConflict(rec: ConflictRecord): Promise<void> {
  const d = await db()
  const row = await d.get('events', [rec.calendarId, rec.eventId])
  if (row) {
    if (rec.opType === 'delete') await deleteEvent(row)
    else await patchEvent(row, rec.payload as Partial<GEvent>)
  }
  await dismissConflict(rec.id)
}
