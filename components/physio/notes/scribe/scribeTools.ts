/**
 * Small, pure helpers for the AI scribe in the browser (tested in scripts/scribe-draft.test.ts):
 * - encodeWav: 16-bit mono samples to a WAV file, for the backup transcription mode;
 * - matchExercises, parseDosage (from convex/helpers/exerciseMatch.ts, shared with the server): names
 *   heard matched to the library, and "3 sets of 10, hold 5 seconds, twice a day" as numbers;
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
// Exercises heard → the library, and doses as said (shared with the server)
// ─────────────────────────────────────────────────────────────────────────────

export {
  exactExercise,
  matchExercises,
  nameScore,
  nameTokens,
  parseDosage,
  parseFrequency,
  similarExercises,
  type Dosage,
  type HeardExercise,
} from '@/convex/helpers/exerciseMatch'
import type { Dosage } from '@/convex/helpers/exerciseMatch'

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
