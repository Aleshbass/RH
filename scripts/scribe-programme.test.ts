/**
 * Checks for the home programme Rehabify Scribe drafts from a session (no Convex, no network):
 *   npx tsx scripts/scribe-programme.test.ts
 * All names and numbers below are made up.
 */
import assert from 'node:assert/strict'
import type { Id } from '../convex/_generated/dataModel'
import { parseFrequency, similarExercises } from '../convex/helpers/exerciseMatch'
import { parseScribeDraft, programmeLine, SCRIBE_SYSTEM_PROMPT, scribeUserPrompt, type CurrentProgramme, type LibraryCandidate } from '../convex/helpers/scribeDraft'
import {
  buildProgrammeSend,
  fillBlanks,
  reviewFromDraft,
  unresolvedRows,
  type CurrentLike,
  type LibraryLike,
} from '../components/physio/notes/scribe/scribeProgramme'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const ex = (id: string) => id as Id<'exercises'>
const LIB: LibraryCandidate[] = [
  { id: ex('e_slr'), name: 'Straight Leg Raise', sided: true },
  { id: ex('e_bridge'), name: 'Glute Bridge' },
  { id: ex('e_calf'), name: 'Calf Raise' },
  { id: ex('e_clam'), name: 'Clamshell', sided: true },
  { id: ex('e_wall'), name: 'Wall Slide' },
]
const CURRENT: CurrentProgramme = {
  programmeId: 'p_knee' as Id<'exercisePrograms'>,
  title: 'Knee programme',
  items: [
    { index: 0, name: 'Straight Leg Raise', exerciseId: ex('e_slr'), side: 'L' },
    // index 1 is an education item, left out of what the AI sees
    { index: 2, name: 'Glute Bridge', exerciseId: ex('e_bridge') },
    { index: 3, name: 'Towel squeeze' },
  ],
}
const reply = (programme: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ noteType: 'treatment_note', subjective: 'Knee better.', objective: 'Not stated.', assessment: 'Not stated.', treatment: 'Not stated.', plan: 'Not stated.', measures: [], programme, redFlags: [], missing: [], carePlan: null, ...extra })
const parse = (programme: unknown, current: CurrentProgramme | null = CURRENT) =>
  parseScribeDraft(reply(programme), { idPrefix: 't', firstVisit: false, library: LIB, current })

console.log('prompt')

test('asks for the programme, with the library and the current programme', () => {
  assert.ok(SCRIBE_SYSTEM_PROMPT.includes('"programme"'))
  assert.ok(SCRIBE_SYSTEM_PROMPT.includes('Never fill in typical doses'))
  assert.ok(SCRIBE_SYSTEM_PROMPT.includes('EXACT name from "Exercise library"'))
  const prompt = scribeUserPrompt('Physio: do your bridges.', {
    source: 'in_person',
    earlierNotes: 2,
    lastPlan: 'Progress to single leg bridge.',
    programme: { title: 'Knee programme', items: ['Straight Leg Raise (left): 3 × 10, Once a day', 'Glute Bridge'] },
    library: ['Straight Leg Raise', 'Glute Bridge'],
  })
  assert.ok(prompt.includes('Current home programme ("Knee programme"):\n1. Straight Leg Raise (left): 3 × 10, Once a day\n2. Glute Bridge'))
  assert.ok(prompt.includes('Exercise library (exact names):\nStraight Leg Raise; Glute Bridge'))
  assert.ok(prompt.includes('Plan in the last note (for reference only):\nProgress to single leg bridge.'))
  assert.ok(scribeUserPrompt('x', { source: 'dictation', earlierNotes: 0 }).includes('Current home programme: none'))
  assert.equal(programmeLine({ name: 'Clamshell', side: 'R', sets: 2, reps: 15, holdSeconds: 3, frequency: 'Twice a day' }), 'Clamshell (right): 2 × 15, hold 3 s, Twice a day')
})

console.log('drafting the programme')

test('new exercises: the AI’s library pick, else a name match, else not in the library', () => {
  const draft = parse({
    title: 'Knee strengthening',
    duration: '2 weeks',
    note: 'Stop if the pain goes above 5 out of 10.',
    exercises: [
      { action: 'new', name: 'clams', library: 'Clamshell', side: 'right', sets: 2, reps: 15, holdSeconds: null, frequency: 'twice a day', dosage: '2 sets of 15 twice a day' },
      { action: 'new', name: 'heel raises', library: null, sets: null, reps: null, dosage: '3 x 12, once a day' },
      { action: 'new', name: 'Step-ups onto the bottom stair', library: 'Step Up', sets: 3, reps: 10, frequency: 'Once a day' },
    ],
  })!
  const items = draft.programme!.items
  assert.equal(draft.programme!.title, 'Knee strengthening')
  assert.equal(draft.programme!.duration, '2 weeks')
  assert.deepEqual(items[0], { action: 'new', heard: 'clams', name: 'Clamshell', exerciseId: 'e_clam', side: 'R', sets: 2, reps: 15, frequency: 'Twice a day', dosage: '2 sets of 15 twice a day', match: 'library' })
  // Numbers left out by the AI come from the words said; "heel raises" is the library's Calf Raise by name
  assert.equal(items[1].exerciseId, 'e_calf')
  assert.equal(items[1].match, 'name')
  assert.deepEqual([items[1].sets, items[1].reps, items[1].frequency], [3, 12, 'Once a day'])
  // An invented library name is ignored, and nothing close: not in the library
  assert.equal(items[2].exerciseId, undefined)
  assert.equal(items[2].match, 'none')
  assert.equal(items[2].name, 'Step-ups onto the bottom stair')
  // The old exercises list is kept for older screens
  assert.deepEqual(draft.exercises.map((e) => e.name), ['clams', 'heel raises', 'Step-ups onto the bottom stair'])
})

test('change, continue and stop point at the programme’s own places (education skipped)', () => {
  const items = parse({
    title: '',
    exercises: [
      { action: 'change', current: 2, name: 'bridges', sets: 3, reps: 15, frequency: null },
      { action: 'continue', current: 1, name: 'SLR' },
      { action: 'stop', current: 3, name: 'towel squeeze' },
    ],
  })!.programme!.items
  assert.deepEqual(items.map((i) => [i.action, i.fromIndex, i.name, i.match]), [
    ['change', 2, 'Glute Bridge', 'current'],
    ['continue', 0, 'Straight Leg Raise', 'current'],
    ['stop', 3, 'Towel squeeze', 'current'],
  ])
  assert.equal(items[0].exerciseId, 'e_bridge')
  assert.equal(items[1].side, 'L') // kept from the programme
  assert.equal(items[2].exerciseId, undefined) // the physio's own written exercise
})

test('keep and stop carry no dose (models copy it from the current programme, which wasn’t said)', () => {
  const items = parse({
    exercises: [
      { action: 'continue', current: 1, name: 'SLR', sets: 3, reps: 10, holdSeconds: 5, frequency: 'Once a day', dosage: '3 × 10, hold 5 s, Once a day' },
      { action: 'stop', current: 3, name: 'towel squeeze', sets: 3, reps: 10, frequency: 'Twice a day', dosage: '3 × 10' },
    ],
  })!.programme!.items
  for (const item of items) {
    assert.deepEqual([item.sets, item.reps, item.holdSeconds, item.frequency, item.dosage], [undefined, undefined, undefined, undefined, undefined])
  }
})

test('a wrong place is found by name, or the change becomes new and the stop is dropped', () => {
  const items = parse({
    exercises: [
      { action: 'change', current: 9, name: 'Glute bridge', sets: 4, reps: 10 },
      { action: 'change', current: null, name: 'Wall slides', sets: 2, reps: 10 },
      { action: 'stop', current: 7, name: 'Hamstring curls' },
    ],
  })!.programme!.items
  assert.deepEqual(items.map((i) => [i.action, i.fromIndex, i.name]), [
    ['change', 2, 'Glute Bridge'],
    ['new', undefined, 'Wall Slide'],
  ])
})

test('doses out of range are left blank, never made up', () => {
  const [item] = parse({ exercises: [{ action: 'new', name: 'Glute bridge', sets: 0, reps: 200, holdSeconds: 500, frequency: '' }] })!.programme!.items
  assert.equal(item.sets, undefined)
  assert.equal(item.reps, undefined)
  assert.equal(item.holdSeconds, undefined)
  assert.equal(item.frequency, undefined)
})

test('no programme said: none drafted; an older reply with only exercises still drafts one', () => {
  assert.equal(parse(null)!.programme, undefined)
  const old = parseScribeDraft(JSON.stringify({ exercises: [{ name: 'Glute bridges', dosage: '3 sets of 10' }] }), { idPrefix: 't', firstVisit: false, library: LIB })!
  assert.equal(old.programme!.items[0].exerciseId, 'e_bridge')
  assert.deepEqual([old.programme!.items[0].sets, old.programme!.items[0].reps], [3, 10])
  assert.equal(old.programme!.currentProgrammeId, undefined)
})

test('how often, in the usual words; similar exercises best first', () => {
  assert.equal(parseFrequency('Twice a day'), 'Twice a day')
  assert.equal(parseFrequency('4 times per week'), '4 times a week')
  assert.equal(parseFrequency('whenever'), undefined)
  assert.equal(similarExercises('single leg bridge', LIB, 3)[0].name, 'Glute Bridge')
  assert.deepEqual(similarExercises('wrist curls', LIB), [])
})

console.log('reviewing and sending')

const LIBRARY = new Map<string, LibraryLike>(
  [
    { _id: ex('e_slr'), name: 'Straight Leg Raise', sided: true, defaults: { sets: 3, reps: 10, holdSeconds: 5, frequency: 'Once a day' } },
    { _id: ex('e_bridge'), name: 'Glute Bridge', defaults: { sets: 3, reps: 12, holdSeconds: null, frequency: 'Once a day' } },
    { _id: ex('e_calf'), name: 'Calf Raise', defaults: { sets: 2, reps: 15, holdSeconds: null, frequency: 'Twice a day' } },
    { _id: ex('e_clam'), name: 'Clamshell', sided: true, defaults: { sets: 2, reps: 10, holdSeconds: null, frequency: 'Once a day' } },
  ].map((e) => [e._id, e])
)
const NOW: CurrentLike = {
  _id: 'p_knee' as Id<'exercisePrograms'>,
  title: 'Knee programme',
  note: 'Ice after.',
  goals: ['Stairs without the rail'],
  items: [
    { index: 0, kind: 'exercise', exerciseId: ex('e_slr'), name: 'Straight Leg Raise', custom: false, side: 'L', sets: 3, reps: 10, holdSeconds: 5, frequency: 'Once a day', note: null, resourceKey: null },
    { index: 1, kind: 'education', exerciseId: null, name: 'Pacing', custom: false, side: null, sets: null, reps: null, holdSeconds: null, frequency: null, note: 'Little and often.', resourceKey: 'pacing' },
    { index: 2, kind: 'exercise', exerciseId: ex('e_bridge'), name: 'Glute Bridge', custom: false, side: null, sets: 2, reps: 10, holdSeconds: null, frequency: 'Once a day', note: null, resourceKey: null },
    { index: 3, kind: 'exercise', exerciseId: null, name: 'Towel squeeze', custom: true, side: null, sets: 3, reps: 10, holdSeconds: 5, frequency: 'Twice a day', note: null, resourceKey: null },
  ],
}

test('a session that only adds exercises adds them to the current programme', () => {
  const draft = parse({ title: 'Knee', exercises: [{ action: 'new', name: 'calf raises', library: 'Calf Raise', sets: 3, reps: 15, frequency: 'Once a day' }] })!
  const review = reviewFromDraft(draft.programme!, NOW)
  assert.equal(review.target, 'update')
  const send = buildProgrammeSend(review, LIBRARY, NOW)
  assert.deepEqual(send, { kind: 'add', programId: 'p_knee', title: 'Knee programme', items: [{ exerciseId: 'e_calf', sets: 3, reps: 15, frequency: 'Once a day' }] })
})

test('changes and stops update the programme in place; logs keep their places', () => {
  const draft = parse({
    exercises: [
      { action: 'change', current: 2, name: 'bridges', sets: 3, reps: 15, frequency: 'Twice a day', duration: null },
      { action: 'stop', current: 3, name: 'towel squeeze' },
      { action: 'continue', current: 1, name: 'SLR' },
      { action: 'new', name: 'clams', library: 'Clamshell', side: 'both', sets: 2, reps: 10, frequency: 'Once a day' },
    ],
    note: 'Ice after the bridges.',
  })!
  const send = buildProgrammeSend(reviewFromDraft(draft.programme!, NOW), LIBRARY, NOW)
  assert.equal(send.kind, 'update')
  if (send.kind !== 'update') return
  assert.equal(send.note, 'Ice after.\n\nIce after the bridges.')
  assert.deepEqual(send.goals, ['Stairs without the rail'])
  assert.deepEqual(send.items, [
    { exerciseId: 'e_slr', side: 'L', sets: 3, reps: 10, holdSeconds: 5, frequency: 'Once a day', fromIndex: 0 },
    { kind: 'education', name: 'Pacing', note: 'Little and often.', resourceKey: 'pacing', fromIndex: 1 },
    { exerciseId: 'e_bridge', sets: 3, reps: 15, frequency: 'Twice a day', fromIndex: 2 },
    // towel squeeze stopped; clamshells on both sides
    { exerciseId: 'e_clam', sets: 2, reps: 10, frequency: 'Once a day', side: 'L' },
    { exerciseId: 'e_clam', sets: 2, reps: 10, frequency: 'Once a day', side: 'R' },
  ])
})

test('blanks must be filled (or filled with the usual dose) and sides chosen', () => {
  const draft = parse({ title: 'Hip', exercises: [{ action: 'new', name: 'clamshells', library: 'Clamshell' }] })!
  let review = reviewFromDraft(draft.programme!, null)
  assert.equal(review.target, 'new')
  let send = buildProgrammeSend(review, LIBRARY, null)
  assert.equal(send.kind, 'error')
  assert.match((send as { message: string }).message, /Add sets and reps for Clamshell/)
  review = fillBlanks(review, LIBRARY, null)
  assert.deepEqual([review.rows[0].sets, review.rows[0].reps, review.rows[0].frequency], [2, 10, 'Once a day'])
  send = buildProgrammeSend(review, LIBRARY, null)
  assert.match((send as { message: string }).message, /Choose a side for Clamshell/)
  review.rows[0].side = 'R'
  assert.deepEqual(buildProgrammeSend(review, LIBRARY, null), {
    kind: 'create',
    title: 'Hip',
    items: [{ exerciseId: 'e_clam', sets: 2, reps: 10, frequency: 'Once a day', side: 'R' }],
  })
})

test('not in the library: must be picked, added, sent as written or unticked', () => {
  const draft = parse({ title: 'Stairs', duration: '3 weeks', exercises: [{ action: 'new', name: 'Step-ups', sets: 3, reps: 10, frequency: 'Once a day', duration: '5 minutes' }] })!
  const review = reviewFromDraft(draft.programme!, null)
  assert.equal(review.note, 'Keep going for 3 weeks.')
  assert.equal(unresolvedRows(review).length, 1)
  assert.match((buildProgrammeSend(review, LIBRARY, null) as { message: string }).message, /“Step-ups” isn’t in your library/)
  review.rows[0].asWritten = true
  assert.deepEqual(buildProgrammeSend(review, LIBRARY, null), {
    kind: 'create',
    title: 'Stairs',
    note: 'Keep going for 3 weeks.',
    items: [{ name: 'Step-ups', sets: 3, reps: 10, frequency: 'Once a day', note: 'Duration: 5 minutes' }],
  })
  review.rows[0].include = false
  assert.deepEqual(buildProgrammeSend(review, LIBRARY, null), { kind: 'none' })
})

test('something done for a time fills as once, for that long', () => {
  const draft = parse({ title: 'Knee', exercises: [{ action: 'new', name: 'Walk on flat ground', frequency: 'Once a day', duration: '20 minutes' }] }, null)!
  const review = fillBlanks(reviewFromDraft(draft.programme!, null), LIBRARY, null)
  review.rows[0].asWritten = true
  assert.deepEqual(buildProgrammeSend(review, LIBRARY, null), {
    kind: 'create',
    title: 'Knee',
    items: [{ name: 'Walk on flat ground', sets: 1, reps: 1, frequency: 'Once a day', note: 'Duration: 20 minutes' }],
  })
})

test('if the current programme changed since drafting, nothing is changed or stopped by mistake', () => {
  const draft = parse({ exercises: [{ action: 'change', current: 2, name: 'bridges', sets: 3, reps: 15, frequency: 'Once a day' }, { action: 'stop', current: 1, name: 'SLR' }] })!
  const other = { ...NOW, _id: 'p_other' as Id<'exercisePrograms'> }
  const review = reviewFromDraft(draft.programme!, other)
  assert.deepEqual(review.rows.map((r) => [r.action, r.fromIndex]), [['new', undefined]])
  const send = buildProgrammeSend(review, LIBRARY, other)
  assert.equal(send.kind, 'add')
})

test('the physio can send it as a new programme instead, or not at all', () => {
  const draft = parse({ title: 'Knee', exercises: [{ action: 'change', current: 2, name: 'bridges', sets: 3, reps: 15, frequency: 'Once a day' }, { action: 'continue', current: 1, name: 'SLR' }] })!
  const review = { ...reviewFromDraft(draft.programme!, NOW), target: 'new' as const }
  const send = buildProgrammeSend(review, LIBRARY, NOW)
  assert.deepEqual(send, { kind: 'create', title: 'Knee', items: [{ exerciseId: 'e_bridge', sets: 3, reps: 15, frequency: 'Once a day' }] })
  assert.deepEqual(buildProgrammeSend({ ...review, include: false }, LIBRARY, NOW), { kind: 'none' })
})

console.log(`\n${passed} passed`)
