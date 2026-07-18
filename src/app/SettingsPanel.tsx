import { setWeekStart, settingsOpen, weekStart } from './state/signals'
import { applyTheme, getTheme, type Theme } from './theme'
import { useState } from 'preact/hooks'

export function SettingsPanel() {
  const [theme, setTheme] = useState<Theme>(getTheme())
  if (!settingsOpen.value) return null
  return (
    <div class="overlay" onClick={() => (settingsOpen.value = false)}>
      <div class="panel" onClick={(e) => e.stopPropagation()}>
        <div class="panel-title">Settings</div>
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
        <div class="panel-hint">
          Keyboard shortcut to open the calendar from anywhere: configure at{' '}
          <code>chrome://extensions/shortcuts</code>
        </div>
      </div>
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['t', 'Go to today'],
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
