import {
  anchor,
  authError,
  authNeeded,
  calendars,
  connecting,
  goToday,
  navigate,
  settingsOpen,
  setView,
  toggleCalendarHidden,
  toggleSidebar,
  view,
} from './state/signals'
import { chipTextColor } from './colors'
import { fmtMonthYear, fmtTime } from './time'
import { connectGoogle } from './connect'
import { chipColor, toggleSelect } from './views/EventChip'
import { currentEvent, JOIN_KEY_HINT, ZoomIcon, ZoomJoinLink, zoomLink } from './zoom'

/**
 * Calendars that get a one-click toggle in the header, matched by name. Like
 * the category labels in colors.ts these are personal — edit them for your own
 * calendars; a pattern that matches nothing just doesn't render.
 */
const QUICK_CALENDARS: { match: RegExp; label: string }[] = [
  { match: /^MG Work$/i, label: 'Work' },
  { match: /^MG Personal$/i, label: 'Personal' },
  { match: /^SF Office Calendar$/i, label: 'SF Office' },
]

function CalendarToggles() {
  const cals = calendars.value
  const picked = QUICK_CALENDARS.flatMap((q) => {
    const cal = cals.find((c) => q.match.test(c.summary))
    return cal ? [{ label: q.label, cal }] : []
  })
  if (!picked.length) return null
  return (
    <div class="cal-toggles">
      {picked.map(({ label, cal }) => {
        const color = cal.backgroundColor ?? 'var(--accent)'
        return (
          <button
            key={cal.id}
            class={'cal-toggle' + (cal.hidden ? ' off' : '')}
            style={{ '--c': color, '--ct': chipTextColor(color) }}
            title={`${cal.hidden ? 'Show' : 'Hide'} ${cal.summary}`}
            aria-pressed={!cal.hidden}
            onClick={() => void toggleCalendarHidden(cal.id)}
          >
            <span class="cal-check">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 5.3l2 2 4-4.6" />
              </svg>
            </span>
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** Center pill: the meeting happening right now, plus a Zoom join shortcut. */
function NowPill() {
  const cur = currentEvent()
  if (!cur) return null
  const zoom = zoomLink(cur)
  return (
    <div class="now-center">
      <button
        class="now-pill"
        title="Show event details (t)"
        onClick={() => toggleSelect(cur)}
      >
        <span class="now-cal-dot" style={{ background: chipColor(cur) }} />
        <span class="now-title">{cur.summary || '(no title)'}</span>
        <span class="now-until">until {fmtTime(cur.endMs)}</span>
      </button>
      {zoom && (
        <ZoomJoinLink cls="zoom-btn" url={zoom}>
          <ZoomIcon />
          Join Zoom
          <kbd class="zoom-kbd">{JOIN_KEY_HINT}</kbd>
        </ZoomJoinLink>
      )}
    </div>
  )
}

export function Header() {
  return (
    <header class="header">
      <button class="icon-btn" title="Toggle sidebar (s)" onClick={toggleSidebar}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 4h12M2 8h12M2 12h12" stroke-linecap="round" />
        </svg>
      </button>
      <span class="title">{fmtMonthYear(anchor.value)}</span>
      <button class="btn" title="Today (g)" onClick={goToday}>
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
      <NowPill />
      <div class="spacer" />
      {authError.value && (
        <span class="auth-error" title={authError.value}>
          {authError.value}
        </span>
      )}
      {authNeeded.value && (
        <button class="btn accent" disabled={connecting.value} onClick={() => void connectGoogle()}>
          {connecting.value ? 'Connecting…' : 'Reconnect Google'}
        </button>
      )}
      <CalendarToggles />
      <div class="view-switch">
        {(['day', 'week', 'month'] as const).map((v) => (
          <button key={v} class={'seg' + (view.value === v ? ' active' : '')} onClick={() => setView(v)}>
            {v[0]!.toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      <button class="icon-btn" title="Settings" onClick={() => (settingsOpen.value = !settingsOpen.value)}>
        {/* Ring + stubby teeth + hub: a cog. The old circle-and-spokes read
            as a sun. */}
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
          <circle cx="8" cy="8" r="4.4" />
          <circle cx="8" cy="8" r="1.5" />
          <path d="M12.4 8h2 M11.11 11.11l1.42 1.42 M8 12.4v2 M4.89 11.11l-1.42 1.42 M3.6 8h-2 M4.89 4.89L3.47 3.47 M8 3.6v-2 M11.11 4.89l1.42-1.42" />
        </svg>
      </button>
    </header>
  )
}
