// Google Calendar event color palette (colorId 1-11) using the modern UI hex
// values, plus the user's custom labels as configured in Google Calendar
// (right-click color menu). The API exposes only colorId — labels are UI-side.
export interface EventColor {
  id: string
  hex: string
  name: string // Google's default name
  label?: string // user's custom label
}

export const EVENT_COLORS: Record<string, EventColor> = {
  '1': { id: '1', hex: '#7986cb', name: 'Lavender', label: 'gym' },
  '2': { id: '2', hex: '#33b679', name: 'Sage', label: 'Investors' },
  '3': { id: '3', hex: '#8e24aa', name: 'Grape', label: '1:1s' },
  '4': { id: '4', hex: '#e67c73', name: 'Flamingo', label: 'Misc external' },
  '5': { id: '5', hex: '#f6bf26', name: 'Banana', label: 'Internal Meetings' },
  '6': { id: '6', hex: '#f4511e', name: 'Tangerine', label: 'Events / In-person' },
  '7': { id: '7', hex: '#039be5', name: 'Peacock' },
  '8': { id: '8', hex: '#616161', name: 'Graphite', label: 'Block' },
  '9': { id: '9', hex: '#3f51b5', name: 'Blueberry', label: 'GTM / Growth / Marketing' },
  '10': { id: '10', hex: '#0b8043', name: 'Basil', label: 'Recruiting' },
  '11': { id: '11', hex: '#d50000', name: 'Tomato', label: 'Customer Calls' },
}

export function eventColorHex(colorId?: string): string | undefined {
  return colorId ? EVENT_COLORS[colorId]?.hex : undefined
}

export function eventColorLabel(colorId?: string): string | undefined {
  const c = colorId ? EVENT_COLORS[colorId] : undefined
  return c ? (c.label ?? c.name) : undefined
}

/** Google renders WHITE text on every color of its current palettes — even
 * Banana yellow at ~1.7:1 contrast (Google's call; matched deliberately so
 * chips look identical to Google Calendar). Luminance can't reproduce that
 * choice (#f6bf26 → white but equally-light pastels → dark), so membership
 * in the known palettes decides, and only custom/legacy-pastel calendar
 * colors fall back to the computed contrast pick. */
const WHITE_TEXT_HEXES = new Set([
  ...Object.values(EVENT_COLORS).map((c) => c.hex),
  // modern calendar palette (24)
  '#795548', '#e67c73', '#d50000', '#f4511e', '#ef6c00', '#f09300',
  '#009688', '#0b8043', '#7cb342', '#c0ca33', '#e4c441', '#f6bf26',
  '#33b679', '#039be5', '#4285f4', '#3f51b5', '#7986cb', '#b39ddb',
  '#616161', '#a79b8e', '#ad1457', '#d81b60', '#8e24aa', '#9e69af',
])

export function chipTextColor(fill: string): string {
  return WHITE_TEXT_HEXES.has(fill.toLowerCase()) ? '#fff' : textOnColor(fill)
}

/** White or near-black by WCAG contrast — for colors outside Google's
 * palettes (custom calendar hexes), where there's no convention to match. */
export function textOnColor(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return '#fff'
  const n = parseInt(m[1]!, 16)
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return 1.05 / (L + 0.05) >= 3 ? '#fff' : 'rgba(10, 10, 10, 0.86)'
}
