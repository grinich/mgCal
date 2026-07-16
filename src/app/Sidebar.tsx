import { calendars, sidebarOpen, toggleCalendarHidden } from './state/signals'

export function Sidebar() {
  if (!sidebarOpen.value) return null
  return (
    <aside class="sidebar">
      <div class="sidebar-title">Calendars</div>
      {calendars.value.map((c) => (
        <label key={c.id} class="cal-row" title={c.id}>
          <span
            class={'cal-dot' + (c.hidden ? ' off' : '')}
            style={{ '--c': c.backgroundColor ?? 'var(--accent)' }}
          />
          <input
            type="checkbox"
            checked={!c.hidden}
            onChange={() => void toggleCalendarHidden(c.id)}
            style={{ display: 'none' }}
          />
          <span class={'cal-name' + (c.hidden ? ' off' : '')}>{c.summary}</span>
        </label>
      ))}
    </aside>
  )
}
