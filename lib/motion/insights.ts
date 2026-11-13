/**
 * What camera-coach sessions say to a physiotherapist: the range a joint moved, how even and how
 * fast the reps were, whether form faded in later sets, how it all sits next to the pain the
 * patient reported, and plain flags with the numbers behind them.
 *
 * Pure functions with no imports: used by the physio's screen, by Convex (Needs attention) and by
 * the AI weekly summary, so all three say the same thing. Thresholds are listed in FLAG_RULES.
 *
 * The angles come from a phone camera (about 5-10° from the side, and seated knees read straighter
 * than they are), so ranges are estimates: compare one patient over time, not against norms.
 */

export type SessionMeasure = {
  /** The joint whose angle drives the rep count: knee, hip, shoulder or elbow */
  joint: string
  /** The patient's measured start position, in degrees */
  startAngle: number
  /** Joint angle at the top of each counted rep */
  peakAngles: number[]
  /** Degrees moved from the start to the top, per counted rep */
  ranges: number[]
  /** Seconds each counted rep took, start to start */
  repSeconds: number[]
  /** Which set each counted rep was in (1, 2, 3...) */
  repSets: number[]
}

export type SessionPain = { score: number | null; difficulty: string | null; note: string | null; at: number }

export type InsightSession = {
  createdAt: number
  itemIndex: number
  exerciseKey: string
  side: 'L' | 'R'
  repsCounted: number
  repsTarget: number
  partialReps: number
  averageScore: number
  rehabifyScore: number
  repScores: number[]
  measure?: SessionMeasure | null
  pain?: SessionPain | null
}

export type SessionStats = {
  /** Average and best range moved, degrees; null for sessions saved before ranges were kept */
  rangeAvg: number | null
  rangeBest: number | null
  /** How much the range varied rep to rep (standard deviation, degrees) */
  rangeSpread: number | null
  /** Average seconds per rep */
  tempoAvg: number | null
  /** Form score of the first set minus the last set; positive = got worse */
  fatigueDrop: number | null
  /** Range of the first set minus the last set, degrees; positive = got shorter */
  rangeFade: number | null
  /** Share of attempts that fell short of a counted rep */
  shortShare: number
}

export type FlagTone = 'red' | 'amber' | 'green'
export type FlagCode =
  | 'pain_high'
  | 'pain_rising'
  | 'range_drop'
  | 'range_gain'
  | 'short_reps'
  | 'fatigue'
  | 'score_drop'
  | 'ready_to_progress'

export type Flag = { code: FlagCode; tone: FlagTone; title: string; detail: string }

/** The rules behind the flags, in one place so the screen can explain them. */
export const FLAG_RULES = {
  painHigh: 7, // pain reported after the latest session, out of 10
  painRise: 2, // points above the average of the 3 sessions before
  rangeChange: 10, // degrees, average range vs the earlier best (drop) or the first session (gain)
  shortShare: 0.3, // of attempts, with at least 3 short ones
  fatigue: 15, // form-score points lost between the first and last set
  scoreDrop: 15, // Rehabify Score points below the average of the 3 sessions before
  progressScore: 85, // two sessions in a row at or above this, with low pain and no short reps
  progressPain: 3,
} as const

const round = (n: number, dp = 0) => {
  const f = 10 ** dp
  return Math.round(n * f) / f
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const sd = (xs: number[]) => {
  const m = mean(xs)
  if (m === null || xs.length < 2) return null
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

export function sessionStats(s: InsightSession): SessionStats {
  const ranges = s.measure?.ranges ?? []
  const sets = s.measure?.repSets ?? []
  const attempts = s.repsCounted + s.partialReps
  let fatigueDrop: number | null = null
  let rangeFade: number | null = null
  if (sets.length === s.repScores.length && sets.length > 0) {
    const first = Math.min(...sets)
    const last = Math.max(...sets)
    if (last > first) {
      const scoreOf = (set: number) => mean(s.repScores.filter((_, i) => sets[i] === set))
      const rangeOf = (set: number) => mean(ranges.filter((_, i) => sets[i] === set))
      const a = scoreOf(first)
      const b = scoreOf(last)
      if (a !== null && b !== null) fatigueDrop = round(a - b)
      const ra = rangeOf(first)
      const rb = rangeOf(last)
      if (ranges.length === sets.length && ra !== null && rb !== null) rangeFade = round(ra - rb)
    }
  }
  const tempo = mean(s.measure?.repSeconds ?? [])
  const spread = sd(ranges)
  return {
    rangeAvg: ranges.length ? round(mean(ranges)!) : null,
    rangeBest: ranges.length ? round(Math.max(...ranges)) : null,
    rangeSpread: spread === null ? null : round(spread),
    tempoAvg: tempo === null ? null : round(tempo, 1),
    fatigueDrop,
    rangeFade,
    shortShare: attempts > 0 ? s.partialReps / attempts : 0,
  }
}

/**
 * Pain reported for each session: the exercise log for the same programme item saved from a few
 * minutes before to an hour after it (the patient is asked straight after a session).
 */
export function pairPain<S extends { programId: string; itemIndex: number; createdAt: number }>(
  sessions: S[],
  logs: { programId: string; itemIndex: number; createdAt: number; painScore?: number | null; difficulty?: string | null; note?: string | null }[]
): (SessionPain | null)[] {
  const used = new Set<number>()
  return sessions.map((s) => {
    let best = -1
    let bestGap = Infinity
    logs.forEach((log, i) => {
      if (used.has(i) || log.programId !== s.programId || log.itemIndex !== s.itemIndex) return
      const gap = log.createdAt - s.createdAt
      if (gap < -5 * 60_000 || gap > 60 * 60_000) return
      if (Math.abs(gap) < bestGap) {
        best = i
        bestGap = Math.abs(gap)
      }
    })
    if (best < 0) return null
    used.add(best)
    const log = logs[best]
    return { score: log.painScore ?? null, difficulty: log.difficulty ?? null, note: log.note ?? null, at: log.createdAt }
  })
}

/** "knee", "shoulder"... as a word for sentences. */
export const jointWord = (joint: string | undefined) => (joint && /^[a-z]+$/.test(joint) ? joint : 'joint')

/**
 * Flags for one exercise (one programme item), from its sessions oldest first. Red: act now.
 * Amber: worth a look. Green: good news, including "ready to progress".
 */
export function exerciseFlags(sessions: InsightSession[]): Flag[] {
  if (sessions.length === 0) return []
  const flags: Flag[] = []
  const latest = sessions[sessions.length - 1]
  const before = sessions.slice(0, -1)
  const stats = sessions.map(sessionStats)
  const now = stats[stats.length - 1]
  const joint = jointWord(latest.measure?.joint)
  const R = FLAG_RULES

  const pain = latest.pain?.score ?? null
  if (pain !== null && pain >= R.painHigh) {
    flags.push({ code: 'pain_high', tone: 'red', title: `Pain ${pain}/10 after the last session`, detail: latest.pain?.note ? `“${latest.pain.note}”` : 'Reported straight after the exercise.' })
  }
  const earlierPain = before.slice(-3).map((s) => s.pain?.score).filter((p): p is number => typeof p === 'number')
  const earlierPainAvg = mean(earlierPain)
  if (pain !== null && pain < R.painHigh && earlierPainAvg !== null && pain >= earlierPainAvg + R.painRise) {
    flags.push({ code: 'pain_rising', tone: 'amber', title: 'Pain is rising', detail: `${round(earlierPainAvg, 1)}/10 on average before, ${pain}/10 now.` })
  }

  const earlierRanges = stats.slice(0, -1).map((s) => s.rangeAvg).filter((r): r is number => r !== null)
  if (now.rangeAvg !== null && earlierRanges.length > 0) {
    const best = Math.max(...earlierRanges)
    const first = earlierRanges[0]
    if (now.rangeAvg <= best - R.rangeChange) {
      flags.push({ code: 'range_drop', tone: 'amber', title: `${cap(joint)} range down ${best - now.rangeAvg}°`, detail: `Best earlier session averaged ${best}°, the latest ${now.rangeAvg}°.` })
    } else if (now.rangeAvg >= first + R.rangeChange && !(pain !== null && earlierPainAvg !== null && pain > earlierPainAvg)) {
      flags.push({ code: 'range_gain', tone: 'green', title: `${cap(joint)} range up ${now.rangeAvg - first}°`, detail: `From ${first}° in the first session to ${now.rangeAvg}° now.` })
    }
  }

  if (now.shortShare >= R.shortShare && latest.partialReps >= 3) {
    flags.push({
      code: 'short_reps',
      tone: 'amber',
      title: 'Many reps fell short',
      detail: `${latest.partialReps} of ${latest.repsCounted + latest.partialReps} attempts didn't reach the full movement.`,
    })
  }
  if (now.fatigueDrop !== null && now.fatigueDrop >= R.fatigue) {
    flags.push({
      code: 'fatigue',
      tone: 'amber',
      title: 'Form faded in later sets',
      detail: `Form score ${now.fatigueDrop} points lower in the last set${now.rangeFade && now.rangeFade >= 5 ? `, range ${now.rangeFade}° shorter` : ''}.`,
    })
  }
  const earlierScores = before.slice(-3).map((s) => s.rehabifyScore)
  const earlierScoreAvg = mean(earlierScores)
  if (earlierScoreAvg !== null && latest.rehabifyScore <= earlierScoreAvg - R.scoreDrop) {
    flags.push({ code: 'score_drop', tone: 'amber', title: 'Rehabify Score dropped', detail: `${round(earlierScoreAvg)} on average before, ${latest.rehabifyScore} now.` })
  }

  const lastTwo = sessions.slice(-2)
  if (
    lastTwo.length === 2 &&
    lastTwo.every((s) => s.rehabifyScore >= R.progressScore && s.partialReps === 0 && s.repsCounted >= s.repsTarget) &&
    lastTwo.every((s) => s.pain?.score === null || s.pain?.score === undefined || s.pain.score <= R.progressPain) &&
    !flags.some((f) => f.tone !== 'green')
  ) {
    flags.push({
      code: 'ready_to_progress',
      tone: 'green',
      title: 'Ready to progress?',
      detail: `Two full sessions in a row scoring ${R.progressScore}+ with pain ${R.progressPain}/10 or less. Consider more load, reps or the next exercise.`,
    })
  }

  const order: Record<FlagTone, number> = { red: 0, amber: 1, green: 2 }
  return flags.sort((a, b) => order[a.tone] - order[b.tone])
}

function cap(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
