import {
  authNeeded,
  calendars,
  connecting,
  debugOpen,
  notifyGuests,
  outboxCount,
  setNotifyGuests,
  setUpdateChecks,
  setWeekStart,
  settingsOpen,
  syncStates,
  updateChecks,
  weekStart,
} from './state/signals'
import { applyTheme, getTheme, type Theme } from './theme'
import { relTime } from './time'
import { useState } from 'preact/hooks'

/** Live sync state. It used to sit in the header, but it's status rather than
 * a control — the only thing to do with it is open the sync details. */
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
  } else if (connecting.value) {
    cls = 'busy'
    label = 'Connecting…'
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
      onClick={() => {
        settingsOpen.value = false
        debugOpen.value = true
      }}
    >
      {cls === 'busy' ? <span class="badge-spin" /> : <span class="badge-dot" />}
      {label}
    </button>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div class="view-switch">
      {[true, false].map((v) => (
        <button key={String(v)} class={'seg' + (on === v ? ' active' : '')} onClick={() => onChange(v)}>
          {v ? 'On' : 'Off'}
        </button>
      ))}
    </div>
  )
}

export function SettingsPanel() {
  const [theme, setTheme] = useState<Theme>(getTheme())
  if (!settingsOpen.value) return null
  return (
    <div class="overlay" onClick={() => (settingsOpen.value = false)}>
      <div class="panel" onClick={(e) => e.stopPropagation()}>
        <div class="panel-title">Settings</div>
        <div class="setting-row">
          <span>
            Sync
            <small class="setting-sub">Per-calendar detail and pending writes</small>
          </span>
          <SyncBadge />
        </div>
        <div class="setting-row">
          <span>Theme</span>
          <div class="view-switch">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                class={'seg' + (theme === t ? ' active' : '')}
                onClick={() => {
                  setTheme(t)
                  applyTheme(t)
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div class="setting-row">
          <span>Week starts on</span>
          <div class="view-switch">
            {([0, 1] as const).map((n) => (
              <button
                key={n}
                class={'seg' + (weekStart.value === n ? ' active' : '')}
                onClick={() => setWeekStart(n)}
              >
                {n === 0 ? 'Sunday' : 'Monday'}
              </button>
            ))}
          </div>
        </div>
        <div class="setting-row">
          <span>
            Email guests on changes
            <small class="setting-sub">Google notifies attendees whenever you edit an event with guests</small>
          </span>
          <Toggle on={notifyGuests.value} onChange={(v) => void setNotifyGuests(v)} />
        </div>
        <div class="setting-row">
          <span>
            Check for updates
            <small class="setting-sub">Asks GitHub for the latest release twice a day</small>
          </span>
          <Toggle on={updateChecks.value} onChange={(v) => void setUpdateChecks(v)} />
        </div>
        <div class="panel-hint">
          Keyboard shortcut to open the calendar from anywhere: configure at{' '}
          <code>chrome://extensions/shortcuts</code>
        </div>
      </div>
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['t', 'Select current event'],
  ['g', 'Go to today'],
  ['j / n', 'Next period'],
  ['k / p', 'Previous period'],
  ['d', 'Day view'],
  ['w', 'Week view'],
  ['m', 'Month view'],
  ['c', 'Create event'],
  ['/', 'Search'],
  ['e', 'Open selected event'],
  ['⌫', 'Delete selected event'],
  ['⌘↵', 'Join current Zoom meeting'],
  ['pinch', 'Zoom time scale in/out'],
  ['s', 'Toggle sidebar'],
  ['Esc', 'Close / deselect'],
  ['?', 'This help'],
]

export function HelpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div class="overlay" onClick={onClose}>
      <div class="panel" onClick={(e) => e.stopPropagation()}>
        <div class="panel-title">Keyboard shortcuts</div>
        <div class="shortcut-grid">
          {SHORTCUTS.map(([k, desc]) => (
            <div key={k} class="shortcut-row">
              <kbd>{k}</kbd>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
