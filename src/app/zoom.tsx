import type { ComponentChildren } from 'preact'
import type { EventRow } from '../data/types'
import { nowMs, visibleEvents } from './state/signals'
import { isDeclined } from './views/EventChip'

// Join URLs: zoom.us/j/<id> (meeting), /my/<name> (PMR), /w and /s variants,
// on any subdomain (company.zoom.us). Zoom isn't a first-class conference
// provider in the Calendar API, so the link hides in conferenceData (when
// added via the Zoom add-on), the location field, or the description HTML.
const ZOOM_RE = /https?:\/\/(?:[\w-]+\.)?zoom\.us\/(?:j|my|s|w|wc)\/[^\s<>"')\]]+/i

/** First Zoom join URL found on the event, or undefined. */
export function zoomLink(ev: EventRow): string | undefined {
  const sources = [
    ev.conferenceData ? JSON.stringify(ev.conferenceData) : undefined,
    ev.location,
    ev.description,
  ]
  for (const src of sources) {
    const m = src ? ZOOM_RE.exec(src) : null
    if (m) return m[0].replace(/&amp;/g, '&').replace(/[.,;!?]+$/, '')
  }
  return undefined
}

/** Deep link that opens the Zoom app directly, skipping the browser landing
 * page. Only numeric /j/<id> (and /s/) URLs convert; /my/<name> personal links
 * need the web redirect to resolve the ID, so those return the original URL. */
export function zoomOpenHref(url: string): string {
  const m = /^https?:\/\/((?:[\w-]+\.)?zoom\.us)\/(?:j|s)\/(\d+)(?:\?([^#]*))?/i.exec(url)
  if (!m) return url
  const pwd = new URLSearchParams(m[3] ?? '').get('pwd')
  return `zoommtg://${m[1]}/join?action=join&confno=${m[2]}${pwd ? `&pwd=${encodeURIComponent(pwd)}` : ''}`
}

/** The meeting happening right now (drives the header pill and ⌘↵ join).
 * Most recently started wins when meetings overlap — it's the one you're in.
 * Skips all-day events and meetings you declined. */
export function currentEvent(): EventRow | undefined {
  const now = nowMs.value
  return visibleEvents.value
    .filter((e) => !e.allDay && e.startMs <= now && now < e.endMs && !isDeclined(e))
    .sort((a, b) => b.startMs - a.startMs)[0]
}

/** Programmatic join (keyboard shortcut): same semantics as ZoomJoinLink. */
export function joinZoom(url: string): void {
  const href = zoomOpenHref(url)
  if (href.startsWith('zoommtg:')) location.href = href
  else window.open(href, '_blank', 'noreferrer')
}

export const JOIN_KEY_HINT = /Mac|iP/.test(navigator.platform) ? '⌘↵' : 'Ctrl↵'

/** Join anchor: zoommtg: deep links must NOT use target=_blank (it leaves a
 * dead blank tab behind); web fallbacks should open in a new tab. */
export function ZoomJoinLink({ url, cls, children }: { url: string; cls: string; children: ComponentChildren }) {
  const href = zoomOpenHref(url)
  const isDeep = href.startsWith('zoommtg:')
  return (
    <a class={cls} href={href} target={isDeep ? undefined : '_blank'} rel="noreferrer">
      {children}
    </a>
  )
}

/** Zoom-style camera glyph (rounded body + wedge), drawn in currentColor. */
export function ZoomIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1 5.2C1 4 2 3 3.2 3h5.6C10 3 11 4 11 5.2v5.6C11 12 10 13 8.8 13H3.2C2 13 1 12 1 10.8V5.2z" />
      <path d="M12 6.5l2.6-2c.6-.4 1.4 0 1.4.7v5.6c0 .7-.8 1.1-1.4.7l-2.6-2v-3z" />
    </svg>
  )
}
