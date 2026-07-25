import { useState } from 'preact/hooks'
import { Header } from './Header'
import { UpdateBanner } from './UpdateBanner'
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
import { SearchOverlay } from './search/SearchOverlay'
import { OverflowPopover } from './views/OverflowPopover'
import { DropZone } from './DropZone'
import { SyncDebug } from './SyncDebug'
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
      <UpdateBanner />
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
      <SearchOverlay />
      <OverflowPopover />
      <SyncDebug />
      <DropZone />
      <Toasts />
    </div>
  )
}

function ConnectCard() {
  if (!isOAuthConfigured()) return <SetupCard />
  return (
    <div class="connect-wrap">
      <div class="connect-card">
        <div class="connect-title">mgCal</div>
        <p>Connect your Google account to load your calendars. Data syncs to a local cache so the app opens instantly.</p>
        <button class="btn accent" onClick={() => void connectGoogle()}>
          Connect Google
        </button>
      </div>
    </div>
  )
}

const CONSOLE = 'https://console.cloud.google.com'

/** Shown until the manifest carries a real client ID. mgCal has no shared
 * Google project — every install authorizes against its own — so this walks
 * through creating one instead of just pointing at the README. */
function SetupCard() {
  const [copied, setCopied] = useState(false)
  // The live id is authoritative: it matches the pinned key in the manifest, or
  // whatever Chrome assigned if that key was removed.
  const itemId = chrome.runtime.id

  const copyId = () => {
    void navigator.clipboard.writeText(itemId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div class="connect-wrap">
      <div class="connect-card setup-card">
        <div class="connect-title">Set up mgCal</div>
        <p>
          mgCal talks straight to Google with an OAuth client you own — there's no mgCal server and no
          shared account. Takes about three minutes, once.
        </p>

        <ol class="setup-steps">
          <li>
            <a href={`${CONSOLE}/projectcreate`} target="_blank" rel="noreferrer">
              Create a Google Cloud project
            </a>
          </li>
          <li>
            <a href={`${CONSOLE}/apis/library/calendar-json.googleapis.com`} target="_blank" rel="noreferrer">
              Enable the Google Calendar API
            </a>
          </li>
          <li>
            <a href={`${CONSOLE}/apis/credentials/consent`} target="_blank" rel="noreferrer">
              Configure the consent screen
            </a>{' '}
            — pick <b>External</b>, then add your own Google account under <b>Test users</b>. Leave it in
            Testing mode; no verification needed.
          </li>
          <li>
            <a href={`${CONSOLE}/apis/credentials/oauthclient`} target="_blank" rel="noreferrer">
              Create an OAuth client ID
            </a>{' '}
            — type <b>Chrome Extension</b>, with this Item ID:
            <button class="setup-id" onClick={copyId} title="Copy to clipboard">
              <code>{itemId}</code>
              <span class="setup-copy">{copied ? 'copied ✓' : 'copy'}</span>
            </button>
          </li>
          <li>
            Save the client ID into the manifest and rebuild:
            <code class="setup-cmd">npm run set-client-id &lt;CLIENT_ID&gt;</code>
            <code class="setup-cmd">npm run build</code>
          </li>
          <li>
            Hit the reload icon for mgCal on <code>chrome://extensions</code>, then open a new tab.
          </li>
        </ol>

        <p class="setup-foot">
          Full walkthrough in the README. Chrome-extension clients have no secret, so the client ID isn't
          sensitive — it just has to be yours.
        </p>
      </div>
    </div>
  )
}
