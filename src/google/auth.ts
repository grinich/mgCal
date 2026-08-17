// Token acquisition via chrome.identity against the user's own GCP OAuth client.
// Interactive auth must be triggered from a user gesture in the page; the
// service worker only ever asks non-interactively and raises `authNeeded`.

export class AuthError extends Error {
  constructor(message: string, public needsInteraction: boolean) {
    super(message)
  }
}

export async function getToken(interactive = false): Promise<string> {
  try {
    const { token } = await chrome.identity.getAuthToken({ interactive })
    if (!token) throw new Error('empty token')
    await setAuthNeeded(false)
    return token
  } catch (e) {
    if (!interactive) await setAuthNeeded(true)
    throw new AuthError(String(e), !interactive)
  }
}

/** Interactive re-auth, for the Connect/Reconnect buttons.
 *
 * Chrome hands back cached tokens without asking Google whether they're still
 * good, so a grant that was revoked — or expired, which Testing-mode consent
 * screens do to refresh tokens after a week — still resolves instantly to the
 * dead token and no consent window ever opens. Dropping the cache first makes
 * this a real grant instead of a button that appears to do nothing. */
export async function reauth(): Promise<string> {
  await clearTokenCache()
  return getToken(true)
}

export async function invalidateToken(token: string): Promise<void> {
  await chrome.identity.removeCachedAuthToken({ token })
}

async function clearTokenCache(): Promise<void> {
  try {
    await chrome.identity.clearAllCachedAuthTokens()
  } catch {
    // Not available (older Chrome, or the dev shim): evict the one token we can name.
    try {
      const { token } = await chrome.identity.getAuthToken({ interactive: false })
      if (token) await invalidateToken(token)
    } catch {
      /* nothing cached to clear */
    }
  }
}

async function setAuthNeeded(needed: boolean): Promise<void> {
  const { authNeeded } = await chrome.storage.local.get('authNeeded')
  if (authNeeded !== needed) await chrome.storage.local.set({ authNeeded: needed })
}

/** chrome.identity's failures are terse and describe the OAuth client rather
 * than anything the person clicking can act on ("bad client id: 1234"). Every
 * install authorizes against its own Cloud project, so these are setup problems
 * with concrete fixes — say what they are instead of only logging them.
 * Pure on purpose: `itemId` is passed in so this stays testable. */
export function describeAuthError(raw: string, itemId: string): string {
  const s = raw.toLowerCase()
  if (s.includes('bad client id') || s.includes('invalid oauth2 client id')) {
    return `Google rejected this build's OAuth client ID. It has to be a Chrome Extension client created for Item ID ${itemId}; fix it with "npm run set-client-id <ID>", then npm run build and reload the extension.`
  }
  if (s.includes('access_denied') || s.includes('not granted or revoked')) {
    return 'Google refused the grant. If your consent screen is still in Testing mode, add this Google account under Test users, then try again.'
  }
  if (s.includes('did not approve') || s.includes('canceled') || s.includes('cancelled')) {
    return 'Sign-in was closed before Google finished. Click Reconnect to try again.'
  }
  if (s.includes('authorization page could not be loaded')) {
    return "Chrome couldn't load Google's sign-in page. Check your connection, then try again."
  }
  if (s.includes('turned off browser signin') || s.includes('not signed in')) {
    return 'Chrome is signed out of Google. Sign in to Chrome, then click Reconnect.'
  }
  if (s.includes('already') && s.includes('pending')) {
    return 'A sign-in window is already open — finish it, or close it and click Reconnect.'
  }
  return `Reconnect failed: ${raw.replace(/^Error:\s*/, '')}`
}

export function isOAuthConfigured(): boolean {
  const manifest = chrome.runtime.getManifest() as chrome.runtime.ManifestV3 & {
    oauth2?: { client_id: string }
  }
  return !!manifest.oauth2 && !manifest.oauth2.client_id.startsWith('YOUR_CLIENT_ID')
}
