import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import preact from '@preact/preset-vite'

const DEV_EVENTS_MODULE = 'virtual:mgcal-dev-events'

/**
 * Supplies `npm run dev` with a real calendar export to develop against, read
 * from the path in MGCAL_DEV_EVENTS (see README). The file is deliberately kept
 * OUTSIDE the repo: exports contain real attendee emails and meeting titles, so
 * anything inside the tree is one `git add -f` away from being published.
 *
 * Only the dev server ever inlines it. During `vite build` this resolves to
 * null no matter what the environment says, so real data cannot reach dist/.
 */
function devEvents(): Plugin {
  const id = '\0' + DEV_EVENTS_MODULE
  let serving = false
  return {
    name: 'mgcal-dev-events',
    configResolved(config) {
      serving = config.command === 'serve'
    },
    resolveId(source) {
      if (source === DEV_EVENTS_MODULE) return id
      return null
    },
    load(loaded) {
      if (loaded !== id) return null
      const path = process.env.MGCAL_DEV_EVENTS
      if (!serving || !path) return 'export default null'
      const abs = resolve(path)
      this.info(`seeding dev data from ${abs}`)
      // Inlined rather than imported so the path can live anywhere on disk.
      return `export default ${readFileSync(abs, 'utf8')}`
    },
  }
}

// App pages build. The service worker is built separately by vite.sw.config.ts
// so it lands as a single dist/sw.js with no shared hashed chunks.
export default defineConfig({
  plugins: [preact(), devEvents()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { index: 'index.html' },
    },
  },
})
