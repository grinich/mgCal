import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    rollupOptions: {
      input: { sw: 'src/sw/index.ts' },
      output: {
        entryFileNames: 'sw.js',
        format: 'es',
        codeSplitting: false,
      },
    },
  },
})
