import { render } from 'preact'
import { useState } from 'preact/hooks'
import { getToken, isOAuthConfigured } from './google/auth'
import { api } from './google/api'
import type { CalendarRow } from './data/types'

// Milestone 1: connection debug panel over the skeleton.
// Milestone 3 replaces this with the real app hydration.

function DebugPanel() {
  const [status, setStatus] = useState<string>(isOAuthConfigured() ? '' : 'oauth-missing')
  const [calendars, setCalendars] = useState<{ id: string; summary: string; primary?: boolean }[]>()

  async function connect() {
    setStatus('connecting…')
    try {
      await getToken(true)
      const res = await api<{ items: CalendarRow[] }>('/users/me/calendarList')
      console.log('calendarList', res.items)
      setCalendars(res.items)
      setStatus('connected')
    } catch (e) {
      setStatus(String(e))
    }
  }

  return (
    <div
      style={{
        position: 'fixed', top: 60, right: 16, width: 320, padding: 16,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, boxShadow: 'var(--shadow)', zIndex: 100,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>gcal setup</div>
      {status === 'oauth-missing' ? (
        <div style={{ color: 'var(--text-muted)' }}>
          No OAuth client configured. Follow README.md to create a Google Cloud OAuth client, then put
          its client ID in <code>public/manifest.json</code> and rebuild.
        </div>
      ) : (
        <>
          <button onClick={connect} style={{ padding: '6px 12px', cursor: 'pointer' }}>
            Connect Google
          </button>
          <div style={{ marginTop: 8, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{status}</div>
          {calendars && (
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {calendars.map((c) => (
                <li key={c.id}>
                  {c.summary}
                  {c.primary ? ' (primary)' : ''}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

const mount = document.createElement('div')
document.body.appendChild(mount)
render(<DebugPanel />, mount)
