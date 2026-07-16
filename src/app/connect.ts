import { getToken } from '../google/auth'
import { authNeeded, connected } from './state/signals'

/** Interactive OAuth — must run from a user gesture in the page. */
export async function connectGoogle(): Promise<void> {
  try {
    await getToken(true)
    authNeeded.value = false
    connected.value = true
    await chrome.runtime.sendMessage({ type: 'kick', full: true }).catch(() => {})
  } catch (e) {
    console.error('connect failed', e)
  }
}
