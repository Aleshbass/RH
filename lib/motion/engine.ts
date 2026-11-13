import type { CueCode, Metrics, MotionExercise, RepStats } from './exercises'
import { facing, point, SKELETON_POINTS, visible, type Frame, type Joint, type Side } from './pose'

/**
 * Counts reps and judges them, frame by frame.
 *
 * States: rest → rising → top → lowering → rest. A rep counts only when the movement reaches the
 * exercise's countAt progress and comes back to rest; a smaller attempt is a "partial" with a
 * cue. Thresholds have a gap between going up and coming down, so jitter can't double-count.
 */

/** The 3D demonstration's own rep, measured the same way (lib/motion/reference.ts). */
export type Reference = {
  restAngle: number
  peakAngle: number
  /** Active part of one rep, in seconds */
  activeSeconds: number
  /** Progress (0-1) through the active part, resampled to SHAPE_POINTS points */
  shape: number[]
}

export const SHAPE_POINTS = 40
/** A limb segment changing on-screen length by more than this means it's turning towards the camera */
export const OUT_OF_PLANE = 0.2
/** Relative targets stop just short of a fully straight joint, or of a fully bent one */
const RELATIVE_TARGET_CAP = 178
const RELATIVE_TARGET_FLOOR = 20
const START_BELOW = 0.2
const RISE_ABOVE = 0.3
const SNAPSHOT_MS = 100
const STUCK_MS = 30_000

export type RepResult = {
  index: number
  score: number
  counted: true
  mistakes: CueCode[]
  stats: RepStats
  /** Stick-figure frames of the rep for the physio (image units, 3 decimals), at most 16 */
  snapshot: number[][]
}

export type EngineEvent =
  | { type: 'rep'; rep: RepResult }
  | { type: 'partial'; cue: CueCode; peakProgress: number }

type Sample = { t: number; progress: number; metrics: Metrics }

function avgMetrics(samples: Sample[]): Metrics {
  const sums: Record<string, { total: number; n: number }> = {}
  for (const s of samples) {
    for (const [k, v] of Object.entries(s.metrics)) {
      sums[k] ??= { total: 0, n: 0 }
      if (v !== null && Number.isFinite(v)) {
        sums[k].total += v
        sums[k].n += 1
      }
    }
  }
  return Object.fromEntries(Object.entries(sums).map(([k, s]) => [k, s.n ? s.total / s.n : null]))
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

/** Resample a progress curve to n points (by time). */
export function resample(samples: { t: number; progress: number }[], n = SHAPE_POINTS): number[] {
  if (samples.length === 0) return []
  if (samples.length === 1) return Array(n).fill(samples[0].progress)
  const t0 = samples[0].t
  const t1 = samples[samples.length - 1].t
  const out: number[] = []
  let j = 0
  for (let i = 0; i < n; i++) {
    const t = t0 + ((t1 - t0) * i) / (n - 1)
    while (j < samples.length - 2 && samples[j + 1].t < t) j++
    const a = samples[j]
    const b = samples[j + 1]
    const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
    out.push(a.progress + (b.progress - a.progress) * clamp01(f))
  }
  return out
}

/**
 * How closely two progress curves match in shape, allowing them to drift in time (dynamic time
 * warping with a narrow band). 1 is the same shape; 0 is far off.
 */
export function shapeSimilarity(a: number[], b: number[]): number {
  const n = a.length
  const m = b.length
  if (!n || !m) return 0
  const band = Math.max(4, Math.round(Math.max(n, m) * 0.2))
  const INF = Number.POSITIVE_INFINITY
  let prev = new Array<number>(m + 1).fill(INF)
  prev[0] = 0
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1).fill(INF)
    const center = Math.round((i * m) / n)
    for (let j = Math.max(1, center - band); j <= Math.min(m, center + band); j++) {
      const cost = Math.abs(a[i - 1] - b[j - 1])
      cur[j] = cost + Math.min(prev[j], cur[j - 1], prev[j - 1])
    }
    prev = cur
  }
  const meanCost = prev[m] / (n + m)
  return clamp01(1 - meanCost * 3)
}

/** Tempo against the demonstration: full marks from 0.75x to 1.6x its time, nothing below 0.35x or above 3x. */
export function tempoScore(activeSeconds: number, refSeconds: number) {
  const r = activeSeconds / Math.max(refSeconds, 0.5)
  if (r >= 0.75 && r <= 1.6) return 1
  if (r < 0.75) return clamp01((r - 0.35) / 0.4)
  return clamp01((3 - r) / 1.4)
}

export function repScore(exercise: MotionExercise, stats: RepStats, mistakes: CueCode[], reference: Reference | null, curve: number[]) {
  const range = clamp01(stats.peakProgress)
  const refSeconds = reference?.activeSeconds ?? exercise.refActiveSeconds
  const tempo = tempoScore(stats.activeMs / 1000, refSeconds)
  const control = reference && curve.length ? 0.6 * tempo + 0.4 * shapeSimilarity(curve, reference.shape) : tempo
  const form = clamp01(1 - 0.5 * mistakes.length)
  return Math.round(100 * (0.5 * range + 0.3 * control + 0.2 * form))
}

export class RepEngine {
  readonly side: Side
  private dir: 1 | -1 = 1
  private restAngle: number
  private state: 'rest' | 'rising' | 'top' | 'lowering' = 'rest'
  private restSamples: Sample[] = []
  private repSamples: Sample[] = []
  private repStart = 0
  private peakEnter = 0
  private peakExit = 0
  private holdMs = 0
  private lastTopT = 0
  private peak = 0
  private peakAngle = 0
  private frames: Frame[] = []
  private lastSnapshotT = 0
  private reps = 0
  private readonly target: number
  /** Resting on-screen length of each limb segment (median of the start position), for the out-of-plane check */
  private segmentBase: number[] | null = null
  private segmentSamples: number[][] = []
  /** Latest progress (0-1), for the progress bar on the camera */
  progress = 0
  angle: number | null = null
  /** The last frame was skipped because a limb was turning towards the camera */
  outOfPlane = false

  constructor(
    readonly exercise: MotionExercise,
    side: Side,
    restAngle: number | null,
    private readonly reference: Reference | null
  ) {
    this.side = side
    // The patient's own start position, within reason (a bad first reading must not break counting)
    this.restAngle =
      restAngle !== null && Math.abs(restAngle - exercise.rest) <= 30 ? restAngle : exercise.rest
    // Same range of movement from the patient's own start (see MotionExercise.relativeTarget)
    const relative = this.restAngle + (exercise.target - exercise.rest)
    this.target = !exercise.relativeTarget
      ? exercise.target
      : exercise.target >= exercise.rest
        ? Math.min(RELATIVE_TARGET_CAP, relative)
        : Math.max(RELATIVE_TARGET_FLOOR, relative)
  }

  get phase() {
    return this.state
  }

  /** The patient's start position for this session (degrees), which ranges are measured from. */
  get startAngle() {
    return this.restAngle
  }

  /** Between reps: at rest, so spoken corrections may play. */
  get betweenReps() {
    return this.state === 'rest'
  }

  /** Joints that must be visible and aren't, in this frame. */
  missing(frame: Frame): Joint[] {
    return this.exercise.needed.filter((j) => !visible(point(frame, j, this.side)))
  }

  private progressOf(angle: number) {
    const span = this.target - this.restAngle
    return span === 0 ? 0 : (angle - this.restAngle) / span
  }

  /** On-screen length of each configured limb segment, or null when a point isn't visible. */
  private segmentLengths(frame: Frame): number[] | null {
    const segments = this.exercise.segments
    if (!segments?.length) return null
    const lengths: number[] = []
    for (const [a, b] of segments) {
      const pa = point(frame, a, this.side)
      const pb = point(frame, b, this.side)
      if (!visible(pa) || !visible(pb)) return null
      lengths.push(Math.hypot(pa.x - pb.x, pa.y - pb.y))
    }
    return lengths
  }

  /** True when a limb has changed length on screen enough that it's turning towards the camera. */
  private turnedOutOfPlane(frame: Frame, atRest: boolean): boolean {
    const lengths = this.segmentLengths(frame)
    if (!lengths) return false
    if (!this.segmentBase) {
      // Learn the resting lengths from the start position first
      if (atRest) {
        this.segmentSamples.push(lengths)
        if (this.segmentSamples.length >= 10) {
          this.segmentBase = lengths.map((_, i) => median(this.segmentSamples.map((s) => s[i])))
        }
      }
      return false
    }
    return lengths.some((len, i) => {
      const base = this.segmentBase![i]
      return base > 1e-6 && Math.abs(len - base) / base > OUT_OF_PLANE
    })
  }

  /** Feed one smoothed frame; returns what happened. Frames where the body can't be seen are skipped. */
  update(frame: Frame): EngineEvent[] {
    const d = facing(frame, this.side)
    if (d) this.dir = d
    const angle = this.exercise.primary(frame, this.side)
    this.angle = angle
    if (angle === null) return []
    const progress = this.progressOf(angle)
    // A limb turning towards the camera reads as a different angle: skip the frame rather than count it
    this.outOfPlane = this.turnedOutOfPlane(frame, this.state === 'rest' && progress < START_BELOW)
    if (this.outOfPlane) return []
    this.progress = clamp01(progress)
    const sample: Sample = { t: frame.t, progress, metrics: this.exercise.metrics(frame, this.side, this.dir) }
    const events: EngineEvent[] = []
    const countAt = this.exercise.countAt

    if (this.state !== 'rest' && frame.t - this.repStart > STUCK_MS) {
      // Wandered off mid-rep (or sat down to rest): start over without counting
      this.reset()
      return events
    }

    switch (this.state) {
      case 'rest':
        if (progress < START_BELOW) {
          this.restSamples.push(sample)
          if (this.restSamples.length > 30) this.restSamples.shift()
          this.repStart = frame.t
        }
        if (progress > RISE_ABOVE) {
          this.state = 'rising'
          this.repSamples = [...this.restSamples.slice(-3), sample]
          this.frames = []
          this.peak = progress
          this.peakAngle = angle
          this.holdMs = 0
        }
        break
      case 'rising':
        this.track(sample, angle, frame)
        if (progress >= countAt) {
          this.state = 'top'
          this.peakEnter = frame.t
          this.lastTopT = frame.t
        } else if (progress < START_BELOW) {
          if (this.peak >= this.exercise.partialAt) events.push({ type: 'partial', cue: this.exercise.partialCue, peakProgress: this.peak })
          this.reset()
        }
        break
      case 'top':
        this.track(sample, angle, frame)
        if (progress >= countAt - 0.07) {
          this.holdMs += frame.t - this.lastTopT
          this.lastTopT = frame.t
        } else {
          this.state = 'lowering'
          this.peakExit = frame.t
        }
        break
      case 'lowering':
        this.track(sample, angle, frame)
        if (progress >= countAt) {
          // Went back up before finishing: still the same rep
          this.state = 'top'
          this.lastTopT = frame.t
        } else if (progress < START_BELOW) {
          events.push({ type: 'rep', rep: this.finish(frame.t) })
          this.reset()
          this.restSamples = [sample]
          this.repStart = frame.t
        }
        break
    }
    return events
  }

  private track(sample: Sample, angle: number, frame: Frame) {
    this.repSamples.push(sample)
    if (sample.progress > this.peak) {
      this.peak = sample.progress
      this.peakAngle = angle
    }
    if (frame.t - this.lastSnapshotT >= SNAPSHOT_MS) {
      this.lastSnapshotT = frame.t
      this.frames.push(frame)
      if (this.frames.length > 300) this.frames = this.frames.filter((_, i) => i % 2 === 0)
    }
  }

  private finish(endT: number): RepResult {
    const exercise = this.exercise
    const atTop = this.repSamples.filter((s) => s.progress >= exercise.countAt - 0.07)
    // Going up: from rest until first near the peak; coming down: from last near the peak until
    // back at rest. Most of each movement, not just its fast middle.
    const near = this.peak * 0.95
    const firstNear = this.repSamples.find((s) => s.progress >= near)?.t ?? this.peakEnter
    const lastNear = [...this.repSamples].reverse().find((s) => s.progress >= near)?.t ?? this.peakExit
    const stats: RepStats = {
      peakProgress: this.peak,
      peakAngle: this.peakAngle,
      activeMs: endT - this.repStart,
      upMs: firstNear - this.repStart,
      downMs: endT - lastNear,
      holdMs: this.holdMs,
      atPeak: avgMetrics(atTop.length ? atTop : this.repSamples),
      atStart: avgMetrics(this.restSamples.length ? this.restSamples : this.repSamples.slice(0, 3)),
    }
    const mistakes = exercise.rules.filter((rule) => rule.check(stats)).map((rule) => rule.code)
    // Shape is compared on each curve's own scale: range is scored separately
    const top = Math.max(this.peak, 0.01)
    const curve = resample(this.repSamples.map((s) => ({ t: s.t, progress: clamp01(s.progress / top) })))
    this.reps += 1
    return {
      index: this.reps,
      counted: true,
      score: repScore(exercise, stats, mistakes, this.reference, curve),
      mistakes,
      stats,
      snapshot: snapshotOf(this.frames),
    }
  }

  private reset() {
    this.state = 'rest'
    this.repSamples = []
    this.frames = []
    this.peak = 0
    this.holdMs = 0
  }
}

/** Up to 16 evenly spaced frames of the stick figure: [x0, y0, x1, y1, ...] over SKELETON_POINTS. */
export function snapshotOf(frames: Frame[], max = 16): number[][] {
  if (!frames.length) return []
  const step = Math.max(1, frames.length / max)
  const out: number[][] = []
  for (let i = 0; i < frames.length && out.length < max; i += step) {
    const f = frames[Math.floor(i)]
    out.push(SKELETON_POINTS.flatMap((idx) => {
      const p = f.points[idx]
      return p && p.v >= 0.3 ? [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000] : [-1, -1]
    }))
  }
  return out
}
