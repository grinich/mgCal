import { useEffect, useState } from 'preact/hooks'
import { isNewerVersion, UPDATE_STORAGE_KEY, type UpdateStatus } from '../data/update'

const DISMISS_KEY = 'updateBannerDismissedVersion'

/** Banner shown when a newer GitHub release exists than the running build.
 * Reads the status the service worker's update checker writes to storage,
 * re-renders live when it changes. Dismissal is per-version, so the banner
 * reappears only when an even newer release ships. */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [showHow, setShowHow] = useState(false)

  useEffect(() => {
    let active = true
    void chrome.storage.local.get([UPDATE_STORAGE_KEY, DISMISS_KEY]).then((v) => {
      if (!active) return
      setStatus((v[UPDATE_STORAGE_KEY] as UpdateStatus | undefined) ?? null)
      setDismissed((v[DISMISS_KEY] as string | undefined) ?? null)
    })
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return
      if (changes[UPDATE_STORAGE_KEY]) setStatus((changes[UPDATE_STORAGE_KEY].newValue as UpdateStatus) ?? null)
      if (changes[DISMISS_KEY]) setDismissed((changes[DISMISS_KEY].newValue as string) ?? null)
    }
    chrome.storage.onChanged.addListener(listener)
    return () => {
      active = false
      chrome.storage.onChanged.removeListener?.(listener)
    }
  }, [])

  if (chrome.runtime.id === 'dev-shim') return null
  const current = chrome.runtime.getManifest().version
  if (!status?.releaseUrl) return null
  if (!isNewerVersion(status.latestVersion, current)) return null
  if (dismissed === status.latestVersion) return null

  const dismiss = () => {
    setDismissed(status.latestVersion)
    void chrome.storage.local.set({ [DISMISS_KEY]: status.latestVersion })
  }

  return (
    <div class="update-banner">
      <div class="update-row">
        <span class="update-icon">↑</span>
        <span>
          mgCal <b>v{status.latestVersion}</b> is available
          <span class="muted"> · you have v{current}</span>
        </span>
        <a class="btn accent update-link" href={status.releaseUrl} target="_blank" rel="noreferrer">
          What's changed
        </a>
        <button class="update-how" onClick={() => setShowHow(!showHow)}>
          How to update
        </button>
        <button class="icon-btn update-dismiss" title="Dismiss" onClick={dismiss}>
          ✕
        </button>
      </div>
      {showHow && (
        <div class="update-howto">
          Download the .zip from the{' '}
          <a href={status.releaseUrl} target="_blank" rel="noreferrer">
            release page
          </a>{' '}
          and unzip it (or, from a clone, <code>git pull && npm run build</code>), then open{' '}
          <code>chrome://extensions</code> and click the reload icon (↻) on the mgCal card. Your calendars
          and settings are preserved.
        </div>
      )}
    </div>
  )
}
