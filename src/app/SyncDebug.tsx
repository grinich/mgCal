import { useEffect, useState } from 'preact/hooks'
import { db } from '../data/db'
import type { CalendarRow, OutboxOp, SyncStateRow } from '../data/types'
import { conflicts } from './state/conflicts'
import { authNeeded, calendars, debugOpen } from './state/signals'
import { relTime } from './time'

interface CalDebugRow {
  cal: CalendarRow
  st?: SyncStateRow
  count: number
}

interface DebugData {
  rows: CalDebugRow[]
  ops: OutboxOp[]
  totalEvents: number
}

async function loadDebug(): Promise<DebugData> {
  const d = await db()
  const states = new Map(
    (await d.getAll('syncState')).map((s) => [s.calendarId, s]),
  )
  const rows: CalDebugRow[] = []
  for (const cal of calendars.value) {
    const count = await d.countFromIndex(
      'events',
      'byCalStart',
      IDBKeyRange.bound([cal.id, -Infinity], [cal.id, Infinity]),
    )
    rows.push({ cal, st: states.get(cal.id), count })
  }
  rows.sort((a, b) => b.count - a.count)
  return { rows, ops: await d.getAll('outbox'), totalEvents: await d.count('events') }
}

function phaseBadge(st?: SyncStateRow): { label: string; cls: string } {
  if (!st) return { label: 'not started', cls: 'muted' }
  if (st.error) return { label: 'error', cls: 'err' }
  if (st.phase === 'full') return { label: st.pageToken ? 'baselining…' : 'baseline', cls: 'busy' }
  if (st.phase === 'incremental') return { label: 'live', cls: 'ok' }
  return { label: st.phase, cls: 'muted' }
}

export function SyncDebug() {
  if (!debugOpen.value) return null
  return <Panel />
}

function Panel() {
  const [data, setData] = useState<DebugData | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    const tick = () => void loadDebug().then((d) => alive && setData(d))
    tick()
    const t = setInterval(tick, 1500)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const kickFull = () => void chrome.runtime.sendMessage({ type: 'kick', full: true }).catch(() => {})
  const resetVisibility = () =>
    void chrome.runtime.sendMessage({ type: 'resetVisibility' }).catch(() => {})
  const copyDebug = () => {
    void navigator.clipboard
      .writeText(
        JSON.stringify(
          {
            at: new Date().toISOString(),
            authNeeded: authNeeded.value,
            totalEvents: data?.totalEvents,
            calendars: data?.rows.map((r) => ({
              id: r.cal.id,
              summary: r.cal.summary,
              hidden: !!r.cal.hidden,
              events: r.count,
              phase: r.st?.phase,
              lastSyncedAt: r.st?.lastSyncedAt,
              baselinedAt: r.st?.baselinedAt,
              hasPageToken: !!r.st?.pageToken,
              error: r.st?.error,
            })),
            outbox: data?.ops,
          },
          null,
          2,
        ),
      )
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
  }

  return (
    <div class="overlay" onClick={() => (debugOpen.value = false)}>
      <div class="panel debug-panel" onClick={(e) => e.stopPropagation()}>
        <div class="debug-head">
          <div class="panel-title">Sync debug</div>
          <div class="spacer" />
          <button class="btn" onClick={kickFull}>Full sync now</button>
          <button class="btn" title="Re-apply Google Calendar's show/hide selections" onClick={resetVisibility}>
            Match Google visibility
          </button>
          <button class="btn" onClick={copyDebug}>{copied ? 'Copied ✓' : 'Copy debug info'}</button>
          <button class="icon-btn" onClick={() => (debugOpen.value = false)}>✕</button>
        </div>

        {!data ? (
          <div class="muted">Loading…</div>
        ) : (
          <>
            <div class="debug-summary">
              <span>{data.totalEvents} events cached</span>
              <span>{data.rows.length} calendars</span>
              <span>{data.ops.length} queued writes</span>
              <span>{conflicts.value.length} conflicts</span>
              {authNeeded.value && <span class="debug-err">auth needed</span>}
            </div>

            <table class="debug-table">
              <thead>
                <tr>
                  <th>Calendar</th><th>Status</th><th>Events</th><th>Last sync</th><th>Baselined</th><th>Error</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const b = phaseBadge(r.st)
                  return (
                    <tr key={r.cal.id} class={r.cal.hidden ? 'dimmed' : ''}>
                      <td class="debug-cal">
                        <span class="cal-dot" style={{ '--c': r.cal.backgroundColor ?? 'var(--accent)' }} />
                        {r.cal.summary}
                      </td>
                      <td><span class={'debug-badge ' + b.cls}>{b.label}</span></td>
                      <td>{r.count}</td>
                      <td>{r.st?.lastSyncedAt ? relTime(r.st.lastSyncedAt) : '—'}</td>
                      <td>{r.st?.baselinedAt ? relTime(r.st.baselinedAt) : '—'}</td>
                      <td class="debug-error" title={r.st?.error}>{r.st?.error ? r.st.error.slice(0, 48) : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {data.ops.length > 0 && (
              <>
                <div class="panel-title debug-sub">Outbox ({data.ops.length})</div>
                <table class="debug-table">
                  <thead>
                    <tr><th>#</th><th>Op</th><th>Event</th><th>Attempts</th><th>Next try</th><th>Last error</th></tr>
                  </thead>
                  <tbody>
                    {data.ops.slice(0, 20).map((op) => (
                      <tr key={op.seq}>
                        <td>{op.seq}</td>
                        <td>{op.opType}</td>
                        <td class="debug-error">{String(op.payload.summary ?? op.eventId).slice(0, 28)}</td>
                        <td>{op.attempts}</td>
                        <td>{op.nextAttemptMs > Date.now() ? `in ${Math.round((op.nextAttemptMs - Date.now()) / 1000)}s` : 'now'}</td>
                        <td class="debug-error" title={op.lastError}>{op.lastError?.slice(0, 40) ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
