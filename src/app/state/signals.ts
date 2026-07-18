import { computed, effect, signal } from '@preact/signals'
import { db, eventsInRange } from '../../data/db'
import type { CalendarRow, EventRow, SyncStateRow } from '../../data/types'
import { addDays, addMonths, DAY, HOUR, isSameDay, MIN, startOfDay, startOfWeek } from '../time'

export type View = 'day' | 'week' | 'month'

export const view = signal<View>((localStorage.getItem('view') as View) || 'week')
// Every new tab opens on today; navigation only lasts for the tab's lifetime.
export const anchor = signal<Date>(new Date())
export const calendars = signal<CalendarRow[]>([])
export const events = signal<EventRow[]>([])
export const nowMs = signal<number>(Date.now())
export const authNeeded = signal<boolean>(false)
export const connected = signal<boolean>(true) // false until first calendar list arrives
export const sidebarOpen = signal<boolean>(localStorage.getItem('sidebar') === '1')
export const selectedKey = signal<string | null>(null) // `${calendarId}|${id}`
export const selectedAnchor = signal<{ x: number; y: number; w: number; h: number } | null>(null)
export const overflowList = signal<{
  events: EventRow[]
  anchor: { x: number; y: number; w: number; h: number }
} | null>(null)
export const helpOpen = signal<boolean>(false)
export const settingsOpen = signal<boolean>(false)
export const searchOpen = signal<boolean>(false)
export const debugOpen = signal<boolean>(false)

// ---------- sync status (drives the header badge + debug panel) ----------

export const syncStates = signal<SyncStateRow[]>([])
export const outboxCount = signal<number>(0)

export async function refreshSyncMeta(): Promise<void> {
  const d = await db()
  syncStates.value = (await d.getAll('syncState')).filter((s) => s.calendarId !== '$global')
  outboxCount.value = await d.count('outbox')
}

export async function setCalendarsHidden(ids: string[], hidden: boolean): Promise<void> {
  const d = await db()
  const tx = d.transaction('calendars', 'readwrite')
  for (const id of ids) {
    const cal = await tx.store.get(id)
    if (cal) {
      cal.hidden = hidden
      await tx.store.put(cal)
    }
  }
  await tx.done
  await refreshCalendars()
}
export const weekStart = signal<0 | 1>(localStorage.getItem('weekStart') === '1' ? 1 : 0)

export function setWeekStart(n: 0 | 1): void {
  weekStart.value = n
  localStorage.setItem('weekStart', String(n))
}

// ---------- event editor ----------

export interface EditorState {
  mode: 'create' | 'edit'
  original?: EventRow
  calendarId: string
  summary: string
  allDay: boolean
  startMs: number
  endMs: number
  location: string
  description: string
}

export const editor = signal<EditorState | null>(null)

export function writableCalendars(): CalendarRow[] {
  return calendars.value.filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer')
}

export function openCreate(startMs?: number, endMs?: number, allDay = false): void {
  const writable = writableCalendars()
  const cal = writable.find((c) => c.primary) ?? writable[0]
  if (!cal) return
  let s = startMs
  if (s == null) {
    const a = anchor.value
    const now = new Date()
    const base = isSameDay(a, now) ? now : new Date(a.getFullYear(), a.getMonth(), a.getDate(), 9)
    s = Math.ceil(base.getTime() / (30 * MIN)) * (30 * MIN)
  }
  editor.value = {
    mode: 'create',
    calendarId: cal.id,
    summary: '',
    allDay,
    startMs: s,
    endMs: endMs ?? s + (allDay ? DAY : HOUR),
    location: '',
    description: '',
  }
}

export function openEdit(ev: EventRow): void {
  editor.value = {
    mode: 'edit',
    original: ev,
    calendarId: ev.calendarId,
    summary: ev.summary ?? '',
    allDay: ev.allDay,
    startMs: ev.startMs,
    endMs: ev.endMs,
    location: ev.location ?? '',
    description: ev.description ?? '',
  }
}

export function selectedEvent(): EventRow | undefined {
  const key = selectedKey.value
  if (!key) return undefined
  return visibleEvents.value.find((e) => `${e.calendarId}|${e.id}` === key)
}

// ---------- recurring scope dialog ----------

export type RecurringScope = 'this' | 'following' | 'all'

export interface ScopeDialogState {
  summary: string
  action: 'edit' | 'delete'
  resolve: (s: RecurringScope | null) => void
}

export const scopeDialog = signal<ScopeDialogState | null>(null)

/** Resolve which instances a recurring edit applies to (asks the user). */
export function askScope(ev: EventRow, action: 'edit' | 'delete'): Promise<RecurringScope | null> {
  if (!ev.recurringEventId) return Promise.resolve('this')
  return new Promise((res) => {
    scopeDialog.value = {
      summary: ev.summary ?? '(no title)',
      action,
      resolve: (s) => {
        scopeDialog.value = null
        res(s)
      },
    }
  })
}

export interface Range {
  startMs: number
  endMs: number
}

export const range = computed<Range>(() => rangeForView(view.value, anchor.value))

export function rangeForView(v: View, a: Date): Range {
  if (v === 'day') {
    const s = startOfDay(a)
    return { startMs: s.getTime(), endMs: s.getTime() + DAY }
  }
  if (v === 'week') {
    const s = startOfWeek(a, weekStart.value)
    return { startMs: s.getTime(), endMs: s.getTime() + 7 * DAY }
  }
  // month: full weeks covering the month
  const first = new Date(a.getFullYear(), a.getMonth(), 1)
  const gridStart = startOfWeek(first, weekStart.value)
  const last = new Date(a.getFullYear(), a.getMonth() + 1, 0)
  const gridEnd = addDays(startOfWeek(last, weekStart.value), 7)
  return { startMs: gridStart.getTime(), endMs: gridEnd.getTime() }
}

export const visibleEvents = computed<EventRow[]>(() => {
  const hidden = new Set(calendars.value.filter((c) => c.hidden).map((c) => c.id))
  return events.value.filter((e) => !hidden.has(e.calendarId))
})

export const calendarById = computed<Map<string, CalendarRow>>(
  () => new Map(calendars.value.map((c) => [c.id, c])),
)

let refreshSeq = 0
export async function refreshEvents(): Promise<void> {
  const seq = ++refreshSeq
  const r = range.value
  const rows = await eventsInRange(r.startMs, r.endMs)
  if (seq === refreshSeq) events.value = rows
}

export async function refreshCalendars(): Promise<void> {
  const d = await db()
  const rows = await d.getAll('calendars')
  rows.sort((a, b) => Number(!!b.primary) - Number(!!a.primary) || a.summary.localeCompare(b.summary))
  calendars.value = rows
  if (rows.length) connected.value = true
}

export function setView(v: View): void {
  view.value = v
  localStorage.setItem('view', v)
}

export function setAnchor(d: Date): void {
  anchor.value = d
}

export function goToday(): void {
  setAnchor(new Date())
}

export function navigate(dir: 1 | -1): void {
  const a = anchor.value
  if (view.value === 'day') setAnchor(addDays(a, dir))
  else if (view.value === 'week') setAnchor(addDays(a, 7 * dir))
  else setAnchor(addMonths(a, dir))
}

export function toggleSidebar(): void {
  sidebarOpen.value = !sidebarOpen.value
  localStorage.setItem('sidebar', sidebarOpen.value ? '1' : '0')
}

export async function toggleCalendarHidden(id: string): Promise<void> {
  const d = await db()
  const cal = await d.get('calendars', id)
  if (!cal) return
  cal.hidden = !cal.hidden
  await d.put('calendars', cal)
  await refreshCalendars()
}

/** Wire subscriptions + fast poll. Call once at startup. */
export function initApp(): void {
  effect(() => {
    void range.value // track
    void refreshEvents()
  })

  chrome.runtime.onMessage.addListener((msg: { type?: string; calendarIds?: string[] }) => {
    if (msg?.type === 'write-conflict') {
      void import('./conflicts').then((m) => m.loadConflicts())
      return
    }
    if (msg?.type !== 'db-updated') return
    void refreshEvents()
    void refreshSyncMeta()
    if (msg.calendarIds?.includes('$calendars')) void refreshCalendars()
  })
  void import('./conflicts').then((m) => m.loadConflicts())

  window.addEventListener('gcal-local-write', () => {
    void refreshEvents()
    void refreshSyncMeta()
  })

  void refreshSyncMeta()
  setInterval(() => {
    if (document.visibilityState === 'visible') void refreshSyncMeta()
  }, 2500)

  void chrome.storage.local.get('authNeeded').then((v) => (authNeeded.value = !!v.authNeeded))
  chrome.storage.onChanged.addListener((changes) => {
    if ('authNeeded' in changes) authNeeded.value = !!changes.authNeeded?.newValue
  })

  void refreshCalendars().then(() => {
    if (!calendars.value.length) connected.value = false
  })

  // Clock for the now-line.
  setInterval(() => (nowMs.value = Date.now()), 30_000)

  // 1s foreground fast-poll; SW governor handles quota.
  const kick = (full = false) => chrome.runtime.sendMessage({ type: 'kick', full }).catch(() => {})
  let timer: ReturnType<typeof setInterval> | undefined
  const update = () => {
    if (document.visibilityState === 'visible' && !timer) {
      void kick()
      timer = setInterval(() => void kick(), 1000)
    } else if (document.visibilityState !== 'visible' && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
  document.addEventListener('visibilitychange', update)
  update()
  void kick(true) // full pass on open
}
