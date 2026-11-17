/**
 * The home programme Rehabify Scribe drafted, as the physio reviews it at sign-off, and what
 * "Approve and send" sends. Pure (no React), tested in scripts/scribe-programme.test.ts.
 *
 * - reviewFromDraft: the draft as editable rows. A row the AI tied to the current programme stays
 *   tied only while that programme is still the current one.
 * - fillBlanks: "Fill in the usual dose": blanks only, from the library (or the current programme).
 * - buildProgrammeSend: which call to make (create, add to the current programme, or update it)
 *   with the items exactly as exercisePrograms accepts them, or the first thing to fix.
 */
import type { Id } from '@/convex/_generated/dataModel'
import type { ScribeProgramme, ScribeProgrammeItem } from '@/convex/helpers/scribeDraft'

/** Keep in step with MAX_ITEMS and the dose ranges in convex/exercisePrograms.ts */
export const MAX_PROGRAMME_ITEMS = 30
const RANGES = { sets: [1, 10], reps: [1, 50], hold: [1, 120] } as const

export type ReviewRow = {
  key: string
  action: ScribeProgrammeItem['action']
  /** The exercise as it was said */
  heard: string
  include: boolean
  /** The library (or own) exercise it's matched to */
  exerciseId: Id<'exercises'> | null
  /** The library name when matched, else the name as said */
  name: string
  /** Its place in the current programme (change, continue, stop) */
  fromIndex?: number
  side: 'L' | 'R' | 'both' | null
  sets: number | null
  reps: number | null
  hold: number | null
  frequency: string
  /** Time-based exercises ("20 minutes"), as said */
  duration: string
  /** The dose as said, to compare */
  dosage?: string
  match: ScribeProgrammeItem['match']
  /** Not in the library: send it as written, without a demonstration */
  asWritten: boolean
}

export type ProgrammeReview = {
  /** Send a programme at all */
  include: boolean
  /** Update (or add to) the current programme, or start a new one */
  target: 'update' | 'new'
  title: string
  /** Written instructions for the patient */
  note: string
  rows: ReviewRow[]
}

/** What the builder needs to know about a library exercise */
export type LibraryLike = {
  _id: Id<'exercises'>
  name: string
  sided?: boolean
  defaults: { sets: number; reps: number; holdSeconds: number | null; frequency: string }
}

/** The current programme as the care team sees it (exercisePrograms.listForPatient) */
export type CurrentLike = {
  _id: Id<'exercisePrograms'>
  title: string
  note: string | null
  goals: string[]
  items: {
    index: number
    kind: 'exercise' | 'education'
    exerciseId: Id<'exercises'> | null
    name: string
    custom: boolean
    side: 'L' | 'R' | null
    sets: number | null
    reps: number | null
    holdSeconds: number | null
    frequency: string | null
    note: string | null
    resourceKey: string | null
  }[]
}

/** One item as exercisePrograms accepts it (itemFields), with its old place when updating */
export type PayloadItem = {
  exerciseId?: Id<'exercises'>
  kind?: 'exercise' | 'education'
  name?: string
  side?: 'L' | 'R'
  sets?: number
  reps?: number
  holdSeconds?: number
  frequency?: string
  note?: string
  resourceKey?: string
  fromIndex?: number
}

export type ProgrammeSend =
  | { kind: 'none' }
  | { kind: 'error'; message: string; rowKey?: string }
  | { kind: 'create'; title: string; note?: string; items: PayloadItem[] }
  | { kind: 'add'; programId: Id<'exercisePrograms'>; title: string; note?: string; items: PayloadItem[] }
  | { kind: 'update'; programId: Id<'exercisePrograms'>; title: string; note: string; goals: string[]; items: PayloadItem[] }

let rowCounter = 0
const nextKey = () => `sp${++rowCounter}`

/** The draft as rows to review. `current` is the patient's current programme now (null if none). */
export function reviewFromDraft(programme: ScribeProgramme, current: { _id: string } | null): ProgrammeReview {
  // The AI's "change / continue / stop" only stand while that programme is still the current one
  const sameCurrent = Boolean(current && programme.currentProgrammeId && current._id === programme.currentProgrammeId)
  const rows: ReviewRow[] = []
  for (const item of programme.items) {
    let action = item.action
    if (!sameCurrent && action !== 'new') {
      if (action === 'stop') continue
      action = 'new'
    }
    const tied = action !== 'new'
    rows.push({
      key: nextKey(),
      action,
      heard: item.heard,
      include: action !== 'continue',
      exerciseId: item.exerciseId ?? null,
      name: item.name,
      ...(tied && item.fromIndex !== undefined ? { fromIndex: item.fromIndex } : {}),
      side: item.side ?? null,
      sets: item.sets ?? null,
      reps: item.reps ?? null,
      hold: item.holdSeconds ?? null,
      frequency: item.frequency ?? '',
      duration: item.duration ?? '',
      dosage: item.dosage,
      match: tied ? 'current' : item.match === 'current' ? 'none' : item.match,
      asWritten: false,
    })
  }
  const duration = programme.duration.trim()
  return {
    include: rows.some((r) => r.include),
    target: current ? 'update' : 'new',
    title: programme.title.trim() || 'Home exercises',
    note: [programme.note.trim(), duration ? `Keep going for ${duration}.` : ''].filter(Boolean).join('\n'),
    rows,
  }
}

const clampTo = (value: number | null | undefined, [lo, hi]: readonly [number, number]) =>
  typeof value === 'number' && Number.isFinite(value) && value >= lo ? Math.min(hi, Math.round(value)) : null

/** Blanks filled with the usual dose: the library's defaults, or the current programme's for exercises already in it. */
export function fillBlanks(review: ProgrammeReview, library: Map<string, LibraryLike>, current: CurrentLike | null): ProgrammeReview {
  return {
    ...review,
    rows: review.rows.map((row) => {
      const was = row.fromIndex !== undefined ? current?.items.find((i) => i.index === row.fromIndex) : undefined
      const entry = row.exerciseId ? library.get(row.exerciseId) : undefined
      // Something done for a time ("walk for 20 minutes"): once, for that long
      const timed = !was && !entry && Boolean(row.duration.trim())
      const usual = {
        sets: clampTo(was?.sets, RANGES.sets) ?? clampTo(entry?.defaults.sets, RANGES.sets) ?? (timed ? 1 : 3),
        reps: clampTo(was?.reps, RANGES.reps) ?? clampTo(entry?.defaults.reps, RANGES.reps) ?? (timed ? 1 : 10),
        hold: clampTo(was?.holdSeconds, RANGES.hold) ?? clampTo(entry?.defaults.holdSeconds, RANGES.hold),
        frequency: was?.frequency?.trim() || entry?.defaults.frequency?.trim() || 'Once a day',
      }
      return {
        ...row,
        sets: row.sets ?? usual.sets,
        reps: row.reps ?? usual.reps,
        hold: row.hold ?? usual.hold,
        frequency: row.frequency.trim() || usual.frequency,
      }
    }),
  }
}

/** Rows that still need the physio: not in the library and not resolved yet. */
export function unresolvedRows(review: ProgrammeReview) {
  return review.rows.filter((r) => r.include && r.action === 'new' && !r.exerciseId && !r.asWritten)
}

/** What each row sends. Throws the message to show when something needs fixing. */
function rowItems(row: ReviewRow, library: Map<string, LibraryLike>): PayloadItem[] {
  const label = row.name || row.heard
  const entry = row.exerciseId ? library.get(row.exerciseId) : undefined
  if (!row.exerciseId && !row.asWritten && row.fromIndex === undefined) {
    throw new RowError(`“${row.heard}” isn’t in your library. Pick a similar one, add your own, send it as written, or untick it.`, row.key)
  }
  const sets = clampTo(row.sets, RANGES.sets)
  const reps = clampTo(row.reps, RANGES.reps)
  if (sets === null || reps === null) throw new RowError(`Add sets and reps for ${label}, or tap “Fill in the usual dose”.`, row.key)
  if (!row.frequency.trim()) throw new RowError(`Say how often for ${label}, or tap “Fill in the usual dose”.`, row.key)
  if (entry?.sided && !row.side) throw new RowError(`Choose a side for ${label}.`, row.key)
  const hold = row.hold === null ? undefined : (clampTo(row.hold, RANGES.hold) ?? undefined)
  const dose: PayloadItem = {
    sets,
    reps,
    ...(hold !== undefined ? { holdSeconds: hold } : {}),
    frequency: row.frequency.trim().slice(0, 60),
    ...(row.duration.trim() ? { note: `Duration: ${row.duration.trim()}`.slice(0, 1000) } : {}),
  }
  const what: PayloadItem = row.exerciseId ? { exerciseId: row.exerciseId } : { name: label.slice(0, 120) }
  // Sides only for exercises done on one side at a time (the server ignores them otherwise)
  const sided = entry ? Boolean(entry.sided) : row.side !== null
  if (sided && row.side === 'both') return [{ ...what, ...dose, side: 'L' }, { ...what, ...dose, side: 'R' }]
  return [{ ...what, ...dose, ...(sided && row.side && row.side !== 'both' ? { side: row.side } : {}) }]
}

class RowError extends Error {
  constructor(message: string, readonly rowKey?: string) {
    super(message)
  }
}

/** An item of the current programme sent back unchanged (updateProgram needs the whole list). */
function keptItem(item: CurrentLike['items'][number]): PayloadItem {
  if (item.kind === 'education') {
    return { kind: 'education', name: item.name, ...(item.note ? { note: item.note } : {}), ...(item.resourceKey ? { resourceKey: item.resourceKey } : {}), fromIndex: item.index }
  }
  return {
    ...(item.exerciseId && !item.custom ? { exerciseId: item.exerciseId } : { name: item.name }),
    ...(item.side ? { side: item.side } : {}),
    sets: clampTo(item.sets, RANGES.sets) ?? 3,
    reps: clampTo(item.reps, RANGES.reps) ?? 10,
    ...(clampTo(item.holdSeconds, RANGES.hold) !== null ? { holdSeconds: clampTo(item.holdSeconds, RANGES.hold)! } : {}),
    frequency: item.frequency?.trim() || 'Once a day',
    ...(item.note ? { note: item.note } : {}),
    fromIndex: item.index,
  }
}

/**
 * What "Approve and send" does with the programme. `current` is the patient's current programme
 * (the one the review's "update" means), or null.
 */
export function buildProgrammeSend(review: ProgrammeReview, library: Map<string, LibraryLike>, current: CurrentLike | null): ProgrammeSend {
  if (!review.include) return { kind: 'none' }
  const rows = review.rows.filter((r) => r.include && r.action !== 'continue')
  try {
    const updating = review.target === 'update' && current !== null
    if (!updating) {
      // A new programme: everything ticked except "stop", at the dose shown
      const items = rows.filter((r) => r.action !== 'stop').flatMap((r) => rowItems(r, library))
      if (!items.length) return { kind: 'none' }
      if (!review.title.trim()) return { kind: 'error', message: 'Give the programme a title.' }
      if (items.length > MAX_PROGRAMME_ITEMS) return { kind: 'error', message: `A programme can have up to ${MAX_PROGRAMME_ITEMS} items (this one has ${items.length}).` }
      return { kind: 'create', title: review.title.trim().slice(0, 120), ...(review.note.trim() ? { note: review.note.trim() } : {}), items }
    }

    const tied = (r: ReviewRow) => r.fromIndex !== undefined && current.items.some((i) => i.index === r.fromIndex)
    const changes = rows.filter((r) => r.action === 'change' && tied(r))
    const stops = new Set(rows.filter((r) => r.action === 'stop' && tied(r)).map((r) => r.fromIndex!))
    // New exercises, and changes to one no longer in the programme (sent as new)
    const news = rows.filter((r) => r.action === 'new' || (r.action === 'change' && !tied(r))).flatMap((r) => rowItems(r, library))

    if (!changes.length && !stops.size) {
      if (!news.length) return { kind: 'none' }
      if (current.items.length + news.length > MAX_PROGRAMME_ITEMS) {
        return { kind: 'error', message: `“${current.title}” would have ${current.items.length + news.length} items; the most is ${MAX_PROGRAMME_ITEMS}. Start a new programme instead.` }
      }
      return { kind: 'add', programId: current._id, title: current.title, ...(review.note.trim() ? { note: review.note.trim() } : {}), items: news }
    }

    const changed = new Map(changes.map((r) => [r.fromIndex!, r]))
    const items: PayloadItem[] = []
    for (const item of current.items) {
      if (stops.has(item.index)) continue
      const change = changed.get(item.index)
      if (!change) {
        items.push(keptItem(item))
        continue
      }
      // The same exercise at the new dose; the patient's logs stay with it
      const kept = keptItem(item)
      const [fresh] = rowItems({ ...change, side: change.side === 'both' ? null : (change.side ?? item.side), exerciseId: kept.exerciseId ?? null, name: item.name, asWritten: !kept.exerciseId }, library)
      items.push({ ...fresh, ...(kept.exerciseId ? { exerciseId: kept.exerciseId } : { name: item.name }), ...(fresh.note ? {} : item.note ? { note: item.note } : {}), fromIndex: item.index })
    }
    items.push(...news)
    if (!items.length) return { kind: 'error', message: `That would leave “${current.title}” empty. Untick “stop” on one exercise, or archive the programme from the patient’s Exercises tab.` }
    if (items.length > MAX_PROGRAMME_ITEMS) return { kind: 'error', message: `“${current.title}” would have ${items.length} items; the most is ${MAX_PROGRAMME_ITEMS}.` }
    const note = [current.note?.trim() ?? '', review.note.trim()].filter(Boolean).join('\n\n')
    return { kind: 'update', programId: current._id, title: current.title, note, goals: current.goals, items }
  } catch (error) {
    if (error instanceof RowError) return { kind: 'error', message: error.message, rowKey: error.rowKey }
    throw error
  }
}

/** One line on what will happen, for the Approve button area */
export function sendSummary(send: ProgrammeSend): string | null {
  switch (send.kind) {
    case 'create':
      return `New programme “${send.title}” with ${send.items.length} exercise${send.items.length === 1 ? '' : 's'}`
    case 'add':
      return `${send.items.length} exercise${send.items.length === 1 ? '' : 's'} added to “${send.title}”`
    case 'update':
      return `“${send.title}” updated`
    default:
      return null
  }
}
