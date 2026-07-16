import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { TimeGrid } from './views/TimeGrid'
import { MonthView } from './views/MonthView'
import { anchor, connected, helpOpen, view, visibleEvents, weekStart } from './state/signals'
import { addDays, startOfDay, startOfWeek } from './time'
import { connectGoogle } from './connect'
import { isOAuthConfigured } from '../google/auth'
import { HelpOverlay, SettingsPanel } from './SettingsPanel'
import { EventEditor } from './event/EventEditor'
import { EventPopover } from './event/EventPopover'
import { RecurrenceScopeDialog } from './event/RecurrenceScopeDialog'
import { Toasts } from './Toasts'

export function App() {
  const v = view.value
  const evts = visibleEvents.value

  let body
  if (!connected.value) {
    body = <ConnectCard />
  } else if (v === 'month') {
    body = <MonthView events={evts} />
  } else {
    const start = v === 'day' ? startOfDay(anchor.value) : startOfWeek(anchor.value, weekStart.value)
    const days = Array.from({ length: v === 'day' ? 1 : 7 }, (_, i) => addDays(start, i))
    body = <TimeGrid days={days} events={evts} />
  }

  return (
    <div class="app">
      <Header />
      <div class="body">
        <Sidebar />
        <main class="main">{body}</main>
      </div>
      <SettingsPanel />
      <HelpOverlay open={helpOpen.value} onClose={() => (helpOpen.value = false)} />
      <EventPopover />
      <EventEditor />
      <RecurrenceScopeDialog />
      <Toasts />
    </div>
  )
}

function ConnectCard() {
  const configured = isOAuthConfigured()
  return (
    <div class="connect-wrap">
      <div class="connect-card">
        <div class="connect-title">gcal</div>
        {configured ? (
          <>
            <p>Connect your Google account to load your calendars. Data syncs to a local cache so the app opens instantly.</p>
            <button class="btn accent" onClick={() => void connectGoogle()}>
              Connect Google
            </button>
          </>
        ) : (
          <p>
            No OAuth client configured yet. Follow the README to create a Google Cloud OAuth client for
            this extension, put its client ID in <code>public/manifest.json</code>, and rebuild.
          </p>
        )}
      </div>
    </div>
  )
}
