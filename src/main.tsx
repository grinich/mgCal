import { render } from 'preact'
import './app/app.css'
import { App } from './app/App'
import { initApp } from './app/state/signals'
import { initKeyboard } from './app/keyboard'
import { initTheme } from './app/theme'

initApp()
initKeyboard()
initTheme()

// Swap the static skeleton for the live app in a single frame — the layouts
// are identical, so the first hydrated paint lands without a visible shift.
const root = document.getElementById('app')!
root.textContent = ''
render(<App />, root)
