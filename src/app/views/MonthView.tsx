import type { EventRow } from '../../data/types'
import { anchor, range, selectedKey, setAnchor, setView, weekStart } from '../state/signals'
import { addDays, DAY, DOW, fmtTimeShort, isSameDay } from '../time'
import { chipTextColor } from '../colors'
import { chipColor, eventKey, isDeclined, toggleSelect } from './EventChip'
import { layoutLanes, splitAllDay } from './layout'

const MAX_ROWS = 4 // lanes + single-day chips per cell before "+N more"
const DATE_H = 26 // px: the date-number row at the top of each cell
const LANE_H = 18 // px per spanning lane

export function MonthView({ events }: { events: EventRow[] }) {
  const r = range.value
  const numDays = Math.round((r.endMs - r.startMs) / DAY)
  const weeks = numDays / 7
  const gridStart = new Date(r.startMs)
  const today = new Date()
  const month = anchor.value.getMonth()
  // Multi-day / all-day events span week rows as single bars (like the
  // week view's all-day lanes); timed single-day events stay in their cell.
  const { allDay: spanning, timed: single } = splitAllDay(events)

  return (
    <div class="month">
      <div class="month-dow-row">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} class="month-dow">
            {DOW[(i + weekStart.value) % 7]}
          </div>
        ))}
      </div>
      <div class="month-grid">
        {Array.from({ length: weeks }, (_, w) => (
          <MonthWeek
            key={addDays(gridStart, w * 7).getTime()}
            weekDays={Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i))}
            spanning={spanning}
            single={single}
            month={month}
            today={today}
          />
        ))}
      </div>
    </div>
  )
}

function openDay(d: Date): void {
  setAnchor(d)
  setView('day')
}

function MonthWeek({
  weekDays,
  spanning,
  single,
  month,
  today,
}: {
  weekDays: Date[]
  spanning: EventRow[]
  single: EventRow[]
  month: number
  today: Date
}) {
  const lanes = layoutLanes(spanning, weekDays)
  const laneCount = lanes.length ? Math.max(...lanes.map((l) => l.lane)) + 1 : 0
  const maxSingles = Math.max(0, MAX_ROWS - laneCount)

  return (
    <div class="month-week">
      {weekDays.map((date) => {
        const dayStartMs = date.getTime()
        const dayEndMs = addDays(date, 1).getTime()
        const dayEvents = single
          .filter((e) => e.startMs < dayEndMs && e.endMs > dayStartMs)
          .sort((a, b) => a.startMs - b.startMs)
        const shown = dayEvents.slice(0, maxSingles)
        const hidden = dayEvents.length - shown.length
        return (
          <div
            key={dayStartMs}
            class={'month-cell' + (date.getMonth() === month ? '' : ' outside')}
            onClick={() => (selectedKey.value = null)}
          >
            <button
              class={'month-dom' + (isSameDay(date, today) ? ' today' : '')}
              onClick={(e) => {
                e.stopPropagation()
                openDay(date)
              }}
            >
              {date.getDate()}
            </button>
            {laneCount > 0 && <div style={{ height: `${laneCount * LANE_H}px`, flex: 'none' }} />}
            {shown.map((ev) => (
              <div
                key={eventKey(ev)}
                class={
                  'month-chip' +
                  (selectedKey.value === eventKey(ev) ? ' selected' : '') +
                  (isDeclined(ev) ? ' declined' : '')
                }
                style={{ '--c': chipColor(ev), '--ct': chipTextColor(chipColor(ev)) }}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleSelect(ev, e.currentTarget as HTMLElement)
                }}
              >
                <span class="month-chip-time">{fmtTimeShort(ev.startMs)}</span>
                {ev.summary || '(no title)'}
              </div>
            ))}
            {hidden > 0 && (
              <button class="month-more" onClick={(e) => { e.stopPropagation(); openDay(date) }}>
                +{hidden} more
              </button>
            )}
          </div>
        )
      })}
      {/* Spanning bars overlay the row; the cells above reserved their space. */}
      <div class="month-lanes">
        {lanes.map((l) => (
          <div
            key={eventKey(l.ev)}
            class={
              'month-chip solid month-span' +
              (selectedKey.value === eventKey(l.ev) ? ' selected' : '') +
              (isDeclined(l.ev) ? ' declined' : '')
            }
            style={{
              top: `${DATE_H + l.lane * LANE_H}px`,
              left: `calc(${(l.startCol / 7) * 100}% + 3px)`,
              width: `calc(${(l.span / 7) * 100}% - 6px)`,
              '--c': chipColor(l.ev),
              '--ct': chipTextColor(chipColor(l.ev)),
            }}
            onClick={(e) => {
              e.stopPropagation()
              toggleSelect(l.ev, e.currentTarget as HTMLElement)
            }}
          >
            {l.clipsLeft ? '… ' : ''}
            {l.ev.summary || '(no title)'}
            {l.clipsRight ? ' …' : ''}
          </div>
        ))}
      </div>
    </div>
  )
}
