import { useEffect, useRef, useState } from 'preact/hooks'
import { importIcsFiles } from './ics'

/** Full-bleed splash while dragging files over the window; drops import .ics. */
export function DropZone() {
  const [active, setActive] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const depth = useRef(0)
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>()

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
      void importIcsFiles(files).then(({ added, skipped }) => {
        setNotice(
          added
            ? `Added ${added} event${added > 1 ? 's' : ''} to your calendar`
            : skipped
              ? 'No events found — drop an .ics file'
              : null,
        )
        clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => setNotice(null), 3000)
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
      {notice && <div class="drop-notice">{notice}</div>}
    </>
  )
}
