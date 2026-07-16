import { goToday, helpOpen, navigate, selectedKey, settingsOpen, setView, toggleSidebar } from './state/signals'

type Handler = () => void

const bindings = new Map<string, Handler>()

export function bindKey(key: string, handler: Handler): void {
  bindings.set(key, handler)
}

export function initKeyboard(): void {
  bindKey('t', goToday)
  bindKey('j', () => navigate(1))
  bindKey('n', () => navigate(1))
  bindKey('k', () => navigate(-1))
  bindKey('p', () => navigate(-1))
  bindKey('d', () => setView('day'))
  bindKey('w', () => setView('week'))
  bindKey('m', () => setView('month'))
  bindKey('s', toggleSidebar)
  bindKey('?', () => (helpOpen.value = !helpOpen.value))
  bindKey('Escape', () => {
    if (helpOpen.value) helpOpen.value = false
    else if (settingsOpen.value) settingsOpen.value = false
    else selectedKey.value = null
  })

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const t = e.target as HTMLElement
    if (
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement ||
      t.isContentEditable
    )
      return
    const h = bindings.get(e.key)
    if (h) {
      e.preventDefault()
      h()
    }
  })
}
