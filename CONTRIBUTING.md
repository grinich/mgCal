# Contributing

This is a personal project I keep small on purpose. Bug reports and focused
fixes are very welcome; large features may not be merged if they don't fit how I
use the calendar. Please open an issue before starting anything big.

## Getting set up

```sh
npm install
npm run dev        # runs the app on localhost with seeded demo data
```

`npm run dev` needs no Google account and no OAuth client. `src/dev/setup.ts`
installs a `chrome.*` shim and seeds demo events straight into IndexedDB, so
nothing talks to Google. To work against the real extension instead, follow the
setup steps in the README.

## Before opening a PR

```sh
npm run typecheck
npm test
npm run build
```

CI runs all three on every pull request.

## Conventions

- Two-space indent, no semicolons, single quotes — see `.editorconfig`. There's
  deliberately no Prettier/ESLint config; please match the surrounding style
  rather than reformatting files.
- Comments explain *why*, not *what*. The existing code leans on short comments
  above non-obvious logic (especially in `src/sw/` and `src/data/`) — that's the
  house style, so keep it up in new code.
- Keep commit subjects imperative and specific.
- Prefer plain functions and signals over new abstractions. There is no state
  management library beyond `@preact/signals`, and no CSS framework beyond
  `src/app/app.css`.

## Where things live

| Path | What it does |
| --- | --- |
| `src/app/` | UI: views, editor, popover, search, settings |
| `src/data/` | IndexedDB schema, write API (outbox), RRULE helpers, types |
| `src/sw/` | Service worker: sync engine, outbox flush, reminders, update check |
| `src/google/` | OAuth token handling and the Calendar API client |
| `src/dev/` | Localhost-only `chrome.*` shim and seed data |
| `test/` | Unit tests for the pure logic (recurrence, ICS, versions, time) |

## Don't commit real calendar data

`src/dev/` used to be the natural home for a dump of your own calendar to
develop against. Keep those dumps outside the repo — the dev seeder reads one
from `MGCAL_DEV_EVENTS` (see README), precisely so real attendee emails can't
land in a commit.
