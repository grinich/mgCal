import type { EventRow } from '../../data/types'
import { anchor, range, selectedKey, setAnchor, setView, weekStart } from '../state/signals'
import { DAY, DOW, fmtTimeShort, isSameDay } from '../time'
import { chipTextColor } from '../colors'
import { chipColor, eventKey, isDeclined, toggleSelect } from './EventChip'

const MAX_CHIPS = 4

export function MonthView({ events }: { events: EventRow[] }) {
  const r = range.value
  const numDays = Math.round((r.endMs - r.startMs) / DAY)
  const weeks = numDays / 7
  const today = new Date()
  const month = anchor.value.getMonth()

  const days: { date: Date; events: EventRow[] }[] = []
  for (let i = 0; i < numDays; i++) {
    const startMs = r.startMs + i * DAY
    days.push({
      date: new Date(startMs),
      events: events
        .filter((e) => e.startMs < startMs + DAY && e.endMs > startMs)
        .sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || a.startMs - b.startMs),
    })
  }

  const openDay = (d: Date) => {
    setAnchor(d)
    setView('day')
  }

  return (
    <div class="month">
      <div class="month-dow-row">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} class="month-dow">
            {DOW[(i + weekStart.value) % 7]}
          </div>
        ))}
      </div>
      <div class="month-grid" style={{ gridTemplateRows: `repeat(${weeks}, 1fr)` }}>
        {days.map(({ date, events: dayEvents }) => (
          <div
            key={date.getTime()}
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
            {dayEvents.slice(0, MAX_CHIPS).map((ev) => (
              <div
                key={eventKey(ev)}
                class={
                  'month-chip' +
                  (ev.allDay || ev.endMs - ev.startMs >= DAY ? ' solid' : '') +
                  (selectedKey.value === eventKey(ev) ? ' selected' : '') +
                  (isDeclined(ev) ? ' declined' : '')
                }
                style={{ '--c': chipColor(ev), '--ct': chipTextColor(chipColor(ev)) }}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleSelect(ev, e.currentTarget as HTMLElement)
                }}
              >
                {!ev.allDay && ev.endMs - ev.startMs < DAY && (
                  <span class="month-chip-time">{fmtTimeShort(ev.startMs)}</span>
                )}
                {ev.summary || '(no title)'}
              </div>
            ))}
            {dayEvents.length > MAX_CHIPS && (
              <button class="month-more" onClick={(e) => { e.stopPropagation(); openDay(date) }}>
                +{dayEvents.length - MAX_CHIPS} more
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
