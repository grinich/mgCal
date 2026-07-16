# gcal

A local-first Google Calendar replacement that runs as a Chrome extension. Your new tab page becomes a calendar that paints instantly (<100ms) from a local IndexedDB cache, while a background service worker keeps it in sync with Google Calendar — 1-second incremental polling while you're looking at it, once a minute in the background. All edits apply instantly and sync back to the cloud through a persistent outbox.

## Setup

### 1. Build and load the extension

```sh
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `dist/` folder.

The manifest pins a public key, so the extension ID is always **`lmkneinmcojelimnmnpenoopnlnlgjng`** no matter where it's loaded. (The matching private key in `keys/extension.pem` is gitignored and only needed if you ever pack a `.crx`.)

### 2. Create your Google OAuth client (one time, ~3 minutes)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project (e.g. `gcal-extension`).
2. **APIs & Services → Library** → search **Google Calendar API** → Enable.
3. **APIs & Services → OAuth consent screen** → External → fill in the app name + your email → under **Test users**, add your own Google account email. Leave the app in **Testing** mode (fine for personal use; no verification needed).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type: **Chrome Extension** → Item ID: `lmkneinmcojelimnmnpenoopnlnlgjng`.
5. Copy the generated client ID into `public/manifest.json` under `oauth2.client_id`, then `npm run build` and hit the reload icon on `chrome://extensions`.

### 3. Connect

Open a new tab (or press `Cmd+Shift+K`) and click **Connect Google**.

## Development

```sh
npm run watch      # rebuild app + service worker on change
npm run typecheck
```

After a rebuild, click the reload icon for the extension on `chrome://extensions` (the service worker doesn't hot-reload).

- App pages are built by `vite.config.ts`; the service worker is built separately by `vite.sw.config.ts` into a single `dist/sw.js`.
- Local data lives in IndexedDB database `gcal` — inspect via DevTools → Application → IndexedDB.

## Keyboard shortcuts

`t` today · `d`/`w`/`m` day/week/month view · `j`/`k` next/prev period · `c` create event · `/` search · `e` open selected · `Esc` close · `?` help
