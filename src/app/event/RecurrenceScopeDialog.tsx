import { scopeDialog } from '../state/signals'

export function RecurrenceScopeDialog() {
  const st = scopeDialog.value
  if (!st) return null
  const verb = st.action === 'delete' ? 'Delete' : 'Edit'
  return (
    <div class="overlay" onClick={() => st.resolve(null)}>
      <div class="panel scope-panel" onClick={(e) => e.stopPropagation()}>
        <div class="panel-title">
          {verb} recurring event “{st.summary}”
        </div>
        <div class="scope-btns">
          <button class="btn" autofocus onClick={() => st.resolve('this')}>
            This event
          </button>
          <button class="btn" onClick={() => st.resolve('following')}>
            This and following events
          </button>
          <button class="btn" onClick={() => st.resolve('all')}>
            All events
          </button>
        </div>
        <div class="editor-actions">
          <div class="spacer" />
          <button class="btn" onClick={() => st.resolve(null)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
