/** Locations are often URLs (Zoom links) or long room lists — compact them. */
export function cleanLocation(loc: string): string {
  const first = loc.split(',')[0]!.trim()
  if (/^https?:\/\//i.test(first)) {
    try {
      return new URL(first).hostname.replace(/^www\./, '')
    } catch {
      return first
    }
  }
  return loc
}

/** URL locations open directly; physical addresses open in Google Maps. */
export function locationHref(loc: string): string {
  const first = loc.split(',')[0]!.trim()
  if (/^https?:\/\//i.test(first)) return first
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(loc)
}
