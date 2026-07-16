// All listeners must be registered synchronously at the top level so a
// freshly-woken service worker re-attaches them before events dispatch.
import { openApp } from './open-app'

chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarms()
})

chrome.runtime.onStartup.addListener(() => {
  void ensureAlarms()
})

chrome.action.onClicked.addListener(() => {
  void openApp()
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-calendar') void openApp()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync') {
    // Milestone 2: run incremental sync + outbox flush here.
  }
})

chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, sendResponse) => {
  if (msg?.type === 'kick') {
    // Milestone 2: trigger immediate sync/flush.
    sendResponse({ ok: true })
  }
  return false
})

async function ensureAlarms(): Promise<void> {
  const existing = await chrome.alarms.get('sync')
  if (!existing) await chrome.alarms.create('sync', { periodInMinutes: 1 })
}
