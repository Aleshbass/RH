/**
 * Exercise names as said in a session matched to the exercise library, and doses as said turned
 * into numbers. Pure (no database), shared by Rehabify Scribe on the server (scribeDraft.ts, which
 * drafts the home programme) and in the browser (components/physio/notes/scribe/scribeTools.ts).
 * Tested in scripts/scribe-draft.test.ts and scripts/scribe-programme.test.ts.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Names
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

/** Names close enough to count as the same exercise */
export const MATCH_THRESHOLD = 0.5

/**
 * Each exercise heard matched to the closest library exercise (each library one used once), or
 * left unmatched when nothing is close enough. The physio confirms every match before sending.
 */
export function matchExercises<T extends { name: string }>(heard: HeardExercise[], library: T[], threshold = MATCH_THRESHOLD) {
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

/** The library exercises most like a name, best first ("Pick a similar one"). */
export function similarExercises<T extends { name: string }>(name: string, library: T[], limit = 5, floor = 0.2): T[] {
  return library
    .map((entry) => ({ entry, score: nameScore(name, entry.name) }))
    .filter((s) => s.score >= floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry)
}

/** The library exercise with exactly this name (any case, spacing or punctuation), or undefined. */
export function exactExercise<T extends { name: string }>(name: string, library: T[]): T | undefined {
  const key = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const wanted = key(name)
  return wanted ? library.find((entry) => key(entry.name) === wanted) : undefined
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

  const frequency = parseFrequency(t)
  if (frequency) out.frequency = frequency
  for (const key of Object.keys(out) as (keyof Dosage)[]) if (out[key] === undefined) delete out[key]
  return out
}

/** "twice a day" → "Twice a day"; the usual ways of saying how often, or undefined. */
export function parseFrequency(text?: string): string | undefined {
  if (!text) return undefined
  const t = text.toLowerCase()
  if (/\b(?:twice|two times) (?:a|per) day\b/.test(t)) return 'Twice a day'
  if (/\b(?:three|3) times (?:a|per) day\b/.test(t)) return '3 times a day'
  if (/\bevery other day\b|\balternate days\b/.test(t)) return 'Every other day'
  if (/\b(?:once (?:a|per) day|daily|every day|each day)\b/.test(t)) return 'Once a day'
  const week = t.match(new RegExp(`${NUM}\\s*times\\s*(?:a|per)\\s*week`))
  if (week && toNumber(week[1])) return `${toNumber(week[1])} times a week`
  return undefined
}
