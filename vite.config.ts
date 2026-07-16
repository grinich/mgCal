import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// App pages build. The service worker is built separately by vite.sw.config.ts
// so it lands as a single dist/sw.js with no shared hashed chunks.
export default defineConfig({
  plugins: [preact()],
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
