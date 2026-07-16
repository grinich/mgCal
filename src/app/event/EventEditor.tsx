import { useEffect, useRef, useState } from 'preact/hooks'
import { createEvent, deleteEvent, patchEvent } from '../../data/outbox'
import type { GDateTime, GEvent } from '../../data/types'
import { calendars, editor, selectedKey, writableCalendars } from '../state/signals'
import { DAY, startOfDay } from '../time'

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
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => titleRef.current?.focus(), [])

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

    if (st.mode === 'create') {
      const fields: Partial<GEvent> & { start: GDateTime; end: GDateTime } = { start, end }
      if (summary) fields.summary = summary
      if (location) fields.location = location
      if (description) fields.description = description
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
