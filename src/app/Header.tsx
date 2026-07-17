import {
  anchor,
  authNeeded,
  calendars,
  debugOpen,
  goToday,
  navigate,
  outboxCount,
  settingsOpen,
  setView,
  syncStates,
  toggleSidebar,
  view,
} from './state/signals'
import { fmtMonthYear, relTime } from './time'
import { connectGoogle } from './connect'

function SyncBadge() {
  const isDev = chrome.runtime.id === 'dev-shim'
  const cals = calendars.value
  const states = syncStates.value
  const byCal = new Map(states.map((s) => [s.calendarId, s]))
  const synced = cals.filter((c) => byCal.get(c.id)?.phase === 'incremental').length
  const errors = states.filter((s) => s.error).length
  const pending = outboxCount.value
  const lastSync = Math.max(0, ...states.map((s) => s.lastSyncedAt ?? 0))

  let cls = 'ok'
  let label: string
  if (isDev && states.length === 0) {
    cls = 'muted'
    label = 'Demo data'
  } else if (authNeeded.value) {
    cls = 'warn'
    label = 'Reconnect Google'
  } else if (cals.length > 0 && synced < cals.length) {
    cls = 'busy'
    label = `Syncing ${synced}/${cals.length} calendars…`
  } else if (pending > 0) {
    cls = 'busy'
    label = `Syncing ${pending} change${pending > 1 ? 's' : ''}…`
  } else if (errors > 0) {
    cls = 'warn'
    label = `${errors} sync issue${errors > 1 ? 's' : ''}`
  } else {
    label = 'Up to date'
  }

  return (
    <button
      class={'sync-badge ' + cls}
      title={(lastSync ? `Last sync ${relTime(lastSync)} · ` : '') + 'Click for sync details'}
      onClick={() => (debugOpen.value = true)}
    >
      {cls === 'busy' ? <span class="badge-spin" /> : <span class="badge-dot" />}
      {label}
    </button>
  )
}

export function Header() {
  return (
    <header class="header">
      <SyncBadge />
      <button class="icon-btn" title="Toggle sidebar (s)" onClick={toggleSidebar}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 4h12M2 8h12M2 12h12" stroke-linecap="round" />
        </svg>
      </button>
      <span class="title">{fmtMonthYear(anchor.value)}</span>
      <button class="btn" title="Today (t)" onClick={goToday}>
        Today
      </button>
      <div class="nav-btns">
        <button class="icon-btn" title="Previous (k)" onClick={() => navigate(-1)}>
          ‹
        </button>
        <button class="icon-btn" title="Next (j)" onClick={() => navigate(1)}>
          ›
        </button>
      </div>
      <div class="spacer" />
      {authNeeded.value && (
        <button class="btn accent" onClick={() => void connectGoogle()}>
          Reconnect Google
        </button>
      )}
      <div class="view-switch">
        {(['day', 'week', 'month'] as const).map((v) => (
          <button key={v} class={'seg' + (view.value === v ? ' active' : '')} onClick={() => setView(v)}>
            {v[0]!.toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      <button class="icon-btn" title="Settings" onClick={() => (settingsOpen.value = !settingsOpen.value)}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke-linecap="round" />
        </svg>
      </button>
    </header>
  )
}
