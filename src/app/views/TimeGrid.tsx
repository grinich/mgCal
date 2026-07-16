import { useLayoutEffect, useRef } from 'preact/hooks'
import type { EventRow } from '../../data/types'
import { calendarById, nowMs, openEdit, overflowList, selectedKey } from '../state/signals'
import { DAY, DOW, defaultScrollTop, fmtTime, fmtTimeShort, HOUR, HOUR_H, isSameDay } from '../time'
import { layoutDay, layoutLanes, splitAllDay } from './layout'
import { textOnColor } from '../colors'
import { chipColor, EventChip, eventKey, isDeclined, toggleSelect } from './EventChip'
import { drag, makeGeom, startCreateDrag, type GridGeom } from './drag'

const GUTTER_PX = 52

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

  const geom: GridGeom = {
    timeAt: (e) => makeGeom(innerRef.current!, days, GUTTER_PX).timeAt(e),
  }

  const rowStartMs = days[0]!.getTime()
  const lanes = layoutLanes(allDay, rowStartMs, days.length)
  const laneCount = lanes.length ? Math.max(...lanes.map((l) => l.lane)) + 1 : 0
  const cols = `var(--gutter) repeat(${days.length}, 1fr)`

  return (
    <div class="timegrid">
      <div class="days-header" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => (
          <div key={d.getTime()} class={'day-head' + (isSameDay(d, today) ? ' today' : '')}>
            <div class="dow">{DOW[d.getDay()]}</div>
            <div class="dom">{d.getDate()}</div>
          </div>
        ))}
      </div>

      {laneCount > 0 && (
        <div class="allday-row" style={{ gridTemplateColumns: cols }}>
          <div class="allday-label">all-day</div>
          <div class="allday-lanes" style={{ height: `${laneCount * 22 + 2}px` }}>
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
                  '--ct': textOnColor(chipColor(l.ev)),
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
          </div>
        </div>
      )}

      <div class="grid-scroll" ref={scrollRef}>
        <div class="grid-inner" ref={innerRef} style={{ gridTemplateColumns: cols, height: `${24 * HOUR_H}px` }}>
          <div class="gutter">
            {Array.from({ length: 23 }, (_, i) => (
              <div key={i} class="hour-label" style={{ top: `${(i + 1) * HOUR_H}px` }}>
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
  const dayEndMs = dayStartMs + DAY
  const now = nowMs.value
  const isToday = isSameDay(day, new Date(now))
  const dayEvents = events.filter((e) => e.startMs < dayEndMs && e.endMs > dayStartMs)
  const { chips, overflows } = layoutDay(dayEvents, dayStartMs, maxCols, priorityRank)

  const d = drag.value
  let ghost: { top: number; height: number; label: string; color?: string } | null = null
  if (d && d.startMs < dayEndMs && d.endMs > dayStartMs) {
    const s = Math.max(d.startMs, dayStartMs)
    const e = Math.min(d.endMs, dayEndMs)
    ghost = {
      top: ((s - dayStartMs) / HOUR) * HOUR_H,
      height: Math.max(((e - s) / HOUR) * HOUR_H - 2, 12),
      label:
        d.kind === 'event'
          ? `${d.ev.summary || '(no title)'} · ${fmtTimeShort(d.startMs)}–${fmtTime(d.endMs)}`
          : `${fmtTimeShort(d.startMs)} – ${fmtTime(d.endMs)}`,
      color: d.kind === 'event' ? chipColor(d.ev) : undefined,
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
        <div class="now-line" style={{ top: `${((now - dayStartMs) / HOUR) * HOUR_H}px` }}>
          <div class="now-dot" />
        </div>
      )}
    </div>
  )
}
