import {
  changeThreshold,
  isRealChange,
  measureBetter,
  measureNumber,
  measureResult,
  measureUnit,
  seriesKey,
  type ClinicalMeasure,
} from '@/convex/helpers/clinicalMeasures'

export type NoteType = 'initial_assessment' | 'treatment_note' | 'follow_up'

export const NOTE_TYPES: { value: NoteType; label: string }[] = [
  { value: 'initial_assessment', label: 'Initial assessment' },
  { value: 'treatment_note', label: 'Treatment' },
  { value: 'follow_up', label: 'Follow-up' },
]

/** Every kind of note a patient's record can hold, including ones written elsewhere. */
export const NOTE_TYPE_LABELS: Record<string, string> = {
  initial_assessment: 'Initial assessment',
  treatment_note: 'Treatment',
  follow_up: 'Follow-up',
  discharge_summary: 'Discharge summary',
  follow_up_outreach: 'Follow-up call',
}

export const isEditableNoteType =(type: string): type is NoteType => NOTE_TYPES.some((t) => t.value === type)

/**
 * A clinical note as api.physioCare.getClinicalNotes returns it (newest first). Notes can come
 * from colleagues on the patient's care team: only the author edits one, but everyone's
 * measures count towards progress and re-testing.
 */
export type ClinicalNote = {
  _id: string
  sessionDate: number
  noteType: string
  subjectiveAssessment?: string
  objectiveAssessment?: string
  treatmentAdministered?: string
  planForNextSession?: string
  diagnosis?: string
  measures: ClinicalMeasure[]
  editedAt?: number | null
  voiceNote?: string | null
  attachments?: { url: string; contentType: string | null; size: number }[]
  /** Who wrote it, when the query says */
  authorName?: string | null
  /** Written by the signed-in physio (undefined on older query versions: treat as theirs) */
  mine?: boolean
  /** Drafted by the AI scribe, then reviewed and signed by the physio */
  aiAssisted?: boolean
}

/**
 * The notes from a getClinicalNotes result, newest first, whether it's a plain list or a page
 * ({ page } or { notes }). undefined while loading.
 */
export function readNotes(result: unknown): ClinicalNote[] | undefined {
  if (result === undefined) return undefined
  const list = Array.isArray(result)
    ? result
    : result && typeof result === 'object'
      ? ((result as { page?: unknown; notes?: unknown }).page ?? (result as { notes?: unknown }).notes)
      : null
  if (!Array.isArray(list)) return []
  return (list as ClinicalNote[])
    .map((n) => ({ ...n, measures: Array.isArray(n.measures) ? n.measures : [] }))
    .sort((a, b) => b.sessionDate - a.sessionDate)
}

/** A note being written or edited. Assessment is stored as the note's `diagnosis`. */
export type NoteDraft = {
  noteType: NoteType
  subjective: string
  objective: string
  assessment: string
  treatment: string
  plan: string
  measures: ClinicalMeasure[]
}

export const emptyDraft = (noteType: NoteType = 'treatment_note'): NoteDraft => ({
  noteType,
  subjective: '',
  objective: '',
  assessment: '',
  treatment: '',
  plan: '',
  measures: [],
})

export const draftHasContent = (draft: NoteDraft) =>
  draft.measures.length > 0 || [draft.subjective, draft.objective, draft.assessment, draft.treatment, draft.plan].some((t) => t.trim())

/** Whether two measures are the same, whatever order their fields are in (empty fields ignored). */
export function sameMeasure(a: ClinicalMeasure, b: ClinicalMeasure) {
  const canonical = (m: ClinicalMeasure) =>
    JSON.stringify(
      Object.keys(m)
        .filter((key) => m[key as keyof ClinicalMeasure] !== undefined)
        .sort()
        .map((key) => [key, m[key as keyof ClinicalMeasure]])
    )
  return canonical(a) === canonical(b)
}

/** Whether two drafts say the same thing (ignoring spaces at the ends and field order). */
export function sameDraft(a: NoteDraft, b: NoteDraft) {
  const text = (d: NoteDraft) => [d.noteType, d.subjective, d.objective, d.assessment, d.treatment, d.plan].map((t) => t.trim()).join('\u0000')
  return text(a) === text(b) && a.measures.length === b.measures.length && a.measures.every((m, i) => sameMeasure(m, b.measures[i]))
}

/** `measures` with `incoming` added: one with the same id replaces it, the rest go on the end. */
export function mergeMeasures(measures: ClinicalMeasure[], incoming: ClinicalMeasure[]) {
  const byId = new Map(incoming.map((m) => [m.id, m]))
  const merged = measures.map((m) => byId.get(m.id) ?? m)
  const known = new Set(measures.map((m) => m.id))
  return [...merged, ...incoming.filter((m) => !known.has(m.id))]
}

/** A measure form or re-test panel with entries not yet added to the note. */
export type PendingResult =
  | { kind: 'none' }
  | { kind: 'ok'; measures: ClinicalMeasure[] }
  | { kind: 'invalid'; message: string }

export type PendingHandle = {
  /** Entries ready to add; `quiet` skips showing the problem in the form */
  collect: (quiet?: boolean) => PendingResult
  /** Something has been entered */
  started: () => boolean
}

export function newMeasureId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/** A measure's value at an earlier visit. */
export type Previous = { value: number; date: number; measure: ClinicalMeasure }

/** The most recent earlier value of each measure, from notes written before `before`. */
export function previousBySeries(notes: ClinicalNote[] | undefined, before: number, skipNoteId?: string) {
  const previous = new Map<string, Previous>()
  for (const note of notes ?? []) {
    if (note._id === skipNoteId || note.sessionDate >= before) continue
    for (const measure of note.measures) {
      const key = seriesKey(measure)
      const value = measureNumber(measure)
      if (key === null || value === null) continue
      const known = previous.get(key)
      if (!known || known.date < note.sessionDate) previous.set(key, { value, date: note.sessionDate, measure })
    }
  }
  return previous
}

/** The latest note before `before` that recorded measures. */
export function lastMeasuredNote(notes: ClinicalNote[] | undefined, before: number, skipNoteId?: string) {
  return (notes ?? []).find((n) => n._id !== skipNoteId && n.sessionDate < before && n.measures.length > 0) ?? null
}

/** A measure to take again, with when it was last taken. */
export type RetestItem = { measure: ClinicalMeasure; date: number }

/** One re-test row per thing measured; a special test is one row per test and side, angle or not. */
export const retestKey = (m: ClinicalMeasure) =>
  m.kind === 'special_test' ? `test|${m.key}|${m.side ?? ''}` : (seriesKey(m) ?? `${m.kind}|${m.key}|${m.side ?? ''}`)

/**
 * What to re-test: the latest value of every measure taken before `before` (whoever took it),
 * split into those from the most recent measuring visit and older ones not repeated since.
 * Special tests without a number count once per test and side.
 */
export function retestItems(notes: ClinicalNote[] | undefined, before: number, skipNoteId?: string) {
  const latest = new Map<string, RetestItem>()
  for (const note of notes ?? []) {
    if (note._id === skipNoteId || note.sessionDate >= before) continue
    for (const measure of note.measures) {
      const key = retestKey(measure)
      const known = latest.get(key)
      if (!known || known.date < note.sessionDate) latest.set(key, { measure, date: note.sessionDate })
    }
  }
  const items = [...latest.values()].sort((a, b) => b.date - a.date)
  const lastDate = items[0]?.date ?? null
  return {
    lastDate,
    recent: items.filter((item) => item.date === lastDate),
    earlier: items.filter((item) => item.date !== lastDate),
  }
}

/**
 * better / worse: moved by more than the measure's minimal change, in its better direction.
 * noise: moved, but within measurement error. same: no change. moved: changed, and there's no
 * agreed threshold (your own measures).
 */
export type ChangeTone = 'better' | 'worse' | 'same' | 'noise' | 'moved'

export type Change = { text: string; tone: ChangeTone; /** Explains the tone, for a tooltip */ title: string }

export const CHANGE_TONES: Record<ChangeTone, string> = {
  better: 'bg-pt-green-bg text-pt-green-fg',
  worse: 'bg-pt-amber-bg text-pt-amber-fg',
  same: 'bg-pt-neutral-bg text-pt-muted',
  noise: 'bg-pt-neutral-bg text-pt-muted',
  moved: 'bg-pt-neutral-bg text-pt-ink',
}

/** The minimal change in words: "±5°", "±2", "a whole grade". */
export function thresholdText(measure: ClinicalMeasure, baseline: number): string | null {
  const graded = (measure.kind === 'strength' && measure.method !== 'dynamometer') || (measure.kind === 'outcome' && measure.key === 'mas')
  if (graded) return 'a whole grade'
  const threshold = changeThreshold(measure, baseline)
  if (!threshold) return null
  return `${Math.round(threshold.amount * 100) / 100}${measureUnit(measure)}`
}

/** How a measure moved since an earlier value: "↑15°", "↓2", or the earlier grade for MMT and Ashworth. */
export function changeSince(measure: ClinicalMeasure, previous: Previous | undefined): Change | null {
  const value = measureNumber(measure)
  if (!previous || value === null) return null
  const diff = Math.round((value - previous.value) * 100) / 100
  if (diff === 0) return { text: 'No change', tone: 'same', title: 'No change' }
  const better = measureBetter(measure) === 'higher' ? diff > 0 : diff < 0
  const graded = (measure.kind === 'strength' && measure.method !== 'dynamometer') || (measure.kind === 'outcome' && measure.key === 'mas')
  const text = graded
    ? `${diff > 0 ? '↑' : '↓'} from ${measureResult(previous.measure)}`
    : `${diff > 0 ? '↑' : '↓'}${Math.abs(diff)}${measureUnit(measure)}`
  const real = isRealChange(measure, previous.value, value)
  const threshold = thresholdText(measure, previous.value)
  if (real === null) return { text, tone: 'moved', title: 'No agreed minimal change for this measure, so it isn’t marked better or worse.' }
  if (!real) return { text, tone: 'noise', title: `Within measurement error: a real change is at least ${threshold}.` }
  return { text, tone: better ? 'better' : 'worse', title: `${better ? 'Better' : 'Worse'} by more than the minimal change (${threshold}).` }
}

/** One measure across visits, oldest point first. */
export type SeriesPoint = { date: number; value: number; measure: ClinicalMeasure; noteId: string }
export type Series = { key: string; latest: ClinicalMeasure; first: ClinicalMeasure; points: SeriesPoint[] }

/**
 * Every measure recorded at two or more visits, most recently measured first. A visit that
 * measured the same thing twice counts once (its last value).
 */
export function buildSeries(notes: ClinicalNote[] | undefined, minPoints = 2): Series[] {
  const byKey = new Map<string, Series>()
  for (const note of [...(notes ?? [])].sort((a, b) => a.sessionDate - b.sessionDate)) {
    for (const measure of note.measures) {
      const key = seriesKey(measure)
      const value = measureNumber(measure)
      if (key === null || value === null) continue
      const point = { date: note.sessionDate, value, measure, noteId: note._id }
      const series = byKey.get(key)
      if (!series) {
        byKey.set(key, { key, first: measure, latest: measure, points: [point] })
        continue
      }
      const last = series.points[series.points.length - 1]
      if (last.noteId === note._id) series.points[series.points.length - 1] = point
      else series.points.push(point)
      if (series.points.length === 1) series.first = measure
      series.latest = measure
    }
  }
  return [...byKey.values()]
    .filter((s) => s.points.length >= minPoints)
    .sort((a, b) => b.points[b.points.length - 1].date - a.points[a.points.length - 1].date)
}
