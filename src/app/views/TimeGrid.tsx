import { useLayoutEffect, useRef } from 'preact/hooks'
import type { EventRow } from '../../data/types'
import { calendarById, editor, nowMs, openEdit, overflowList, selectedKey, writableCalendars } from '../state/signals'
import { addDays, DOW, defaultScrollTop, fmtTime, fmtTimeShort, hourH, isSameDay, setHourH, wallHours } from '../time'
import { layoutDay, layoutLanes, splitAllDay } from './layout'
import { chipTextColor } from '../colors'
import { chipColor, EventChip, eventKey, isDeclined, toggleSelect } from './EventChip'
import { drag, makeGeom, startAllDayCreateDrag, startCreateDrag, type GridGeom } from './drag'

const GUTTER_PX = 52

/** The color a drag-created event will actually have once saved: its
 * calendar's color — the editor's calendar when one is open, else the
 * default create calendar (same pick openCreate makes). */
function draftColor(): string {
  const ed = editor.value
  const cal =
    ed?.mode === 'create'
      ? calendarById.value.get(ed.calendarId)
      : (writableCalendars().find((c) => c.primary) ?? writableCalendars()[0])
  return cal?.backgroundColor ?? 'var(--accent)'
}

/** Shared day/week time grid: header row, all-day lane row, scrollable hour grid. */
export function TimeGrid({ days, events }: { days: Date[]; events: EventRow[] }) {
  const { allDay, timed } = splitAllDay(events)
  const scrollRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const today = new Date(nowMs.value)
  const todayVisible = days.some((d) => isSameDay(d, today))

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = defaultScrollTop(todayVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]?.getTime(), days.length])

  // Trackpad pinch (Chrome delivers it as ctrl+wheel) zooms the time scale:
  // pinch in = shorter hours = more of the day visible. The time under the
  // cursor stays put: scrollTop is re-derived after the grid re-renders at
  // the new height (setting it immediately would clamp against the old one).
  const pinchAnchor = useRef<{ y: number; frac: number } | null>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const y = e.clientY - el.getBoundingClientRect().top
      pinchAnchor.current = { y, frac: (el.scrollTop + y) / (24 * hourH.value) }
      setHourH(hourH.value * Math.exp(-e.deltaY * 0.01))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  useLayoutEffect(() => {
    const el = scrollRef.current
    const a = pinchAnchor.current
    if (el && a) {
      pinchAnchor.current = null
      el.scrollTop = a.frac * 24 * hourH.value - a.y
    }
  }, [hourH.value])

  const geom: GridGeom = {
    timeAt: (e) => makeGeom(innerRef.current!, days, GUTTER_PX).timeAt(e),
  }

  const lanes = layoutLanes(allDay, days)
  const laneCount = lanes.length ? Math.max(...lanes.map((l) => l.lane)) + 1 : 0
  const cols = `var(--gutter) repeat(${days.length}, 1fr)`
  // The draft chip (Google-style): drawn solid in its own lane from the
  // moment the create-drag starts, and kept on screen while the editor is
  // open for it — it only disappears on save (the optimistic row takes over)
  // or cancel. Sourced from the live drag while dragging, from the editor
  // snapshot after lift-off.
  const dv = drag.value
  const ed = editor.value
  let draft: { first: number; last: number } | null = null
  if (dv?.kind === 'create-allday') {
    draft = { first: dv.startIdx, last: dv.endIdx }
  } else if (ed?.mode === 'create' && ed.allDay) {
    let first = -1
    let last = -1
    days.forEach((d, i) => {
      if (d.getTime() < ed.endMs && addDays(d, 1).getTime() > ed.startMs) {
        if (first < 0) first = i
        last = i
      }
    })
    if (first >= 0) draft = { first, last }
  }

  return (
    <div class="timegrid">
      {/* Click a date → quick-add a one-day all-day event; drag across dates
       * → multi-day. The draft draws in the all-day strip below. */}
      <div
        class="days-header"
        style={{ gridTemplateColumns: cols }}
        onPointerDown={(e) => startAllDayCreateDrag(e, days, { gutterPx: GUTTER_PX, clickCreates: true })}
      >
        <div />
        {days.map((d) => (
          <div key={d.getTime()} class={'day-head' + (isSameDay(d, today) ? ' today' : '')}>
            <div class="dow">{DOW[d.getDay()]}</div>
            <div class="dom">{d.getDate()}</div>
          </div>
        ))}
      </div>

      {/* Always rendered (min one lane tall) so there's a surface to drag
       * across for creating all-day events even when none exist yet. */}
      <div class="allday-row" style={{ gridTemplateColumns: cols }}>
        <div class="allday-label">all-day</div>
        <div
          class="allday-lanes"
          style={{ height: `${Math.max(laneCount + (draft ? 1 : 0), 1) * 22 + 2}px` }}
          onPointerDown={(e) => e.target === e.currentTarget && startAllDayCreateDrag(e, days)}
        >
          {lanes.map((l) => (
              <div
                key={eventKey(l.ev)}
                class={
                  'lane-chip' +
                  (selectedKey.value === eventKey(l.ev) ? ' selected' : '') +
                  (isDeclined(l.ev) ? ' declined' : '') +
                  (l.ev.pending ? ' pending' : '')
                }
                style={{
                  top: `${l.lane * 22}px`,
                  left: `calc(${(l.startCol / days.length) * 100}% + 1px)`,
                  width: `calc(${(l.span / days.length) * 100}% - 3px)`,
                  '--c': chipColor(l.ev),
                  '--ct': chipTextColor(chipColor(l.ev)),
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleSelect(l.ev, e.currentTarget as HTMLElement)
                }}
                onDblClick={(e) => {
                  e.stopPropagation()
                  openEdit(l.ev)
                }}
              >
                {l.clipsLeft ? '… ' : ''}
                {l.ev.summary || '(no title)'}
                {l.clipsRight ? ' …' : ''}
              </div>
            ))}
          {draft && (
            <div
              class="lane-chip draft"
              style={{
                top: `${laneCount * 22}px`,
                left: `calc(${(draft.first / days.length) * 100}% + 1px)`,
                width: `calc(${((draft.last - draft.first + 1) / days.length) * 100}% - 3px)`,
                '--c': draftColor(),
                '--ct': chipTextColor(draftColor()),
              }}
            >
              (no title)
            </div>
          )}
        </div>
      </div>

      <div class="grid-scroll" ref={scrollRef}>
        <div
          class="grid-inner"
          ref={innerRef}
          style={{ gridTemplateColumns: cols, height: `${24 * hourH.value}px`, '--hour-h': `${hourH.value}px` }}
        >
          <div class="gutter">
            {Array.from({ length: 23 }, (_, i) => (
              <div key={i} class="hour-label" style={{ top: `${(i + 1) * hourH.value}px` }}>
                {fmtTime(new Date(2000, 0, 1, i + 1).getTime())}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <DayColumn key={d.getTime()} day={d} events={timed} geom={geom} maxCols={days.length === 1 ? 6 : 3} />
          ))}
          <div class="hour-lines" />
        </div>
      </div>
    </div>
  )
}

/** Contended visible columns go to my own calendars first; shared-calendar
 * events and things I've declined are first into the +N overflow. */
function priorityRank(ev: EventRow): number {
  const cal = calendarById.value.get(ev.calendarId)
  let r = cal?.accessRole === 'owner' ? 0 : 1
  if (isDeclined(ev)) r += 2
  return r
}

function DayColumn({
  day,
  events,
  geom,
  maxCols,
}: {
  day: Date
  events: EventRow[]
  geom: GridGeom
  maxCols: number
}) {
  const dayStartMs = day.getTime()
  const dayEndMs = addDays(day, 1).getTime() // real day end — DST days aren't 24h
  const now = nowMs.value
  const isToday = isSameDay(day, new Date(now))
  const dayEvents = events.filter((e) => e.startMs < dayEndMs && e.endMs > dayStartMs)
  const { chips, overflows } = layoutDay(dayEvents, dayStartMs, dayEndMs, maxCols, priorityRank)

  const d = drag.value
  const ed = editor.value
  let ghost: { top: number; height: number; label: string; color?: string } | null = null
  // Live drag ghost, or (Google-style) the timed create draft held on screen
  // while the editor is open for it.
  const span =
    d && d.kind !== 'create-allday'
      ? d
      : !d && ed?.mode === 'create' && !ed.allDay
        ? { kind: 'create' as const, startMs: ed.startMs, endMs: ed.endMs }
        : null
  if (span && span.startMs < dayEndMs && span.endMs > dayStartMs) {
    const s = Math.max(span.startMs, dayStartMs)
    const e = Math.min(span.endMs, dayEndMs)
    ghost = {
      top: wallHours(s, dayStartMs, dayEndMs) * hourH.value,
      height: Math.max((wallHours(e, dayStartMs, dayEndMs) - wallHours(s, dayStartMs, dayEndMs)) * hourH.value - 2, 12),
      label:
        span.kind === 'event'
          ? `${span.ev.summary || '(no title)'} · ${fmtTimeShort(span.startMs)}–${fmtTime(span.endMs)}`
          : `${fmtTimeShort(span.startMs)} – ${fmtTime(span.endMs)}`,
      color: span.kind === 'event' ? chipColor(span.ev) : draftColor(),
    }
  }

  return (
    <div class="day-col" onPointerDown={(e) => e.target === e.currentTarget && startCreateDrag(e, geom)}>
      {chips.map((p) => (
        <EventChip
          key={eventKey(p.ev)}
          ev={p.ev}
          top={p.top}
          height={p.height}
          leftPct={p.leftPct}
          widthPct={p.widthPct}
          z={p.z}
          geom={geom}
        />
      ))}
      {overflows.map((o) => (
        <button
          key={`more-${o.top}`}
          class="chip-more"
          style={{ top: `${o.top}px`, height: `${o.height}px` }}
          title={`${o.events.length} more events`}
          onClick={(e) => {
            e.stopPropagation()
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            overflowList.value = { events: o.events, anchor: { x: r.x, y: r.y, w: r.width, h: r.height } }
          }}
        >
          +{o.events.length}
        </button>
      ))}
      {ghost && (
        <div
          class="ghost-chip"
          style={{ top: `${ghost.top}px`, height: `${ghost.height}px`, '--c': ghost.color ?? 'var(--accent)' }}
        >
          {ghost.label}
        </div>
      )}
      {isToday && (
        <div class="now-line" style={{ top: `${wallHours(now, dayStartMs, dayEndMs) * hourH.value}px` }}>
          <div class="now-dot" />
        </div>
      )}
    </div>
  )
}
