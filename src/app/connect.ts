import { api } from '../google/api'
import { describeAuthError, reauth } from '../google/auth'
import { authError, authNeeded, connected, connecting } from './state/signals'

/** Interactive OAuth — must run from a user gesture in the page. */
export async function connectGoogle(): Promise<void> {
  if (connecting.value) return // the consent window is already open; a second click errors
  connecting.value = true
  authError.value = ''
  try {
    await reauth()
    // A token in hand doesn't prove the grant is live — Chrome mints one from
    // its own cache. One real call does, and it turns a silent no-op into
    // either working sync or a message worth reading.
    await api('/users/me/calendarList', { query: { maxResults: 1 } })
    authNeeded.value = false
    connected.value = true
    await chrome.runtime.sendMessage({ type: 'kick', full: true }).catch(() => {})
  } catch (e) {
    authError.value = describeAuthError(e instanceof Error ? e.message : String(e), chrome.runtime.id)
    console.error('connect failed', e)
  } finally {
    connecting.value = false
  }
}
