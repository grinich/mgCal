import { useEffect, useRef, useState } from 'preact/hooks'
import { createEvent, deleteEventScoped, patchEventScoped } from '../../data/outbox'
import { presetLabel, presetRule, type RecurrencePreset } from '../../data/rrule'
import type { GAttendee, GDateTime, GEvent } from '../../data/types'
import { EVENT_COLORS } from '../colors'
import { askScope, calendarById, calendars, editor, selectedKey, weekStart, writableCalendars } from '../state/signals'
import { addDays, DOW, fmtTime, MIN, startOfDay, startOfWeek } from '../time'
import { getKnownEmails } from './emails'

const PRESETS: RecurrencePreset[] = ['none', 'daily', 'weekly', 'weekdays', 'monthly', 'yearly']

function ymd(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toGTime(ms: number, allDay: boolean): GDateTime {
  return allDay ? { date: ymd(ms) } : { dateTime: new Date(ms).toISOString() }
}

// ---------- keyboard-friendly parsing ----------

/** "9", "930", "9:30", "9am", "9.30pm", "21:15" → minutes past midnight. */
export function parseTimeText(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\./g, ':')
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*(a|am|p|pm)?$/.exec(s)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  const ap = m[3]
  if (min > 59) return null
  if (ap?.startsWith('p') && h < 12) h += 12
  if (ap?.startsWith('a') && h === 12) h = 0
  if (h > 23) return null
  return h * 60 + min
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "7/22", "jul 22", "22 jul", "2026-07-22", "july 22 2026" → Date (midnight). */
export function parseDateText(raw: string, ref: Date): Date | null {
  const s = raw.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ')
  let y: number | undefined, mo: number | undefined, d: number | undefined

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (!m && (m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(s))) {
    mo = Number(m[1])
    d = Number(m[2])
    if (m[3]) y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
  }
  if (!m && (m = /^([a-z]{3,9})\s+(\d{1,2})(?:\s+(\d{4}))?$/.exec(s))) {
    mo = MONTHS.findIndex((x) => m![1]!.startsWith(x)) + 1
    d = Number(m[2])
    if (m[3]) y = Number(m[3])
  }
  if (!m && (m = /^(\d{1,2})\s+([a-z]{3,9})(?:\s+(\d{4}))?$/.exec(s))) {
    d = Number(m[1])
    mo = MONTHS.findIndex((x) => m![2]!.startsWith(x)) + 1
    if (m[3]) y = Number(m[3])
  }
  if (!mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const year = y ?? ref.getFullYear()
  const date = new Date(year, mo - 1, d)
  return isNaN(date.getTime()) ? null : date
}

function fmtDateText(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ---------- field components ----------

const TIME_OPTS = Array.from({ length: 96 }, (_, i) => {
  const minutes = i * 15
  return { minutes, label: fmtTime(new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).getTime()) }
})

function TimeField({ ms, onCommit, label }: { ms: number; onCommit: (minutes: number) => void; label: string }) {
  const [text, setText] = useState(fmtTime(ms))
  const [bad, setBad] = useState(false)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setText(fmtTime(ms))
    setBad(false)
  }, [ms])

  // Highlight the 15-min option nearest what's typed (or the current value)
  // and keep it scrolled into view while the menu is open.
  const cur = new Date(ms)
  const target = parseTimeText(text) ?? cur.getHours() * 60 + cur.getMinutes()
  const nearest = (Math.round(target / 15) * 15) % (24 * 60)
  useEffect(() => {
    if (open) menuRef.current?.querySelector('.sel')?.scrollIntoView({ block: 'center' })
  }, [open, nearest])

  const commit = () => {
    const mins = parseTimeText(text)
    if (mins == null) {
      setBad(true)
      setText(fmtTime(ms))
      setTimeout(() => setBad(false), 600)
    } else {
      onCommit(mins)
    }
  }
  return (
    <div class="time-field">
      <input
        class={'field-input time-input' + (bad ? ' bad' : '')}
        value={text}
        aria-label={label}
        onInput={(e) => {
          setText(e.currentTarget.value)
          setOpen(true)
        }}
        onBlur={() => {
          setOpen(false)
          commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            setOpen(false)
            commit()
            ;(e.currentTarget.form?.querySelector('[data-save]') as HTMLElement | null)?.focus()
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation() // close the menu, not the editor
            setOpen(false)
          }
        }}
        onFocus={(e) => {
          e.currentTarget.select()
          setOpen(true)
        }}
      />
      {open && (
        <div class="time-menu" ref={menuRef}>
          {TIME_OPTS.map((o) => (
            <button
              key={o.minutes}
              type="button"
              tabIndex={-1}
              class={'time-opt' + (o.minutes === nearest ? ' sel' : '')}
              // pointerdown beats the input's blur, so the pick lands first
              onPointerDown={(e) => {
                e.preventDefault()
                setOpen(false)
                onCommit(o.minutes)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Compact date input; the mini-month calendar pops under it only while the
 * field has focus (Google-style) instead of living in the form. */
function DateField({ ms, onCommit, label }: { ms: number; onCommit: (d: Date) => void; label: string }) {
  const [text, setText] = useState(fmtDateText(ms))
  const [bad, setBad] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setText(fmtDateText(ms))
    setBad(false)
  }, [ms])
  const commit = () => {
    const d = parseDateText(text, new Date(ms))
    if (!d) {
      setBad(true)
      setText(fmtDateText(ms))
      setTimeout(() => setBad(false), 600)
    } else {
      onCommit(d)
    }
  }
  return (
    <div class="date-field">
      <input
        class={'field-input date-input' + (bad ? ' bad' : '')}
        value={text}
        aria-label={label}
        onInput={(e) => setText(e.currentTarget.value)}
        onBlur={() => {
          setOpen(false)
          commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            setOpen(false)
            commit()
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation() // close the picker, not the editor
            setOpen(false)
          }
        }}
        onFocus={(e) => {
          e.currentTarget.select()
          setOpen(true)
        }}
      />
      {open && (
        // pointerdown preventDefault keeps the input focused (and its blur
        // from firing) while clicking the calendar's day/nav buttons.
        <div class="date-menu" onPointerDown={(e) => e.preventDefault()}>
          <MiniMonth
            valueMs={ms}
            onPick={(d) => {
              setOpen(false)
              onCommit(d)
            }}
          />
        </div>
      )}
    </div>
  )
}

/** Always-visible mini month calendar. */
function MiniMonth({ valueMs, onPick }: { valueMs: number; onPick: (d: Date) => void }) {
  const value = new Date(valueMs)
  const [view, setView] = useState(new Date(value.getFullYear(), value.getMonth(), 1))
  useEffect(() => {
    setView(new Date(value.getFullYear(), value.getMonth(), 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.getFullYear(), value.getMonth()])

  const gridStart = startOfWeek(view, weekStart.value)
  const today = new Date()
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  return (
    <div class="mini-month">
      <div class="mini-head">
        <button type="button" tabIndex={-1} class="icon-btn" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>
          ‹
        </button>
        <span class="mini-title">
          {view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <button type="button" tabIndex={-1} class="icon-btn" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>
          ›
        </button>
      </div>
      <div class="mini-grid">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={'d' + i} class="mini-dow">
            {DOW[(i + weekStart.value) % 7]!.slice(0, 1)}
          </span>
        ))}
        {cells.map((d) => (
          <button
            type="button"
            tabIndex={-1}
            key={d.getTime()}
            class={
              'mini-cell' +
              (d.getMonth() !== view.getMonth() ? ' outside' : '') +
              (same(d, value) ? ' selected' : '') +
              (same(d, today) ? ' today' : '')
            }
            onClick={() => onPick(d)}
          >
            {d.getDate()}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- editor ----------

export function EventEditor() {
  const st = editor.value
  if (!st) return null
  if (st.quickAt) return <QuickCreate key="quick" />
  return <EditorForm key={st.original ? `${st.original.calendarId}|${st.original.id}` : 'create'} />
}

function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Title-only popup for drag-created events (Google-style quick add): the
 * drag already fixed the times, so just ask for a name. Enter/Save creates,
 * Esc or click-away cancels, "More options" expands into the full editor. */
function QuickCreate() {
  const st = editor.value!
  const at = st.quickAt!
  const [summary, setSummary] = useState('')
  const ref = useRef<HTMLFormElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: 0 })

  useEffect(() => {
    const w = ref.current?.offsetWidth ?? 300
    const h = ref.current?.offsetHeight ?? 130
    setPos({
      left: Math.max(8, Math.min(at.x + 12, window.innerWidth - w - 8)),
      top: Math.max(8, Math.min(at.y + 12, window.innerHeight - h - 8)),
    })
    titleRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = () => (editor.value = null)

  async function save(e?: Event) {
    e?.preventDefault()
    const fields: Partial<GEvent> & { start: GDateTime; end: GDateTime } = {
      start: toGTime(st.startMs, st.allDay),
      end: toGTime(st.endMs, st.allDay),
    }
    if (summary) fields.summary = summary
    await createEvent(st.calendarId, fields)
    close()
  }

  const allDayEndIncl = addDays(new Date(st.endMs), -1).getTime() // exclusive → inclusive
  const when = st.allDay
    ? allDayEndIncl > st.startMs
      ? `${fmtDay(st.startMs)} – ${fmtDay(allDayEndIncl)}`
      : fmtDay(st.startMs)
    : `${fmtDay(st.startMs)} ⋅ ${fmtTime(st.startMs)} – ${fmtTime(st.endMs)}`

  return (
    <div class="overlay quick-overlay" onClick={close}>
      <form
        ref={ref}
        class="panel editor quick-create"
        style={pos}
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
          placeholder="Add title"
          value={summary}
          onInput={(e) => setSummary(e.currentTarget.value)}
        />
        <div class="quick-when">{when}</div>
        <div class="editor-actions">
          <div class="spacer" />
          <button type="button" class="btn" onClick={() => (editor.value = { ...st, summary, quickAt: undefined })}>
            More options
          </button>
          <button type="submit" class="btn accent" data-save>
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

function EditorForm() {
  const st = editor.value!
  const [summary, setSummary] = useState(st.summary)
  const [allDay, setAllDay] = useState(st.allDay)
  // startMs/endMs are the single source of truth. For all-day, endMs holds the
  // INCLUSIVE end day here; the exclusive day is added back at save time.
  const [startMs, setStartMs] = useState(st.startMs)
  const [endMs, setEndMs] = useState(st.allDay ? addDays(new Date(st.endMs), -1).getTime() : st.endMs)
  const [calendarId, setCalendarId] = useState(st.calendarId)
  const [location, setLocation] = useState(st.location)
  const [description, setDescription] = useState(st.description)
  const [guests, setGuests] = useState<string[]>(
    (st.original?.attendees ?? []).map((a) => a.email).filter(Boolean),
  )
  const [guestInput, setGuestInput] = useState('')
  const [repeat, setRepeat] = useState<RecurrencePreset>('none')
  const [colorId, setColorId] = useState<string>(st.original?.colorId ?? '')
  const [knownEmails, setKnownEmails] = useState<string[]>([])
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
    void getKnownEmails().then(setKnownEmails)
  }, [])

  const close = () => (editor.value = null)

  // Moving the start preserves duration (Google-style); end clamps to start.
  function moveStart(next: number): void {
    const dur = Math.max(endMs - startMs, allDay ? 0 : 15 * MIN)
    setStartMs(next)
    setEndMs(next + dur)
  }
  function moveEnd(next: number): void {
    setEndMs(allDay ? Math.max(next, startMs) : Math.max(next, startMs + 15 * MIN))
  }
  const withDate = (ms: number, d: Date) => {
    const t = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.getHours(), t.getMinutes()).getTime()
  }
  const withMinutes = (ms: number, minutes: number) => {
    const t = new Date(ms)
    return new Date(t.getFullYear(), t.getMonth(), t.getDate(), Math.floor(minutes / 60), minutes % 60).getTime()
  }

  function addGuest(raw: string): void {
    const email = raw.trim().replace(/,$/, '')
    if (email && /.+@.+\..+/.test(email) && !guests.includes(email)) {
      setGuests([...guests, email])
    }
    setGuestInput('')
  }

  async function save(e?: Event) {
    e?.preventDefault()
    let s: number, en: number
    if (allDay) {
      // Calendar-day steps, not +DAY: a 23- or 25-hour day would otherwise
      // push the exclusive end to 01:00 or 23:00 instead of local midnight.
      s = startOfDay(new Date(startMs)).getTime()
      en = addDays(startOfDay(new Date(endMs)), 1).getTime() // exclusive
      if (en <= s) en = addDays(new Date(s), 1).getTime()
    } else {
      s = startMs
      en = endMs > startMs ? endMs : startMs + 15 * MIN
    }
    const start = toGTime(s, allDay)
    const end = toGTime(en, allDay)

    if (st.mode === 'create') {
      const fields: Partial<GEvent> & { start: GDateTime; end: GDateTime } = { start, end }
      if (summary) fields.summary = summary
      if (location) fields.location = location
      if (description) fields.description = description
      if (guests.length) fields.attendees = guests.map((email) => ({ email }))
      const rule = presetRule(repeat, new Date(s))
      if (rule) fields.recurrence = rule
      if (colorId) fields.colorId = colorId
      await createEvent(calendarId, fields)
    } else if (st.original) {
      const patch: Partial<GEvent> = {}
      if (summary !== st.summary) patch.summary = summary
      if (location !== st.location) patch.location = location
      if (description !== st.description) patch.description = description
      if (s !== st.startMs || en !== st.endMs || allDay !== st.allDay) {
        patch.start = start
        patch.end = end
      }
      const origEmails = (st.original.attendees ?? []).map((a) => a.email).filter(Boolean)
      if (JSON.stringify(guests) !== JSON.stringify(origEmails)) {
        patch.attendees = guests.map(
          (email): GAttendee => st.original!.attendees?.find((a) => a.email === email) ?? { email },
        )
      }
      if (colorId !== (st.original.colorId ?? '')) {
        patch.colorId = (colorId || null) as unknown as string
      }
      if (Object.keys(patch).length) {
        const scope = await askScope(st.original, 'edit')
        if (!scope) return
        await patchEventScoped(st.original, patch, scope)
      }
    }
    close()
  }

  async function del() {
    if (st.original) {
      const scope = await askScope(st.original, 'delete')
      if (!scope) return
      await deleteEventScoped(st.original, scope)
      selectedKey.value = null
    }
    close()
  }

  const cals = st.mode === 'create' ? writableCalendars() : calendars.value

  return (
    <div class="overlay" onClick={close}>
      <form
        class="panel editor editor-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            close()
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void save()
          }
        }}
      >
        <input
          ref={titleRef}
          class="editor-title"
          placeholder="Event title"
          value={summary}
          onInput={(e) => setSummary(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter from the title jumps to the start date (Enter saves later).
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.currentTarget.form?.querySelector('.date-input') as HTMLElement | null)?.focus()
            }
          }}
        />

        <div class="when-grid">
          <div class="when-col">
            <div class="when-label">Starts</div>
            <div class="when-fields">
              <DateField ms={startMs} label="Start date" onCommit={(d) => moveStart(withDate(startMs, d))} />
              {!allDay && (
                <TimeField ms={startMs} label="Start time" onCommit={(m) => moveStart(withMinutes(startMs, m))} />
              )}
            </div>
          </div>
          <div class="when-col">
            <div class="when-label">Ends</div>
            <div class="when-fields">
              <DateField ms={endMs} label="End date" onCommit={(d) => moveEnd(withDate(endMs, d))} />
              {!allDay && (
                <TimeField ms={endMs} label="End time" onCommit={(m) => moveEnd(withMinutes(endMs, m))} />
              )}
            </div>
          </div>
        </div>

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
          {st.mode === 'create' && (
            <select value={repeat} onChange={(e) => setRepeat(e.currentTarget.value as RecurrencePreset)}>
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {presetLabel(p, new Date(startMs))}
                </option>
              ))}
            </select>
          )}
          {st.mode === 'edit' && st.original?.recurringEventId && <span class="muted">↻ Recurring</span>}
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

        {/* Event categories: the color palette with the user's category names. */}
        <div class="cat-row">
          <button
            type="button"
            tabIndex={-1}
            class={'cat-pill' + (colorId === '' ? ' sel' : '')}
            style={{ '--dot': calendarById.value.get(calendarId)?.backgroundColor ?? 'var(--accent)' }}
            onClick={() => setColorId('')}
          >
            <span class="cat-pill-dot" />
            Calendar color
          </button>
          {Object.values(EVENT_COLORS).map((c) => (
            <button
              key={c.id}
              type="button"
              tabIndex={-1}
              class={'cat-pill' + (colorId === c.id ? ' sel' : '')}
              style={{ '--dot': c.hex }}
              onClick={() => setColorId(c.id)}
            >
              <span class="cat-pill-dot" />
              {c.label ?? c.name}
            </button>
          ))}
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
          <span class="muted editor-hint">⌘↵ to save</span>
          <button type="button" class="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" class="btn accent" data-save>
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
