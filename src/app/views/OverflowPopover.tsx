import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { overflowList } from '../state/signals'
import { fmtTime } from '../time'
import { chipColor, eventKey, isDeclined, toggleSelect } from './EventChip'

const W = 280

/** List of events collapsed behind a "+N" pill in a dense cluster. */
export function OverflowPopover() {
  const st = overflowList.value
  if (!st) return null
  return <Pop key={st.anchor.x + '|' + st.anchor.y} />
}

function Pop() {
  const st = overflowList.value!
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: 0 })

  useLayoutEffect(() => {
    const a = st.anchor
    const h = ref.current?.offsetHeight ?? 200
    let left = a.x + a.w + 8
    if (left + W > window.innerWidth - 8) left = a.x - W - 8
    if (left < 8) left = 8
    const top = Math.min(Math.max(8, a.y), Math.max(8, window.innerHeight - h - 12))
    setPos({ left, top })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.more-pop, .chip-more')) return
      overflowList.value = null
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  return (
    <div class="more-pop" ref={ref} style={{ width: `${W}px`, ...pos }}>
      {st.events.map((ev) => (
        <button
          key={eventKey(ev)}
          class="more-row"
          onClick={(e) => {
            overflowList.value = null
            toggleSelect(ev, e.currentTarget as HTMLElement)
          }}
        >
          <span class="search-dot" style={{ '--c': chipColor(ev) }} />
          <span class={'more-title' + (isDeclined(ev) ? ' declined-text' : '')}>
            {ev.summary || '(no title)'}
          </span>
          <span class="more-time">{ev.allDay ? 'all-day' : fmtTime(ev.startMs)}</span>
        </button>
      ))}
    </div>
  )
}
