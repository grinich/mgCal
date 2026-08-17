// Minimal .ics (RFC 5545) reader — enough to import dropped invite files.
// Pure: no DOM, no app state, no writes. The import flow that consumes this
// lives in src/app/ics.ts.
import type { GDateTime, GEvent } from './types'

interface Prop {
  params: Record<string, string>
  value: string
}

function unfold(text: string): string[] {
  return text
    .replace(/\r\n[ \t]/g, '')
    .replace(/\r/g, '')
    .split('\n')
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
}

function parseTime(p: Prop | undefined): GDateTime | undefined {
  if (!p) return undefined
  const v = p.value.trim()
  if (p.params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    return { date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` }
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v)
  if (!m) return undefined
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7]}`
  if (m[7]) return { dateTime: iso }
  return { dateTime: iso, timeZone: p.params.TZID ?? Intl.DateTimeFormat().resolvedOptions().timeZone }
}

export function parseIcs(text: string): Partial<GEvent>[] {
  const events: Partial<GEvent>[] = []
  let cur: Record<string, Prop[]> | null = null

  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      cur = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur) {
        const get = (name: string) => cur![name]?.[0]
        const start = parseTime(get('DTSTART'))
        let end = parseTime(get('DTEND'))
        if (start && !end) {
          // Default duration: 1h for timed, 1 day (exclusive end) for all-day.
          if (start.date) {
            // All in UTC: `new Date("YYYY-MM-DD")` is UTC midnight, so stepping
            // it with the LOCAL setDate/getDate pair moved it by a local day —
            // 23h across spring-forward, which rounded the end back onto the
            // start date and left a zero-length event that never rendered.
            const [y, m, d] = start.date.split('-').map(Number)
            end = { date: new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10) }
          } else {
            end = { dateTime: new Date(Date.parse(start.dateTime!) + 3600_000).toISOString() }
          }
        }
        const rrules = (cur['RRULE'] ?? []).map((r) => 'RRULE:' + r.value)
        const ev: Partial<GEvent> = {
          summary: get('SUMMARY') ? unescape(get('SUMMARY')!.value) : undefined,
          location: get('LOCATION') ? unescape(get('LOCATION')!.value) : undefined,
          description: get('DESCRIPTION') ? unescape(get('DESCRIPTION')!.value).slice(0, 4000) : undefined,
          start,
          end,
          recurrence: rrules.length ? rrules : undefined,
        }
        if (start && end) events.push(ev)
      }
      cur = null
      continue
    }
    if (!cur) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const [head, value] = [line.slice(0, idx), line.slice(idx + 1)]
    const [name, ...paramParts] = head.split(';')
    const params: Record<string, string> = {}
    for (const part of paramParts) {
      const eq = part.indexOf('=')
      if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '')
    }
    ;(cur[name!.toUpperCase()] ??= []).push({ params, value })
  }
  return events
}
