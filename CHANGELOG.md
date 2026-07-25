# Changelog

## [Unreleased]

- Open-sourced under the MIT license.
- Settings: **Email guests on changes** — turn off to stop Google notifying attendees on every edit (a drag-to-move used to always email the room).
- Settings: **Check for updates** — turn off the twice-daily GitHub Releases poll, the extension's only non-Google network call.
- Dropping an `.ics` file now previews what will be imported and asks for confirmation instead of writing to your calendar immediately.
- "Copy debug info" now exports sync status only — calendar names, event titles and guest emails are stripped, so it's safe to paste into a bug report.
- The manifest ships a placeholder OAuth client ID; set up your own client per the README.
- Event description rendering no longer round-trips sanitized HTML through a string, ruling out the mutation-XSS class.
- `Cmd+Shift+K` reliably focuses an existing calendar tab instead of sometimes opening a duplicate.
- Added a test suite (recurrence rewriting, `.ics` parsing, version comparison, DST date math) and CI on pull requests.

## [0.2.0] - 2026-07-17

- Trackpad pinch zooms the time scale (28–140px per hour, cursor-anchored, persisted).
- Current-event pill in the header center; click for details.
- Join Zoom buttons in the header and event popover, using `zoommtg://` deep links that open the Zoom app directly. `⌘↵` joins the current meeting's Zoom.
- Chip text colors now match Google Calendar exactly: white on every Google-palette fill, computed contrast only for custom calendar colors.
- Readable outlined (not-responded/declined) chips; opaque hover cards on declined events.
- Sync badge moved next to the view switcher.
- Update checker: the extension polls GitHub Releases twice a day and shows a banner when a newer version ships.
- Real Apple emoji extension icons.

## [0.1.0] - 2026-07-16

- Initial release: instant local-first Google Calendar as a Chrome new-tab extension. Day/week/month views, offline cache with outbox sync, drag to move/resize/create, RSVP, search, ICS import, keyboard shortcuts.
