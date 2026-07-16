import { api } from '../google/api'

// The Calendar API's freeBusy endpoint expands Google Groups into member
// calendar IDs (emails) — no Directory API needed. Cached per SW lifetime.
const cache = new Map<string, string[]>()

export async function expandGroup(email: string): Promise<string[]> {
  const hit = cache.get(email)
  if (hit) return hit
  const now = Date.now()
  const resp = await api<{ groups?: Record<string, { calendars?: string[]; errors?: unknown[] }> }>(
    '/freeBusy',
    {
      method: 'POST',
      body: {
        timeMin: new Date(now).toISOString(),
        timeMax: new Date(now + 3600_000).toISOString(),
        items: [{ id: email }],
        groupExpansionMax: 100,
      },
    },
  )
  const members = resp.groups?.[email]?.calendars ?? []
  cache.set(email, members)
  return members
}
