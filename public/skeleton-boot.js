// Paints the current week's skeleton synchronously (real dates, hour labels,
// scrolled like the live grid) so the first frame is already "the calendar".
// External file (not inline) because the extension CSP is script-src 'self'.
;(function () {
  var now = new Date()
  var view = localStorage.getItem('view') || 'week'
  var anchor = now // new tabs always open on today, matching the live app
  if (view === 'month') {
    // Month view has a different shape; keep just the header, no week skeleton.
    document.getElementById('sk-days').style.display = 'none'
    document.getElementById('sk-grid').style.display = 'none'
  }
  var ws = localStorage.getItem('weekStart') === '1' ? 1 : 0
  var start = new Date(anchor)
  start.setHours(0, 0, 0, 0)
  if (view !== 'day') start.setDate(start.getDate() - ((start.getDay() - ws + 7) % 7))
  var numDays = view === 'day' ? 1 : 7
  var days = document.getElementById('sk-days')
  var todayVisible = false
  var names = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  days.style.gridTemplateColumns = 'var(--gutter) repeat(' + numDays + ', 1fr)'
  var inner = document.querySelector('.sk-grid-inner')
  inner.style.gridTemplateColumns = 'var(--gutter) repeat(' + numDays + ', 1fr)'
  var cols = inner.querySelectorAll('.sk-col')
  for (var c = numDays; c < cols.length; c++) cols[c].remove()
  for (var i = 0; i < numDays; i++) {
    var d = new Date(start)
    d.setDate(start.getDate() + i)
    var isToday = d.toDateString() === now.toDateString()
    todayVisible = todayVisible || isToday
    var el = document.createElement('div')
    el.className = 'sk-day' + (isToday ? ' today' : '')
    var dow = document.createElement('div')
    dow.className = 'dow'
    dow.textContent = names[d.getDay()]
    var dom = document.createElement('div')
    dom.className = 'dom'
    dom.textContent = String(d.getDate())
    el.appendChild(dow)
    el.appendChild(dom)
    days.appendChild(el)
  }
  document.getElementById('sk-title').textContent = anchor.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
  var gutter = document.getElementById('sk-gutter')
  for (var h = 1; h < 24; h++) {
    var lab = document.createElement('div')
    lab.className = 'sk-hour'
    lab.style.top = 'calc(var(--hour-h) * ' + h + ')'
    lab.textContent = (h % 12 || 12) + ' ' + (h < 12 ? 'AM' : 'PM')
    gutter.appendChild(lab)
  }
  // Must mirror defaultScrollTop() in src/app/time.ts so hydration doesn't jump.
  var grid = document.getElementById('sk-grid')
  grid.scrollTop = todayVisible
    ? Math.max(0, (now.getHours() + now.getMinutes() / 60) * 56 - 180)
    : 8 * 56 - 8
})()
