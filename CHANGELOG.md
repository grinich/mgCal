# Changelog

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
