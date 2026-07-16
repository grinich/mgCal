// Minimal RRULE string surgery — we never expand recurrences locally
// (the server does that via singleEvents=true); we only rewrite rules
// for "this and following" splits and build preset rules for creation.
import type { GDateTime } from './types'

/** RRULE UNTIL for splits: last allowed moment before the split instance. */
export function untilBefore(originalStart: GDateTime): string {
  if (originalStart.date) {
    const [y, m, d] = originalStart.date.split('-').map(Number)
    const prev = new Date(Date.UTC(y!, m! - 1, d! - 1))
    return basicDate(prev)
  }
  const t = new Date(Date.parse(originalStart.dateTime!) - 1000)
  return (
    basicDate(t) +
    'T' +
    String(t.getUTCHours()).padStart(2, '0') +
    String(t.getUTCMinutes()).padStart(2, '0') +
    String(t.getUTCSeconds()).padStart(2, '0') +
    'Z'
  )
}

function basicDate(d: Date): string {
  return (
    String(d.getUTCFullYear()) +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0')
  )
}

/** Truncate a recurrence list so the series ends before the split point. */
export function truncateRecurrence(recurrence: string[], until: string): string[] {
  return recurrence.map((line) => {
    if (!line.toUpperCase().startsWith('RRULE:')) return line
    const parts = line
      .slice(6)
      .split(';')
      .filter((p) => {
        const k = p.split('=')[0]?.toUpperCase()
        return k !== 'UNTIL' && k !== 'COUNT' // COUNT→UNTIL conversion
      })
    parts.push(`UNTIL=${until}`)
    return 'RRULE:' + parts.join(';')
  })
}

/** New series after a split keeps the original end condition minus COUNT. */
export function stripCount(recurrence: string[]): string[] {
  return recurrence.map((line) => {
    if (!line.toUpperCase().startsWith('RRULE:')) return line
    const parts = line
      .slice(6)
      .split(';')
      .filter((p) => p.split('=')[0]?.toUpperCase() !== 'COUNT')
    return parts.length ? 'RRULE:' + parts.join(';') : line
  })
}

/** Whether any RRULE line carries a COUNT bound, and its value. */
export function getCount(recurrence: string[]): number | undefined {
  for (const line of recurrence) {
    if (!line.toUpperCase().startsWith('RRULE:')) continue
    const m = /(?:^|;)COUNT=(\d+)/i.exec(line.slice(6))
    if (m) return Number(m[1])
  }
  return undefined
}

/** Replace/insert COUNT=n on the RRULE line (used for post-split tails). */
export function replaceCount(recurrence: string[], n: number): string[] {
  return recurrence.map((line) => {
    if (!line.toUpperCase().startsWith('RRULE:')) return line
    const parts = line
      .slice(6)
      .split(';')
      .filter((p) => {
        const k = p.split('=')[0]?.toUpperCase()
        return k !== 'COUNT' && k !== 'UNTIL'
      })
    parts.push(`COUNT=${n}`)
    return 'RRULE:' + parts.join(';')
  })
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export type RecurrencePreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays'

export function presetLabel(p: RecurrencePreset, start: Date): string {
  switch (p) {
    case 'none':
      return 'Does not repeat'
    case 'daily':
      return 'Daily'
    case 'weekly':
      return `Weekly on ${start.toLocaleDateString(undefined, { weekday: 'long' })}`
    case 'monthly':
      return `Monthly on day ${start.getDate()}`
    case 'yearly':
      return `Annually on ${start.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`
    case 'weekdays':
      return 'Every weekday (Mon–Fri)'
  }
}

export function presetRule(p: RecurrencePreset, start: Date): string[] | undefined {
  switch (p) {
    case 'none':
      return undefined
    case 'daily':
      return ['RRULE:FREQ=DAILY']
    case 'weekly':
      return [`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[start.getDay()]}`]
    case 'monthly':
      return ['RRULE:FREQ=MONTHLY']
    case 'yearly':
      return ['RRULE:FREQ=YEARLY']
    case 'weekdays':
      return ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']
  }
}
