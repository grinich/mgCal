/**
 * Chrome parks focus in the omnibox when a new tab opens, so on a fresh tab
 * the first `j`/`k` goes to the address bar and nothing happens until you
 * press Esc. This claims focus for the page instead.
 *
 * It has to be retried rather than called once: Chrome focuses the omnibox
 * itself as the new tab settles, so a single call at startup is raced and
 * lost. `document.hasFocus()` is false exactly while the browser UI holds
 * focus — that's both the signal to keep trying and the signal to stop.
 *
 * The target is a plain element, never an input: initKeyboard ignores
 * keystrokes aimed at text fields, so parking focus in one would swallow every
 * shortcut it was meant to enable.
 *
 * A background tab (cmd-click) reports no focus too, but focusing an element
 * there only sets the document's own focused node — it can't pull the window
 * forward — so the retry is harmless until it times out.
 */
const RETRY_MS = 50
const GIVE_UP_MS = 1000

export function claimFocus(root: HTMLElement): void {
  root.tabIndex = -1
  const deadline = Date.now() + GIVE_UP_MS
  const take = (): void => {
    if (document.hasFocus() || Date.now() > deadline) return
    root.focus({ preventScroll: true })
    setTimeout(take, RETRY_MS)
  }
  take()
}
