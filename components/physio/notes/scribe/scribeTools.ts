/**
 * Small, pure helpers for the AI scribe in the browser (tested in scripts/scribe-draft.test.ts):
 * - encodeWav: 16-bit mono samples to a WAV file, for the backup transcription mode;
 * - matchExercises: the exercises heard in the session matched to the exercise library by name;
 * - parseDosage: "3 sets of 10, hold 5 seconds, twice a day" to sets, reps, hold and how often;
 * - suggestedDate: the Lagos calendar date a follow-up "in N days" falls on;
 * - draftToNote: the AI's draft as the note editor's draft ("Not stated." sections left empty).
 */
import type { NoteDraft } from '@/components/physio/notes/progress'
import type { ScribeDraft } from '@/convex/helpers/scribeDraft'

export const SCRIBE_SAMPLE_RATE = 16000

/** A WAV file (PCM 16-bit mono) from blocks of samples. */
export function encodeWav(blocks: Int16Array[], sampleRate = SCRIBE_SAMPLE_RATE): ArrayBuffer {
  const samples = blocks.reduce((n, b) => n + b.length, 0)
  const buffer = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // bytes per second
  view.setUint16(32, 2, true) // bytes per sample frame
  view.setUint16(34, 16, true) // bits per sample
  text(36, 'data')
  view.setUint32(40, samples * 2, true)
  let offset = 44
  for (const block of blocks) {
    for (let i = 0; i < block.length; i++, offset += 2) view.setInt16(offset, block[i], true)
  }
  return buffer
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercises heard → the library
// ─────────────────────────────────────────────────────────────────────────────

/** Words physios say for the same thing, mapped to one form before comparing names. */
const SYNONYMS: [RegExp, string][] = [
  [/\bslr\b/g, 'straight leg raise'],
  [/\bquads?\b/g, 'quadriceps'],
  [/\bhams\b/g, 'hamstring'],
  [/\b(?:thera ?band|resistance band|band)\b/g, 'band'],
  [/\bheel raises?\b/g, 'calf raise'],
  [/\bclams?\b/g, 'clamshell'],
  [/\bsit to stand\b/g, 'sit stand'],
  [/\bsts\b/g, 'sit stand'],
  [/\bext(?:ernal)? rot(?:ation)?\b/g, 'external rotation'],
  [/\bint(?:ernal)? rot(?:ation)?\b/g, 'internal rotation'],
]
const FILLER = new Set(['exercise', 'exercises', 'the', 'a', 'an', 'and', 'with', 'of', 'on', 'for', 'to', 'your', 'in'])

const stem = (word: string) => word.replace(/(ing|es|s|e)$/, '')

export function nameTokens(name: string): string[] {
  let text = name.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ')
  for (const [pattern, replacement] of SYNONYMS) text = text.replace(pattern, replacement)
  return [...new Set(text.split(' ').filter((w) => w && !FILLER.has(w)).map(stem).filter(Boolean))]
}

/** How alike two exercise names are, 0 to 1 (shared words over all words, with a bonus for containment). */
export function nameScore(a: string, b: string): number {
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  if (!ta.length || !tb.length) return 0
  const setB = new Set(tb)
  const shared = ta.filter((t) => setB.has(t)).length
  const union = new Set([...ta, ...tb]).size
  const jaccard = shared / union
  const contained = shared === Math.min(ta.length, tb.length) ? 0.25 : 0
  return Math.min(1, jaccard + contained)
}

export type HeardExercise = { name: string; dosage?: string }

/**
 * Each exercise heard matched to the closest library exercise (each library one used once), or
 * left unmatched when nothing is close enough. The physio confirms every match before sending.
 */
export function matchExercises<T extends { name: string }>(heard: HeardExercise[], library: T[], threshold = 0.5) {
  const used = new Set<number>()
  const matched: { heard: HeardExercise; entry: T; score: number }[] = []
  const unmatched: HeardExercise[] = []
  for (const item of heard) {
    let best = -1
    let bestScore = 0
    library.forEach((entry, i) => {
      if (used.has(i)) return
      const score = nameScore(item.name, entry.name)
      if (score > bestScore) {
        best = i
        bestScore = score
      }
    })
    if (best >= 0 && bestScore >= threshold) {
      used.add(best)
      matched.push({ heard: item, entry: library[best], score: bestScore })
    } else unmatched.push(item)
  }
  return { matched, unmatched }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dosage as said → numbers
// ─────────────────────────────────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30 }
const toNumber = (text: string) => (/^\d+$/.test(text) ? Number(text) : NUMBER_WORDS[text.toLowerCase()])
const NUM = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty)'

export type Dosage = { sets?: number; reps?: number; holdSeconds?: number; frequency?: string }

/** Sets, reps, hold and how often from the words used ("3 x 10", "hold for 5 seconds", "twice a day"). */
export function parseDosage(text?: string): Dosage {
  if (!text) return {}
  const t = text.toLowerCase()
  const out: Dosage = {}
  const setsReps = t.match(new RegExp(`${NUM}\\s*(?:sets?\\s*(?:of\\s*)?|x|×|by)\\s*${NUM}`))
  if (setsReps) {
    out.sets = toNumber(setsReps[1])
    out.reps = toNumber(setsReps[2])
  } else {
    const sets = t.match(new RegExp(`${NUM}\\s*sets?\\b`))
    const reps = t.match(new RegExp(`${NUM}\\s*(?:reps?|repetitions)\\b`))
    if (sets) out.sets = toNumber(sets[1])
    if (reps) out.reps = toNumber(reps[1])
  }
  const hold = t.match(new RegExp(`hold(?:ing|s)?\\s*(?:it\\s*)?(?:for\\s*)?${NUM}\\s*(?:s\\b|secs?\\b|seconds?)`)) ?? t.match(new RegExp(`${NUM}\\s*(?:s|secs?|seconds?)\\s*hold`))
  if (hold) out.holdSeconds = toNumber(hold[1])

  if (/\b(?:twice|two times) (?:a|per) day\b/.test(t)) out.frequency = 'Twice a day'
  else if (/\b(?:three|3) times (?:a|per) day\b/.test(t)) out.frequency = '3 times a day'
  else if (/\bevery other day\b|\balternate days\b/.test(t)) out.frequency = 'Every other day'
  else if (/\b(?:once (?:a|per) day|daily|every day|each day)\b/.test(t)) out.frequency = 'Once a day'
  else {
    const week = t.match(new RegExp(`${NUM}\\s*times\\s*(?:a|per)\\s*week`))
    if (week && toNumber(week[1])) out.frequency = `${toNumber(week[1])} times a week`
  }
  for (const key of Object.keys(out) as (keyof Dosage)[]) if (out[key] === undefined) delete out[key]
  return out
}

type DoseDefaults = { sets: number; reps: number; holdSeconds: number | null; frequency: string }

/** A library exercise with the dosage that was said in place of its defaults. */
export function withDosage<T extends { defaults: DoseDefaults }>(entry: T, dosage: Dosage): T {
  return { ...entry, defaults: { ...entry.defaults, ...dosage } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dates and the editor
// ─────────────────────────────────────────────────────────────────────────────

const LAGOS_OFFSET = 60 * 60 * 1000

/** The Lagos calendar date (YYYY-MM-DD) `days` from now. */
export function suggestedDate(days: number, now = Date.now()): string {
  return new Date(now + days * 86_400_000 + LAGOS_OFFSET).toISOString().slice(0, 10)
}

const notStated = (text: string) => !text.trim() || /^not stated\.?$/i.test(text.trim())

/** The AI's draft as the editor's note. Sections the recording didn't cover stay empty; measures are suggestions, added one by one. */
export function draftToNote(draft: ScribeDraft, keepMeasures: NoteDraft['measures']): NoteDraft {
  const section = (text: string) => (notStated(text) ? '' : text)
  return {
    noteType: draft.noteType,
    subjective: section(draft.subjective),
    objective: section(draft.objective),
    assessment: section(draft.assessment),
    treatment: section(draft.treatment),
    plan: section(draft.plan),
    measures: keepMeasures,
  }
}
