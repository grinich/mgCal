import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { getToken, isOAuthConfigured } from './google/auth'
import { db } from './data/db'

// Milestone 2: debug panel showing live sync state over the skeleton.
// Milestone 3 replaces this with the real app hydration.

function startFastPoll(): () => void {
  let timer: ReturnType<typeof setInterval> | undefined
  const tick = () => {
    if (document.visibilityState === 'visible') {
      chrome.runtime.sendMessage({ type: 'kick' }).catch(() => {})
    }
  }
  const update = () => {
    if (document.visibilityState === 'visible' && !timer) {
      tick()
      timer = setInterval(tick, 1000)
    } else if (document.visibilityState !== 'visible' && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
  document.addEventListener('visibilitychange', update)
  update()
  return () => {
    document.removeEventListener('visibilitychange', update)
    if (timer) clearInterval(timer)
  }
}

function DebugPanel() {
  const [status, setStatus] = useState<string>(isOAuthConfigured() ? '' : 'oauth-missing')
  const [counts, setCounts] = useState<{ calendars: number; events: number }>()
  const [authNeeded, setAuthNeeded] = useState(false)

  async function refreshCounts() {
    const d = await db()
    setCounts({ calendars: await d.count('calendars'), events: await d.count('events') })
  }

  useEffect(() => {
    void refreshCounts()
    void chrome.storage.local.get('authNeeded').then((v) => setAuthNeeded(!!v.authNeeded))
    const onMsg = (msg: { type?: string }) => {
      if (msg?.type === 'db-updated') void refreshCounts()
    }
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>) => {
      if ('authNeeded' in changes) setAuthNeeded(!!changes.authNeeded?.newValue)
    }
    chrome.runtime.onMessage.addListener(onMsg)
    chrome.storage.onChanged.addListener(onStorage)
    const stopPoll = startFastPoll()
    return () => {
      chrome.runtime.onMessage.removeListener(onMsg)
      chrome.storage.onChanged.removeListener(onStorage)
      stopPoll()
    }
  }, [])

  async function connect() {
    setStatus('connecting…')
    try {
      await getToken(true) // user-gesture interactive auth
      await chrome.runtime.sendMessage({ type: 'kick', full: true })
      setStatus('connected')
      setAuthNeeded(false)
      await refreshCounts()
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
      <div style={{ fontWeight: 600, marginBottom: 8 }}>gcal sync debug</div>
      {status === 'oauth-missing' ? (
        <div style={{ color: 'var(--text-muted)' }}>
          No OAuth client configured. Follow README.md to create a Google Cloud OAuth client, then put
          its client ID in <code>public/manifest.json</code> and rebuild.
        </div>
      ) : (
        <>
          {(authNeeded || !counts?.calendars) && (
            <button onClick={connect} style={{ padding: '6px 12px', cursor: 'pointer', marginBottom: 8 }}>
              Connect Google
            </button>
          )}
          <div style={{ color: 'var(--text-muted)' }}>
            {counts ? `${counts.calendars} calendars · ${counts.events} events cached` : 'reading cache…'}
          </div>
          {status && <div style={{ marginTop: 8, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{status}</div>}
        </>
      )}
    </div>
  )
}

const mount = document.createElement('div')
document.body.appendChild(mount)
render(<DebugPanel />, mount)
