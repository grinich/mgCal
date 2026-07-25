# Security

## Reporting a vulnerability

Please report security issues privately via [GitHub's private vulnerability
reporting](https://github.com/grinich/mgCal/security/advisories/new) rather than
opening a public issue. I'll acknowledge within a few days. This is a personal
project with no SLA and no bounty program.

## Security model

mgCal holds an OAuth token with the `https://www.googleapis.com/auth/calendar`
scope — full read/write access to every calendar the signed-in account can see.
That makes a few properties worth stating explicitly:

- **There is no mgCal server.** The extension talks only to
  `www.googleapis.com` and `api.github.com` (the update check). Your calendar
  data never transits infrastructure controlled by this project's author.
- **Tokens are never stored by the extension.** `chrome.identity.getAuthToken`
  keeps them in Chrome's own token cache; `src/google/auth.ts` requests one per
  API call and never persists it.
- **You supply your own OAuth client.** The committed manifest ships a
  placeholder client ID. The Google Cloud project is yours, so the consent
  screen, quota, and audit log are yours too.
- **Calendar data is cached unencrypted in IndexedDB**, which is normal for a
  Chrome extension but means it is readable by anyone with access to your
  logged-in OS user account and Chrome profile.

## Areas worth extra scrutiny in review

- `sanitizeDescription()` in `src/app/event/EventPopover.tsx` renders HTML from
  event descriptions. Descriptions are fully attacker-controlled: anyone who can
  send a calendar invite chooses their contents. The sanitizer builds an inert
  fragment, applies a tag allowlist, strips every attribute except `https:`
  hrefs on `<a>`, and is appended to the DOM directly — it is never re-parsed
  from a serialized string, which rules out the mutation-XSS class. Changes here
  deserve a careful look.
- `src/app/ics.ts` parses untrusted `.ics` files from drag-and-drop.
- `src/sw/flush.ts` performs all authenticated writes to Google Calendar.
