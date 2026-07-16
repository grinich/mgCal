import { db } from '../data/db'
import type { EventRow } from '../data/types'
import { openApp } from './open-app'

const HOUR = 3600_000
const FIRE_WINDOW_MS = 2 * HOUR // rolling horizon, refreshed every sync tick
const LOOKAHEAD_MS = 7 * 24 * HOUR // max reminder lead we honor

let lastScheduled = 0

/** Clear and re-create rem| alarms from the current cache (self-healing). */
export async function scheduleReminders(force = false): Promise<void> {
  const now = Date.now()
  if (!force && now - lastScheduled < 30_000) return
  lastScheduled = now

  const all = await chrome.alarms.getAll()
  await Promise.all(all.filter((a) => a.name.startsWith('rem|')).map((a) => chrome.alarms.clear(a.name)))

  const d = await db()
  const cals = new Map((await d.getAll('calendars')).map((c) => [c.id, c]))
  const rows = await d.getAllFromIndex('events', 'byStart', IDBKeyRange.bound(now, now + LOOKAHEAD_MS))

  for (const ev of rows) {
    if (ev.status === 'cancelled' || ev.pending === 'delete' || ev.allDay) continue
    if (ev.attendees?.some((a) => a.self && a.responseStatus === 'declined')) continue
    const cal = cals.get(ev.calendarId)
    if (cal?.hidden) continue
    const overrides = ev.reminders?.useDefault ? cal?.defaultReminders : ev.reminders?.overrides
    for (const r of overrides ?? []) {
      if (r.method !== 'popup') continue
      const fireMs = ev.startMs - r.minutes * 60_000
      if (fireMs > now && fireMs <= now + FIRE_WINDOW_MS) {
        await chrome.alarms.create(`rem|${ev.calendarId}|${ev.id}|${fireMs}`, { when: fireMs })
      }
    }
  }
}

export async function onReminderAlarm(name: string): Promise<void> {
  const [, calendarId, eventId] = name.split('|')
  if (!calendarId || !eventId) return
  const d = await db()
  const ev = await d.get('events', [calendarId, eventId])
  // Guard against staleness: the event may have moved, been cancelled, or declined.
  if (!ev || ev.status === 'cancelled' || ev.pending === 'delete') return
  if (ev.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return
  if (ev.startMs < Date.now() - 5 * 60_000) return

  const t = new Date(ev.startMs)
  const timeStr = t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  await chrome.notifications.create(`ntf|${calendarId}|${eventId}`, {
    type: 'basic',
    iconUrl: 'icons/128.png',
    title: ev.summary || '(no title)',
    message: ev.location ? `${timeStr} · ${ev.location}` : timeStr,
    priority: 2,
    buttons: ev.hangoutLink ? [{ title: 'Join Meet' }] : undefined,
  })
}

export async function onNotificationClicked(id: string): Promise<void> {
  if (!id.startsWith('ntf|')) return
  await chrome.notifications.clear(id)
  await openApp()
}

export async function onNotificationButton(id: string, _buttonIndex: number): Promise<void> {
  if (!id.startsWith('ntf|')) return
  const [, calendarId, eventId] = id.split('|')
  const d = await db()
  const ev = await d.get('events', [calendarId!, eventId!])
  if (ev?.hangoutLink) await chrome.tabs.create({ url: ev.hangoutLink })
  await chrome.notifications.clear(id)
}
