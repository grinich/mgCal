// All listeners must be registered synchronously at the top level so a
// freshly-woken service worker re-attaches them before events dispatch.
import { openApp } from './open-app'
import { syncAll } from './sync'

chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarms()
  void syncAll('full')
})

chrome.runtime.onStartup.addListener(() => {
  void ensureAlarms()
  void syncAll('full')
})

chrome.action.onClicked.addListener(() => {
  void openApp()
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-calendar') void openApp()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync') void syncAll('full')
})

chrome.runtime.onMessage.addListener((msg: { type?: string; full?: boolean }, _sender, sendResponse) => {
  if (msg?.type === 'kick') {
    // Keep the message channel open so the worker stays alive for the pass.
    syncAll(msg.full ? 'full' : 'fast').then(
      () => sendResponse({ ok: true }),
      (e) => sendResponse({ ok: false, error: String(e) }),
    )
    return true
  }
  return false
})

async function ensureAlarms(): Promise<void> {
  const existing = await chrome.alarms.get('sync')
  if (!existing) await chrome.alarms.create('sync', { periodInMinutes: 1 })
}
