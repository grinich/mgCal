import { useEffect, useRef, useState } from 'preact/hooks'
import { parseGTime } from '../data/db'
import { commitIcsImport, planIcsImport, type IcsImportPlan } from './ics'

const PREVIEW_LIMIT = 6

function whenLabel(start: { date?: string; dateTime?: string } | undefined): string {
  const ms = parseGTime(start)
  if (ms == null) return ''
  const d = new Date(ms)
  const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (start?.date) return day
  return `${day}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

/** Full-bleed splash while dragging files over the window; drops import .ics. */
export function DropZone() {
  const [active, setActive] = useState(false)
  const [plan, setPlan] = useState<IcsImportPlan | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const depth = useRef(0)
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>()

  const flash = (msg: string) => {
    setNotice(msg)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 3000)
  }

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current++
      setActive(true)
    }
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setActive(false)
      const files = [...(e.dataTransfer?.files ?? [])]
      // Parse only. Importing creates real events on a real calendar with no
      // undo, so nothing is written until the user confirms.
      void planIcsImport(files).then((p) => {
        if (!p) flash('No writable calendar to import into')
        else if (!p.events.length) flash('No events found — drop an .ics file')
        else setPlan(p)
      })
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  const confirm = () => {
    if (!plan) return
    const p = plan
    setPlan(null)
    void commitIcsImport(p).then(({ added }) =>
      flash(`Added ${added} event${added > 1 ? 's' : ''} to ${p.target.summary}`),
    )
  }

  const count = plan?.events.length ?? 0

  return (
    <>
      {active && (
        <div class="drop-splash">
          <div class="drop-box">
            <div class="drop-emoji">📅</div>
            <div class="drop-title">Drop to add to your calendar</div>
            <div class="drop-sub">.ics events will be imported and synced to Google Calendar</div>
          </div>
        </div>
      )}

      {plan && (
        <div class="overlay" onClick={() => setPlan(null)}>
          <div class="panel" onClick={(e) => e.stopPropagation()}>
            <div class="panel-title">
              Import {count} event{count > 1 ? 's' : ''}?
            </div>
            <div class="import-list">
              {plan.events.slice(0, PREVIEW_LIMIT).map((ev, i) => (
                <div key={i} class="import-row">
                  <span class="import-summary">{ev.summary || '(no title)'}</span>
                  <span class="muted">{whenLabel(ev.start)}</span>
                </div>
              ))}
              {count > PREVIEW_LIMIT && <div class="muted">and {count - PREVIEW_LIMIT} more…</div>}
            </div>
            <div class="panel-hint">
              These will be created on <b>{plan.target.summary}</b> and synced to Google Calendar. Recurring
              invites add every occurrence, and there's no undo.
              {plan.skipped > 0 && ` ${plan.skipped} dropped file${plan.skipped > 1 ? 's were' : ' was'} skipped.`}
            </div>
            <div class="panel-actions">
              <button class="btn" onClick={() => setPlan(null)}>
                Cancel
              </button>
              <button class="btn accent" onClick={confirm}>
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && <div class="drop-notice">{notice}</div>}
    </>
  )
}
