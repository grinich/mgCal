import { useLayoutEffect, useRef } from 'preact/hooks'
import type { EventRow } from '../../data/types'
import { nowMs } from '../state/signals'
import { DAY, DOW, defaultScrollTop, fmtTime, HOUR, HOUR_H, isSameDay } from '../time'
import { layoutDay, layoutLanes, splitAllDay } from './layout'
import { chipColor, EventChip, eventKey, isDeclined } from './EventChip'
import { selectedKey } from '../state/signals'

/** Shared day/week time grid: header row, all-day lane row, scrollable hour grid. */
export function TimeGrid({ days, events }: { days: Date[]; events: EventRow[] }) {
  const { allDay, timed } = splitAllDay(events)
  const scrollRef = useRef<HTMLDivElement>(null)
  const today = new Date(nowMs.value)
  const todayVisible = days.some((d) => isSameDay(d, today))

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = defaultScrollTop(todayVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]?.getTime()])

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
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  const k = eventKey(l.ev)
                  selectedKey.value = selectedKey.value === k ? null : k
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
        <div class="grid-inner" style={{ gridTemplateColumns: cols, height: `${24 * HOUR_H}px` }}>
          <div class="gutter">
            {Array.from({ length: 23 }, (_, i) => (
              <div key={i} class="hour-label" style={{ top: `${(i + 1) * HOUR_H}px` }}>
                {fmtTime(new Date(2000, 0, 1, i + 1).getTime())}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <DayColumn key={d.getTime()} day={d} events={timed} />
          ))}
          <div class="hour-lines" />
        </div>
      </div>
    </div>
  )
}

function DayColumn({ day, events }: { day: Date; events: EventRow[] }) {
  const dayStartMs = day.getTime()
  const dayEndMs = dayStartMs + DAY
  const now = nowMs.value
  const isToday = isSameDay(day, new Date(now))
  const dayEvents = events.filter((e) => e.startMs < dayEndMs && e.endMs > dayStartMs)
  const positioned = layoutDay(dayEvents, dayStartMs)

  return (
    <div class="day-col" onClick={() => (selectedKey.value = null)}>
      {positioned.map((p) => (
        <EventChip key={eventKey(p.ev)} ev={p.ev} top={p.top} height={p.height} col={p.col} cols={p.cols} />
      ))}
      {isToday && (
        <div class="now-line" style={{ top: `${((now - dayStartMs) / HOUR) * HOUR_H}px` }}>
          <div class="now-dot" />
        </div>
      )}
    </div>
  )
}
