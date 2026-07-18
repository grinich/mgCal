// All listeners must be registered synchronously at the top level so a
// freshly-woken service worker re-attaches them before events dispatch.
import { openApp } from './open-app'
import { forceRebaseline, resetVisibilityFromGoogle, syncAll } from './sync'
import { flushOutbox } from './flush'
import { onNotificationButton, onNotificationClicked, onReminderAlarm, scheduleReminders } from './reminders'
import { expandGroup } from './groups'
import { checkForUpdate, ensureUpdateAlarm, UPDATE_ALARM } from './update-check'

chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarms()
  void ensureUpdateAlarm()
  void checkForUpdate()
  void syncAll('full').then(() => scheduleReminders(true))
})

chrome.runtime.onStartup.addListener(() => {
  void ensureAlarms()
  void ensureUpdateAlarm()
  void checkForUpdate()
  void syncAll('full').then(() => scheduleReminders(true))
})

chrome.action.onClicked.addListener(() => {
  void openApp()
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-calendar') void openApp()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync') {
    void flushOutbox()
      .then(() => syncAll('full'))
      .then(() => scheduleReminders(true))
  } else if (alarm.name === UPDATE_ALARM) {
    void checkForUpdate()
  } else if (alarm.name.startsWith('rem|')) {
    void onReminderAlarm(alarm.name)
  }
})

chrome.notifications.onClicked.addListener((id) => {
  void onNotificationClicked(id)
})

chrome.notifications.onButtonClicked.addListener((id, idx) => {
  void onNotificationButton(id, idx)
})

chrome.runtime.onMessage.addListener(
  (msg: { type?: string; full?: boolean; email?: string }, _sender, sendResponse) => {
    if (msg?.type === 'expandGroup' && typeof msg.email === 'string') {
      expandGroup(msg.email).then(
        (members) => sendResponse({ ok: true, members }),
        (e) => sendResponse({ ok: false, error: String(e) }),
      )
      return true
    }
    if (msg?.type === 'resetVisibility') {
      resetVisibilityFromGoogle().then(
        () => sendResponse({ ok: true }),
        (e) => sendResponse({ ok: false, error: String(e) }),
      )
      return true
    }
    if (msg?.type === 'rebaseline') {
      forceRebaseline()
        .then(() => syncAll('full'))
        .then(
          () => sendResponse({ ok: true }),
          (e) => sendResponse({ ok: false, error: String(e) }),
        )
      return true
    }
    if (msg?.type === 'kick') {
    // Flush local edits first, then pull. Channel stays open to keep the worker alive.
      flushOutbox()
        .then(() => syncAll(msg.full ? 'full' : 'fast'))
        .then(() => scheduleReminders()) // internally throttled to every 30s
        .then(
          () => sendResponse({ ok: true }),
          (e) => sendResponse({ ok: false, error: String(e) }),
        )
      return true
    }
    return false
  },
)

async function ensureAlarms(): Promise<void> {
  const existing = await chrome.alarms.get('sync')
  if (!existing) await chrome.alarms.create('sync', { periodInMinutes: 1 })
}
