import { loadCertificateAssets, type Measure } from '@/lib/learn/certificate'

/**
 * A patient feedback card as an image the physio can post: the patient's own words, first name
 * and area, optional pain change and sessions, and the physio's name and booking link. Ink and
 * Rehabify green on brand fonts, drawn as one SVG (fonts embedded) and turned into a PNG in the
 * browser, like the Learn certificate.
 */

export type CardFormat = 'square' | 'story' | 'landscape'

export const CARD_FORMATS: Record<CardFormat, { label: string; hint: string; width: number; height: number }> = {
  square: { label: 'Square', hint: 'WhatsApp, Instagram post', width: 1080, height: 1080 },
  story: { label: 'Story', hint: 'Status, Instagram story', width: 1080, height: 1920 },
  landscape: { label: 'LinkedIn', hint: 'LinkedIn, X, Facebook', width: 1200, height: 627 },
}

export type CardData = {
  quote: string
  firstName: string
  area: string | null
  pain: { from: number; to: number } | null
  sessions: number | null
  physioName: string
  physioTitle: string
  /** Shown without https:// */
  link: string
}

const INK = '#16181c'
const LIME = '#00cd0f'
const WHITE = '#ffffff'

function esc(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Greedy word wrap with the real font. */
function wrap(text: string, width: number, size: number, measure: Measure) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (measure(next, 'cal', size) <= width || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

let whiteLogo: Promise<string> | null = null
function loadWhiteLogo() {
  whiteLogo ??= fetch('/logos/White MainRehabify.svg')
    .then((r) => r.text())
    .then((svg) => {
      let binary = ''
      for (const byte of new TextEncoder().encode(svg)) binary += String.fromCharCode(byte)
      return btoa(binary)
    })
  whiteLogo.catch(() => {
    whiteLogo = null
  })
  return whiteLogo
}

export async function feedbackCardSvg(data: CardData, format: CardFormat) {
  const [{ assets, measure }, logo] = await Promise.all([loadCertificateAssets(), loadWhiteLogo()])
  const { width: W, height: H } = CARD_FORMATS[format]
  const landscape = format === 'landscape'
  const pad = landscape ? 64 : 88
  const inner = W - pad * 2
  const scale = landscape ? 0.82 : 1

  // Header
  const logoH = 44 * scale
  const logoW = logoH * (512.34 / 139.77)
  const badgeText = 'Verified patient feedback'
  const badgeSize = 26 * scale
  const badgeW = measure(badgeText, 'matterBold', badgeSize) + 76 * scale
  const badgeH = 56 * scale
  const top = pad

  // Stats and footer heights, from the bottom up
  const stats = [
    data.pain ? { label: 'PAIN', value: `${data.pain.from} → ${data.pain.to}` } : null,
    data.sessions ? { label: 'SESSIONS', value: String(data.sessions) } : null,
  ].filter((s): s is { label: string; value: string } => Boolean(s))
  const footerH = 104 * scale
  const statsH = stats.length ? 150 * scale : 0
  const gap = 44 * scale
  const bottomBlock = footerH + (stats.length ? statsH + gap : 0) + gap

  // The quote fills what's left, as large as fits
  const quoteTop = top + badgeH + (format === 'story' ? 220 : 76 * scale)
  const quoteMarkH = 92 * scale
  const nameH = 64 * scale
  const room = H - pad - bottomBlock - quoteTop - quoteMarkH - nameH
  const quoteWidth = landscape ? inner : inner
  let size = (landscape ? 54 : format === 'story' ? 84 : 72) * 1
  let lines = wrap(`${data.quote}`, quoteWidth, size, measure)
  while (size > 30 && lines.length * size * 1.16 > room) {
    size -= 2
    lines = wrap(data.quote, quoteWidth, size, measure)
  }
  const lineH = size * 1.16
  const quoteBaseline = quoteTop + quoteMarkH + size
  const nameY = quoteTop + quoteMarkH + lines.length * lineH + 40 * scale

  // Stats boxes
  const statsTop = H - pad - footerH - gap - statsH
  const boxGap = 24 * scale
  const boxW = stats.length ? (inner - boxGap * (stats.length - 1)) / Math.max(stats.length, 2) : 0
  const statsSvg = stats
    .map((s, i) => {
      const x = pad + i * (boxW + boxGap)
      return `<rect x="${x}" y="${statsTop}" width="${boxW}" height="${statsH}" rx="${28 * scale}" fill="${WHITE}" fill-opacity="0.07"/>
<text x="${x + 32 * scale}" y="${statsTop + 50 * scale}" font-family="RHMatter" font-weight="600" font-size="${22 * scale}" letter-spacing="${2 * scale}" fill="${WHITE}" fill-opacity="0.6">${s.label}</text>
<text x="${x + 32 * scale}" y="${statsTop + 116 * scale}" font-family="RHCal" font-weight="600" font-size="${54 * scale}" fill="${WHITE}">${esc(s.value)}</text>`
    })
    .join('\n')

  const footerTop = H - pad - footerH
  const linkSize = 26 * scale
  const linkW = measure(data.link, 'matterBold', linkSize)
  const nameSize = 34 * scale
  const physio = `${data.physioName}, ${data.physioTitle}`
  // The link sits on the right when it fits beside the name, else under it
  const linkBeside = measure(physio, 'matterBold', nameSize) + linkW + 48 < inner

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
@font-face{font-family:RHCal;src:url(data:font/woff2;base64,${assets.calSans}) format('woff2');font-weight:600}
@font-face{font-family:RHMatter;src:url(data:font/woff2;base64,${assets.matterRegular}) format('woff2');font-weight:400}
@font-face{font-family:RHMatter;src:url(data:font/woff2;base64,${assets.matterSemiBold}) format('woff2');font-weight:600}
</style>
<rect width="${W}" height="${H}" fill="${INK}"/>
<image href="data:image/svg+xml;base64,${logo}" x="${pad}" y="${top + (badgeH - logoH) / 2}" width="${logoW}" height="${logoH}"/>
<rect x="${W - pad - badgeW}" y="${top}" width="${badgeW}" height="${badgeH}" rx="${badgeH / 2}" fill="${LIME}"/>
<path d="M${W - pad - badgeW + 26 * scale} ${top + badgeH / 2} l${8 * scale} ${8 * scale} l${16 * scale} -${16 * scale}" stroke="${INK}" stroke-width="${4 * scale}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="${W - pad - badgeW + 58 * scale}" y="${top + badgeH / 2 + badgeSize * 0.36}" font-family="RHMatter" font-weight="600" font-size="${badgeSize}" fill="${INK}">${badgeText}</text>
<text x="${pad - 4}" y="${quoteTop + quoteMarkH}" font-family="RHCal" font-weight="600" font-size="${150 * scale}" fill="${LIME}">“</text>
${lines
  .map((l, i) => `<text x="${pad}" y="${quoteBaseline + i * lineH}" font-family="RHCal" font-weight="600" font-size="${size}" fill="${WHITE}">${esc(l)}</text>`)
  .join('\n')}
<text x="${pad}" y="${nameY}" font-family="RHMatter" font-size="${30 * scale}" fill="${WHITE}" fill-opacity="0.72">${esc([data.firstName, data.area].filter(Boolean).join(', '))}</text>
${statsSvg}
<line x1="${pad}" x2="${W - pad}" y1="${footerTop}" y2="${footerTop}" stroke="${WHITE}" stroke-opacity="0.14" stroke-width="2"/>
<text x="${pad}" y="${footerTop + 40 * scale}" font-family="RHMatter" font-size="${22 * scale}" fill="${WHITE}" fill-opacity="0.6">Treated by</text>
<text x="${pad}" y="${footerTop + 82 * scale}" font-family="RHMatter" font-weight="600" font-size="${nameSize}" fill="${WHITE}">${esc(physio)}</text>
<text x="${linkBeside ? W - pad : pad}" y="${linkBeside ? footerTop + 82 * scale : footerTop + 82 * scale + 40 * scale}" text-anchor="${linkBeside ? 'end' : 'start'}" font-family="RHMatter" font-weight="600" font-size="${linkSize}" fill="${LIME}">${esc(data.link)}</text>
</svg>`
}

export async function feedbackCardPng(data: CardData, format: CardFormat) {
  const svg = await feedbackCardSvg(data, format)
  const { width, height } = CARD_FORMATS[format]
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('png')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Opens the phone's share sheet with the image (WhatsApp, Instagram, LinkedIn...). Where files
 * can't be shared (most computers) the image downloads instead. Returns what happened.
 */
export async function shareCardImage(blob: Blob, filename: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' })
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return 'cancelled'
    }
  }
  downloadBlob(blob, filename)
  return 'downloaded'
}
