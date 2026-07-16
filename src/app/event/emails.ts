import { db } from '../../data/db'

/** Guest autocomplete corpus: every attendee email seen in cached events. */
export async function getKnownEmails(): Promise<string[]> {
  const d = await db()
  const rows = await d.getAll('events')
  const freq = new Map<string, number>()
  for (const r of rows) {
    for (const a of r.attendees ?? []) {
      if (a.email) freq.set(a.email, (freq.get(a.email) ?? 0) + 1)
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e)
}
