import { render } from 'preact'
import './app/app.css'
import { App } from './app/App'
import { reanchorForLocalZone } from './data/db'
import { initApp } from './app/state/signals'
import { initKeyboard } from './app/keyboard'
import { initTheme } from './app/theme'
import { initFavicon } from './app/favicon'
import { claimFocus } from './app/focus'

async function boot() {
  // Before the awaits below: Chrome focuses the omnibox as the tab is created,
  // so the sooner the page takes focus back the sooner j/k work. #app is in
  // the static HTML, so it's there to focus already.
  const root = document.getElementById('app')!
  claimFocus(root)

  // Dev-only: chrome.* shim + demo data so the page runs on localhost.
  // Dead-code-eliminated from the extension build.
  if (import.meta.env.DEV) {
    await (await import('./dev/setup')).installDevMode()
  }
  // Before the first query: cached all-day midnights belong to whatever zone
  // computed them, so a zone change has to be repaired ahead of any read.
  await reanchorForLocalZone()

  initApp()
  initKeyboard()
  initTheme()
  initFavicon()

  // Swap the static skeleton for the live app in a single frame — the layouts
  // are identical, so the first hydrated paint lands without a visible shift.
  root.textContent = ''
  render(<App />, root)
}

void boot()
