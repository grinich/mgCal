// Dev-only harness: lets the app page run in a plain browser tab (vite dev on
// localhost) with a chrome.* shim and seeded data. Nothing here talks to Google
// — the shim's getAuthToken returns a fake token and the data is written
// straight to IndexedDB. Never ships in the extension build; main.tsx only
// imports this behind import.meta.env.DEV.
//
// Seeds from a real calendar export when MGCAL_DEV_EVENTS points at one (see
// README), otherwise from the synthetic demo data below. Exports live outside
// the repo so real attendee emails can't be committed.
import devEvents from 'virtual:mgcal-dev-events'
import { db, getSetting, normalizeEvent, setSetting } from '../data/db'
import type { CalendarRow, GAttendee, GEvent } from '../data/types'

export interface RealData {
  fetchedAt: string
  calendars: CalendarRow[]
  events: (GEvent & { calendarId: string })[]
}

export async function installDevMode(): Promise<void> {
  installChromeShim()
  if (devEvents) await seedReal(devEvents)
  else await seed()
}

async function seedReal(real: RealData): Promise<void> {
  const d = await db()
  const marker = `real:${real.fetchedAt}:${real.events.length}`
  if ((await getSetting<string>('devSeed')) === marker) return
  await d.clear('events')
  await d.clear('calendars')
  await d.clear('outbox')
  for (const c of real.calendars) await d.put('calendars', c)
  for (const e of real.events) {
    const { calendarId, ...ev } = e
    await d.put('events', normalizeEvent(ev as GEvent, calendarId, 1))
  }
  await setSetting('devSeed', marker)
  console.log(`[gcal dev] seeded ${real.events.length} REAL events from ${real.calendars.length} calendars`)
}

function installChromeShim(): void {
  const g = globalThis as { chrome?: typeof chrome }
  if (g.chrome?.runtime?.id) return
  const store: Record<string, unknown> = {}
  g.chrome = {
    runtime: {
      id: 'dev-shim',
      sendMessage: (msg: { type?: string }) =>
        Promise.resolve(msg?.type === 'kick' ? { ok: true } : { ok: false, error: 'not available in dev' }),
      onMessage: { addListener: () => {}, removeListener: () => {} },
      getManifest: () => ({
        manifest_version: 3,
        name: 'gcal-dev',
        version: '0.0.0',
        oauth2: { client_id: 'dev-shim.apps.googleusercontent.com', scopes: [] },
      }),
    },
    storage: {
      local: {
        get: (keys: string | string[]) => {
          const ks = Array.isArray(keys) ? keys : [keys]
          return Promise.resolve(Object.fromEntries(ks.map((k) => [k, store[k]])))
        },
        set: (obj: Record<string, unknown>) => {
          Object.assign(store, obj)
          return Promise.resolve()
        },
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    identity: {
      getAuthToken: () => Promise.resolve({ token: 'dev-token' }),
      removeCachedAuthToken: () => Promise.resolve(),
    },
  } as unknown as typeof chrome
}

const CALS: CalendarRow[] = [
  { id: 'work', summary: 'Work', backgroundColor: '#4f6bed', accessRole: 'owner', primary: true },
  { id: 'personal', summary: 'Personal', backgroundColor: '#188038', accessRole: 'owner' },
  { id: 'team', summary: 'Team Events', backgroundColor: '#f4511e', accessRole: 'writer' },
  { id: 'family', summary: 'Family', backgroundColor: '#8e24aa', accessRole: 'writer' },
]

const ME: GAttendee = { email: 'mg@example.com', displayName: 'MG', self: true, responseStatus: 'accepted' }

let seq = 0
function mk(
  calendarId: string,
  summary: string,
  dayOffset: number,
  startHour: number,
  hours: number,
  extra: Partial<GEvent> = {},
): { calendarId: string; ev: GEvent } {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + dayOffset)
  const start = new Date(d.getTime() + startHour * 3600_000)
  const end = new Date(start.getTime() + hours * 3600_000)
  return {
    calendarId,
    ev: {
      id: `dev${seq++}`,
      etag: `"e${seq}"`,
      status: 'confirmed',
      summary,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      ...extra,
    },
  }
}

function mkAllDay(
  calendarId: string,
  summary: string,
  dayOffset: number,
  days = 1,
  extra: Partial<GEvent> = {},
): { calendarId: string; ev: GEvent } {
  const ymd = (off: number) => {
    const d = new Date()
    d.setDate(d.getDate() + off)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return {
    calendarId,
    ev: {
      id: `dev${seq++}`,
      etag: `"e${seq}"`,
      status: 'confirmed',
      summary,
      start: { date: ymd(dayOffset) },
      end: { date: ymd(dayOffset + days) },
      ...extra,
    },
  }
}

async function seed(): Promise<void> {
  const d = await db()
  if ((await d.count('calendars')) > 0) return

  for (const c of CALS) await d.put('calendars', c)

  const dow = new Date().getDay() // seed relative to the current week (Sun=0)
  const mon = 1 - dow // offset to this week's Monday
  const guests: GAttendee[] = [
    { email: 'sam@example.com', displayName: 'Sam Reyes', responseStatus: 'accepted', organizer: true },
    { email: 'jo@example.com', displayName: 'Jo Chen', responseStatus: 'tentative' },
    { email: 'ari@example.com', displayName: 'Ari Patel', responseStatus: 'needsAction' },
    { ...ME, responseStatus: 'needsAction' },
  ]

  const events = [
    // recurring standup instances across three weeks
    ...[-7, 0, 7].flatMap((w) =>
      [0, 1, 2, 3, 4].map((i) =>
        mk('work', 'Standup', mon + i + w, 9.5, 0.25, {
          recurringEventId: 'standup-master',
          originalStartTime: { dateTime: new Date(Date.now() + (mon + i + w) * 86400_000).toISOString() },
        }),
      ),
    ),
    mk('work', 'Design review', mon + 1, 11, 1, { attendees: guests, hangoutLink: 'https://meet.google.com/dev-mock', location: 'Zoom / HQ 4F' }),
    mk('work', 'Product sync', mon + 2, 14, 1, { attendees: guests.slice(0, 2).concat(ME) }),
    // overlapping cluster wednesday afternoon
    mk('work', 'Architecture deep-dive', mon + 2, 13, 2.5),
    mk('team', 'Interview: staff eng', mon + 2, 13.5, 1, { location: 'Conf Rm B' }),
    mk('work', '1:1 with Sam', mon + 2, 14.5, 0.5, { hangoutLink: 'https://meet.google.com/dev-mock' }),
    mk('work', 'Declined: vendor pitch', mon + 3, 10, 1, {
      attendees: [{ ...ME, responseStatus: 'declined' }, guests[0]!],
    }),
    mk('work', 'Focus block', mon + 3, 13, 3, { transparency: 'transparent' }),
    mk('personal', 'Gym', mon, 7, 1),
    mk('personal', 'Gym', mon + 2, 7, 1),
    mk('personal', 'Gym', mon + 4, 7, 1),
    mk('personal', 'Dinner with Alex', mon + 4, 19, 2, { location: 'Nopa' }),
    mk('family', 'School pickup', mon + 1, 15.25, 0.5),
    mk('team', 'Offsite planning', mon + 8, 10, 2),
    mk('work', 'Quarterly review', mon + 9, 9, 3, { attendees: guests }),
    mk('personal', 'Dentist', mon - 3, 8.5, 1),
    mkAllDay('team', 'Company offsite', mon + 2, 3),
    mkAllDay('personal', 'Marathon training week', mon, 1),
    mkAllDay('family', "Nana's birthday", mon + 5),
    mkAllDay('work', 'Perf cycle self-reviews due', mon + 11),
    // month-view filler
    ...[-14, -10, 16, 20, 24].map((off) => mk('work', 'Planning sync', off, 10, 1)),
  ]

  for (const { calendarId, ev } of events) {
    await d.put('events', normalizeEvent(ev, calendarId, 1))
  }
  console.log(`[gcal dev] seeded ${events.length} events across ${CALS.length} calendars`)
}
