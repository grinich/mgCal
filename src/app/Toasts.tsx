import { conflicts, dismissConflict, retryConflict } from './state/conflicts'

export function Toasts() {
  const items = conflicts.value
  if (!items.length) return null
  return (
    <div class="toasts">
      {items.map((c) => (
        <div key={c.id} class="toast">
          <div class="toast-msg">
            <b>Couldn't save “{c.summary}”</b>
            <span>{c.message}</span>
          </div>
          <div class="toast-actions">
            {c.opType !== 'create' && (
              <button class="btn" onClick={() => void retryConflict(c)}>
                {c.opType === 'delete' ? 'Delete anyway' : 'Retry with my version'}
              </button>
            )}
            <button class="btn" onClick={() => void dismissConflict(c.id)}>
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
