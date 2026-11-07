import { audioUrl, type CatalogClip } from '@/convex/exerciseLibraryCatalog'
import { CUE_VERSION, type CueCode } from './exercises'

/**
 * All sound in a camera-coached session other than the demonstration's own voiceover.
 *
 * The voiceover (lib/exercise3d/voice.ts, unchanged) always has priority. Spoken corrections are
 * off unless the patient turns them on; then they are pre-recorded clips in the same voice, and:
 * - only one plays at a time, with at most one waiting (a newer correction replaces it, and one
 *   waiting longer than PENDING_MS is dropped as out of date);
 * - the same correction never repeats within REPEAT_MS;
 * - one only starts between reps or in the rest after a set, and only when the voiceover is
 *   silent for the whole length of the clip (its timing is known from the catalog: each cue plays
 *   when the demonstration's loop passes its time).
 */

const REPEAT_MS = 10_000
const PENDING_MS = 6_000
const GAP_S = 0.35 // silence kept either side of a correction

const MODE_KEY = 'rh-motion-cues'
export type CueMode = 'visual' | 'voice'

export function savedCueMode(): CueMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'voice' ? 'voice' : 'visual'
  } catch {
    return 'visual'
  }
}

export function saveCueMode(mode: CueMode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

type Trimmed = { buffer: AudioBuffer; offset: number; duration: number }

/** The audible part of a text-to-speech clip (same rule as the voiceover player). */
function trim(buffer: AudioBuffer): Trimmed {
  const data = buffer.getChannelData(0)
  let peak = 0
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
  const threshold = peak * 0.03
  let a = 0
  let b = data.length - 1
  while (a < data.length && Math.abs(data[a]) < threshold) a++
  while (b > a && Math.abs(data[b]) < threshold) b--
  const rate = buffer.sampleRate
  const offset = Math.max(0, a / rate - 0.02)
  return { buffer, offset, duration: Math.min(buffer.duration - offset, (b - a) / rate + 0.1) }
}

/** The correction clips are kept in Cache Storage (with the tracker files), so voice cues work offline. */
async function cachedBytes(url: string): Promise<ArrayBuffer | null> {
  let cache: Cache | null = null
  try {
    cache = typeof caches !== 'undefined' ? await caches.open('rh-motion-v1') : null
    const hit = await cache?.match(url)
    if (hit) return await hit.arrayBuffer()
  } catch {
    // No Cache Storage (private window): plain download below.
  }
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.arrayBuffer()
  cache?.put(url, new Response(data.slice(0), { headers: { 'Content-Type': 'audio/mpeg' } })).catch(() => undefined)
  return data
}

async function decode(ctx: BaseAudioContext, url: string, keep = false): Promise<Trimmed | null> {
  try {
    let data: ArrayBuffer | null
    if (keep) data = await cachedBytes(url)
    else {
      const res = await fetch(url)
      data = res.ok ? await res.arrayBuffer() : null
    }
    return data ? trim(await ctx.decodeAudioData(data)) : null
  } catch {
    return null
  }
}

type ClipAudio = NonNullable<CatalogClip['audio']>

/** When the demonstration's voiceover is talking, from the catalog's cue times and each clip's length. */
export class VoiceoverTimeline {
  private windows: { at: number; seconds: number }[] = []
  private introUntil = 0

  constructor(private readonly audio: ClipAudio | null) {
    // Until the clips are measured, assume each cue talks for 2.5 s
    this.windows = audio?.cues.map((c) => ({ at: c.at, seconds: 2.5 })) ?? []
  }

  async measure(ctx: BaseAudioContext) {
    if (!this.audio) return
    const lengths = new Map<string, number>()
    await Promise.all(
      [...new Set(this.audio.cues.map((c) => c.file))].map(async (file) => {
        const clip = await decode(ctx, audioUrl(file))
        if (clip) lengths.set(file, clip.duration)
      })
    )
    this.windows = this.audio.cues.map((c) => ({ at: c.at, seconds: lengths.get(c.file) ?? 2.5 }))
  }

  /** The intro started now (performance.now() ms); it is measured so nothing talks over it. */
  async introStarted(ctx: BaseAudioContext, startedMs: number) {
    this.introUntil = startedMs + 25_000 // until measured
    if (!this.audio) return
    const intro = await decode(ctx, audioUrl(this.audio.intro))
    this.introUntil = startedMs + (intro ? intro.duration * 1000 : 25_000)
  }

  /**
   * Whether the voiceover is silent from loop time `loop` for `seconds` of real time, with the
   * demonstration playing at `speed` (its cues follow the animation clock).
   */
  quiet(loop: number, loopLength: number, speed: number, seconds: number, nowMs: number) {
    if (nowMs < this.introUntil) return false
    if (!loopLength) return true
    const span = (seconds + 2 * GAP_S) * speed
    const from = loop - GAP_S * speed
    for (const w of this.windows) {
      const len = (w.seconds + GAP_S) * speed
      // Compare in the loop's own time, both this loop and the next
      for (const start of [w.at - loopLength, w.at, w.at + loopLength]) {
        if (start < from + span && start + len > from) return false
      }
    }
    return true
  }
}

/** Short spoken corrections, played only when the session says it's a good moment. */
export class CorrectionVoice {
  private ctx: AudioContext | null = null
  private clips = new Map<CueCode, Promise<Trimmed | null>>()
  private lastSaid = new Map<CueCode, number>()
  private pending: { code: CueCode; at: number } | null = null
  private playingUntil = 0
  enabled: boolean

  constructor(
    private readonly codes: CueCode[],
    mode: CueMode
  ) {
    this.enabled = mode === 'voice'
  }

  get context() {
    return this.ctx
  }

  /** Call from a tap: browsers only allow sound after a user gesture. */
  async start() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AudioCtx()
    }
    await this.ctx.resume().catch(() => undefined)
    if (this.enabled) for (const code of this.codes) void this.load(code)
  }

  setEnabled(on: boolean) {
    this.enabled = on
    if (!on) this.pending = null
    else for (const code of this.codes) void this.load(code)
  }

  /** Ask for a correction; it waits for a quiet moment (or is dropped). */
  request(code: CueCode, nowMs = performance.now()) {
    if (!this.enabled) return
    const last = this.lastSaid.get(code)
    if (last !== undefined && nowMs - last < REPEAT_MS) return
    this.pending = { code, at: nowMs }
  }

  /** Seconds the waiting correction lasts, or null when nothing is waiting. */
  async pendingSeconds(): Promise<number | null> {
    if (!this.pending) return null
    const clip = await this.load(this.pending.code)
    return clip ? clip.duration : null
  }

  /**
   * Plays the waiting correction if `canSpeak(seconds)` agrees. Call it every frame or so with a
   * check that knows whether the patient is between reps and the voiceover is silent.
   */
  async pump(canSpeak: (seconds: number) => boolean, nowMs = performance.now()) {
    const waiting = this.pending
    if (!waiting || !this.ctx || !this.enabled) return
    if (nowMs - waiting.at > PENDING_MS) {
      this.pending = null
      return
    }
    if (nowMs < this.playingUntil) return
    const clip = await this.load(waiting.code)
    if (!clip) {
      this.pending = null
      return
    }
    if (this.pending !== waiting || !canSpeak(clip.duration)) return
    this.pending = null
    this.lastSaid.set(waiting.code, nowMs)
    const source = this.ctx.createBufferSource()
    source.buffer = clip.buffer
    source.connect(this.ctx.destination)
    source.start(0, clip.offset, clip.duration)
    this.playingUntil = nowMs + clip.duration * 1000 + GAP_S * 1000
  }

  dispose() {
    this.pending = null
    void this.ctx?.close().catch(() => undefined)
    this.ctx = null
  }

  private load(code: CueCode) {
    let pending = this.clips.get(code)
    if (!pending) {
      const ctx = this.ctx
      pending = ctx ? decode(ctx, `/motion-cues/${CUE_VERSION}/${code}.mp3`, true) : Promise.resolve(null)
      if (ctx) this.clips.set(code, pending)
    }
    return pending
  }
}
