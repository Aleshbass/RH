/**
 * Checking and scoring questionnaire answers. Plain TypeScript, used by the server
 * (convex/questionnaires.ts scores every submission itself) and by the forms (live preview).
 * The rules per instrument are documented in instruments.ts.
 */
import { PSFS_MAX_ACTIVITIES, PSFS_MAX_ACTIVITY_LENGTH, itemScale } from './instruments'
import { NOT_APPLICABLE, type AnswerValue, type InstrumentDef, type PsfsActivity, type ScoreResult, type SubscaleScore } from './types'

const round1 = (n: number) => Math.round(n * 10) / 10

/** Thrown when answers don't fit the instrument; the message is safe to show to the person. */
export class AnswerError extends Error {}

/** Whether an answer counts towards the score. */
export const isAnswered = (value: AnswerValue | undefined): value is number => typeof value === 'number' && value >= 0

/** True if a value is on the item's scale. */
function onScale(def: InstrumentDef, index: number, value: number) {
  if (!Number.isInteger(value)) return false
  const scale = itemScale(def, index)
  return scale.kind === 'numeric' ? value >= scale.min && value <= scale.max : scale.options.some((o) => o.value === value)
}

/**
 * Checks answers against the instrument and returns them in stored form.
 * - `complete`: every item needs an answer (or "doesn't apply" where the instrument allows it).
 *   Patients submit complete forms; physios entering a paper form may leave items blank.
 */
export function cleanAnswers(def: InstrumentDef, answers: readonly (AnswerValue | undefined)[], complete: boolean): AnswerValue[] {
  if (def.kind !== 'items') throw new AnswerError(`${def.short} has no fixed questions.`)
  if (answers.length > def.items.length) throw new AnswerError('Too many answers for this questionnaire.')
  return def.items.map((_, i) => {
    const value = answers[i]
    if (value === null || value === undefined) {
      if (complete) throw new AnswerError(`Please answer question ${i + 1}.`)
      return null
    }
    if (value === NOT_APPLICABLE) {
      if (!def.allowNotApplicable) throw new AnswerError(`Please answer question ${i + 1}.`)
      return NOT_APPLICABLE
    }
    if (!onScale(def, i, value)) throw new AnswerError(`Question ${i + 1} has an answer that isn’t on its scale.`)
    return value
  })
}

/** Draft answers: nothing required, and anything not on the scale is dropped instead of rejected. */
export function cleanDraftAnswers(def: InstrumentDef, answers: readonly (AnswerValue | undefined)[]): AnswerValue[] {
  if (def.kind !== 'items') return []
  return def.items.map((_, i) => {
    const value = answers[i]
    if (value === null || value === undefined) return null
    if (value === NOT_APPLICABLE) return def.allowNotApplicable ? NOT_APPLICABLE : null
    return onScale(def, i, value) ? value : null
  })
}

/**
 * PSFS activities: trimmed, 1 to 5, each named once. `complete` needs a 0–10 score for each.
 * `keep` are the activities from the last time, which must still be there (rated again).
 */
export function cleanPsfs(activities: readonly PsfsActivity[], complete: boolean, keep: readonly string[] = []): PsfsActivity[] {
  const seen = new Set<string>()
  const rows: PsfsActivity[] = []
  for (const row of activities) {
    const activity = row.activity.replace(/\s+/g, ' ').trim().slice(0, PSFS_MAX_ACTIVITY_LENGTH)
    if (!activity) {
      if (complete && row.score !== null) throw new AnswerError('Each score needs an activity name.')
      continue
    }
    const key = activity.toLowerCase()
    if (seen.has(key)) throw new AnswerError(`“${activity}” is listed twice.`)
    seen.add(key)
    let score = row.score
    if (score !== null && (!Number.isInteger(score) || score < 0 || score > 10)) {
      if (complete) throw new AnswerError(`Rate “${activity}” from 0 to 10.`)
      score = null
    }
    if (complete && score === null) throw new AnswerError(`Rate “${activity}” from 0 to 10.`)
    rows.push({ activity, score })
  }
  if (rows.length > PSFS_MAX_ACTIVITIES) throw new AnswerError(`List up to ${PSFS_MAX_ACTIVITIES} activities.`)
  if (complete) {
    if (rows.length === 0) throw new AnswerError('Add at least one activity and rate it.')
    for (const name of keep) {
      if (!seen.has(name.toLowerCase())) throw new AnswerError(`Please rate “${name}” again so your physio can compare.`)
    }
  }
  return rows
}

/** Sum of the answered items in a list of positions, and how many were answered. */
function tally(answers: readonly AnswerValue[], positions: readonly number[]) {
  let sum = 0
  let answered = 0
  for (const i of positions) {
    const value = answers[i]
    if (isAnswered(value)) {
      sum += value
      answered++
    }
  }
  return { sum, answered, missing: positions.length - answered }
}

const allPositions = (def: InstrumentDef) => def.items.map((_, i) => i)

function scoreLefs(def: InstrumentDef, answers: readonly AnswerValue[]): Pick<ScoreResult, 'total' | 'subscales'> {
  const all = tally(answers, allPositions(def))
  return { total: all.missing === 0 ? all.sum : null, subscales: [] }
}

function scoreSpadi(def: InstrumentDef, answers: readonly AnswerValue[]): Pick<ScoreResult, 'total' | 'subscales'> {
  // Max per item is 10. Unanswered items come out of the maximum; more than 2 in a subscale: no score.
  const subscales: SubscaleScore[] = def.subscales.map((s) => {
    const t = tally(answers, s.items)
    return { key: s.key, label: s.label, value: t.missing > 2 || t.answered === 0 ? null : round1((t.sum / (t.answered * 10)) * 100) }
  })
  if (subscales.some((s) => s.value === null)) return { total: null, subscales }
  const all = tally(answers, allPositions(def))
  return { total: round1((all.sum / (all.answered * 10)) * 100), subscales }
}

function scoreKoosHoos(def: InstrumentDef, answers: readonly AnswerValue[]): Pick<ScoreResult, 'total' | 'subscales'> {
  // 100 − mean item score × 25 (0–4 items), at least half the scale's items answered (Gandek 2019)
  const subscales: SubscaleScore[] = def.subscales.map((s) => {
    const t = tally(answers, s.items)
    return { key: s.key, label: s.label, value: t.answered * 2 < s.items.length || t.answered === 0 ? null : round1(100 - (t.sum / t.answered) * 25) }
  })
  const scored = subscales.map((s) => s.value)
  const total = scored.every((v): v is number => v !== null) ? round1(scored.reduce((a, b) => a + b, 0) / scored.length) : null
  return { total, subscales }
}

function scoreNprs(def: InstrumentDef, answers: readonly AnswerValue[]): Pick<ScoreResult, 'total' | 'subscales'> {
  const subscales: SubscaleScore[] = def.subscales.map((s) => {
    const value = answers[s.items[0]]
    return { key: s.key, label: s.label, value: isAnswered(value) ? value : null }
  })
  const all = tally(answers, allPositions(def))
  return { total: all.missing === 0 ? round1(all.sum / all.answered) : null, subscales }
}

/** Scores a set of answers. Answers should already be cleaned (cleanAnswers / cleanPsfs). */
export function scoreResponse(
  def: InstrumentDef,
  input: { answers?: readonly AnswerValue[]; psfs?: readonly PsfsActivity[] }
): ScoreResult {
  if (def.kind === 'psfs') {
    const rated = (input.psfs ?? []).filter((a): a is { activity: string; score: number } => a.score !== null)
    const missing = (input.psfs ?? []).length - rated.length
    return {
      total: rated.length > 0 ? round1(rated.reduce((n, a) => n + a.score, 0) / rated.length) : null,
      subscales: [],
      answered: rated.length,
      missing,
    }
  }
  const answers = input.answers ?? []
  const all = tally(answers, allPositions(def))
  const scored =
    def.key === 'lefs'
      ? scoreLefs(def, answers)
      : def.key === 'spadi'
        ? scoreSpadi(def, answers)
        : def.key === 'koos12' || def.key === 'hoos12'
          ? scoreKoosHoos(def, answers)
          : scoreNprs(def, answers)
  return { ...scored, answered: all.answered, missing: all.missing }
}

// ─────────────────────────────────────────────────────────────────────────────
// Showing scores and change
// ─────────────────────────────────────────────────────────────────────────────

/** "42 / 80", "31.5", "6.3 / 10"; an em dash when there's no score. */
export function scoreText(def: InstrumentDef, value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return def.range.max === 100 ? String(value) : `${value} / ${def.range.max}`
}

/** One line on which way is better, for tooltips and the patient's results. */
export function directionText(def: InstrumentDef): string {
  return `${def.range.min}–${def.range.max}, ${def.better} is better`
}

export type ScoreChange = {
  /** Signed change in points (latest − earlier) */
  delta: number
  tone: 'better' | 'worse' | 'same'
  /** At least the instrument's MCID, when it has one */
  meaningful: boolean
  /** "+7 points, better" */
  text: string
  /** Explains how the tone was decided, for a tooltip */
  title: string
}

/** How a score moved between two completions. */
export function compareScores(def: InstrumentDef, earlier: number | null | undefined, latest: number | null | undefined): ScoreChange | null {
  if (earlier === null || earlier === undefined || latest === null || latest === undefined) return null
  const delta = round1(latest - earlier)
  if (delta === 0) return { delta, tone: 'same', meaningful: false, text: 'No change', title: 'Same score as before.' }
  const improved = def.better === 'higher' ? delta > 0 : delta < 0
  const size = Math.abs(delta)
  const meaningful = def.mcid ? size >= def.mcid.value : false
  const points = `${delta > 0 ? '+' : '−'}${size} ${size === 1 ? 'point' : 'points'}`
  const mcid = def.mcid
    ? `${meaningful ? 'At least' : 'Less than'} the ${def.mcid.approximate ? 'approximate ' : ''}smallest change that matters to patients (${def.mcid.value} points; ${def.mcid.source}).`
    : 'No established smallest important change for this measure.'
  return {
    delta,
    tone: improved ? 'better' : 'worse',
    meaningful,
    text: `${points}, ${improved ? 'better' : 'worse'}`,
    title: `${def.short}: ${directionText(def)}. ${mcid}`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suggestions
// ─────────────────────────────────────────────────────────────────────────────

const BODY_PARTS: { pattern: RegExp; keys: InstrumentDef['key'][] }[] = [
  { pattern: /\b(knee|acl|pcl|mcl|menisc\w*|patell\w*|tka|tkr|quad\w*)\b/i, keys: ['koos12', 'lefs'] },
  { pattern: /\b(hip|tha|thr|fai|glute\w*|groin|trochanter\w*|labr\w*)\b/i, keys: ['hoos12', 'lefs'] },
  { pattern: /\b(ankle|foot|feet|achilles|plantar|calf|heel|hamstring\w*|shin|leg|lower limb)\b/i, keys: ['lefs'] },
  { pattern: /\b(shoulder|rotator|cuff|frozen|impingement|subacromial|ac joint|clavic\w*|scapul\w*)\b/i, keys: ['spadi'] },
]

/**
 * Questionnaires that fit a condition, from the words the physio used ("Right knee ACL
 * reconstruction" → KOOS-12, LEFS). PSFS and NPRS suit everyone, so they're always offered last.
 */
export function suggestInstruments(condition: string | null | undefined): InstrumentDef['key'][] {
  const keys: InstrumentDef['key'][] = []
  for (const part of BODY_PARTS) {
    if (condition && part.pattern.test(condition)) {
      for (const key of part.keys) if (!keys.includes(key)) keys.push(key)
    }
  }
  return [...keys, 'psfs', 'nprs']
}
