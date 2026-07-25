const APP_URL = chrome.runtime.getURL('index.html')

export async function openApp(): Promise<void> {
  // Filtering with tabs.query({url}) needs the "tabs" permission (or a matching
  // host permission), and a new-tab override can report its URL as
  // chrome://newtab/ rather than the extension URL — so query everything and
  // match on either form ourselves.
  const tabs = await chrome.tabs.query({})
  const existing = tabs.find((t) => t.url?.startsWith(APP_URL) || t.pendingUrl?.startsWith(APP_URL))
  if (existing?.id != null) {
    await chrome.tabs.update(existing.id, { active: true })
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true })
  } else {
    await chrome.tabs.create({ url: APP_URL })
  }
}
