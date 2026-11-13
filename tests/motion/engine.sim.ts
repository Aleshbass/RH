/**
 * Simulated camera sessions for the camera coach's rep engine (lib/motion). A stick figure seen
 * side-on is moved through good reps, half reps and common mistakes, with camera jitter added and
 * the same smoothing as the app; the counts, cues and scores must come out right.
 *
 *   npx tsx tests/motion/engine.sim.ts
 */
import { motionExercise, type CueCode } from '../../lib/motion/exercises'
import type { Frame, Point } from '../../lib/motion/pose'
import { SessionTracker } from '../../lib/motion/session'
import { FrameSmoother } from '../../lib/motion/smoothing'

type V = { x: number; y: number }
type Body = { shoulder: V; elbow: V; wrist: V; hip: V; knee: V; ankle: V; ear: V; nose: V }

const FPS = 25
const rad = (d: number) => (d * Math.PI) / 180
const add = (a: V, len: number, dirDeg: number): V => ({ x: a.x + len * Math.sin(rad(dirDeg)), y: a.y + len * Math.cos(rad(dirDeg)) })

// Seeded jitter so every run is the same
let seed = 7
function noise(sd: number) {
  const r = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  return sd * Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r())
}

/** 33 MediaPipe points for a body facing +x, near side left; the far side is fainter. */
function frameOf(b: Body, t: number, jitter = 0.004): Frame {
  const points: Point[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, v: 0.1 }))
  const put = (i: number, p: V, v: number, dz: number) => {
    points[i] = { x: p.x + noise(jitter), y: p.y + noise(jitter), z: dz, v }
  }
  const pairs: [keyof Body, number, number][] = [
    ['shoulder', 11, 12], ['elbow', 13, 14], ['wrist', 15, 16], ['hip', 23, 24], ['knee', 25, 26], ['ankle', 27, 28], ['ear', 7, 8],
  ]
  for (const [k, l, r] of pairs) {
    put(l, b[k], 0.95, -0.1)
    put(r, { x: b[k].x + 0.01, y: b[k].y }, 0.75, 0.1)
  }
  put(0, b.nose, 0.95, -0.1)
  put(29, { x: b.ankle.x - 0.04, y: b.ankle.y + 0.02 }, 0.9, -0.1) // heel behind the ankle
  put(31, { x: b.ankle.x + 0.1, y: b.ankle.y + 0.03 }, 0.9, -0.1) // toes in front
  put(30, { x: b.ankle.x - 0.03, y: b.ankle.y + 0.02 }, 0.7, 0.1)
  put(32, { x: b.ankle.x + 0.11, y: b.ankle.y + 0.03 }, 0.7, 0.1)
  return { t, points }
}

function head(shoulder: V, lean: number): Pick<Body, 'ear' | 'nose'> {
  const ear = add(shoulder, 0.08, 180 - lean)
  return { ear, nose: { x: ear.x + 0.05, y: ear.y + 0.01 } }
}

// Sit to stand: ankle fixed, shin vertical; knee angle K (90 seated, 175 standing), trunk lean L
function sitToStand(K: number, L: number): Body {
  const ankle = { x: 0.6, y: 0.92 }
  const knee = { x: ankle.x, y: ankle.y - 0.2 }
  const hip = { x: knee.x - 0.2 * Math.sin(rad(K)), y: knee.y + 0.2 * Math.cos(rad(K)) }
  const shoulder = add(hip, 0.25, 180 - L)
  const elbow = add(shoulder, 0.14, 100)
  return { shoulder, elbow, wrist: add(elbow, 0.13, 100), hip, knee, ankle, ...head(shoulder, L) }
}

// Seated knee extension: thigh on the seat (rising by `thigh` degrees), knee angle K, trunk lean L
function kneeExtension(K: number, thigh = 0, L = 0): Body {
  const hip = { x: 0.4, y: 0.6 }
  const knee = { x: hip.x + 0.2 * Math.cos(rad(thigh)), y: hip.y - 0.2 * Math.sin(rad(thigh)) }
  const ankle = { x: knee.x + 0.2 * Math.sin(rad(K - 90 + thigh)), y: knee.y + 0.2 * Math.cos(rad(K - 90 + thigh)) }
  const shoulder = add(hip, 0.25, 180 - L)
  const elbow = add(shoulder, 0.14, 10)
  return { shoulder, elbow, wrist: add(elbow, 0.13, 30), hip, knee, ankle, ...head(shoulder, L) }
}

// Shoulder flexion standing: arm raised F degrees, elbow bent E (0 = straight), trunk lean L
function shoulderFlexion(F: number, E = 0, L = 0): Body {
  const ankle = { x: 0.5, y: 0.95 }
  const knee = { x: 0.5, y: 0.75 }
  const hip = { x: 0.5, y: 0.55 }
  const shoulder = add(hip, 0.25, 180 - L)
  const elbow = add(shoulder, 0.14, F)
  return { shoulder, elbow, wrist: add(elbow, 0.13, F + E), hip, knee, ankle, ...head(shoulder, L) }
}

// Mini squat from standing: ankle fixed, shin and thigh fold evenly to knee angle K, trunk leans with them
function squat(K: number): Body {
  const a = (180 - K) / 2
  const ankle = { x: 0.5, y: 0.95 }
  const knee = add(ankle, 0.2, 180 - a)
  const hip = add(knee, 0.2, 180 + a)
  const lean = a * 0.6
  const shoulder = add(hip, 0.25, 180 - lean)
  const elbow = add(shoulder, 0.14, 90)
  return { shoulder, elbow, wrist: add(elbow, 0.13, 90), hip, knee, ankle, ...head(shoulder, lean) }
}

type Key = { t: number; body: Body }
/** Frames easing between key poses (times in seconds). */
function* play(keys: Key[], lerp: (a: Body, b: Body, f: number) => Body) {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    const n = Math.max(1, Math.round((b.t - a.t) * FPS))
    for (let j = 0; j < n; j++) {
      const f = 0.5 - 0.5 * Math.cos((Math.PI * j) / n)
      yield { t: (a.t + ((b.t - a.t) * j) / n) * 1000, body: lerp(a.body, b.body, f) }
    }
  }
}

function lerpBody(a: Body, b: Body, f: number): Body {
  const out = {} as Body
  for (const k of Object.keys(a) as (keyof Body)[]) out[k] = { x: a[k].x + (b[k].x - a[k].x) * f, y: a[k].y + (b[k].y - a[k].y) * f }
  return out
}

/** Angle-space interpolation: build bodies from interpolated parameters. */
function reps(
  make: (p: number[]) => Body,
  rest: number[],
  top: number[],
  times: { up: number; hold: number; down: number; pause: number },
  count: number,
  jitter = 0.004,
  dropout = 0
) {
  const keys: { t: number; p: number[] }[] = [{ t: 0, p: rest }]
  let t = 1
  keys.push({ t, p: rest })
  for (let i = 0; i < count; i++) {
    keys.push({ t: (t += times.up), p: top })
    keys.push({ t: (t += times.hold), p: top })
    keys.push({ t: (t += times.down), p: rest })
    keys.push({ t: (t += times.pause), p: rest })
  }
  const frames: Frame[] = []
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    const n = Math.max(1, Math.round((b.t - a.t) * FPS))
    for (let j = 0; j < n; j++) {
      const f = 0.5 - 0.5 * Math.cos((Math.PI * j) / n)
      const p = a.p.map((v, k) => v + (b.p[k] - v) * f)
      const frame = frameOf(make(p), (a.t + ((b.t - a.t) * j) / n) * 1000, jitter)
      // Some frames lose the knee and ankle (walked behind the chair leg, a blur...)
      if (dropout && Math.abs(noise(1)) < dropout) for (const i of [25, 27]) frame.points[i] = { ...frame.points[i], v: 0.2 }
      frames.push(frame)
    }
  }
  return frames
}
void play
void lerpBody

type Case = {
  name: string
  exercise: string
  frames: Frame[]
  sets?: number
  reps?: number
  expectReps: number
  expectPartials?: number
  expectCue?: CueCode
  noCues?: boolean
  minScore?: number
  maxScore?: number
}

const STS = (p: number[]) => sitToStand(p[0], p[1])
const KE = (p: number[]) => kneeExtension(p[0], p[1], p[2])
const SF = (p: number[]) => shoulderFlexion(p[0], p[1], p[2])
const SQ = (p: number[]) => squat(p[0])

const cases: Case[] = [
  { name: 'sit to stand: 5 good reps', exercise: 'sit-to-stand', frames: reps(STS, [90, 8], [176, 2], { up: 1.6, hold: 0.8, down: 2.2, pause: 1 }, 5), expectReps: 5, noCues: true, minScore: 85 },
  { name: 'sit to stand: 3 half reps', exercise: 'sit-to-stand', frames: reps(STS, [90, 8], [132, 25], { up: 1.2, hold: 0.4, down: 1.4, pause: 1 }, 3), expectReps: 0, expectPartials: 3, expectCue: 'sts_stand_tall' },
  { name: 'sit to stand: drops down fast', exercise: 'sit-to-stand', frames: reps(STS, [90, 8], [176, 2], { up: 1.6, hold: 0.8, down: 0.5, pause: 1 }, 4), expectReps: 4, expectCue: 'sts_slow_down' },
  { name: 'sit to stand: still bent forward at the top', exercise: 'sit-to-stand', frames: reps(STS, [90, 8], [172, 34], { up: 1.6, hold: 0.8, down: 2.2, pause: 1 }, 4), expectReps: 4, expectCue: 'sts_chest_up' },
  { name: 'knee extension: 5 good reps with a hold', exercise: 'seated-knee-extension', frames: reps(KE, [90, 0, 0], [174, 4, 0], { up: 1.4, hold: 2, down: 1.8, pause: 1 }, 5), expectReps: 5, noCues: true, minScore: 85 },
  { name: 'knee extension: no hold', exercise: 'seated-knee-extension', frames: reps(KE, [90, 0, 0], [174, 4, 0], { up: 1.2, hold: 0, down: 1.5, pause: 1 }, 4), expectReps: 4, expectCue: 'ke_hold' },
  { name: 'knee extension: thigh lifts off the chair', exercise: 'seated-knee-extension', frames: reps(KE, [90, 0, 0], [172, 28, 0], { up: 1.4, hold: 2, down: 1.8, pause: 1 }, 4), expectReps: 4, expectCue: 'ke_thigh_down' },
  { name: 'knee extension: leans back', exercise: 'seated-knee-extension', frames: reps(KE, [90, 0, 0], [174, 4, -22], { up: 1.4, hold: 2, down: 1.8, pause: 1 }, 4), expectReps: 4, expectCue: 'ke_sit_tall' },
  { name: 'knee extension: half way only', exercise: 'seated-knee-extension', frames: reps(KE, [90, 0, 0], [140, 0, 0], { up: 1.2, hold: 1, down: 1.5, pause: 1 }, 3), expectReps: 0, expectPartials: 3, expectCue: 'ke_straighten' },
  { name: 'shoulder flexion: 5 good reps', exercise: 'shoulder-flexion', frames: reps(SF, [8, 0, 0], [162, 0, 0], { up: 2, hold: 0.5, down: 2.2, pause: 0.8 }, 5), expectReps: 5, noCues: true, minScore: 85 },
  { name: 'shoulder flexion: bent elbows', exercise: 'shoulder-flexion', frames: reps(SF, [8, 0, 0], [158, 55, 0], { up: 2, hold: 0.5, down: 2.2, pause: 0.8 }, 4), expectReps: 4, expectCue: 'sf_elbows' },
  { name: 'shoulder flexion: leans back at the top', exercise: 'shoulder-flexion', frames: reps(SF, [8, 0, 0], [160, 0, -16], { up: 2, hold: 0.5, down: 2.2, pause: 0.8 }, 4), expectReps: 4, expectCue: 'sf_no_arch' },
  { name: 'shoulder flexion: only to shoulder height', exercise: 'shoulder-flexion', frames: reps(SF, [8, 0, 0], [92, 0, 0], { up: 1.5, hold: 0.5, down: 1.5, pause: 0.8 }, 3), expectReps: 0, expectPartials: 3, expectCue: 'sf_higher' },
  { name: 'sit to stand: 8 reps, heavy jitter', exercise: 'sit-to-stand', frames: reps(STS, [90, 8], [176, 2], { up: 1.6, hold: 0.8, down: 2.2, pause: 1 }, 8, 0.012), expectReps: 8 },
  { name: 'knee extension: 6 reps, joints dropping out', exercise: 'seated-knee-extension', frames: reps(KE, [90, 0, 0], [174, 4, 0], { up: 1.4, hold: 2, down: 1.8, pause: 1 }, 6, 0.006, 0.25), expectReps: 6 },
  // Bending movements: the target angle is below the rest angle
  { name: 'mini squat: 5 good reps', exercise: 'mini-squat', frames: reps(SQ, [174], [130], { up: 1.4, hold: 0.6, down: 1.4, pause: 0.8 }, 5), expectReps: 5, noCues: true, minScore: 85 },
  { name: 'mini squat: barely bending', exercise: 'mini-squat', frames: reps(SQ, [174], [158], { up: 1.2, hold: 0.4, down: 1.2, pause: 0.8 }, 3), expectReps: 0, expectPartials: 3, expectCue: 'squat_lower' },
  { name: 'mini squat: drops down fast', exercise: 'mini-squat', frames: reps(SQ, [174], [130], { up: 0.3, hold: 0.6, down: 1.4, pause: 0.8 }, 4), expectReps: 4, expectCue: 'slow_down' },
  { name: 'sit to stand: 2 sets of 3', exercise: 'sit-to-stand', frames: reps(STS, [90, 8], [176, 2], { up: 1.6, hold: 0.8, down: 2.2, pause: 1 }, 6), sets: 2, reps: 3, expectReps: 6, noCues: true },
]

let failed = 0
for (const c of cases) {
  const exercise = motionExercise(c.exercise)!
  const smoother = new FrameSmoother()
  const smoothed = c.frames.map((f) => smoother.smooth(f))
  // Rest angle from the first second, as the countdown does
  const firstSecond = smoothed.filter((f) => f.t < 1000).map((f) => exercise.primary(f, 'L')).filter((a): a is number => a !== null)
  const rest = firstSecond.sort((a, b) => a - b)[Math.floor(firstSecond.length / 2)] ?? null
  const session = new SessionTracker(exercise, 'L', { sets: c.sets ?? 1, reps: c.reps ?? 99 }, null, rest)
  const cues = new Set<CueCode>()
  for (const f of smoothed) {
    for (const e of session.onFrame(f)) {
      if (e.type === 'partial') cues.add(e.cue)
      if (e.type === 'rep') e.rep.mistakes.forEach((m) => cues.add(m))
      if (e.type === 'set-done' && session.set < session.plan.sets) session.nextSet()
    }
  }
  const s = session.summary()
  const problems: string[] = []
  if (s.repsCounted !== c.expectReps) problems.push(`reps ${s.repsCounted} (want ${c.expectReps})`)
  if (c.expectPartials !== undefined && s.partialReps !== c.expectPartials) problems.push(`partials ${s.partialReps} (want ${c.expectPartials})`)
  if (c.expectCue && !cues.has(c.expectCue)) problems.push(`no "${c.expectCue}" cue`)
  if (c.noCues && cues.size) problems.push(`unexpected cues: ${[...cues].join(', ')}`)
  if (c.minScore !== undefined && s.averageScore < c.minScore) problems.push(`score ${s.averageScore} < ${c.minScore}`)
  if (c.maxScore !== undefined && s.averageScore > c.maxScore) problems.push(`score ${s.averageScore} > ${c.maxScore}`)
  // Per-rep measurements for the physio: one entry per counted rep, ranges that moved
  const m = s.measure
  if ([m.ranges, m.peakAngles, m.repSeconds, m.repSets].some((xs) => xs.length !== s.repsCounted)) problems.push(`measure has ${m.ranges.length} reps`)
  if (s.repsCounted > 0 && Math.min(...m.ranges) < 10) problems.push(`a range of ${Math.min(...m.ranges)}°`)
  if (m.repSeconds.some((x) => x <= 0)) problems.push('a rep with no time')
  if (problems.length) failed++
  console.log(
    `${problems.length ? 'FAIL' : 'ok  '} ${c.name.padEnd(48)} reps ${s.repsCounted}/${c.expectReps} partials ${s.partialReps} score ${s.averageScore} rehabify ${s.rehabifyScore} sets ${s.setsDone} range ${m.ranges.length ? Math.round(m.ranges.reduce((x, y) => x + y, 0) / m.ranges.length) : '-'}° cues [${[...cues].join(' ')}]${problems.length ? '  <- ' + problems.join('; ') : ''}`
  )
}
console.log(failed ? `\n${failed} of ${cases.length} cases failed` : `\nall ${cases.length} cases passed`)
process.exit(failed ? 1 : 0)
