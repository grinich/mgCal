import type { CalendarRow } from '../data/types'
import { calendars, setCalendarsHidden, sidebarOpen, toggleCalendarHidden } from './state/signals'

function Section({ title, items }: { title: string; items: CalendarRow[] }) {
  if (!items.length) return null
  const ids = items.map((c) => c.id)
  return (
    <div class="sidebar-section">
      <div class="sidebar-title">
        {title}
        <span class="sidebar-bulk">
          <button
            class="bulk-btn"
            title={`Show all ${title.toLowerCase()}`}
            onClick={() => void setCalendarsHidden(ids, false)}
          >
            All
          </button>
          <button
            class="bulk-btn"
            title={`Hide all ${title.toLowerCase()}`}
            onClick={() => void setCalendarsHidden(ids, true)}
          >
            None
          </button>
        </span>
      </div>
      {items.map((c) => (
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
    </div>
  )
}

export function Sidebar() {
  const cals = calendars.value
  const mine = cals.filter((c) => c.accessRole === 'owner')
  const shared = cals.filter((c) => c.accessRole !== 'owner')
  // Stays mounted so open/close animates (margin slide + fade).
  return (
    <aside class={'sidebar' + (sidebarOpen.value ? '' : ' closed')}>
      <div class="sidebar-inner">
        <Section title="My calendars" items={mine} />
        <Section title="Other calendars" items={shared} />
      </div>
    </aside>
  )
}
