// Runs synchronously in <head> so the theme resolves before first style calc.
// External file (not inline) because the extension CSP is script-src 'self'.
;(function () {
  var t = localStorage.getItem('theme') || 'system'
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
