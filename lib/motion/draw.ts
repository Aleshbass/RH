import { BONES, LANDMARK, type Frame, type Joint, type Side } from './pose'

const GREEN = '#00cd0f'
const RED = '#f43f5e'
const SOFT = 'rgba(255,255,255,0.55)'

/** Where the video picture sits inside its box with object-fit: contain. */
export function videoRect(video: HTMLVideoElement, width: number, height: number) {
  const vw = video.videoWidth || 1
  const vh = video.videoHeight || 1
  const scale = Math.min(width / vw, height / vh)
  return { x: (width - vw * scale) / 2, y: (height - vh * scale) / 2, w: vw * scale, h: vh * scale }
}

/**
 * Draws the stick figure over the camera picture. The measured side is green, the other side
 * faint, and joints a correction is about are red. Points are in image units (x * width / height).
 */
export function drawSkeleton(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  frame: Frame | null,
  opts: { side: Side; flagged: Joint[]; aspect: number }
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr)
    canvas.height = Math.round(ch * dpr)
  }
  const g = canvas.getContext('2d')
  if (!g) return
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, cw, ch)
  if (!frame) return
  const r = videoRect(video, cw, ch)
  const at = (i: number) => {
    const p = frame.points[i]
    return { x: r.x + (p.x / opts.aspect) * r.w, y: r.y + p.y * r.h, v: p.v }
  }
  const sideSet = new Set<number>(
    (Object.keys(LANDMARK) as (keyof typeof LANDMARK)[])
      .filter((k) => k !== 'nose')
      .map((k) => (LANDMARK[k as Joint] as { L: number; R: number })[opts.side])
  )
  const flagged = new Set<number>(opts.flagged.map((j) => LANDMARK[j][opts.side]))

  g.lineCap = 'round'
  for (const [a, b] of BONES) {
    const pa = at(a)
    const pb = at(b)
    if (pa.v < 0.5 || pb.v < 0.5) continue
    const measured = sideSet.has(a) && sideSet.has(b)
    g.strokeStyle = measured ? (flagged.has(a) || flagged.has(b) ? RED : GREEN) : SOFT
    g.lineWidth = measured ? 5 : 3
    g.beginPath()
    g.moveTo(pa.x, pa.y)
    g.lineTo(pb.x, pb.y)
    g.stroke()
  }
  for (const i of sideSet) {
    const p = at(i)
    if (p.v < 0.5) continue
    g.fillStyle = flagged.has(i) ? RED : '#ffffff'
    g.beginPath()
    g.arc(p.x, p.y, flagged.has(i) ? 8 : 5, 0, Math.PI * 2)
    g.fill()
  }
}

/** Average brightness of the picture (0-255), from a tiny copy of the current frame. */
export function brightness(video: HTMLVideoElement, scratch: HTMLCanvasElement): number | null {
  if (!video.videoWidth) return null
  scratch.width = 24
  scratch.height = 24
  const g = scratch.getContext('2d', { willReadFrequently: true })
  if (!g) return null
  g.drawImage(video, 0, 0, 24, 24)
  const data = g.getImageData(0, 0, 24, 24).data
  let sum = 0
  for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  return sum / (data.length / 4)
}
