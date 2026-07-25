# mgCal

A local-first Google Calendar replacement that runs as a Chrome extension. Your new tab page becomes a calendar that paints instantly (<100ms) from a local IndexedDB cache, while a background service worker keeps it in sync with Google Calendar — 1-second incremental polling while you're looking at it, once a minute in the background. All edits apply instantly and sync back to the cloud through a persistent outbox.

**Features**: week/day/month views · create/edit/delete with drag-move and drag-resize · guests with autocomplete + Google Meet · RSVP · recurring events (this / this-and-following / all, with repeat presets) · offline edits with conflict handling · event reminders via Chrome notifications (with a Join Meet button) · instant local search (`/`) · light/dark theme · 12 months back / 12 months ahead cached locally.

There is no mgCal server. The extension talks to Google's Calendar API with your own OAuth client, and to `api.github.com` for the update check (switchable in Settings). Your calendar data never touches infrastructure belonging to this project.

## Setup

### 1. Build and load the extension

```sh
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `dist/` folder.

The manifest pins a public key, so the extension ID is always **`lmkneinmcojelimnmnpenoopnlnlgjng`** no matter where it's loaded — which is what lets step 2 below name a stable Item ID. (The matching private key would live in `keys/extension.pem`; it's gitignored, isn't in this repo, and is only needed to pack a `.crx`.) If you'd rather your build have its own identity, delete the `key` field from `public/manifest.json` and use whatever ID Chrome assigns.

### 2. Create your Google OAuth client (one time, ~3 minutes)

The committed manifest ships a placeholder client ID, so this step is required — until you do it, the new tab shows a "no OAuth client configured" card instead of a calendar.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project (e.g. `mgcal-extension`).
2. **APIs & Services → Library** → search **Google Calendar API** → Enable.
3. **APIs & Services → OAuth consent screen** → External → fill in the app name + your email → under **Test users**, add your own Google account email. Leave the app in **Testing** mode (fine for personal use; no verification needed).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type: **Chrome Extension** → Item ID: `lmkneinmcojelimnmnpenoopnlnlgjng` (or your own ID, if you removed the pinned key).
5. Replace `YOUR_CLIENT_ID.apps.googleusercontent.com` in `public/manifest.json` under `oauth2.client_id` with the generated client ID, then `npm run build` and hit the reload icon on `chrome://extensions`.

Chrome-extension OAuth clients have no client secret — Google binds them to the extension ID instead — so the client ID in your manifest isn't sensitive and ships in every build.

### 3. Connect

Open a new tab (or press `Cmd+Shift+K`) and click **Connect Google**.

## What it can access

mgCal requests a single OAuth scope, `https://www.googleapis.com/auth/calendar`: full read/write on every calendar your account can see. That's what drag-to-move, RSVP, and recurring-series edits need; there's no narrower scope that covers them. Tokens are held by Chrome via `chrome.identity` and never stored by the extension. Cached events live unencrypted in IndexedDB, like any extension's local data.

Two behaviors worth knowing about, both switchable in **Settings**:

- **Email guests on changes** (default on). Google notifies every attendee whenever you edit an event that has guests, and mgCal edits with a drag — so a stray drag on a meeting emails the room. Turn it off to make writes silent.
- **Check for updates** (default on). mgCal is loaded unpacked, so Chrome can't auto-update it; the service worker asks GitHub for the latest release twice a day and shows a banner. This is the extension's only non-Google network call and discloses your IP to GitHub.

If you fork this, point `UPDATE_REPO` in `src/sw/update-check.ts` at your own releases so your users aren't prompted to install upstream builds.

## Development

```sh
npm run dev        # app on localhost with seeded demo data — no Google account needed
npm run watch      # rebuild app + service worker on change
npm run typecheck
npm test
```

`npm run dev` installs a `chrome.*` shim (`src/dev/setup.ts`) and seeds demo events straight into IndexedDB, so nothing talks to Google and no OAuth client is needed. After a rebuild of the real extension, click the reload icon on `chrome://extensions` (the service worker doesn't hot-reload).

- App pages are built by `vite.config.ts`; the service worker is built separately by `vite.sw.config.ts` into a single `dist/sw.js`.
- Local data lives in IndexedDB database `gcal` — inspect via DevTools → Application → IndexedDB. (The name predates the mgCal rename; changing it would orphan existing caches.)
- Tests cover the pure logic — recurrence rewriting, `.ics` parsing, version comparison, DST date math. See `test/`.

### Developing against your own calendar

Demo data only goes so far. To run dev mode against a real calendar export, point `MGCAL_DEV_EVENTS` at a JSON file shaped like `{ fetchedAt, calendars[], events[] }` (the `RealData` interface in `src/dev/setup.ts`):

```sh
MGCAL_DEV_EVENTS=~/.mgcal-dev/real-events.json npm run dev
```

**Keep that file outside the repo.** Calendar exports contain real attendee email addresses and meeting titles. The Vite plugin that loads it (`vite.config.ts`) only ever inlines it for the dev server — never during `vite build` — so it can't reach `dist/`, but a copy inside the working tree is still one `git add -f` away from being published.

## Keyboard shortcuts

`t` today · `d`/`w`/`m` day/week/month view · `j`/`k` next/prev period · `c` create event · `/` search · `e` open selected · `⌘↵` join current Zoom · `Esc` close · `?` help · trackpad pinch zooms the time scale

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
