// Raw Google shapes (subset we care about) and local storage rows.

export interface GDateTime {
  date?: string // all-day, YYYY-MM-DD
  dateTime?: string // RFC3339
  timeZone?: string
}

export interface GAttendee {
  email: string
  displayName?: string
  organizer?: boolean
  self?: boolean
  optional?: boolean
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted'
}

export interface GEvent {
  id: string
  etag: string
  status: 'confirmed' | 'tentative' | 'cancelled'
  summary?: string
  description?: string
  location?: string
  start?: GDateTime
  end?: GDateTime
  recurringEventId?: string
  originalStartTime?: GDateTime
  recurrence?: string[]
  attendees?: GAttendee[]
  organizer?: { email?: string; displayName?: string; self?: boolean }
  creator?: { email?: string; self?: boolean }
  hangoutLink?: string
  conferenceData?: unknown
  reminders?: { useDefault: boolean; overrides?: { method: string; minutes: number }[] }
  colorId?: string
  transparency?: 'opaque' | 'transparent'
  visibility?: string
  updated?: string
}

export interface EventRow extends GEvent {
  calendarId: string
  startMs: number
  endMs: number
  allDay: boolean
  updatedMs: number
  baselineGen: number
  ephemeral?: boolean
  pending?: 'create' | 'update' | 'delete'
  searchText: string
}

export interface CalendarRow {
  id: string
  summary: string
  backgroundColor?: string
  foregroundColor?: string
  accessRole: 'freeBusyReader' | 'reader' | 'writer' | 'owner'
  primary?: boolean
  hidden?: boolean // local UI toggle
  timeZone?: string
  defaultReminders?: { method: string; minutes: number }[]
}

export type OutboxOpType = 'create' | 'patch' | 'delete' | 'rsvp' | 'splitRecurring'

export interface OutboxOp {
  seq?: number // autoIncrement
  opType: OutboxOpType
  calendarId: string
  eventId: string
  payload: Record<string, unknown>
  ifMatchEtag?: string
  phase?: number // splitRecurring resumability
  attempts: number
  nextAttemptMs: number
  lastError?: string
  createdMs: number
}

export interface SyncStateRow {
  calendarId: string
  syncToken?: string
  pageToken?: string
  phase: 'idle' | 'full' | 'incremental'
  windowStartMs?: number
  windowEndMs?: number
  baselineGen: number
  baselinedAt?: number
  lastSyncedAt?: number
  error?: string
}
