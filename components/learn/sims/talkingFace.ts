/**
 * The patient's mouth, drawn in the browser (free, no AI service): the talking close-up plays as a
 * video, and each frame is copied to a canvas where the lower lip and chin slide down in thin
 * strips and a mouth opening (dark inside, a hint of teeth and tongue) fills the gap. How open, how
 * wide and how round comes from the voice line's mouth shapes (lips.json, scripts/sims/lips.mjs),
 * read at the voice's current time, so the lips follow the words.
 *
 * Geometry per video frame comes from Blender (the mouth corners, lip line and chin projected
 * through the camera): `<talk>.json` next to the close-up video.
 */

/** [x, y] in video pixels. Per frame: corner (her left), corner (her right), lip centre, lower lip, chin, nose. */
export type Point = [number, number]
export type MouthGeometry = { w: number; h: number; fps: number; frames: [Point, Point, Point, Point, Point, Point][] }
/** Mouth shapes per 1/25 s for each voice line, keyed by audio id. */
export type LipTimings = { fps: number; lines: Record<string, string> }

type ShapeParams = { open: number; width: number; round: number; teeth: number; tongue: number }

/** rest · nearly closed · wide (ee) · open (ah) · round (oh) */
const SHAPES: Record<string, ShapeParams> = {
  x: { open: 0, width: 1, round: 0.8, teeth: 0, tongue: 0 },
  m: { open: 0, width: 1, round: 0.8, teeth: 0, tongue: 0 },
  e: { open: 0.4, width: 1, round: 0.45, teeth: 0.6, tongue: 0 },
  a: { open: 1, width: 0.92, round: 0.7, teeth: 0.32, tongue: 0.4 },
  o: { open: 0.78, width: 0.62, round: 0.55, teeth: 0.15, tongue: 0.25 },
}

/** The mouth's current state; eased towards each new shape so it never snaps. */
export type MouthState = ShapeParams

export const restMouth = (): MouthState => ({ ...SHAPES.x })

/** Move `state` towards `shape` (frame-rate independent: `dt` in seconds). */
export function easeMouth(state: MouthState, shape: string, dt: number): MouthState {
  const target = SHAPES[shape] ?? SHAPES.x
  // Opening quickly and closing a touch slower reads as speech
  const k = (rate: number) => 1 - Math.exp(-rate * dt)
  const openRate = target.open > state.open ? 38 : 26
  return {
    open: state.open + (target.open - state.open) * k(openRate),
    width: state.width + (target.width - state.width) * k(30),
    round: state.round + (target.round - state.round) * k(30),
    teeth: state.teeth + (target.teeth - state.teeth) * k(30),
    tongue: state.tongue + (target.tongue - state.tongue) * k(30),
  }
}

/** The shape for a voice line at `t` seconds (rest outside the line). */
export function shapeAt(lips: LipTimings | null, audioId: string | null, t: number): string {
  if (!lips || !audioId) return 'x'
  const line = lips.lines[audioId]
  if (!line) return 'x'
  return line[Math.floor(t * (lips.fps || 25))] ?? 'x'
}

/** The audio id of a voice URL: ".../v1/q-pain.mp3" -> "q-pain". */
export function audioIdOf(url: string): string {
  const file = url.split('?')[0].split('/').pop() ?? ''
  return decodeURIComponent(file.replace(/\.mp3$/i, ''))
}

const STRIP = 2

/**
 * Draw one frame: the video as it is, then (if the mouth is open) the moved lower face and the
 * mouth opening. `canvas` must be the video's size (geometry w × h).
 */
export function drawTalkingFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, geo: MouthGeometry, mouth: MouthState) {
  const { w, h } = geo
  ctx.drawImage(video, 0, 0, w, h)
  if (mouth.open < 0.02 || !geo.frames.length) return
  const index = Math.floor((video.currentTime || 0) * geo.fps) % geo.frames.length
  const [cl, cr, c, , chin] = geo.frames[index]

  // The lip line: a curve through both corners and the centre
  const x0 = cr[0]
  const x1 = cl[0]
  const xm = c[0]
  const lipY = (x: number) => {
    // Lagrange through (x0, cr.y), (xm, c.y), (x1, cl.y)
    const a = ((x - xm) * (x - x1)) / ((x0 - xm) * (x0 - x1))
    const b = ((x - x0) * (x - x1)) / ((xm - x0) * (xm - x1))
    const d = ((x - x0) * (x - xm)) / ((x1 - x0) * (x1 - xm))
    return cr[1] * a + c[1] * b + cl[1] * d
  }
  const mouthWidth = x1 - x0
  const openPx = mouth.open * 0.16 * mouthWidth
  const mid = (x0 + x1) / 2
  const half = (mouthWidth / 2) * mouth.width
  const left = mid - half
  const chinY = chin[1] + 4
  const bottom = chinY + 26
  const gapAt = (x: number) => {
    const u = (x - left) / (2 * half)
    return u <= 0 || u >= 1 ? 0 : openPx * Math.pow(Math.sin(Math.PI * u), mouth.round)
  }

  // The jaw: the whole chin drops (a soft bell wider than the mouth), the lower lip with the opening
  const jawHalf = (mouthWidth / 2) * 1.45
  const jawAt = (x: number) => {
    const v = (x - mid) / jawHalf
    return Math.abs(v) >= 1 ? 0 : openPx * 0.8 * (0.5 + 0.5 * Math.cos(Math.PI * v))
  }

  // 1) The lower lip and chin slide down in thin strips (overlapping a pixel so no seams show):
  //    lip line .. chin is moved and stretched, chin .. below it squeezed back to where it was
  for (let x = Math.floor(mid - jawHalf); x < mid + jawHalf; x += STRIP) {
    const cx = x + STRIP / 2
    const D = gapAt(cx)
    const J = jawAt(cx)
    if (D < 0.15 && J < 0.15) continue
    const yl = lipY(cx)
    ctx.drawImage(video, x, yl, STRIP + 1, chinY - yl, x, yl + D, STRIP + 1, chinY + J - (yl + D))
    ctx.drawImage(video, x, chinY, STRIP + 1, bottom - chinY, x, chinY + J, STRIP + 1, bottom - chinY - J)
  }

  // 2) The mouth opening between the lip line and the moved lower lip
  const path = new Path2D()
  const steps = 24
  for (let i = 0; i <= steps; i++) {
    const x = left + (2 * half * i) / steps
    if (i === 0) path.moveTo(x, lipY(x))
    else path.lineTo(x, lipY(x))
  }
  for (let i = steps; i >= 0; i--) {
    const x = left + (2 * half * i) / steps
    path.lineTo(x, lipY(x) + gapAt(x))
  }
  path.closePath()
  const top = lipY(mid)
  ctx.save()
  ctx.clip(path)
  const inside = ctx.createLinearGradient(0, top, 0, top + openPx + 1)
  inside.addColorStop(0, '#3d1515')
  inside.addColorStop(0.5, '#240a0b')
  inside.addColorStop(1, '#4a1b1a')
  ctx.fillStyle = inside
  ctx.fillRect(left - 1, top - 6, 2 * half + 2, openPx + 12)
  // A hint of the upper teeth under the top lip
  if (mouth.teeth > 0.02) {
    ctx.globalAlpha = Math.min(1, mouth.teeth * 1.4) * 0.85
    ctx.fillStyle = '#e4dccf'
    const tw = half * 1.25
    ctx.beginPath()
    ctx.ellipse(mid, top - 1, tw, Math.max(1.2, openPx * 0.3 * mouth.teeth + 1), 0, 0, Math.PI)
    ctx.fill()
  }
  // And of the tongue low in the mouth on open vowels
  if (mouth.tongue > 0.02) {
    ctx.globalAlpha = mouth.tongue * 0.75
    ctx.fillStyle = '#7d3135'
    ctx.beginPath()
    ctx.ellipse(mid, top + openPx * 0.95, half * 0.55, openPx * 0.38, 0, Math.PI, 2 * Math.PI)
    ctx.fill()
  }
  ctx.restore()
  // Soft inner edge of the lips
  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.strokeStyle = '#4a1b1b'
  ctx.lineWidth = 1
  ctx.stroke(path)
  ctx.restore()
}
