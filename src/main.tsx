import { render } from 'preact'
import './app/app.css'
import { App } from './app/App'
import { initApp } from './app/state/signals'
import { initKeyboard } from './app/keyboard'
import { initTheme } from './app/theme'

async function boot() {
  // Dev-only: chrome.* shim + demo data so the page runs on localhost.
  // Dead-code-eliminated from the extension build.
  if (import.meta.env.DEV) {
    await (await import('./dev/setup')).installDevMode()
  }
  initApp()
  initKeyboard()
  initTheme()

  // Swap the static skeleton for the live app in a single frame — the layouts
  // are identical, so the first hydrated paint lands without a visible shift.
  const root = document.getElementById('app')!
  root.textContent = ''
  render(<App />, root)
}

void boot()
