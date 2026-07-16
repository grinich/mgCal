const APP_URL = chrome.runtime.getURL('index.html')

export async function openApp(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: APP_URL + '*' })
  const existing = tabs[0]
  if (existing?.id != null) {
    await chrome.tabs.update(existing.id, { active: true })
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true })
  } else {
    await chrome.tabs.create({ url: APP_URL })
  }
}
