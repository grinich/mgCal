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

export async function invalidateToken(token: string): Promise<void> {
  await chrome.identity.removeCachedAuthToken({ token })
}

async function setAuthNeeded(needed: boolean): Promise<void> {
  const { authNeeded } = await chrome.storage.local.get('authNeeded')
  if (authNeeded !== needed) await chrome.storage.local.set({ authNeeded: needed })
}

export function isOAuthConfigured(): boolean {
  const manifest = chrome.runtime.getManifest() as chrome.runtime.ManifestV3 & {
    oauth2?: { client_id: string }
  }
  return !!manifest.oauth2 && !manifest.oauth2.client_id.startsWith('YOUR_CLIENT_ID')
}
