import { defineConfig } from 'vitest/config'

// Tests cover the pure logic only — recurrence rewriting, .ics parsing, version
// comparison, date math. Anything touching IndexedDB, chrome.* or the DOM is
// exercised by hand in the extension; see CONTRIBUTING.md.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // Date math is timezone-sensitive by nature: pin one so DST assertions are
    // reproducible regardless of where CI runs.
    env: { TZ: 'America/Los_Angeles' },
  },
})
