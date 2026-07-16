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
