import { signal } from '@preact/signals'

export const MIN = 60_000
export const HOUR = 3600_000
export const DAY = 24 * HOUR

// px per hour — adjustable with a trackpad pinch on the grid. The static
// skeleton (index.html --hour-h) assumes the 56px default; TimeGrid overrides
// the var inline once hydrated. localStorage is absent in the service worker,
// hence the optional chaining.
const HOUR_H_MIN = 28
const HOUR_H_MAX = 140
const HOUR_H_DEFAULT = 56

function loadHourH(): number {
  const n = Number(globalThis.localStorage?.getItem('hourH'))
  return n >= HOUR_H_MIN && n <= HOUR_H_MAX ? n : HOUR_H_DEFAULT
}

export const hourH = signal<number>(loadHourH())

export function setHourH(px: number): void {
  const v = Math.round(Math.min(HOUR_H_MAX, Math.max(HOUR_H_MIN, px)) * 2) / 2
  if (v === hourH.value) return
  hourH.value = v
  localStorage.setItem('hourH', String(v))
}

export function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export function startOfWeek(d: Date, weekStartsOn = 0): Date {
  const r = startOfDay(d)
  const diff = (r.getDay() - weekStartsOn + 7) % 7
  r.setDate(r.getDate() - diff)
  return r
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function fmtTime(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours() % 12 || 12
  const m = d.getMinutes()
  const ap = d.getHours() < 12 ? 'AM' : 'PM'
  return m === 0 ? `${h} ${ap}` : `${h}:${String(m).padStart(2, '0')} ${ap}`
}

export function fmtTimeShort(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours() % 12 || 12
  const m = d.getMinutes()
  return m === 0 ? `${h}` : `${h}:${String(m).padStart(2, '0')}`
}

export const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** Wall-clock hours (0–24, fractional) of `ms` within the local day
 * [dayStartMs, dayEndMs). The grid's rows are wall-clock hours, so events
 * position by what the clock said — not elapsed time since midnight, which
 * runs an hour off after a DST transition (23h/25h days). */
export function wallHours(ms: number, dayStartMs: number, dayEndMs: number): number {
  if (ms <= dayStartMs) return 0
  if (ms >= dayEndMs) return 24
  const d = new Date(ms)
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
}

/** Scroll offset used by both the static skeleton and the hydrated grid. */
export function defaultScrollTop(todayVisible: boolean): number {
  if (todayVisible) {
    const now = new Date()
    return Math.max(0, (now.getHours() + now.getMinutes() / 60) * hourH.value - 180)
  }
  return 8 * hourH.value - 8
}

export function relTime(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
