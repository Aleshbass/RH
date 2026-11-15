/**
 * Story-size images (1080 × 1920) for WhatsApp Status and Instagram Stories, drawn in the browser
 * (owner 2026-11-15: badge and milestone cards). Nothing leaves the device until the learner shares.
 */

import { badgeSvg } from './badgeSvg'

const W = 1080
const H = 1920
const INK = '#0b1312'
const LIME = '#00cd0f'

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function whiteLogo(): Promise<HTMLImageElement | null> {
  try {
    const r = await fetch('/logos/White%20MainRehabify.svg')
    if (!r.ok) return null
    const svg = (await r.text()).replace('<svg ', '<svg width="1024" height="279" ')
    return await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  } catch {
    return null
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${w}` : w
    if (line && ctx.measureText(test).width > max) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  return lines.slice(0, maxLines)
}

function fonts() {
  const body = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'
  const cal = getComputedStyle(document.body).getPropertyValue('--font-cal').trim() || getComputedStyle(document.documentElement).getPropertyValue('--font-cal').trim()
  return { body, display: cal ? `${cal}, ${body}` : body }
}

export type BadgeStory = { badgeId: string; badgeName: string; firstName: string; how: string; detail?: string | null }

/** The badge story image as a PNG. */
export async function badgeStoryCard(story: BadgeStory): Promise<Blob> {
  const { body, display } = fonts()
  try {
    await Promise.all([document.fonts.load(`600 110px ${display}`), document.fonts.load(`500 44px ${body}`)])
  } catch {
    // system fonts are fine
  }
  const [medal, logo] = await Promise.all([loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg(story.badgeId, 1024))}`), whiteLogo()])
  const site = (process.env.NEXT_PUBLIC_LEARN_URL || window.location.origin).replace(/^https?:\/\//, '').replace(/\/+$/, '')

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)
  // A soft grid, as on the case screens
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'
  ctx.lineWidth = 2
  for (let x = 0; x <= W; x += 60) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = 0; y <= H; y += 60) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }

  if (logo) ctx.drawImage(logo, (W - 300) / 2, 150, 300, 82)
  ctx.textAlign = 'center'
  ctx.font = `700 30px ${body}`
  ctx.fillStyle = LIME
  ctx.fillText('BADGE EARNED', W / 2, 330)

  if (medal) {
    const size = 640
    ctx.drawImage(medal, (W - size) / 2, 400, size, Math.round((size * 118) / 112))
  }

  let y = 1170
  ctx.font = `600 110px ${display}`
  ctx.fillStyle = '#ffffff'
  for (const line of wrap(ctx, story.badgeName, 940, 2)) {
    ctx.fillText(line, W / 2, y)
    y += 120
  }
  ctx.font = `500 46px ${body}`
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillText(`${story.firstName} earned it on Rehabify Learn`, W / 2, y + 10)
  ctx.font = `400 38px ${body}`
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  y += 80
  for (const line of wrap(ctx, story.detail ? `${story.detail}` : `${story.how}.`, 900, 2)) {
    ctx.fillText(line, W / 2, y)
    y += 52
  }

  // The invitation
  ctx.font = `700 42px ${body}`
  const cta = 'Learn with me · join free'
  const cw = ctx.measureText(cta).width + 120
  ctx.fillStyle = LIME
  const top = 1650
  const r = 55
  ctx.beginPath()
  ctx.moveTo((W - cw) / 2 + r, top)
  ctx.arcTo((W + cw) / 2, top, (W + cw) / 2, top + 110, r)
  ctx.arcTo((W + cw) / 2, top + 110, (W - cw) / 2, top + 110, r)
  ctx.arcTo((W - cw) / 2, top + 110, (W - cw) / 2, top, r)
  ctx.arcTo((W - cw) / 2, top, (W + cw) / 2, top, r)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = INK
  ctx.fillText(cta, W / 2, top + 70)
  ctx.font = `600 36px ${body}`
  ctx.fillStyle = LIME
  ctx.fillText(site, W / 2, 1830)

  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t make the image'))), 'image/png'))
}
