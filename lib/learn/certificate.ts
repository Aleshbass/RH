/**
 * The Rehabify Learn certificate, laid out in millimetres on an A4 landscape page (297 × 210).
 *
 * One SVG is the single source for every copy: the on-screen preview, the PNG for sharing and
 * the PDF for printing are all drawn from the same string, so nothing moves between them.
 * Fonts and the logo are embedded as data URIs, which is what lets the browser rasterise it.
 */

export type CertificateData = {
  name: string
  code: string
  programTitle: string
  cohortLabel: string
  dateRange: string
  duration: string
  issuedAt: number
  signatoryName: string | null
  signatoryTitle: string | null
  note: string
  /** Shown without https:// */
  verifyUrl: string
}

export type CertificateAssets = {
  calSans: string // base64 woff2
  matterRegular: string
  matterSemiBold: string
  logo: string // base64 svg, recoloured ink + lime
}

/** Text width in mm for a font and size (mm), measured with the real fonts. */
export type Measure = (text: string, font: 'cal' | 'matter' | 'matterBold', sizeMm: number) => number

const INK = '#0b1312'
const LIME = '#00cd0f'
const PAPER = '#fcfaf3'

// Page grid (mm). Content runs between the two side margins.
export const PAGE = { width: 297, height: 210 }
const LEFT = 24
const RIGHT = 273
const CONTENT = RIGHT - LEFT
const LOGO = { x: LEFT, y: 21, height: 11, ratio: 512.34 / 139.77 }
const NAME = { baseline: 101, maxSize: 16, minSize: 8 }

function esc(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function issuedOn(ms: number) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric' }).format(ms)
}

/** Rough widths for when real measurement isn't available (server, tests). */
const estimate: Measure = (text, font, size) => text.length * size * (font === 'cal' ? 0.5 : font === 'matterBold' ? 0.52 : 0.5)

/** Largest size (up to max) at which `text` fits `width`, never below min. */
function fit(text: string, font: 'cal' | 'matter' | 'matterBold', max: number, min: number, width: number, measure: Measure) {
  const at = measure(text, font, max)
  return at <= width ? max : Math.max(min, Math.floor((max * width) / at * 10) / 10)
}

function label(x: number, y: number, text: string, anchor: 'start' | 'end' = 'start') {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="RHMatter" font-weight="600" font-size="2.3" letter-spacing="0.45" fill="${INK}" fill-opacity="0.5">${esc(text.toUpperCase())}</text>`
}

export function certificateSvg(data: CertificateData, assets: CertificateAssets, measure: Measure = estimate) {
  const nameSize = fit(data.name, 'cal', NAME.maxSize, NAME.minSize, CONTENT, measure)
  const nameWidth = measure(data.name, 'cal', nameSize)
  const squeezeName = nameWidth > CONTENT ? ` textLength="${CONTENT}" lengthAdjust="spacingAndGlyphs"` : ''
  const titleSize = fit(data.programTitle, 'cal', 8.2, 6, CONTENT, measure)
  const details = [data.cohortLabel, data.dateRange, data.duration].filter(Boolean).join('   ·   ')
  const detailsSize = fit(details, 'matter', 3.6, 2.8, CONTENT, measure)
  const verifySize = fit(data.verifyUrl, 'matterBold', 3.2, 2.4, 82, measure)
  const issuer = data.signatoryName || 'Rehabify Learn'
  const issuerTitle = data.signatoryName ? data.signatoryTitle || '' : 'Rehabify Health'
  // The "Issued by" column is 58 mm wide, so a long title never reaches the verify link
  const issuerSize = fit(issuer, 'matterBold', 3.8, 2.8, 58, measure)
  const issuerTitleSize = fit(issuerTitle, 'matter', 3, 2.2, 58, measure)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.width}mm" height="${PAGE.height}mm" viewBox="0 0 ${PAGE.width} ${PAGE.height}">
<defs><style>
@font-face{font-family:RHCal;src:url(data:font/woff2;base64,${assets.calSans}) format('woff2');font-weight:600}
@font-face{font-family:RHMatter;src:url(data:font/woff2;base64,${assets.matterRegular}) format('woff2');font-weight:400}
@font-face{font-family:RHMatter;src:url(data:font/woff2;base64,${assets.matterSemiBold}) format('woff2');font-weight:600}
</style></defs>
<rect width="${PAGE.width}" height="${PAGE.height}" fill="${PAPER}"/>
<rect x="8" y="8" width="281" height="194" rx="3" fill="none" stroke="${INK}" stroke-width="0.35"/>
<rect x="10.5" y="10.5" width="276" height="189" rx="2" fill="none" stroke="${INK}" stroke-opacity="0.12" stroke-width="0.25"/>

<image x="${LOGO.x}" y="${LOGO.y}" height="${LOGO.height}" width="${(LOGO.height * LOGO.ratio).toFixed(2)}" href="data:image/svg+xml;base64,${assets.logo}"/>
${label(RIGHT, 26.5, 'Certificate no.', 'end')}
<text x="${RIGHT}" y="32" text-anchor="end" font-family="RHMatter" font-weight="600" font-size="3.6" letter-spacing="0.15" fill="${INK}">${esc(data.code)}</text>

<text x="${LEFT}" y="59" font-family="RHMatter" font-weight="600" font-size="3.4" letter-spacing="0.7" fill="${INK}" fill-opacity="0.72">CERTIFICATE OF COMPLETION</text>
<rect x="${LEFT}" y="63.2" width="16" height="1.3" rx="0.65" fill="${LIME}"/>

<text x="${LEFT}" y="80" font-family="RHMatter" font-size="4.4" fill="${INK}" fill-opacity="0.62">This is to certify that</text>
<text x="${LEFT}" y="${NAME.baseline}" font-family="RHCal" font-weight="600" font-size="${nameSize}" fill="${INK}"${squeezeName}>${esc(data.name)}</text>
<rect x="${LEFT}" y="${NAME.baseline + 6}" width="${CONTENT}" height="0.25" fill="${INK}" fill-opacity="0.14"/>
<text x="${LEFT}" y="120" font-family="RHMatter" font-size="4.4" fill="${INK}" fill-opacity="0.62">has successfully completed the</text>
<text x="${LEFT}" y="134" font-family="RHCal" font-weight="600" font-size="${titleSize}" fill="${INK}">${esc(data.programTitle)}</text>
<text x="${LEFT}" y="144" font-family="RHMatter" font-size="${detailsSize}" fill="${INK}" fill-opacity="0.6">${esc(details)}</text>

${label(LEFT, 172, 'Date issued')}
<text x="${LEFT}" y="178.5" font-family="RHMatter" font-weight="600" font-size="3.8" fill="${INK}">${esc(issuedOn(data.issuedAt))}</text>

${label(84, 172, 'Issued by')}
<text x="84" y="178.5" font-family="RHMatter" font-weight="600" font-size="${issuerSize}" fill="${INK}">${esc(issuer)}</text>
${issuerTitle ? `<text x="84" y="183.5" font-family="RHMatter" font-size="${issuerTitleSize}" fill="${INK}" fill-opacity="0.6">${esc(issuerTitle)}</text>` : ''}

${label(150, 172, 'Verify this certificate')}
<text x="150" y="178.5" font-family="RHMatter" font-weight="600" font-size="${verifySize}" fill="${INK}">${esc(data.verifyUrl)}</text>

<!-- Brand pairing mark: ink square with a lime square on its corner, flush with the right margin -->
<rect x="243" y="152" width="25" height="25" rx="6" fill="${INK}"/>
<rect x="261" y="170" width="12" height="12" rx="3.2" fill="${LIME}"/>
<path d="M249.4 164.2 l3.6 3.6 l7.2 -7.2" fill="none" stroke="${LIME}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

<text x="${LEFT}" y="194.5" font-family="RHMatter" font-size="2.2" fill="${INK}" fill-opacity="0.45">${esc(data.note)}</text>
</svg>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser helpers: load the assets, measure with the real fonts, export PNG and PDF
// ─────────────────────────────────────────────────────────────────────────────

const FONT_FILES = {
  calSans: '/fonts/CalSans-SemiBold.woff2',
  matterRegular: '/fonts/Matter-Regular.woff2',
  matterSemiBold: '/fonts/Matter-SemiBold.woff2',
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

let assetsPromise: Promise<{ assets: CertificateAssets; measure: Measure }> | null = null

/** Fonts and logo as data, plus a measurer using those exact fonts. Loaded once per page. */
export function loadCertificateAssets() {
  assetsPromise ??= (async () => {
    const [cal, regular, semi, logoText] = await Promise.all([
      fetch(FONT_FILES.calSans).then((r) => r.arrayBuffer()),
      fetch(FONT_FILES.matterRegular).then((r) => r.arrayBuffer()),
      fetch(FONT_FILES.matterSemiBold).then((r) => r.arrayBuffer()),
      fetch('/logos/MainRehabify.svg').then((r) => r.text()),
    ])
    const faces = [
      new FontFace('RHCertCal', cal.slice(0), { weight: '600' }),
      new FontFace('RHCertMatter', regular.slice(0), { weight: '400' }),
      new FontFace('RHCertMatter', semi.slice(0), { weight: '600' }),
    ]
    await Promise.all(faces.map((f) => f.load()))
    faces.forEach((f) => document.fonts.add(f))

    const ctx = document.createElement('canvas').getContext('2d')!
    const family = { cal: '600 100px RHCertCal', matter: '400 100px RHCertMatter', matterBold: '600 100px RHCertMatter' }
    const measure: Measure = (text, font, size) => {
      ctx.font = family[font]
      return (ctx.measureText(text).width / 100) * size
    }
    // Learn is ink and lime: the logo's teal becomes ink
    const logo = toBase64(new TextEncoder().encode(logoText.replace(/#005b57/gi, INK)).buffer as ArrayBuffer)
    return {
      assets: { calSans: toBase64(cal), matterRegular: toBase64(regular), matterSemiBold: toBase64(semi), logo },
      measure,
    }
  })()
  assetsPromise.catch(() => {
    assetsPromise = null
  })
  return assetsPromise
}

/** The certificate as an <img>-ready URL (revoke it when done). */
export function svgUrl(svg: string) {
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
}

/** Rasterise at print quality: 300 dpi is 3508 × 2480 px for A4. */
async function canvasFor(svg: string, dpi = 300) {
  const url = svgUrl(svg)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round((PAGE.width / 25.4) * dpi)
    canvas.height = Math.round((PAGE.height / 25.4) * dpi)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function downloadCertificatePng(svg: string, code: string) {
  const canvas = await canvasFor(svg, 200)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('png')
  save(blob, `Rehabify-certificate-${code}.png`)
}

export async function downloadCertificatePdf(svg: string, code: string) {
  const [{ jsPDF }, canvas] = await Promise.all([import('jspdf'), canvasFor(svg, 300)])
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  pdf.setProperties({ title: `Rehabify Learn certificate ${code}`, author: 'Rehabify Learn' })
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, PAGE.width, PAGE.height, undefined, 'FAST')
  save(pdf.output('blob'), `Rehabify-certificate-${code}.pdf`)
}
