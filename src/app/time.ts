export const MIN = 60_000
export const HOUR = 3600_000
export const DAY = 24 * HOUR
export const HOUR_H = 56 // px per hour, must match --hour-h

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

/** Scroll offset used by both the static skeleton and the hydrated grid. */
export function defaultScrollTop(todayVisible: boolean): number {
  if (todayVisible) {
    const now = new Date()
    return Math.max(0, (now.getHours() + now.getMinutes() / 60) * HOUR_H - 180)
  }
  return 8 * HOUR_H - 8
}

export function relTime(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
