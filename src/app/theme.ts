export type Theme = 'light' | 'dark' | 'system'

export function getTheme(): Theme {
  return (localStorage.getItem('theme') as Theme) || 'system'
}

export function applyTheme(t: Theme): void {
  localStorage.setItem('theme', t)
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function initTheme(): void {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'system') applyTheme('system')
  })
}
