/**
 * Outcome maths shared by Convex (convex/outcomes.ts) and the dashboards. Plain TypeScript.
 *
 * Pain is the 0–10 numeric rating scale (NPRS). A drop of 2 points or more is the smallest change
 * patients notice (the MCID, Farrar et al. 2001), so that is what "meaningful" means here.
 * Patients who started below 2 can't show a meaningful drop and are left out of that percentage.
 */

export const PAIN_MCID = 2

export type PainPoint = {
  at: number
  pain: number
  /** Who gave the score: the patient (link, app, check-in) or the physio typing it in. */
  by: 'patient' | 'physio'
  moment?: string
  appointmentId?: string
}

export function median(values: number[]): number | null {
  const sorted = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return Math.round(value * 10) / 10
}

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}

export function isMeaningfulDrop(baseline: number, latest: number) {
  return baseline - latest >= PAIN_MCID
}

/**
 * A course of care's first and latest pain. The first score is the earliest one; the latest is
 * the final (discharge) score when there is one, else the most recent. Within a single visit,
 * "after the session" relief isn't counted as the course's latest: it needs a later day.
 */
export function courseChange(points: PainPoint[], finalPain?: number | null) {
  const sorted = [...points].sort((a, b) => a.at - b.at)
  const first = sorted[0]
  if (!first) return null
  let latest: PainPoint | undefined
  if (typeof finalPain === 'number') latest = { at: Infinity, pain: finalPain, by: 'patient', moment: 'discharge' }
  else {
    const later = sorted.filter((p) => p.at - first.at >= 2 * 86_400_000 && p.moment !== 'post_session')
    latest = later[later.length - 1] ?? undefined
  }
  if (!latest) return { baseline: first.pain, latest: null, change: null, meaningful: null, points: sorted.length }
  const change = first.pain - latest.pain
  return {
    baseline: first.pain,
    latest: latest.pain,
    change,
    meaningful: first.pain >= PAIN_MCID ? isMeaningfulDrop(first.pain, latest.pain) : null,
    points: sorted.length,
  }
}

/** Pain before vs after the same visit, where both were given. */
export function sessionPairs(points: PainPoint[]) {
  const byVisit = new Map<string, { before?: PainPoint; after?: PainPoint }>()
  for (const p of points) {
    if (!p.appointmentId) continue
    const row = byVisit.get(p.appointmentId) ?? {}
    if (p.moment === 'pre_session' || p.moment === 'intake') row.before = p
    if (p.moment === 'post_session') row.after = p
    byVisit.set(p.appointmentId, row)
  }
  return [...byVisit.entries()]
    .filter(([, r]) => r.before && r.after)
    .map(([appointmentId, r]) => ({ appointmentId, at: r.before!.at, before: r.before!.pain, after: r.after!.pain }))
    .sort((a, b) => a.at - b.at)
}

/** Weekly pain for a chart: the last score of each week since the first one. */
export function weeklyPain(points: PainPoint[]) {
  const sorted = [...points].sort((a, b) => a.at - b.at)
  if (sorted.length === 0) return []
  const start = sorted[0].at
  const weeks = new Map<number, number>()
  for (const p of sorted) weeks.set(Math.floor((p.at - start) / (7 * 86_400_000)), p.pain)
  return [...weeks.entries()].map(([week, pain]) => ({ week: week + 1, pain }))
}

export type CourseRow = {
  completed: boolean
  baseline: number | null
  latest: number | null
  meaningful: boolean | null
  sessions: number
  rating: number | null
  region: Region
}

export type OutcomeSummary = ReturnType<typeof summarise>

/** The physio's figures across their finished courses of care (active ones are counted apart). */
export function summarise(rows: CourseRow[], pairs: { before: number; after: number }[]) {
  const finished = rows.filter((r) => r.completed)
  const scored = finished.filter((r) => r.baseline !== null && r.latest !== null)
  const judged = scored.filter((r) => r.meaningful !== null)
  const active = rows.filter((r) => !r.completed)
  const activeScored = active.filter((r) => r.baseline !== null && r.latest !== null)
  const ratings = rows.map((r) => r.rating).filter((n): n is number => typeof n === 'number')
  const regions = [...new Set(scored.map((r) => r.region))]
  return {
    courses: rows.length,
    finished: finished.length,
    scored: scored.length,
    completionRate: percent(scored.length, finished.length),
    baselineMedian: median(scored.map((r) => r.baseline!)),
    latestMedian: median(scored.map((r) => r.latest!)),
    changeMedian: median(scored.map((r) => r.baseline! - r.latest!)),
    meaningfulPct: percent(judged.filter((r) => r.meaningful).length, judged.length),
    sessionsMedian: median(finished.map((r) => r.sessions).filter((n) => n > 0)),
    activeCourses: active.length,
    activeScored: activeScored.length,
    activeChangeMedian: median(activeScored.map((r) => r.baseline! - r.latest!)),
    ratingAverage: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    ratingCount: ratings.length,
    sessionPairs: pairs.length,
    sessionReliefMedian: median(pairs.map((p) => p.before - p.after)),
    byRegion: regions
      .map((region) => {
        const inRegion = scored.filter((r) => r.region === region)
        const judgedHere = inRegion.filter((r) => r.meaningful !== null)
        return {
          region,
          courses: inRegion.length,
          changeMedian: median(inRegion.map((r) => r.baseline! - r.latest!)),
          meaningfulPct: percent(judgedHere.filter((r) => r.meaningful).length, judgedHere.length),
        }
      })
      .sort((a, b) => b.courses - a.courses),
  }
}

/** Public figures only from this many finished courses with scores, so one patient can't define a physio. */
export const PUBLIC_MIN_COURSES = 5

export const REGIONS = ['Back', 'Neck', 'Shoulder', 'Arm & hand', 'Hip', 'Knee', 'Ankle & foot', 'Neuro', 'Other'] as const
export type Region = (typeof REGIONS)[number]

const REGION_WORDS: [Region, RegExp][] = [
  ['Neuro', /\b(stroke|cva|hemipleg\w*|parkinson\w*|multiple sclerosis|spinal cord|cerebral palsy|neuro\w*|guillain|bell'?s palsy)\b/i],
  ['Back', /\b(back|lumbar|lbp|sciatica|spine|spinal|disc|thoracic|sacroiliac|si joint)\b/i],
  ['Neck', /\b(neck|cervical|whiplash)\b/i],
  ['Shoulder', /\b(shoulder|rotator|frozen|subacromial|supraspinatus|scapula\w*)\b/i],
  ['Arm & hand', /\b(elbow|wrist|hand|finger|thumb|carpal|tennis|golfer'?s|epicondyl\w*|de quervain)\b/i],
  ['Hip', /\b(hip|gluteal|gtps|groin|trochanter\w*)\b/i],
  ['Knee', /\b(knee|acl|pcl|menisc\w*|patell\w*|tka|tkr)\b/i],
  ['Ankle & foot', /\b(ankle|foot|feet|achilles|plantar|heel|toe)\b/i],
]

/** Body region from the physio's own words for what they're treating. */
export function regionOf(condition?: string | null): Region {
  if (!condition) return 'Other'
  for (const [region, words] of REGION_WORDS) if (words.test(condition)) return region
  return 'Other'
}
