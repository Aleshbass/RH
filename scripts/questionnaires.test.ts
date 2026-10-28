/**
 * Checks for questionnaire scoring (no Convex, no network):
 *   npx tsx scripts/questionnaires.test.ts
 * LEFS, SPADI, KOOS-12/HOOS-12, NPRS and PSFS scores and missing-item rules, answer checks,
 * change against the MCID, and suggestions from the condition.
 */
import assert from 'node:assert/strict'
import { ALL_INSTRUMENTS, instrumentDef, questionnairePages } from '../lib/questionnaires/instruments'
import {
  AnswerError,
  cleanAnswers,
  cleanDraftAnswers,
  cleanPsfs,
  compareScores,
  scoreResponse,
  suggestInstruments,
} from '../lib/questionnaires/scoring'
import { NOT_APPLICABLE, type InstrumentDef } from '../lib/questionnaires/types'
import { changeThreshold, type ClinicalMeasure } from '../convex/helpers/clinicalMeasures'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const def = (key: string): InstrumentDef => {
  const d = instrumentDef(key)
  if (!d) throw new Error(`missing ${key}`)
  return d
}
const filled = (d: InstrumentDef, value: number) => d.items.map(() => value)

test('catalogue: every item has a scale, subscales point at real items, ids are unique', () => {
  for (const d of ALL_INSTRUMENTS) {
    const ids = new Set(d.items.map((i) => i.id))
    assert.equal(ids.size, d.items.length, d.key)
    for (const s of d.subscales) for (const i of s.items) assert.ok(i >= 0 && i < d.items.length, `${d.key} ${s.key}`)
    const paged = questionnairePages(d).flatMap((p) => p.items)
    if (d.kind === 'items') assert.deepEqual([...paged].sort((a, b) => a - b), d.items.map((_, i) => i), `${d.key} pages`)
  }
  assert.equal(def('lefs').items.length, 20)
  assert.equal(def('spadi').items.length, 13)
  assert.equal(def('koos12').items.length, 12)
  assert.equal(def('hoos12').items.length, 12)
})

test('LEFS: sum of 20 items, all required', () => {
  const lefs = def('lefs')
  assert.equal(scoreResponse(lefs, { answers: filled(lefs, 4) }).total, 80)
  assert.equal(scoreResponse(lefs, { answers: filled(lefs, 2) }).total, 40)
  const partial = cleanAnswers(lefs, [3, 3, 3], false)
  assert.equal(scoreResponse(lefs, { answers: partial }).total, null)
  assert.throws(() => cleanAnswers(lefs, [3, 3, 3], true), AnswerError)
  assert.throws(() => cleanAnswers(lefs, [...filled(lefs, 4).slice(1), 5], true), AnswerError)
  assert.throws(() => cleanAnswers(lefs, [NOT_APPLICABLE, ...filled(lefs, 4).slice(1)], true), AnswerError)
})

test('SPADI: percentages, unanswered items leave the maximum, >2 missing gives no score', () => {
  const spadi = def('spadi')
  // pain all 5 → 25/50 = 50%; disability all 2 → 16/80 = 20%; total 41/130 = 31.5%
  const answers = [5, 5, 5, 5, 5, 2, 2, 2, 2, 2, 2, 2, 2]
  const r = scoreResponse(spadi, { answers: cleanAnswers(spadi, answers, true) })
  assert.equal(r.subscales.find((s) => s.key === 'pain')?.value, 50)
  assert.equal(r.subscales.find((s) => s.key === 'disability')?.value, 20)
  assert.equal(r.total, 31.5)
  // One disability item doesn't apply: 14/70 = 20%, total 39/120 = 32.5%
  const na = [...answers]
  na[12] = NOT_APPLICABLE
  const r2 = scoreResponse(spadi, { answers: cleanAnswers(spadi, na, true) })
  assert.equal(r2.subscales.find((s) => s.key === 'disability')?.value, 20)
  assert.equal(r2.total, 32.5)
  assert.equal(r2.missing, 1)
  // Three pain items missing: no pain score, no total
  const many = [...answers]
  many[0] = many[1] = many[2] = NOT_APPLICABLE
  const r3 = scoreResponse(spadi, { answers: cleanAnswers(spadi, many, true) })
  assert.equal(r3.subscales.find((s) => s.key === 'pain')?.value, null)
  assert.equal(r3.total, null)
})

test('KOOS-12 / HOOS-12: 100 − mean × 25 per scale, half the items needed, summary = mean of three', () => {
  for (const key of ['koos12', 'hoos12']) {
    const d = def(key)
    assert.equal(scoreResponse(d, { answers: filled(d, 0) }).total, 100)
    assert.equal(scoreResponse(d, { answers: filled(d, 4) }).total, 0)
    // Pain 1,1,1,1 → 75; Function 2,2,2,2 → 50; QOL 3,3,3,3 → 25; summary 50
    const r = scoreResponse(d, { answers: [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3] })
    assert.deepEqual(
      r.subscales.map((s) => s.value),
      [75, 50, 25]
    )
    assert.equal(r.total, 50)
    // Two pain items blank: mean of the other two (1 and 2 → 1.5 → 62.5)
    const half = cleanAnswers(d, [1, 2, null, null, 2, 2, 2, 2, 3, 3, 3, 3], false)
    assert.equal(scoreResponse(d, { answers: half }).subscales[0].value, 62.5)
    // Three blank: no pain score, no summary
    const r3 = scoreResponse(d, { answers: cleanAnswers(d, [1, null, null, null, 2, 2, 2, 2, 3, 3, 3, 3], false) })
    assert.equal(r3.subscales[0].value, null)
    assert.equal(r3.total, null)
  }
})

test('NPRS: mean of now, best and worst; all three needed', () => {
  const nprs = def('nprs')
  const r = scoreResponse(nprs, { answers: [4, 2, 7] })
  assert.equal(r.total, 4.3)
  assert.deepEqual(
    r.subscales.map((s) => s.value),
    [4, 2, 7]
  )
  assert.equal(scoreResponse(nprs, { answers: cleanAnswers(nprs, [4, null, 7], false) }).total, null)
  assert.throws(() => cleanAnswers(nprs, [11, 2, 7], true), AnswerError)
})

test('PSFS: mean of rated activities, names cleaned, previous activities kept', () => {
  const psfs = def('psfs')
  const rows = cleanPsfs(
    [
      { activity: '  Climbing   stairs ', score: 3 },
      { activity: 'Kneeling to pray', score: 6 },
      { activity: '', score: null },
    ],
    true
  )
  assert.deepEqual(
    rows.map((r) => r.activity),
    ['Climbing stairs', 'Kneeling to pray']
  )
  assert.equal(scoreResponse(psfs, { psfs: rows }).total, 4.5)
  assert.throws(() => cleanPsfs([{ activity: 'Running', score: null }], true), AnswerError)
  assert.throws(() => cleanPsfs([{ activity: 'Running', score: 4 }, { activity: 'running', score: 5 }], true), AnswerError)
  assert.throws(() => cleanPsfs([{ activity: 'Running', score: 4 }], true, ['Climbing stairs']), AnswerError)
  assert.throws(() => cleanPsfs([], true), AnswerError)
  // Drafts keep unrated activities
  assert.equal(cleanPsfs([{ activity: 'Running', score: null }], false).length, 1)
})

test('drafts drop values that are not on the scale', () => {
  const lefs = def('lefs')
  const draft = cleanDraftAnswers(lefs, [4, 9, NOT_APPLICABLE, 2.5, 0])
  assert.deepEqual(draft.slice(0, 5), [4, null, null, null, 0])
  assert.equal(draft.length, 20)
  const spadi = def('spadi')
  assert.equal(cleanDraftAnswers(spadi, [NOT_APPLICABLE])[0], NOT_APPLICABLE)
})

test('change: direction and MCID', () => {
  const lefs = def('lefs')
  const up = compareScores(lefs, 30, 42)
  assert.equal(up?.tone, 'better')
  assert.equal(up?.meaningful, true)
  assert.equal(compareScores(lefs, 30, 35)?.meaningful, false)
  const spadi = def('spadi')
  assert.equal(compareScores(spadi, 60, 40)?.tone, 'better')
  assert.equal(compareScores(spadi, 40, 60)?.tone, 'worse')
  assert.equal(compareScores(spadi, 40, 40)?.tone, 'same')
  assert.equal(compareScores(spadi, null, 40), null)
})

test('suggestions follow the condition', () => {
  assert.deepEqual(suggestInstruments('Right knee ACL reconstruction'), ['koos12', 'lefs', 'psfs', 'nprs'])
  assert.deepEqual(suggestInstruments('L hip OA'), ['hoos12', 'lefs', 'psfs', 'nprs'])
  assert.deepEqual(suggestInstruments('Frozen shoulder'), ['spadi', 'psfs', 'nprs'])
  assert.deepEqual(suggestInstruments('Low back pain'), ['psfs', 'nprs'])
  assert.deepEqual(suggestInstruments(undefined), ['psfs', 'nprs'])
})

test('MCIDs match the clinical-note catalogue where both exist (same keys)', () => {
  const same: [string, ClinicalMeasure][] = [
    ['lefs', { id: 't', kind: 'outcome', key: 'lefs', value: 40 }],
    ['spadi', { id: 't', kind: 'outcome', key: 'spadi', value: 40 }],
    ['psfs', { id: 't', kind: 'psfs', key: 'psfs', items: [{ activity: 'Stairs', score: 4 }] }],
    ['nprs', { id: 't', kind: 'pain', key: 'nprs', value: 5 }],
  ]
  for (const [key, measure] of same) {
    assert.equal(def(key).mcid?.value, changeThreshold(measure, 40)?.amount, key)
  }
})

console.log(`\n${passed} questionnaire checks passed`)
