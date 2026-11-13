import { RepEngine, type Reference, type RepResult } from './engine'
import type { CueCode, MotionExercise } from './exercises'
import type { SessionMeasure } from './insights'
import type { Frame, Side } from './pose'

/** Sets and reps of one session, from the programme. */
export type SessionPlan = { sets: number; reps: number }

export type SessionEvent =
  | { type: 'rep'; rep: RepResult; repInSet: number }
  | { type: 'partial'; cue: CueCode }
  | { type: 'set-done'; set: number; topMistake: CueCode | null }
  | { type: 'all-done' }

export type SessionSummary = {
  repsCounted: number
  repsTarget: number
  setsDone: number
  setsPlanned: number
  partialReps: number
  averageScore: number
  rehabifyScore: number
  repScores: number[]
  mistakes: { code: CueCode; count: number }[]
  /** The lowest-scoring reps (up to 3), with stick-figure frames for the physio */
  snapshots: { rep: number; score: number; mistakes: CueCode[]; frames: number[][] }[]
  /** The joint's angles per counted rep, for the physio's range and tempo trends (lib/motion/insights) */
  measure: SessionMeasure
}

/**
 * A whole session: sets of reps on one RepEngine, with the patient's results gathered for the
 * summary. The screen decides when to rest; this only follows the movement.
 */
export class SessionTracker {
  readonly engine: RepEngine
  set = 1
  repsThisSet = 0
  private reps: RepResult[] = []
  /** The set each counted rep was in */
  private repSets: number[] = []
  private partials = 0
  private setMistakes = new Map<CueCode, number>()
  private finished = false

  constructor(
    readonly exercise: MotionExercise,
    readonly side: Side,
    readonly plan: SessionPlan,
    reference: Reference | null,
    restAngle: number | null
  ) {
    this.engine = new RepEngine(exercise, side, restAngle, reference)
  }

  get done() {
    return this.finished
  }

  get repsCounted() {
    return this.reps.length
  }

  /** Feed a frame while the patient is exercising (not while resting between sets). */
  onFrame(frame: Frame): SessionEvent[] {
    if (this.finished) return []
    const out: SessionEvent[] = []
    for (const event of this.engine.update(frame)) {
      if (event.type === 'partial') {
        this.partials += 1
        this.bump(event.cue)
        out.push({ type: 'partial', cue: event.cue })
        continue
      }
      this.reps.push(event.rep)
      this.repSets.push(this.set)
      this.repsThisSet += 1
      for (const code of event.rep.mistakes) this.bump(code)
      out.push({ type: 'rep', rep: event.rep, repInSet: this.repsThisSet })
      if (this.repsThisSet >= this.plan.reps) {
        out.push({ type: 'set-done', set: this.set, topMistake: this.topOf(this.setMistakes) })
        this.setMistakes = new Map()
        if (this.set >= this.plan.sets) {
          this.finished = true
          out.push({ type: 'all-done' })
        }
      }
    }
    return out
  }

  /** After the rest: start the next set. */
  nextSet() {
    if (this.finished) return
    this.set += 1
    this.repsThisSet = 0
  }

  private bump(code: CueCode) {
    this.setMistakes.set(code, (this.setMistakes.get(code) ?? 0) + 1)
  }

  private topOf(counts: Map<CueCode, number>) {
    let best: CueCode | null = null
    let n = 0
    for (const [code, count] of counts) {
      if (count > n) {
        best = code
        n = count
      }
    }
    return best
  }

  summary(): SessionSummary {
    const scores = this.reps.map((r) => r.score)
    const target = this.plan.sets * this.plan.reps
    const counts = new Map<CueCode, number>()
    for (const r of this.reps) for (const m of r.mistakes) counts.set(m, (counts.get(m) ?? 0) + 1)
    if (this.partials) counts.set(this.exercise.partialCue, (counts.get(this.exercise.partialCue) ?? 0) + this.partials)
    const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    const completion = target ? Math.min(1, this.reps.length / target) : 0
    const setsDone = this.finished ? this.plan.sets : this.set - 1 + (this.repsThisSet >= this.plan.reps ? 1 : 0)
    return {
      repsCounted: this.reps.length,
      repsTarget: target,
      setsDone,
      setsPlanned: this.plan.sets,
      partialReps: this.partials,
      averageScore: average,
      rehabifyScore: scores.length ? Math.round(0.75 * average + 25 * completion) : 0,
      repScores: scores,
      mistakes: [...counts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
      snapshots: [...this.reps]
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
        .filter((r) => r.snapshot.length > 0)
        .map((r) => ({ rep: r.index, score: r.score, mistakes: r.mistakes, frames: r.snapshot })),
      measure: {
        joint: this.exercise.primaryJoint,
        startAngle: Math.round(this.engine.startAngle),
        peakAngles: this.reps.map((r) => Math.round(r.stats.peakAngle)),
        ranges: this.reps.map((r) => Math.round(Math.abs(r.stats.peakAngle - this.engine.startAngle))),
        repSeconds: this.reps.map((r) => Math.round(r.stats.activeMs / 100) / 10),
        repSets: [...this.repSets],
      },
    }
  }
}
