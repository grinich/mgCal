import { useEffect, useRef, useState } from 'preact/hooks'
import type { EventRow } from '../../data/types'
import { calendarById, searchOpen, selectedKey, setAnchor } from '../state/signals'
import { fmtTime } from '../time'
import { eventKey } from '../views/EventChip'
import { invalidateSearchIndex, searchEvents } from './searchIndex'

export function SearchOverlay() {
  if (!searchOpen.value) return null
  return <SearchBox />
}

function SearchBox() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EventRow[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    invalidateSearchIndex() // pick up anything synced since last open
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    let stale = false
    void searchEvents(query).then((r) => {
      if (!stale) {
        setResults(r)
        setActive(0)
      }
    })
    return () => {
      stale = true
    }
  }, [query])

  const close = () => (searchOpen.value = false)

  function openResult(ev: EventRow): void {
    setAnchor(new Date(ev.startMs))
    selectedKey.value = eventKey(ev)
    close()
  }

  return (
    <div class="overlay search-overlay" onClick={close}>
      <div class="search-box" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          class="search-input"
          placeholder="Search events…"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              close()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive(Math.min(active + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive(Math.max(active - 1, 0))
            } else if (e.key === 'Enter' && results[active]) {
              openResult(results[active]!)
            }
          }}
        />
        {results.length > 0 && (
          <div class="search-results">
            {results.map((ev, i) => {
              const cal = calendarById.value.get(ev.calendarId)
              const d = new Date(ev.startMs)
              return (
                <div
                  key={eventKey(ev)}
                  class={'search-result' + (i === active ? ' active' : '')}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => openResult(ev)}
                >
                  <span class="search-dot" style={{ '--c': cal?.backgroundColor ?? 'var(--accent)' }} />
                  <span class="search-title">{ev.summary || '(no title)'}</span>
                  <span class="search-when">
                    {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {!ev.allDay && ` · ${fmtTime(ev.startMs)}`}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {query.trim() && !results.length && <div class="search-empty">No matching events</div>}
      </div>
    </div>
  )
}
