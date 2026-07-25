// Preferences that both the page and the service worker need, so they live in
// the IndexedDB `settings` store rather than localStorage (which the worker
// can't read). Display-only prefs — theme, view, week start, sidebar — stay in
// localStorage so they apply before the first paint.
import { getSetting, setSetting } from './db'

/** Send Google's "guests were notified" emails on every write. */
export const PREF_NOTIFY_GUESTS = 'notifyGuests'
/** Poll GitHub Releases for a newer version twice a day. */
export const PREF_UPDATE_CHECKS = 'updateChecks'

export type PrefKey = typeof PREF_NOTIFY_GUESTS | typeof PREF_UPDATE_CHECKS

// Both default on: matching the behavior before these switches existed.
export async function getPref(key: PrefKey): Promise<boolean> {
  return (await getSetting<boolean>(key)) !== false
}

export async function setPref(key: PrefKey, value: boolean): Promise<void> {
  await setSetting(key, value)
}

/**
 * `sendUpdates` for write requests. Google emails every guest on any change to
 * an event with attendees, so with drag-to-move a stray drag can notify a whole
 * meeting — hence the switch.
 */
export async function guestNotification(): Promise<'all' | 'none'> {
  return (await getPref(PREF_NOTIFY_GUESTS)) ? 'all' : 'none'
}
