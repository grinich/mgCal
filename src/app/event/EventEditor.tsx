import { useEffect, useRef, useState } from 'preact/hooks'
import { createEvent, deleteEvent, patchEvent } from '../../data/outbox'
import type { GAttendee, GDateTime, GEvent } from '../../data/types'
import { calendars, editor, selectedKey, writableCalendars } from '../state/signals'
import { DAY, startOfDay } from '../time'
import { getKnownEmails } from './emails'

function ymd(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hm(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function parseLocal(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  return new Date(y!, m! - 1, d!, hh ?? 0, mm ?? 0).getTime()
}

function toGTime(ms: number, allDay: boolean): GDateTime {
  return allDay ? { date: ymd(ms) } : { dateTime: new Date(ms).toISOString() }
}

export function EventEditor() {
  const st = editor.value
  if (!st) return null
  return <EditorForm key={st.original ? `${st.original.calendarId}|${st.original.id}` : 'create'} />
}

function EditorForm() {
  const st = editor.value!
  const [summary, setSummary] = useState(st.summary)
  const [allDay, setAllDay] = useState(st.allDay)
  const [startDate, setStartDate] = useState(ymd(st.startMs))
  const [startTime, setStartTime] = useState(hm(st.startMs))
  const [endDate, setEndDate] = useState(ymd(st.allDay ? st.endMs - DAY : st.endMs))
  const [endTime, setEndTime] = useState(hm(st.endMs))
  const [calendarId, setCalendarId] = useState(st.calendarId)
  const [location, setLocation] = useState(st.location)
  const [description, setDescription] = useState(st.description)
  const [guests, setGuests] = useState<string[]>(
    (st.original?.attendees ?? []).map((a) => a.email).filter(Boolean),
  )
  const [guestInput, setGuestInput] = useState('')
  const [addMeet, setAddMeet] = useState(false)
  const [knownEmails, setKnownEmails] = useState<string[]>([])
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
    void getKnownEmails().then(setKnownEmails)
  }, [])

  function addGuest(raw: string): void {
    const email = raw.trim().replace(/,$/, '')
    if (email && /.+@.+\..+/.test(email) && !guests.includes(email)) {
      setGuests([...guests, email])
    }
    setGuestInput('')
  }

  const close = () => (editor.value = null)

  async function save(e: Event) {
    e.preventDefault()
    let startMs: number, endMs: number
    if (allDay) {
      startMs = startOfDay(new Date(parseLocal(startDate, '00:00'))).getTime()
      endMs = startOfDay(new Date(parseLocal(endDate, '00:00'))).getTime() + DAY // exclusive
      if (endMs <= startMs) endMs = startMs + DAY
    } else {
      startMs = parseLocal(startDate, startTime)
      endMs = parseLocal(endDate, endTime)
      if (endMs <= startMs) endMs = startMs + 15 * 60_000
    }
    const start = toGTime(startMs, allDay)
    const end = toGTime(endMs, allDay)

    const meetRequest = addMeet
      ? {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        }
      : undefined

    if (st.mode === 'create') {
      const fields: Partial<GEvent> & { start: GDateTime; end: GDateTime } = { start, end }
      if (summary) fields.summary = summary
      if (location) fields.location = location
      if (description) fields.description = description
      if (guests.length) fields.attendees = guests.map((email) => ({ email }))
      if (meetRequest) fields.conferenceData = meetRequest
      await createEvent(calendarId, fields)
    } else if (st.original) {
      const patch: Partial<GEvent> = {}
      if (summary !== st.summary) patch.summary = summary
      if (location !== st.location) patch.location = location
      if (description !== st.description) patch.description = description
      if (startMs !== st.startMs || endMs !== st.endMs || allDay !== st.allDay) {
        patch.start = start
        patch.end = end
      }
      const origEmails = (st.original.attendees ?? []).map((a) => a.email).filter(Boolean)
      if (JSON.stringify(guests) !== JSON.stringify(origEmails)) {
        // Preserve existing attendee objects (responses) for retained guests.
        patch.attendees = guests.map(
          (email): GAttendee => st.original!.attendees?.find((a) => a.email === email) ?? { email },
        )
      }
      if (meetRequest) patch.conferenceData = meetRequest
      if (Object.keys(patch).length) await patchEvent(st.original, patch)
    }
    close()
  }

  async function del() {
    if (st.original) {
      await deleteEvent(st.original)
      selectedKey.value = null
    }
    close()
  }

  const cals = st.mode === 'create' ? writableCalendars() : calendars.value

  return (
    <div class="overlay" onClick={close}>
      <form
        class="panel editor"
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            close()
          }
        }}
      >
        <input
          ref={titleRef}
          class="editor-title"
          placeholder="Event title"
          value={summary}
          onInput={(e) => setSummary(e.currentTarget.value)}
        />
        <div class="editor-row">
          <label class="editor-check">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.currentTarget.checked)} />
            All day
          </label>
          <select
            value={calendarId}
            disabled={st.mode === 'edit'}
            onChange={(e) => setCalendarId(e.currentTarget.value)}
          >
            {cals.map((c) => (
              <option key={c.id} value={c.id}>
                {c.summary}
              </option>
            ))}
          </select>
        </div>
        <div class="editor-row">
          <input type="date" value={startDate} onInput={(e) => {
            const v = e.currentTarget.value
            if (endDate < v) setEndDate(v)
            setStartDate(v)
          }} />
          {!allDay && <input type="time" value={startTime} onInput={(e) => setStartTime(e.currentTarget.value)} />}
          <span class="editor-dash">–</span>
          {!allDay && <input type="time" value={endTime} onInput={(e) => setEndTime(e.currentTarget.value)} />}
          <input type="date" value={endDate} onInput={(e) => setEndDate(e.currentTarget.value)} />
        </div>
        <div class="guest-box">
          {guests.map((g) => (
            <span key={g} class="guest-chip">
              {g}
              <button type="button" class="guest-x" onClick={() => setGuests(guests.filter((x) => x !== g))}>
                ✕
              </button>
            </span>
          ))}
          <input
            class="guest-input"
            placeholder={guests.length ? 'Add guest' : 'Add guests'}
            list="known-emails"
            value={guestInput}
            onInput={(e) => setGuestInput(e.currentTarget.value)}
            onChange={(e) => addGuest(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && guestInput.trim()) {
                e.preventDefault()
                addGuest(guestInput)
              } else if (e.key === 'Backspace' && !guestInput && guests.length) {
                setGuests(guests.slice(0, -1))
              }
            }}
          />
          <datalist id="known-emails">
            {knownEmails
              .filter((k) => !guests.includes(k))
              .slice(0, 50)
              .map((k) => (
                <option key={k} value={k} />
              ))}
          </datalist>
        </div>
        {!st.original?.hangoutLink && (
          <label class="editor-check">
            <input type="checkbox" checked={addMeet} onChange={(e) => setAddMeet(e.currentTarget.checked)} />
            Add Google Meet video conferencing
          </label>
        )}
        <input
          class="editor-field"
          placeholder="Location"
          value={location}
          onInput={(e) => setLocation(e.currentTarget.value)}
        />
        <textarea
          class="editor-field"
          placeholder="Description"
          rows={3}
          value={description}
          onInput={(e) => setDescription(e.currentTarget.value)}
        />
        <div class="editor-actions">
          {st.mode === 'edit' && (
            <button type="button" class="btn danger" onClick={() => void del()}>
              Delete
            </button>
          )}
          <div class="spacer" />
          <button type="button" class="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" class="btn accent">
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
