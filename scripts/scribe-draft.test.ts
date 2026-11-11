/**
 * Checks for the AI scribe's prompt, draft reading and name redaction (no Convex, no network):
 *   npx tsx scripts/scribe-draft.test.ts
 * All names and numbers below are made up.
 */
import assert from 'node:assert/strict'
import { cleanMeasures } from '../convex/helpers/clinicalMeasures'
import {
  isNotStated,
  NOT_STATED,
  parseScribeDraft,
  redactText,
  SCRIBE_SYSTEM_PROMPT,
  scribeUserPrompt,
  transcriptionPrompt,
} from '../convex/helpers/scribeDraft'
import {
  draftToNote,
  encodeWav,
  matchExercises,
  nameScore,
  parseDosage,
  suggestedDate,
  withDosage,
} from '../components/physio/notes/scribe/scribeTools'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

console.log('scribe prompt')

test('system prompt lists catalogue keys and the no-invention rules', () => {
  for (const key of ['knee_flexion', 'shoulder_abduction', 'lachman', 'slr', 'tug', 'nprs', 'psfs', 'lefs', 'mas']) {
    assert.ok(SCRIBE_SYSTEM_PROMPT.includes(key), `missing ${key}`)
  }
  assert.ok(SCRIBE_SYSTEM_PROMPT.includes('Never invent'))
  assert.ok(SCRIBE_SYSTEM_PROMPT.includes('"Not stated."'))
  assert.ok(SCRIBE_SYSTEM_PROMPT.includes('JSON'))
  assert.ok(SCRIBE_SYSTEM_PROMPT.includes('3.75 for 4-'), 'MMT grade values')
})

test('user prompt wraps the transcript and labels earlier values as comparison only', () => {
  const prompt = scribeUserPrompt('  Physio: How is the knee?  ', {
    source: 'in_person',
    earlierNotes: 2,
    condition: 'Right knee pain after a fall',
    plan: { goals: ['Climb stairs without pain'], sessionFrequency: 'Twice a week', plannedSessions: 8 },
    earlierMeasures: ['Knee flexion (AROM · Right): 95° (Mon, 3 Nov)'],
  })
  assert.ok(prompt.includes('<transcript>\nPhysio: How is the knee?\n</transcript>'))
  assert.ok(prompt.includes('Earlier notes for this patient: 2'))
  assert.ok(prompt.includes('for comparison only'))
  assert.ok(prompt.includes('- Climb stairs without pain'))
  assert.ok(prompt.includes('Active care plan: yes (Twice a week, 8 sessions planned)'))
  const first = scribeUserPrompt('x', { source: 'dictation', earlierNotes: 0 })
  assert.ok(first.includes('none (probably a first visit)'))
  assert.ok(first.includes('Dictation'))
  assert.ok(!first.includes('Earlier record'))
  assert.ok(first.includes('Active care plan: none'))
  assert.ok(SCRIBE_SYSTEM_PROMPT.includes('"carePlan"') && SCRIBE_SYSTEM_PROMPT.includes('achievedGoals'))
})

console.log('reading the draft')

const reply = '```json\n' + JSON.stringify({
  noteType: 'initial_assessment',
  subjective: 'Right knee pain for 3 weeks after a fall.\nPain score: 6/10 on stairs.',
  objective: 'Mild effusion. Knee flexion 110° right.',
  assessment: 'not stated',
  treatment: '',
  plan: 'Home programme: quad sets 3 x 10 daily.\nReview in one week.',
  measures: [
    { kind: 'rom', key: 'knee_flexion', side: 'right', value: 110 }, // method left out: arom
    { kind: 'rom', key: 'knee_flexion', value: 100 }, // no side: dropped
    { kind: 'strength', key: 'knee_extension', side: 'right', value: '4+' }, // grade as text
    { kind: 'strength', key: 'wrist_hand_grip', side: 'left', value: 22 }, // dynamometer only
    { kind: 'pain', key: 'nprs', value: 6, location: 'knee', context: 'On movement' },
    { kind: 'special_test', key: 'lachman', side: 'right', result: 'Negative' },
    { kind: 'special_test', key: 'made_up_test', result: 'positive' }, // unknown: dropped
    { kind: 'functional', key: 'tug', value: 14.2, device: 'walking stick', context: 'none' },
    { kind: 'psfs', items: [{ activity: 'Climbing stairs', score: 4 }] },
    { kind: 'outcome', key: 'lefs', value: 41 },
    { kind: 'rom', key: 'knee_flexion', side: 'right', value: 999 }, // out of range: dropped
    'not a measure', // dropped
  ],
  exercises: [{ name: 'Quad sets', dosage: '3 x 10, daily' }, 'Straight leg raise', { name: '' }],
  followUp: { text: 'Review in one week', inDays: 7 },
  redFlags: [],
  missing: ['special tests', 'Follow-up', 'something else'],
}) + '\n```'

test('reads fenced JSON and keeps the sections', () => {
  const draft = parseScribeDraft(reply, { idPrefix: 't1', firstVisit: false })
  assert.ok(draft)
  assert.equal(draft.noteType, 'initial_assessment')
  assert.ok(draft.subjective.startsWith('Right knee pain'))
  assert.equal(draft.assessment, NOT_STATED, '"not stated" is normalised')
  assert.equal(draft.treatment, NOT_STATED, 'an empty section says Not stated.')
  assert.ok(isNotStated(draft.treatment) && !isNotStated(draft.plan))
})

test('keeps only measures that pass the catalogue, tidied', () => {
  const draft = parseScribeDraft(reply, { idPrefix: 't1', firstVisit: false })!
  const keys = draft.measures.map((m) => `${m.kind}:${m.key}`)
  assert.deepEqual(keys, [
    'rom:knee_flexion',
    'strength:knee_extension',
    'strength:wrist_hand_grip',
    'pain:nprs',
    'special_test:lachman',
    'functional:tug',
    'psfs:psfs',
    'outcome:lefs',
  ])
  assert.equal(draft.droppedMeasures, 4)
  const [rom, mmt, grip, pain, lachman, tug] = draft.measures
  assert.equal(rom.method, 'arom')
  assert.equal(mmt.method, 'mmt')
  assert.equal(mmt.value, 4.25)
  assert.equal(grip.method, 'dynamometer')
  assert.equal(pain.location, 'Knee')
  assert.equal(pain.context, 'movement')
  assert.equal(lachman.result, 'negative')
  assert.equal(tug.device, 'Walking stick')
  assert.equal(tug.context, undefined, '"None" is dropped: it is what models fill in when nothing was said')
  // The whole set saves as one note: unique ids, every one valid
  assert.equal(cleanMeasures(draft.measures).length, draft.measures.length)
  assert.ok(draft.measures.every((m) => m.id.startsWith('t1_')))
})

test('exercises, follow-up, missing items', () => {
  const draft = parseScribeDraft(reply, { idPrefix: 't1', firstVisit: false })!
  assert.deepEqual(draft.exercises, [{ name: 'Quad sets', dosage: '3 x 10, daily' }, { name: 'Straight leg raise' }])
  assert.deepEqual(draft.followUp, { text: 'Review in one week', inDays: 7 })
  assert.deepEqual(draft.missing, ['special tests', 'follow-up'])
  assert.deepEqual(draft.redFlags, [])
})

test('falls back on the note type and leaves out an unstated follow-up', () => {
  const raw = JSON.stringify({ noteType: 'soap', subjective: 'Better today.', followUp: { text: 'Not stated.' } })
  const first = parseScribeDraft(raw, { idPrefix: 'a', firstVisit: true })!
  assert.equal(first.noteType, 'initial_assessment')
  assert.ok(!('followUp' in first))
  assert.equal(first.objective, NOT_STATED)
  assert.deepEqual(first.measures, [])
  assert.equal(parseScribeDraft(raw, { idPrefix: 'a', firstVisit: false })!.noteType, 'treatment_note')
  const dayless = parseScribeDraft(JSON.stringify({ followUp: { text: 'See you soon', inDays: 0.5 } }), { idPrefix: 'a', firstVisit: false })!
  assert.deepEqual(dayless.followUp, { text: 'See you soon' })
})

test('returns null for a reply that is not JSON', () => {
  assert.equal(parseScribeDraft('Sorry, I cannot help with that.', { idPrefix: 'a', firstVisit: false }), null)
  assert.equal(parseScribeDraft('[1, 2]', { idPrefix: 'a', firstVisit: false }), null)
  assert.equal(parseScribeDraft('{ broken', { idPrefix: 'a', firstVisit: false }), null)
})

test('caps very long sections', () => {
  const draft = parseScribeDraft(JSON.stringify({ subjective: 'a'.repeat(20_000) }), { idPrefix: 'a', firstVisit: false })!
  assert.equal(draft.subjective.length, 10_000)
})

console.log('care plan')

test('drafts a new plan; measures and targets must fit the catalogue', () => {
  const raw = JSON.stringify({
    subjective: 'x',
    carePlan: {
      action: 'create',
      title: 'Right knee rehab after a fall',
      summary: 'Strength and range, then stairs.',
      goals: [
        { description: 'Bend the knee fully', timeline: '6 weeks', measure: { kind: 'rom', key: 'knee_flexion', side: 'right' }, target: 135 },
        { description: 'Knee straight', timeline: '', measure: { kind: 'rom', key: 'knee_flexion' }, target: 0 }, // no side: no measure
        { description: 'Pain-free stairs', timeline: 'Not stated', measure: { kind: 'pain', key: 'nprs', location: 'knee' }, target: 0 },
        { description: 'Better function', timeline: '8 weeks', measure: { kind: 'outcome', key: 'lefs' }, target: 999 }, // target off the scale
        { description: 'Lachman stays negative', measure: { kind: 'special_test', key: 'lachman', side: 'right' } }, // nothing to chart
        { description: '' },
      ],
      sessionFrequency: 'Twice a week',
      plannedSessions: 8,
      reviewInWeeks: 4,
      precautions: 'Avoid deep squats',
      achievedGoals: [],
      changeReason: '',
    },
  })
  const plan = parseScribeDraft(raw, { idPrefix: 'p', firstVisit: true })!.carePlan!
  assert.equal(plan.action, 'create')
  assert.equal(plan.goals.length, 5)
  assert.deepEqual(plan.goals[0], { description: 'Bend the knee fully', timeline: '6 weeks', measure: { kind: 'rom', key: 'knee_flexion', method: 'arom', side: 'right' }, target: 135 })
  assert.ok(!('measure' in plan.goals[1]), 'a sided measure without its side is left off')
  assert.deepEqual(plan.goals[2], { description: 'Pain-free stairs', timeline: '', measure: { kind: 'pain', key: 'nprs', location: 'Knee' }, target: 0 })
  assert.deepEqual(plan.goals[3].measure, { kind: 'outcome', key: 'lefs' })
  assert.ok(!('target' in plan.goals[3]), 'a target off the scale is dropped')
  assert.ok(!('measure' in plan.goals[4]))
  assert.equal(plan.plannedSessions, 8)
  assert.equal(plan.reviewInWeeks, 4)
  assert.equal(plan.sessionFrequency, 'Twice a week')
})

test('drafts changes to the current plan', () => {
  const raw = JSON.stringify({
    carePlan: {
      action: 'update',
      title: '',
      summary: '',
      goals: [{ description: 'Return to five-a-side football', timeline: '3 months' }],
      achievedGoals: ['Climb stairs without pain'],
      sessionFrequency: 'Once a week',
      plannedSessions: 0.5, // not a whole number: dropped
      reviewInWeeks: null,
      precautions: '',
      changeReason: 'Stairs goal met; dropping to weekly visits.',
    },
  })
  const plan = parseScribeDraft(raw, { idPrefix: 'p', firstVisit: false })!.carePlan!
  assert.equal(plan.action, 'update')
  assert.deepEqual(plan.achievedGoals, ['Climb stairs without pain'])
  assert.equal(plan.goals[0].description, 'Return to five-a-side football')
  assert.equal(plan.sessionFrequency, 'Once a week')
  assert.ok(!('plannedSessions' in plan))
  assert.equal(plan.changeReason, 'Stairs goal met; dropping to weekly visits.')
})

test('no plan when the session said nothing about it', () => {
  assert.ok(!('carePlan' in parseScribeDraft(JSON.stringify({ carePlan: null }), { idPrefix: 'p', firstVisit: true })!))
  const empty = JSON.stringify({ carePlan: { action: 'create', title: 'Plan', goals: [], achievedGoals: [], sessionFrequency: 'Not stated', precautions: '' } })
  assert.ok(!('carePlan' in parseScribeDraft(empty, { idPrefix: 'p', firstVisit: true })!), 'a plan with nothing in it is not offered')
})

console.log('redaction')

const targets = [
  { names: ['Adaeze', 'Okafor-Bello'], label: '[patient]' },
  { names: ['Tunde', 'Ola'], label: '[physio]' },
]

test('replaces names as whole words in any case', () => {
  const out = redactText('ADAEZE said Mrs okafor-bello and Bello came. Tunde examined. Adaezelike stays.', targets)
  assert.equal(out, '[patient] said Mrs [patient] and [patient] came. [physio] examined. Adaezelike stays.')
})

test('leaves short names alone so ordinary words survive', () => {
  assert.equal(redactText('Hold for 10 seconds, ola.', [{ names: ['Ola'], label: '[physio]' }]), 'Hold for 10 seconds, [physio].')
  assert.equal(redactText('Do it on the left side.', [{ names: ['Do'], label: '[patient]' }]), 'Do it on the left side.')
})

test('replaces phone numbers and emails but not clinical numbers', () => {
  const out = redactText(
    'Call me on 0803 123 4567 or +234 (803) 123-4567, email ada.o@example.com. Knee flexion 110 degrees, 3 x 10 reps, 2026-11-10.',
    []
  )
  assert.equal(out, 'Call me on [phone] or [phone], email [email]. Knee flexion 110 degrees, 3 x 10 reps, 2026-11-10.')
  assert.equal(redactText('95\n110\n120\n130', []), '95\n110\n120\n130', 'numbers on separate lines never join')
})

console.log('browser helpers')

test('transcription hint carries the vocabulary and the end of the transcript', () => {
  const prompt = transcriptionPrompt('x'.repeat(500) + ' last words here')
  assert.ok(prompt.includes('Lachman') && prompt.includes('Nigerian Pidgin'))
  assert.ok(prompt.endsWith('last words here'))
  assert.ok(prompt.length < 1200)
  assert.ok(!transcriptionPrompt('').includes('Earlier:'))
})

test('matches heard exercises to the library by name, each library one once', () => {
  const library = [
    { name: 'Straight Leg Raise', id: 1 },
    { name: 'Quadriceps Sets', id: 2 },
    { name: 'Glute Bridge', id: 3 },
    { name: 'Calf Raises', id: 4 },
    { name: 'Clamshells', id: 5 },
  ]
  const { matched, unmatched } = matchExercises(
    [{ name: 'SLR', dosage: '3 x 10' }, { name: 'quad sets' }, { name: 'bridging' }, { name: 'heel raises' }, { name: 'clams' }, { name: 'Tai chi walking' }, { name: 'straight leg raises' }],
    library
  )
  assert.deepEqual(
    matched.map((m) => [m.heard.name, m.entry.id]),
    [['SLR', 1], ['quad sets', 2], ['bridging', 3], ['heel raises', 4], ['clams', 5]]
  )
  assert.deepEqual(unmatched.map((u) => u.name), ['Tai chi walking', 'straight leg raises'], 'a library exercise is used once')
  assert.ok(nameScore('Wall slides', 'Wall Slide') >= 0.9)
  assert.ok(nameScore('Wall slides', 'Wall push-up') < 0.5)
})

test('reads dosage as said', () => {
  assert.deepEqual(parseDosage('3 sets of 10, twice a day'), { sets: 3, reps: 10, frequency: 'Twice a day' })
  assert.deepEqual(parseDosage('three x fifteen daily'), { sets: 3, reps: 15, frequency: 'Once a day' })
  assert.deepEqual(parseDosage('hold for 5 seconds, 10 reps, 3 times a day'), { reps: 10, holdSeconds: 5, frequency: '3 times a day' })
  assert.deepEqual(parseDosage('2 sets, 4 times a week'), { sets: 2, frequency: '4 times a week' })
  assert.deepEqual(parseDosage('as tolerated'), {})
  assert.deepEqual(parseDosage(undefined), {})
  const entry = { name: 'SLR', defaults: { sets: 2, reps: 8, holdSeconds: 3 as number | null, frequency: 'Once a day' } }
  assert.deepEqual(withDosage(entry, parseDosage('3 x 10')).defaults, { sets: 3, reps: 10, holdSeconds: 3, frequency: 'Once a day' })
})

test('encodes a valid mono 16 kHz WAV', () => {
  const wav = new DataView(encodeWav([new Int16Array([0, 1000, -1000]), new Int16Array([32767])]))
  const text = (o: number, n: number) => String.fromCharCode(...Array.from({ length: n }, (_, i) => wav.getUint8(o + i)))
  assert.equal(text(0, 4), 'RIFF')
  assert.equal(text(8, 4), 'WAVE')
  assert.equal(wav.getUint16(22, true), 1)
  assert.equal(wav.getUint32(24, true), 16000)
  assert.equal(wav.getUint32(40, true), 8)
  assert.equal(wav.byteLength, 52)
  assert.equal(wav.getInt16(46, true), 1000)
  assert.equal(wav.getInt16(50, true), 32767)
})

test('follow-up date in Lagos, and the draft into the editor', () => {
  // 23:30 UTC on 10 Nov is 00:30 on 11 Nov in Lagos; a week later is 18 Nov
  assert.equal(suggestedDate(7, Date.UTC(2026, 10, 10, 23, 30)), '2026-11-18')
  const draft = parseScribeDraft(reply, { idPrefix: 't1', firstVisit: false })!
  const note = draftToNote(draft, [])
  assert.equal(note.assessment, '', '"Not stated." sections stay empty in the editor')
  assert.equal(note.treatment, '')
  assert.ok(note.subjective.startsWith('Right knee pain'))
  assert.deepEqual(note.measures, [], 'suggested measures are added one by one, not automatically')
})

console.log(`\n${passed} passed`)
