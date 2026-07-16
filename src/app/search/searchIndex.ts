import { db } from '../../data/db'
import type { EventRow } from '../../data/types'

let cache: EventRow[] | null = null

export function invalidateSearchIndex(): void {
  cache = null
}

async function ensureIndex(): Promise<EventRow[]> {
  if (!cache) {
    const d = await db()
    cache = await d.getAll('events')
  }
  return cache
}

export async function searchEvents(query: string, limit = 50): Promise<EventRow[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const terms = q.split(/\s+/)
  const rows = await ensureIndex()
  const now = Date.now()
  return rows
    .filter(
      (r) =>
        r.status !== 'cancelled' && r.pending !== 'delete' && terms.every((t) => r.searchText.includes(t)),
    )
    .sort((a, b) => Math.abs(a.startMs - now) - Math.abs(b.startMs - now)) // closest to now first
    .slice(0, limit)
}
