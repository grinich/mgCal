// Google-style dynamic favicon: rounded blue square showing today's day
// number, redrawn when the date changes so the tab icon is always current.
const BLUE = '#426deb'

function draw(day: number): string {
  const S = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  ctx.roundRect(0, 0, S, S, 14)
  ctx.fillStyle = BLUE
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `700 ${day > 9 ? 40 : 46}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(day), S / 2, S / 2 + 3)
  return canvas.toDataURL('image/png')
}

export function initFavicon(): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  let shown = -1
  const update = () => {
    const day = new Date().getDate()
    if (day === shown) return
    shown = day
    link.href = draw(day)
  }
  update()
  setInterval(update, 60_000) // rolls over at midnight; cheap no-op otherwise
}
