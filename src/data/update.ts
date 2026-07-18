// Shared update-check types + version helpers, imported by both the service
// worker checker and the UI banner. The checker fetches the latest GitHub
// release and stores an UpdateStatus; the banner reads it and compares against
// the running manifest version. mgCal is loaded unpacked (not from the Web
// Store), so Chrome can't auto-update it — this is notify-to-update.

/** chrome.storage.local key holding the latest known release. */
export const UPDATE_STORAGE_KEY = 'updateStatus'

export interface UpdateStatus {
  /** Latest release version, without a leading "v" (e.g. "0.2.0"). */
  latestVersion: string
  /** GitHub release page URL (the "what's changed" link target). */
  releaseUrl: string
  /** ISO timestamp the release was published. */
  publishedAt: string
  /** Epoch ms when we last checked. */
  checkedAt: number
}

/** Parse a semver-ish string ("v1.2.3" or "1.2.3") into [major, minor, patch]. */
export function parseVersion(v: string): [number, number, number] {
  const m = (v || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return [0, 0, 0]
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** True when `latest` is strictly newer than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const pa = parseVersion(latest)
  const pb = parseVersion(current)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i]! > pb[i]!
  }
  return false
}
