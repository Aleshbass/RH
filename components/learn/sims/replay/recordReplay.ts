'use client'

/**
 * Turns a shared run into a vertical video (1080 × 1920) in the browser, for TikTok, Instagram and
 * WhatsApp Status (owner 2026-11-14): the patient scene with their lips moving on their own lines,
 * the conversation as big captions, the voices, then the score and an invitation to try the case.
 * Canvas + Web Audio + MediaRecorder: free, and nothing leaves the device until the learner shares
 * the file. MP4 where the browser records it (Chrome/Edge 126+, Safari), otherwise WebM.
 *
 * Recording runs in real time (the voices set the pace), so the tab has to stay open.
 */

import type { SimScene } from '@/lib/learn/simulation/engine'
import { voiceUrl, type SimShare, type SimShareBeat } from '../simApi'
import { drawTalkingFrame, easeMouth, restMouth, shapeAt, type LipTimings, type MouthGeometry, type MouthState } from '../talkingFace'
import { sceneSvg } from '../art2d/clinicScene'

const W = 1080
const H = 1920
const FPS = 30
const INK = '#0b1312'
const LIME = '#00cd0f'
// The scene fills the frame edge to edge as a tall shot (owner 2026-11-17: the wide picture was
// small on phones); the conversation sits over its lower part, where the floor is
const STAGE = { x: 0, y: 160, w: 1080, h: 1240 }
const ZONE = { top: 1060, bottom: 1690 }
/** The 2D drawings are 1440 × 960 with the patient near x 770: the tall crop of that, in drawing units. */
const CROP_H = 940
const CROP_W = Math.round((CROP_H * STAGE.w) / STAGE.h)
const FOCUS_X: Record<string, number> = { tunde: 810 }
function portraitArt(svg: string, character: string | undefined): string {
  const cx = FOCUS_X[character ?? ''] ?? 770
  const x = Math.round(Math.min(1440 - CROP_W, Math.max(0, cx - CROP_W / 2)))
  return svg.replace('viewBox="0 0 1440 960" width="1440" height="960"', `viewBox="${x} ${960 - CROP_H} ${CROP_W} ${CROP_H}" width="${STAGE.w}" height="${STAGE.h}"`)
}
const INTRO = 2.6
const OUTRO = 4.8

const CATEGORY_DOT: Record<string, string> = { ask: '#38bdf8', examine: '#a78bfa', do: '#22c55e', help: '#f59e0b' }
const OUTCOME_COLOUR: Record<string, { bg: string; fg: string }> = {
  good: { bg: LIME, fg: INK },
  fair: { bg: '#fcd34d', fg: '#2b1d00' },
  poor: { bg: '#fb923c', fg: '#2b1200' },
  harm: { bg: '#f43f5e', fg: '#ffffff' },
}

type Shot = { kind: 'intro' | 'beat' | 'outro'; index: number; start: number; dur: number; audio: AudioBuffer | null; scene: string | null }
type Card = { h: number; draw: (ctx: CanvasRenderingContext2D, top: number) => void }
type SceneMedia = {
  scene: SimScene
  still: HTMLImageElement | null
  video: HTMLVideoElement | null
  geo: MouthGeometry | null
  /** 2D scenes: the drawing per lip shape (x, e, a, o). */
  art: Record<string, HTMLImageElement> | null
}

export type RecordResult = { blob: Blob; ext: 'mp4' | 'webm'; mime: string; seconds: number }

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const ease = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3)
const clock = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.round(Math.max(0, sec)) % 60).padStart(2, '0')}`

/** The best format this browser can record (MP4 first: WhatsApp and Instagram want it). */
export function pickVideoMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const options = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return options.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m)
    } catch {
      return false
    }
  }) ?? null
}

export function canRecordVideo() {
  if (typeof window === 'undefined') return false
  const canvas = document.createElement('canvas') as HTMLCanvasElement & { captureStream?: unknown }
  return typeof canvas.captureStream === 'function' && Boolean(pickVideoMime()) && Boolean(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext)
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function loadJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url)
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

function loadVideo(src: string, host: HTMLElement): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.muted = true
    v.loop = true
    v.playsInline = true
    v.preload = 'auto'
    v.crossOrigin = 'anonymous'
    v.setAttribute('playsinline', '')
    // In the page (but invisible): some phones won't decode a video that isn't
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
    host.appendChild(v)
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      resolve(ok ? v : null)
    }
    v.oncanplay = () => finish(true)
    v.onerror = () => finish(false)
    window.setTimeout(() => finish(v.readyState >= 2), 8000)
    v.src = src
    v.load()
  })
}

async function loadVoice(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const data = await r.arrayBuffer()
    return await new Promise<AudioBuffer | null>((resolve) => {
      ctx.decodeAudioData(data, (b) => resolve(b), () => resolve(null))
    })
  } catch {
    return null
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines = 9): string[] {
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
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, '')}…`
    return kept
  }
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** The logo as an image (white, for the dark video). */
async function loadLogo(): Promise<HTMLImageElement | null> {
  try {
    const r = await fetch('/logos/White%20MainRehabify.svg')
    if (!r.ok) return null
    let svg = await r.text()
    // Give it a size so every browser rasterises it crisply
    svg = svg.replace('<svg ', '<svg width="1024" height="279" ')
    return await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  } catch {
    return null
  }
}

type RecordOptions = {
  onStage?: (stage: 'loading' | 'recording') => void
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
  /** A small canvas on the page that mirrors the video as it's made. */
  preview?: HTMLCanvasElement | null
}

/** Call straight from the tap (the sound needs it). */
export async function recordReplay(share: SimShare, opts: RecordOptions): Promise<RecordResult> {
  const mime = pickVideoMime()
  if (!mime) throw new Error('This browser can’t make videos. Try Chrome or Safari.')
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const audio = new Ctor()
  void audio.resume().catch(() => undefined)
  const videos: HTMLVideoElement[] = []
  try {
    return await record(share, opts, mime, audio, videos)
  } finally {
    for (const v of videos) {
      v.pause()
      v.remove()
    }
    void audio.close().catch(() => undefined)
  }
}

async function record(share: SimShare, opts: RecordOptions, mime: string, audio: AudioContext, videos: HTMLVideoElement[]): Promise<RecordResult> {
  opts.onStage?.('loading')

  const host = document.body
  const c = share.case
  const fontBody = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'
  const calVar = getComputedStyle(document.body).getPropertyValue('--font-cal').trim() || getComputedStyle(document.documentElement).getPropertyValue('--font-cal').trim()
  const fontDisplay = calVar ? `${calVar}, ${fontBody}` : fontBody
  try {
    await Promise.all([document.fonts.load(`600 64px ${fontDisplay}`), document.fonts.load(`500 40px ${fontBody}`), document.fonts.load(`700 40px ${fontBody}`)])
  } catch {
    // system fonts are fine
  }

  // ── Media ──
  const sceneIds = new Set<string>()
  for (const b of share.beats) if ((b.kind === 'scene' || b.kind === 'action') && b.scene) sceneIds.add(b.scene)
  const scenes = new Map<string, SceneMedia>()
  await Promise.all(
    [...sceneIds].map(async (id) => {
      const scene = (share.scenes as Record<string, SimScene>)[id]
      if (!scene) return
      const [still, video, geo] = await Promise.all([
        loadImage(scene.src),
        scene.video ? loadVideo(scene.video, host) : Promise.resolve(null),
        scene.mouth ? loadJson<MouthGeometry>(scene.mouth) : Promise.resolve(null),
      ])
      if (video) videos.push(video)
      // 2D scenes: the drawing with each lip shape, swapped as she speaks
      let art: Record<string, HTMLImageElement> | null = null
      if (scene.art2d) {
        const art2d = scene.art2d
        const shapes = await Promise.all(
          (['x', 'e', 'a', 'o'] as const).map(async (m) => [m, await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(portraitArt(sceneSvg(art2d, { mouth: m }), art2d.character))}`)] as const)
        )
        art = Object.fromEntries(shapes.filter(([, img]) => img)) as Record<string, HTMLImageElement>
        if (!art.x) art = null
      }
      scenes.set(id, { scene, still, video, geo, art })
    })
  )
  const lips = c.audio ? await loadJson<LipTimings>(`/sims/${c.slug}/v${c.version}/lips.json`) : null
  const logo = await loadLogo()
  const voices = new Map<number, AudioBuffer | null>()
  if (c.audio) {
    await Promise.all(
      share.beats.map(async (b, i) => {
        // Speakers' lines, and the narrator reading situations and the ending (narrated cases)
        const id = b.kind === 'speech' ? b.audioId : (b.kind === 'scene' || b.kind === 'ending') && b.audioId ? b.audioId : null
        if (id) voices.set(i, await loadVoice(audio, voiceUrl(c.slug, c.version, id)))
      })
    )
  }
  if (opts.signal?.aborted) throw new DOMException('Stopped', 'AbortError')

  // ── Timeline ──
  const shots: Shot[] = [{ kind: 'intro', index: -1, start: 0, dur: INTRO, audio: null, scene: null }]
  let t = INTRO
  let scene: string | null = null
  share.beats.forEach((b, i) => {
    if ((b.kind === 'scene' || b.kind === 'action') && b.scene) scene = b.scene
    const buf = voices.get(i) ?? null
    // Brisk: a voiced beat lasts as long as its voice plus a breath; silent ones just long enough to read
    const dur = buf
      ? buf.duration + (b.kind === 'ending' ? 0.6 : 0.3)
      : b.kind === 'scene'
        ? clamp(1.2 + words(b.text) * 0.18, 2, 4.5)
        : b.kind === 'speech'
          ? clamp(1.2 + words(b.text) * 0.26, 1.8, 6)
          : b.kind === 'action'
            ? 1.2
            : b.kind === 'finding'
              ? clamp(1.6 + words(b.detail) * 0.12, 2, 3.2)
              : clamp(2.5 + words(b.summary) * 0.18, 3.5, 7)
    shots.push({ kind: 'beat', index: i, start: t, dur, audio: buf, scene })
    t += dur
  })
  shots.push({ kind: 'outro', index: share.beats.length, start: t, dur: OUTRO, audio: null, scene })
  const total = t + OUTRO
  const firstScene = shots.find((s) => s.scene)?.scene ?? null
  for (const s of shots) if (!s.scene) s.scene = firstScene

  // ── Canvas ──
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const face = document.createElement('canvas')
  const faceCtx = face.getContext('2d')!
  const layer = document.createElement('canvas')
  layer.width = W
  layer.height = ZONE.bottom - ZONE.top + 20
  const layerCtx = layer.getContext('2d')!
  const site = (process.env.NEXT_PUBLIC_LEARN_URL || window.location.origin).replace(/^https?:\/\//, '').replace(/\/+$/, '')

  // Caption cards, measured once
  const cards: Card[] = share.beats.map((b) => {
    if (b.kind === 'scene') {
      ctx.font = `400 34px ${fontBody}`
      const lines = wrap(ctx, b.text, 880, 6)
      const h = lines.length * 46 + 44
      return {
        h,
        draw: (g, top) => {
          g.fillStyle = 'rgba(30,38,37,0.94)'
          roundRect(g, 60, top, 960, h, 30)
          g.fill()
          g.font = `400 34px ${fontBody}`
          g.fillStyle = 'rgba(255,255,255,0.78)'
          g.textAlign = 'center'
          lines.forEach((l, k) => g.fillText(l, W / 2, top + 22 + 34 + k * 46))
          g.textAlign = 'left'
        },
      }
    }
    if (b.kind === 'speech') {
      ctx.font = `500 40px ${fontBody}`
      const lines = wrap(ctx, b.text, 780, 8)
      const width = Math.min(860, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 64)
      const bubble = lines.length * 54 + 44
      const h = bubble + 44
      const patient = b.speaker === 'patient'
      return {
        h,
        draw: (g, top) => {
          g.font = `700 28px ${fontBody}`
          g.fillStyle = patient ? LIME : 'rgba(255,255,255,0.8)'
          g.shadowColor = 'rgba(0,0,0,0.7)'
          g.shadowBlur = 10
          g.fillText(patient || !b.role ? b.name : `${b.name} · ${b.role}`, 76, top + 28)
          g.shadowColor = 'transparent'
          g.shadowBlur = 0
          g.fillStyle = patient ? '#ffffff' : '#e3f4e6'
          roundRect(g, 60, top + 44, width, bubble, 34)
          g.fill()
          g.font = `500 40px ${fontBody}`
          g.fillStyle = INK
          lines.forEach((l, k) => g.fillText(l, 92, top + 44 + 22 + 40 + k * 54))
        },
      }
    }
    if (b.kind === 'action') {
      ctx.font = `600 38px ${fontBody}`
      const lines = wrap(ctx, b.label, 720, 4)
      const width = Math.min(860, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 110)
      const h = lines.length * 50 + 40 + 40
      const dot = CATEGORY_DOT[b.category]
      return {
        h,
        draw: (g, top) => {
          const x = W - 60 - width
          g.fillStyle = LIME
          roundRect(g, x, top, width, h, 34)
          g.fill()
          if (dot) {
            g.fillStyle = INK
            g.beginPath()
            g.arc(x + 38, top + 20 + 36 - 12, 9, 0, Math.PI * 2)
            g.fill()
            g.fillStyle = dot
            g.beginPath()
            g.arc(x + 38, top + 20 + 36 - 12, 6, 0, Math.PI * 2)
            g.fill()
          }
          g.font = `600 38px ${fontBody}`
          g.fillStyle = INK
          lines.forEach((l, k) => g.fillText(l, x + 64, top + 20 + 36 + k * 50))
          g.font = `600 26px ui-monospace, Menlo, monospace`
          g.fillStyle = 'rgba(11,19,18,0.6)'
          g.fillText(`at ${clock(b.clockSec)}`, x + 64, top + h - 22)
        },
      }
    }
    if (b.kind === 'finding') {
      ctx.font = `500 36px ${fontBody}`
      const lines = wrap(ctx, b.detail, 840, 5)
      const h = lines.length * 48 + 96
      return {
        h,
        draw: (g, top) => {
          g.fillStyle = b.abnormal ? 'rgba(53,27,32,0.95)' : 'rgba(30,38,37,0.94)'
          roundRect(g, 60, top, 960, h, 30)
          g.fill()
          g.strokeStyle = b.abnormal ? 'rgba(251,113,133,0.6)' : 'rgba(255,255,255,0.16)'
          g.lineWidth = 2
          g.stroke()
          g.font = `700 26px ${fontBody}`
          g.fillStyle = b.abnormal ? '#fda4af' : 'rgba(255,255,255,0.6)'
          g.fillText(`FINDING · ${b.label.toUpperCase()}`, 96, top + 50)
          g.font = `500 36px ${fontBody}`
          g.fillStyle = '#ffffff'
          lines.forEach((l, k) => g.fillText(l, 96, top + 98 + k * 48))
        },
      }
    }
    // ending
    const tone = OUTCOME_COLOUR[b.outcome] ?? OUTCOME_COLOUR.poor
    ctx.font = `400 34px ${fontBody}`
    const lines = wrap(ctx, b.summary, 860, 6)
    const h = lines.length * 46 + 120
    return {
      h,
      draw: (g, top) => {
        g.save()
        roundRect(g, 60, top, 960, h, 30)
        g.clip()
        g.fillStyle = '#ffffff'
        g.fillRect(60, top, 960, h)
        g.fillStyle = tone.bg
        g.fillRect(60, top, 960, 70)
        g.font = `700 30px ${fontBody}`
        g.fillStyle = tone.fg
        g.fillText(b.title, 96, top + 46)
        g.font = `400 34px ${fontBody}`
        g.fillStyle = 'rgba(11,19,18,0.8)'
        lines.forEach((l, k) => g.fillText(l, 96, top + 120 + k * 46))
        g.restore()
      },
    }
  })

  let mouth: MouthState = restMouth()
  let lastNow = 0

  const drawStage = (shot: Shot, at: number, dt: number) => {
    const media = shot.scene ? scenes.get(shot.scene) : undefined
    ctx.save()
    ctx.beginPath()
    ctx.rect(STAGE.x, STAGE.y, STAGE.w, STAGE.h)
    ctx.clip()
    ctx.fillStyle = '#14211f'
    ctx.fillRect(STAGE.x, STAGE.y, STAGE.w, STAGE.h)
    const beat: SimShareBeat | undefined = shot.kind === 'beat' ? share.beats[shot.index] : undefined
    const talking = beat?.kind === 'speech' && beat.speaker === 'patient'
    const shape = talking && beat?.kind === 'speech' ? shapeAt(lips, beat.audioId, at - shot.start) : 'x'
    mouth = easeMouth(mouth, shape, dt)
    const cover = (src: CanvasImageSource, sw: number, sh: number) => {
      const scale = Math.max(STAGE.w / sw, STAGE.h / sh)
      const dw = sw * scale
      const dh = sh * scale
      ctx.drawImage(src, STAGE.x + (STAGE.w - dw) / 2, STAGE.y + (STAGE.h - dh) / 2, dw, dh)
    }
    if (media?.art) {
      const img = media.art[shape] ?? media.art.x
      cover(img, STAGE.w, STAGE.h)
    } else if (media?.video && media.video.readyState >= 2) {
      if (media.geo) {
        if (face.width !== media.geo.w) face.width = media.geo.w
        if (face.height !== media.geo.h) face.height = media.geo.h
        drawTalkingFrame(faceCtx, media.video, media.geo, mouth)
        cover(face, media.geo.w, media.geo.h)
      } else cover(media.video, media.video.videoWidth || 720, media.video.videoHeight || 480)
    } else if (media?.still) cover(media.still, media.still.naturalWidth, media.still.naturalHeight)
    // Blend into the header, and darken the lower part where the captions sit
    const top = ctx.createLinearGradient(0, STAGE.y, 0, STAGE.y + 90)
    top.addColorStop(0, 'rgba(11,19,18,0.9)')
    top.addColorStop(1, 'rgba(11,19,18,0)')
    ctx.fillStyle = top
    ctx.fillRect(STAGE.x, STAGE.y, STAGE.w, 90)
    const fadeFrom = ZONE.top - 200
    const fade = ctx.createLinearGradient(0, fadeFrom, 0, STAGE.y + STAGE.h)
    fade.addColorStop(0, 'rgba(11,19,18,0)')
    fade.addColorStop(0.45, 'rgba(11,19,18,0.82)')
    fade.addColorStop(1, 'rgba(11,19,18,1)')
    ctx.fillStyle = fade
    ctx.fillRect(STAGE.x, fadeFrom, STAGE.w, STAGE.y + STAGE.h - fadeFrom)
    ctx.restore()
    // Who is speaking
    if (beat?.kind === 'speech') {
      ctx.font = `700 28px ${fontBody}`
      const label = `${beat.name} speaking`
      const w = ctx.measureText(label).width + 76
      const y = ZONE.top - 96
      ctx.fillStyle = 'rgba(3,8,7,0.75)'
      roundRect(ctx, 60, y, w, 54, 27)
      ctx.fill()
      ctx.fillStyle = LIME
      ctx.beginPath()
      ctx.arc(88, y + 27, 8 + Math.sin(at * 10) * 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, 110, y + 37)
    }
  }

  const draw = (at: number, dt: number) => {
    const shot = shots.find((s) => at < s.start + s.dur) ?? shots[shots.length - 1]
    ctx.fillStyle = INK
    ctx.fillRect(0, 0, W, H)

    // Header: logo and label
    if (logo) ctx.drawImage(logo, 60, 64, 236, 64)
    ctx.font = `700 26px ${fontBody}`
    const tag = 'CLINICAL SIMULATION'
    const tagW = ctx.measureText(tag).width + 48
    ctx.strokeStyle = 'rgba(0,205,15,0.6)'
    ctx.lineWidth = 2
    roundRect(ctx, W - 60 - tagW, 72, tagW, 50, 25)
    ctx.stroke()
    ctx.fillStyle = LIME
    ctx.fillText(tag, W - 60 - tagW + 24, 106)

    drawStage(shot, at, dt)

    // Patient and the case clock, as chips on the picture
    ctx.font = `700 32px ${fontBody}`
    const who = `${c.patient.name}, ${c.patient.age}`
    ctx.fillStyle = 'rgba(3,8,7,0.7)'
    roundRect(ctx, 40, STAGE.y + 24, ctx.measureText(who).width + 56, 60, 30)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(who, 68, STAGE.y + 65)
    let caseClock = 0
    for (let i = 0; i <= Math.min(shot.index, share.beats.length - 1); i++) {
      const b = share.beats[i]
      if (b?.kind === 'action') caseClock = b.clockSec
    }
    ctx.font = `600 32px ui-monospace, Menlo, monospace`
    const clockW = ctx.measureText(clock(caseClock)).width + 48
    ctx.fillStyle = 'rgba(3,8,7,0.7)'
    roundRect(ctx, W - 40 - clockW, STAGE.y + 24, clockW, 60, 30)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'right'
    ctx.fillText(clock(caseClock), W - 64, STAGE.y + 65)
    ctx.textAlign = 'left'

    // Conversation: newest at the bottom, older ones scroll up and fade
    if (shot.kind !== 'intro') {
      const last = Math.min(shot.index, share.beats.length - 1)
      const enter = shot.kind === 'beat' ? ease((at - shot.start) / 0.35) : 1
      const g = layerCtx
      g.clearRect(0, 0, layer.width, layer.height)
      g.save()
      g.translate(0, -(ZONE.top - 10))
      let bottom = ZONE.bottom
      for (let i = last; i >= 0 && bottom > ZONE.top - 400; i--) {
        const card = cards[i]
        const top = bottom - card.h
        g.save()
        if (i === last && shot.kind === 'beat') {
          g.globalAlpha = enter
          g.translate(0, (1 - enter) * 40)
        }
        card.draw(g, top)
        g.restore()
        bottom = top - 24
      }
      g.restore()
      // Older lines fade out as they scroll up
      g.save()
      g.globalCompositeOperation = 'destination-out'
      const fadeTop = g.createLinearGradient(0, 0, 0, 140)
      fadeTop.addColorStop(0, 'rgba(0,0,0,1)')
      fadeTop.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = fadeTop
      g.fillRect(0, 0, W, 140)
      g.restore()
      ctx.drawImage(layer, 0, ZONE.top - 10)
    } else {
      // Intro: what this is
      const a = ease(at / 0.5) * (1 - ease((at - (INTRO - 0.5)) / 0.5))
      ctx.save()
      ctx.globalAlpha = a
      ctx.font = `700 30px ${fontBody}`
      ctx.fillStyle = LIME
      ctx.fillText(wrap(ctx, c.setting, 940, 1)[0] ?? '', 60, ZONE.top + 40)
      ctx.font = `600 66px ${fontDisplay}`
      ctx.fillStyle = '#ffffff'
      const lines = wrap(ctx, c.title, 940, 3)
      let y = ZONE.top + 120
      for (const l of lines) {
        ctx.fillText(l, 60, y)
        y += 80
      }
      ctx.font = `500 38px ${fontBody}`
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      for (const l of wrap(ctx, `${share.firstName} took on this case. Watch what they did, then try it yourself.`, 940, 3)) {
        y += 8
        ctx.fillText(l, 60, y + 30)
        y += 50
      }
      ctx.restore()
    }

    // Footer: progress and where to try it
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    roundRect(ctx, 60, 1726, W - 120, 10, 5)
    ctx.fill()
    ctx.fillStyle = LIME
    roundRect(ctx, 60, 1726, Math.max(10, (W - 120) * clamp(at / total, 0, 1)), 10, 5)
    ctx.fill()
    ctx.font = `600 32px ${fontBody}`
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText(`${share.firstName}’s run`, 60, 1800)
    ctx.textAlign = 'right'
    ctx.fillStyle = LIME
    ctx.fillText(site, W - 60, 1800)
    ctx.textAlign = 'left'

    // Outro: the score and the invitation
    if (shot.kind === 'outro') {
      const a = ease((at - shot.start) / 0.5)
      ctx.save()
      ctx.globalAlpha = a
      ctx.fillStyle = 'rgba(11,19,18,0.96)'
      ctx.fillRect(0, 0, W, H)
      if (logo) ctx.drawImage(logo, (W - 300) / 2, 220, 300, 82)
      ctx.textAlign = 'center'
      ctx.font = `500 44px ${fontBody}`
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText(`${share.firstName} scored`, W / 2, 560)
      const pop = 0.85 + 0.15 * ease((at - shot.start - 0.2) / 0.5)
      ctx.save()
      ctx.translate(W / 2, 800)
      ctx.scale(pop, pop)
      ctx.font = `600 260px ${fontDisplay}`
      ctx.fillStyle = share.result.passed ? LIME : '#ffffff'
      ctx.fillText(`${share.result.pct}%`, 0, 0)
      ctx.restore()
      const tone = OUTCOME_COLOUR[share.result.outcome] ?? OUTCOME_COLOUR.poor
      ctx.font = `700 34px ${fontBody}`
      const pw = ctx.measureText(share.result.title).width + 64
      ctx.fillStyle = tone.bg
      roundRect(ctx, (W - pw) / 2, 880, pw, 66, 33)
      ctx.fill()
      ctx.fillStyle = tone.fg
      ctx.fillText(share.result.title, W / 2, 925)
      ctx.font = `400 34px ${fontBody}`
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      let y = 1030
      for (const l of wrap(ctx, c.title, 900, 2)) {
        ctx.fillText(l, W / 2, y)
        y += 46
      }
      ctx.font = `600 70px ${fontDisplay}`
      ctx.fillStyle = '#ffffff'
      ctx.fillText('Can you do better?', W / 2, 1300)
      ctx.font = `700 40px ${fontBody}`
      const cta = 'Try this case free'
      const cw = ctx.measureText(cta).width + 120
      ctx.fillStyle = LIME
      roundRect(ctx, (W - cw) / 2, 1370, cw, 110, 55)
      ctx.fill()
      ctx.fillStyle = INK
      ctx.fillText(cta, W / 2, 1440)
      ctx.font = `600 38px ${fontBody}`
      ctx.fillStyle = LIME
      ctx.fillText(site, W / 2, 1560)
      ctx.font = `400 28px ${fontBody}`
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.fillText('Rehabify Learn · clinical simulations for physiotherapists', W / 2, 1620)
      ctx.textAlign = 'left'
      ctx.restore()
    }
  }

  // ── Record ──
  for (const v of videos) void v.play().catch(() => undefined)
  draw(0, 0)
  const dest = audio.createMediaStreamDestination()
  const stream = new MediaStream([
    ...(canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(FPS).getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ])
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  // One soundtrack, mixed ahead of time (every line exactly where it belongs), played as a single
  // sound: far steadier on phones than dozens of separately timed sounds
  const track = await mixSoundtrack(audio, shots, total)
  const t0 = audio.currentTime + 0.35
  const sources: AudioBufferSourceNode[] = []
  if (track) {
    const src = audio.createBufferSource()
    src.buffer = track
    src.connect(dest)
    src.start(t0)
    sources.push(src)
  } else {
    for (const s of shots) {
      if (!s.audio) continue
      const src = audio.createBufferSource()
      src.buffer = s.audio
      src.connect(dest)
      src.start(t0 + s.start + 0.12)
      sources.push(src)
    }
  }
  // Keep the screen on: a dimmed or locked phone stops drawing and the video stalls
  let wake: { release: () => Promise<void> } | null = null
  try {
    wake = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null
  } catch {
    // not supported: the page asks people to keep it open
  }
  recorder.start(1000)
  opts.onStage?.('recording')

  const preview = opts.preview?.getContext('2d') ?? null
  let aborted = false
  let leftPage = false
  await new Promise<void>((resolve) => {
    let frame = 0
    const onAbort = () => {
      aborted = true
      cancelAnimationFrame(frame)
      resolve()
    }
    // Leaving the page part-way would leave gaps: stop cleanly and say why
    const onHidden = () => {
      if (document.visibilityState !== 'hidden') return
      leftPage = true
      document.removeEventListener('visibilitychange', onHidden)
      onAbort()
    }
    document.addEventListener('visibilitychange', onHidden)
    opts.signal?.addEventListener('abort', () => document.removeEventListener('visibilitychange', onHidden), { once: true })
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    lastNow = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastNow) / 1000)
      lastNow = now
      const at = audio.currentTime - t0
      draw(Math.max(0, at), dt)
      if (preview && opts.preview) preview.drawImage(canvas, 0, 0, opts.preview.width, opts.preview.height)
      opts.onProgress?.(clamp(at, 0, total), total)
      if (at >= total + 0.3) {
        opts.signal?.removeEventListener('abort', onAbort)
        document.removeEventListener('visibilitychange', onHidden)
        resolve()
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  })

  recorder.stop()
  await stopped
  for (const s of sources) {
    try {
      s.stop()
    } catch {
      // already ended
    }
  }
  stream.getTracks().forEach((tr) => tr.stop())
  void wake?.release().catch(() => undefined)
  if (leftPage) throw new Error('Recording stopped because the page was left. Keep this screen open until the video is done, then try again.')
  if (aborted) throw new DOMException('Stopped', 'AbortError')
  const type = mime.split(';')[0]
  return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm', mime: type, seconds: Math.round(total) }
}

/**
 * Every voice line placed at its moment in one buffer (OfflineAudioContext renders it in a blink).
 * Null when there's nothing to mix or the browser can't, and the caller schedules lines one by one.
 */
async function mixSoundtrack(audio: AudioContext, shots: Shot[], total: number): Promise<AudioBuffer | null> {
  const voiced = shots.filter((s) => s.audio)
  if (!voiced.length) return null
  const Offline = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!Offline) return null
  try {
    const rate = audio.sampleRate
    const mix = new Offline(1, Math.ceil((total + 1) * rate), rate)
    for (const s of voiced) {
      const src = mix.createBufferSource()
      src.buffer = s.audio
      src.connect(mix.destination)
      src.start(s.start + 0.12)
    }
    return await mix.startRendering()
  } catch {
    return null
  }
}

/** Roughly how long the video will be (before any voices are loaded). */
export function estimateSeconds(share: SimShare) {
  let t = INTRO + OUTRO
  for (const b of share.beats) {
    const narrated = (b.kind === 'scene' || b.kind === 'ending') && Boolean(b.audioId)
    if (b.kind === 'scene') t += narrated ? 0.3 + words(b.text) * 0.4 : clamp(1.2 + words(b.text) * 0.18, 2, 4.5)
    else if (b.kind === 'speech') t += 0.3 + words(b.text) * 0.36
    else if (b.kind === 'action') t += 1.2
    else if (b.kind === 'finding') t += clamp(1.6 + words(b.detail) * 0.12, 2, 3.2)
    else t += narrated ? 0.6 + words(`${b.title} ${b.summary}`) * 0.4 : clamp(2.5 + words(b.summary) * 0.18, 3.5, 7)
  }
  return Math.round(t)
}
