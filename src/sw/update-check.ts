// Periodically checks GitHub Releases for a newer version and records the
// result in chrome.storage.local; the UI's UpdateBanner reads it and prompts
// the user to update when the latest release is newer than the running build.
import { UPDATE_STORAGE_KEY, type UpdateStatus } from '../data/update'

export const UPDATE_ALARM = 'update-check'
const CHECK_INTERVAL_MINUTES = 12 * 60 // twice a day
const RELEASES_API = 'https://api.github.com/repos/grinich/mgCal/releases/latest'

export async function checkForUpdate(): Promise<void> {
  // api.github.com is in host_permissions, so this fetch is CORS-exempt.
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) return // no releases yet (404) or transient — try again later
    const release = (await res.json()) as {
      tag_name?: string
      html_url?: string
      published_at?: string
      draft?: boolean
      prerelease?: boolean
    }
    // /releases/latest already excludes drafts and prereleases, but guard anyway.
    if (release.draft || release.prerelease) return

    const latestVersion = String(release.tag_name ?? '').replace(/^v/i, '')
    if (!latestVersion) return

    const status: UpdateStatus = {
      latestVersion,
      releaseUrl: release.html_url ?? '',
      publishedAt: release.published_at ?? '',
      checkedAt: Date.now(),
    }
    await chrome.storage.local.set({ [UPDATE_STORAGE_KEY]: status })
  } catch {
    // Offline — keep the last cached status, try again on the next alarm.
  }
}

export async function ensureUpdateAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(UPDATE_ALARM)
  if (!existing) await chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: CHECK_INTERVAL_MINUTES })
}
