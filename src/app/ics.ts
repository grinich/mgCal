// Drag-and-drop .ics import flow. The parser itself is in src/data/ics.ts.
import { parseIcs } from '../data/ics'
import { createEvent } from '../data/outbox'
import type { CalendarRow, GDateTime, GEvent } from '../data/types'
import { calendars } from './state/signals'

export interface IcsImportResult {
  added: number
  skipped: number
}

export interface IcsImportPlan {
  /** Calendar the events would be created in. */
  target: CalendarRow
  events: Partial<GEvent>[]
  /** Dropped files that weren't .ics or held no VEVENTs. */
  skipped: number
}

/**
 * Read dropped .ics files and describe what importing them would do, without
 * writing anything. Imports create real events on a real calendar and there's
 * no undo, so the drop is always confirmed first — see DropZone.
 */
export async function planIcsImport(files: File[]): Promise<IcsImportPlan | null> {
  const writable = calendars.value.filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer')
  const target = writable.find((c) => c.primary) ?? writable[0]
  if (!target) return null

  const events: Partial<GEvent>[] = []
  let skipped = 0
  for (const file of files) {
    if (!/\.ics$/i.test(file.name) && file.type !== 'text/calendar') {
      skipped++
      continue
    }
    const parsed = parseIcs(await file.text())
    if (!parsed.length) skipped++
    events.push(...parsed)
  }
  return { target, events, skipped }
}

/** Commit a confirmed plan. */
export async function commitIcsImport(plan: IcsImportPlan): Promise<IcsImportResult> {
  for (const ev of plan.events) {
    await createEvent(plan.target.id, ev as Partial<GEvent> & { start: GDateTime; end: GDateTime })
  }
  return { added: plan.events.length, skipped: plan.skipped }
}
