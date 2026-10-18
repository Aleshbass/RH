import { audioUrl, type CatalogClip } from '@/convex/exerciseLibraryCatalog'

type ClipAudio = NonNullable<CatalogClip['audio']>
type Trimmed = { buffer: AudioBuffer; offset: number; duration: number }

const decoded = new Map<string, Promise<ArrayBuffer>>()

/** Raw MP3 bytes, fetched once per page (the CDN and browser cache the files themselves). */
function fetchAudio(file: string) {
  let pending = decoded.get(file)
  if (!pending) {
    pending = fetch(audioUrl(file)).then((res) => {
      if (!res.ok) throw new Error(`Couldn't load ${file}`)
      return res.arrayBuffer()
    })
    pending.catch(() => decoded.delete(file))
    decoded.set(file, pending)
  }
  return pending.then((buf) => buf.slice(0))
}

/**
 * Spoken guidance for one exercise: an intro once, then short cues on every rep, timed against
 * the animation's own clock so they stay in step at 0.5× and stop when the demo is paused.
 * Text-to-speech audio starts and ends with a variable silence, so each clip is trimmed to the
 * audible part before it plays.
 */
export class VoiceGuide {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private buffers = new Map<string, Promise<Trimmed | null>>()
  private current: AudioBufferSourceNode | null = null
  private introEndsAt = 0
  private lastLoopTime = -1
  private muted = false

  constructor(private readonly audio: ClipAudio) {}

  get started() {
    return this.ctx !== null
  }

  /** Call from a tap: browsers only allow sound after a user gesture. */
  async start({ intro }: { intro: boolean }) {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AudioCtx()
      this.gain = this.ctx.createGain()
      this.gain.connect(this.ctx.destination)
    }
    await this.ctx.resume()
    this.setMuted(false)
    for (const cue of this.audio.cues) void this.load(cue.file)
    if (intro) {
      const clip = await this.load(this.audio.intro)
      if (clip) this.introEndsAt = this.play(clip)
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.gain) this.gain.gain.value = muted ? 0 : 1
    if (muted) this.stopCurrent()
  }

  /** Call every frame with the demo's position in its loop, in seconds. */
  tick(loopTime: number) {
    const prev = this.lastLoopTime
    this.lastLoopTime = loopTime
    if (!this.ctx || this.muted || this.ctx.state !== 'running' || prev < 0 || loopTime === prev) return
    if (this.ctx.currentTime < this.introEndsAt) return // never talk over the intro
    const wrapped = loopTime < prev
    for (const cue of this.audio.cues) {
      const crossed = wrapped ? cue.at > prev || cue.at <= loopTime : cue.at > prev && cue.at <= loopTime
      if (crossed) {
        void this.load(cue.file).then((clip) => {
          if (clip && !this.muted) this.play(clip)
        })
      }
    }
  }

  dispose() {
    this.stopCurrent()
    void this.ctx?.close()
    this.ctx = null
  }

  private stopCurrent() {
    try {
      this.current?.stop()
    } catch {
      // Already finished.
    }
    this.current = null
  }

  /** Plays a trimmed clip now and returns when it will end (AudioContext time). */
  private play(clip: Trimmed) {
    const ctx = this.ctx!
    this.stopCurrent()
    const source = ctx.createBufferSource()
    source.buffer = clip.buffer
    source.connect(this.gain!)
    source.start(0, clip.offset, clip.duration)
    this.current = source
    return ctx.currentTime + clip.duration
  }

  private load(file: string) {
    let pending = this.buffers.get(file)
    if (!pending) {
      pending = fetchAudio(file)
        .then((data) => this.ctx!.decodeAudioData(data))
        .then((buffer) => trim(buffer))
        .catch(() => null)
      this.buffers.set(file, pending)
    }
    return pending
  }
}

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
