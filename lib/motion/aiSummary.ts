/**
 * The AI weekly summary of camera-coach sessions (convex/cameraInsights.ts): what the model is told,
 * what it is given and how its answer is read. Pure, so it can be tested without a network.
 *
 * The model gets numbers only: per-session counts, scores, ranges, tempo, pain scores and the
 * rule-based flags (lib/motion/insights.ts). No names, no dates of birth, no free-text notes. It
 * drafts; the physio decides. It is told never to diagnose or to change the plan itself.
 */
import { exerciseFlags, sessionStats, type InsightSession } from './insights'

export type SummaryTone = 'good' | 'watch' | 'concern'
export type CameraSummary = {
  headline: string
  points: { text: string; basis: string; tone: SummaryTone }[]
  suggestions: string[]
}

export type SummaryExercise = {
  name: string
  sessions: (InsightSession & { programId?: string })[] // oldest first
}

const DAY = 86_400_000

export const SUMMARY_SYSTEM_PROMPT = `You help a physiotherapist review a patient's home exercise sessions recorded with a phone-camera coach (pose estimation).

Write a short weekly summary the physiotherapist can read in 30 seconds and paste into a clinical note.

About the data:
- "range" is degrees the main joint moved from the patient's own start position, per rep, estimated from a phone camera. It is about 5-10 degrees uncertain and seated knee angles read straighter than they are. Compare the patient with themselves over time; never compare with normal values.
- "form" and "score" are the app's 0-100 movement-quality scores, guidance not measurement.
- "pain" is what the patient reported (0-10) straight after the session; null means they didn't say.
- "flags" are fixed rules already applied to the numbers; you may mention them.
- Sessions marked thisWeek:true are the week being summarised; the others are background.

Rules:
- Every point must state the numbers it rests on in "basis" (e.g. "range 48° → 61° over 5 sessions; pain 3 → 2").
- Do not diagnose, do not name conditions, do not give a prognosis.
- Do not change the plan. Suggestions are options for the physiotherapist, each starting with "Consider" (e.g. "Consider adding a set if pain stays at 3 or below.").
- If the data is thin (fewer than 3 sessions this week, or no ranges), say so plainly and keep it short.
- If pain is 7 or more, or rising with falling range, put that first with tone "concern".
- Plain British English, short sentences, no jargon the patient's GP wouldn't know, no exclamation marks.

Reply with one JSON object only:
{"headline": "one sentence, at most 25 words",
 "points": [{"text": "one sentence", "basis": "the numbers", "tone": "good" | "watch" | "concern"}],
 "suggestions": ["Consider ..."]}
At most 5 points and 3 suggestions.`

const r1 = (n: number) => Math.round(n * 10) / 10

/** The numbers the model sees, as compact JSON. `now` marks which sessions are this week. */
export function summaryInput(exercises: SummaryExercise[], now: number): string {
  const weekStart = now - 7 * DAY
  const data = exercises
    .filter((e) => e.sessions.length > 0)
    .map((e) => {
      const sessions = e.sessions.slice(-20)
      const first = sessions[0]
      return {
        exercise: e.name.slice(0, 80),
        joint: first.measure?.joint ?? null,
        side: first.side === 'L' ? 'left' : 'right',
        flags: exerciseFlags(sessions).map((f) => `${f.title}: ${f.detail}`),
        sessions: sessions.map((s) => {
          const st = sessionStats(s)
          return {
            daysAgo: r1((now - s.createdAt) / DAY),
            thisWeek: s.createdAt >= weekStart,
            reps: `${s.repsCounted}/${s.repsTarget}`,
            shortReps: s.partialReps,
            form: s.averageScore,
            score: s.rehabifyScore,
            rangeAvg: st.rangeAvg,
            rangeBest: st.rangeBest,
            rangeSpread: st.rangeSpread,
            secondsPerRep: st.tempoAvg,
            formDropLastSet: st.fatigueDrop,
            rangeDropLastSet: st.rangeFade,
            pain: s.pain?.score ?? null,
            difficulty: s.pain?.difficulty ?? null,
          }
        }),
      }
    })
  return JSON.stringify({ unitsNote: 'range in degrees, scores 0-100, pain 0-10', exercises: data })
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Reads the model's reply strictly; null when it isn't usable. */
export function parseSummary(text: string): CameraSummary | null {
  let raw: unknown
  try {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const headline = clip(o.headline, 240)
  if (!headline) return null
  const points = (Array.isArray(o.points) ? o.points : [])
    .map((p) => {
      const q = (p ?? {}) as Record<string, unknown>
      const tone: SummaryTone = q.tone === 'good' || q.tone === 'concern' ? q.tone : 'watch'
      return { text: clip(q.text, 300), basis: clip(q.basis, 200), tone }
    })
    .filter((p) => p.text)
    .slice(0, 5)
  const suggestions = (Array.isArray(o.suggestions) ? o.suggestions : [])
    .map((s) => clip(s, 240))
    .filter(Boolean)
    // Options for the physio, never orders
    .map((s) => (/^consider\b/i.test(s) ? s : `Consider: ${s.charAt(0).toLowerCase()}${s.slice(1)}`))
    .slice(0, 3)
  return { headline, points, suggestions }
}

/** The summary as plain text, to paste into a note. */
export function summaryAsText(s: CameraSummary): string {
  const lines = [`Camera coach summary (AI draft, checked by me): ${s.headline}`]
  for (const p of s.points) lines.push(`- ${p.text}${p.basis ? ` (${p.basis})` : ''}`)
  if (s.suggestions.length) lines.push('Plan considerations:', ...s.suggestions.map((x) => `- ${x}`))
  lines.push('Angles are phone-camera estimates (about ±5–10°).')
  return lines.join('\n')
}
