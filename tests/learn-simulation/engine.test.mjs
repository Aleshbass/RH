// Rehabify Learn simulations: engine tests. Run with `npm run test:sim` (Node 24 imports the .ts engine).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyChoice,
  availableChoices,
  buildDebrief,
  clockSec,
  expire,
  maxPoints,
  scoreState,
  SimError,
  startState,
  validateCase,
  vitalsAt,
} from '../../lib/learn/simulation/engine.ts'

/** A small triage case: stop → (check vitals | look at calf) → escalate → good end. */
function triageCase(overrides = {}) {
  return {
    slug: 'test-triage',
    version: 1,
    title: 'Test triage',
    summary: 'A test',
    specialty: 'cardioresp',
    difficulty: 1,
    mode: 'triage',
    timeLimitSec: 60,
    estimatedMinutes: 1,
    setting: 'Ward',
    patient: { name: 'Test', age: 60, sex: 'M', presentingComplaint: 'Breathless' },
    speakers: { patient: { name: 'Mr Test', role: 'Patient' } },
    monitor: true,
    vitals: { hr: 110, spo2: 92, bpSys: 125, bpDia: 80, rr: 24 },
    pain: 5,
    drift: { everySec: 10, vitals: { spo2: -1, hr: 2 }, maxSteps: 5, stopFlag: 'escalated' },
    phases: [{ id: 'triage', label: 'Triage', budgetSec: 60 }],
    startNode: 'start',
    nodes: {
      start: {
        id: 'start',
        phase: 'triage',
        prompt: 'He is breathless.',
        choices: [
          { id: 'stop', label: 'Stop', costSec: 5, next: 'assess', points: 10, tag: 'critical', feedback: 'Right.' },
          { id: 'walk', label: 'Walk him', costSec: 5, next: 'collapse', points: -20, tag: 'harmful', feedback: 'Unsafe.' },
        ],
      },
      assess: {
        id: 'assess',
        phase: 'triage',
        prompt: 'What next?',
        choices: [
          {
            id: 'vitals',
            label: 'Check vitals',
            costSec: 15,
            next: 'assess',
            points: 10,
            tag: 'critical',
            feedback: 'Yes.',
            reveals: ['f-vitals'],
            effects: { flags: ['monitor'] },
          },
          { id: 'rom', label: 'Knee ROM', costSec: 20, next: 'assess', points: -2, tag: 'wasteful', feedback: 'Not now.' },
          { id: 'massage', label: 'Massage calf', costSec: 10, next: 'assess', points: -10, tag: 'harmful', feedback: 'No.', effects: { vitals: { hr: 10, spo2: -3 }, pain: 2 } },
          { id: 'escalate', label: 'Escalate', costSec: 10, next: 'good', points: 20, tag: 'critical', feedback: 'Yes.', effects: { flags: ['escalated'] } },
        ],
      },
      good: { id: 'good', phase: 'triage', prompt: '', end: { outcome: 'good', title: 'Well done', summary: 'Reviewed fast.' } },
      collapse: { id: 'collapse', phase: 'triage', prompt: '', end: { outcome: 'harm', title: 'Collapse', summary: 'He collapsed.' } },
    },
    findings: { 'f-vitals': { id: 'f-vitals', label: 'Vitals', detail: 'HR 110', abnormal: true } },
    mustDo: ['stop', 'vitals', 'escalate'],
    autoFail: ['walk'],
    expertPath: ['stop', 'vitals', 'escalate'],
    passMark: 70,
    learningPoints: ['Stop and escalate.'],
    references: [{ label: 'Test ref' }],
    ...overrides,
  }
}

test('a sound test case passes the lint', () => {
  assert.deepEqual(validateCase(triageCase()), [])
})

test('the expert path scores 100% and passes', () => {
  const def = triageCase()
  let s = startState(def, 0)
  for (const id of def.expertPath) s = applyChoice(def, s, id, 1000)
  const score = scoreState(def, s)
  assert.equal(s.status, 'finished')
  assert.equal(s.finish.reason, 'end')
  assert.equal(score.pct, 100)
  assert.equal(score.passed, true)
  assert.equal(maxPoints(def), 40)
})

test('questions drop away once asked; repeatable ones stay', () => {
  const def = triageCase()
  let s = applyChoice(def, startState(def, 0), 'stop', 0)
  s = applyChoice(def, s, 'vitals', 0)
  assert.ok(!availableChoices(def, s).some((c) => c.id === 'vitals'))
  assert.throws(() => applyChoice(def, s, 'vitals', 0), (e) => e instanceof SimError && e.code === 'unavailable')
})

test('a choice from another node is refused', () => {
  const def = triageCase()
  assert.throws(() => applyChoice(def, startState(def, 0), 'escalate', 0), SimError)
})

test('an auto-fail choice ends the case as harm and fails', () => {
  const def = triageCase()
  const s = applyChoice(def, startState(def, 0), 'walk', 0)
  const score = scoreState(def, s)
  assert.equal(s.finish.reason, 'auto-fail')
  assert.equal(score.outcome, 'harm')
  assert.equal(score.passed, false)
  assert.deepEqual(score.harmful, ['walk'])
})

test('triage time counts real time plus action time', () => {
  const def = triageCase()
  let s = applyChoice(def, startState(def, 0), 'stop', 10_000) // 10 s real + 5 s action
  assert.equal(clockSec(def, s, 10_000), 15)
  assert.equal(clockSec(def, s, 20_000), 25)
})

test('running out of time ends the attempt (choices after the grace period are refused)', () => {
  const def = triageCase()
  let s = applyChoice(def, startState(def, 0), 'stop', 0)
  assert.equal(expire(def, s, 57_000).status, 'active') // 57 s real + 5 s action = 62 s, inside the 3 s grace
  assert.equal(expire(def, s, 59_000).status, 'finished') // 64 s: over
  const late = applyChoice(def, s, 'escalate', 70_000)
  assert.equal(late.status, 'finished')
  assert.equal(late.finish.reason, 'timeout')
  assert.equal(scoreState(def, late).passed, false)
})

test('expire() leaves a live attempt alone and closes an overdue one', () => {
  const def = triageCase()
  const s = startState(def, 0)
  assert.equal(expire(def, s, 30_000), s)
  const done = expire(def, s, 64_000)
  assert.equal(done.finish.reason, 'timeout')
  assert.equal(done.finish.clockSec, 60)
})

test('an action that pushes past the limit times out instead of moving on', () => {
  const def = triageCase()
  let s = applyChoice(def, startState(def, 0), 'stop', 0)
  s = applyChoice(def, s, 'rom', 38_000) // 38 + 5 + 20 = 63 ≥ 60
  assert.equal(s.finish.reason, 'timeout')
})

test('vitals drift with time and freeze once escalated', () => {
  const def = triageCase()
  let s = applyChoice(def, startState(def, 0), 'stop', 0)
  assert.equal(vitalsAt(def, s, 0).spo2, 92)
  assert.equal(vitalsAt(def, s, 25).spo2, 90) // 2 steps
  assert.equal(vitalsAt(def, s, 500).spo2, 87) // capped at 5 steps
  s = applyChoice(def, s, 'escalate', 20_000) // clock 35 → 3 steps frozen
  assert.equal(s.driftFrozen, 3)
  assert.equal(vitalsAt(def, s, 500).spo2, 89)
})

test('harmful effects change vitals and pain, clamped to safe ranges', () => {
  const def = triageCase({ vitals: { hr: 195, spo2: 61, bpSys: 125, bpDia: 80, rr: 24 } })
  let s = applyChoice(def, startState(def, 0), 'stop', 0)
  s = applyChoice(def, s, 'massage', 0)
  assert.equal(s.vitals.hr, 200)
  assert.equal(s.vitals.spo2, 60)
  assert.equal(s.pain, 7)
})

test('missing a must-do fails even on a good ending', () => {
  const def = triageCase()
  let s = applyChoice(def, startState(def, 0), 'stop', 0)
  s = applyChoice(def, s, 'escalate', 0)
  const score = scoreState(def, s)
  assert.equal(score.outcome, 'good')
  assert.deepEqual(score.mustDoMissed, ['vitals'])
  assert.equal(score.passed, false)
})

test('full cases take points off for phases that run over budget', () => {
  const def = triageCase({ mode: 'full', timeLimitSec: undefined, phases: [{ id: 'triage', label: 'Triage', budgetSec: 20 }] })
  let s = startState(def, 0)
  for (const id of def.expertPath) s = applyChoice(def, s, id, 999_999) // real time doesn't count in full cases
  const score = scoreState(def, s)
  assert.deepEqual(score.overBudget, ['triage'])
  assert.equal(score.points, 35)
})

test('the debrief lists the timeline, critical actions and missed findings', () => {
  const def = triageCase()
  let s = applyChoice(def, startState(def, 0), 'stop', 0)
  s = applyChoice(def, s, 'escalate', 0)
  const d = buildDebrief(def, s)
  assert.equal(d.timeline.length, 2)
  assert.equal(d.critical.find((c) => c.choiceId === 'vitals').done, false)
  assert.equal(d.missedFindings[0].id, 'f-vitals')
  assert.equal(d.ending.title, 'Well done')
})

test('the lint catches broken cases', () => {
  const broken = triageCase({ mustDo: ['nope'], expertPath: ['stop', 'escalate'] })
  broken.nodes.assess.choices[0].next = 'missing'
  const problems = validateCase(broken)
  assert.ok(problems.some((p) => p.includes('mustDo "nope"')))
  assert.ok(problems.some((p) => p.includes('missing node "missing"')))
})

test('every case in content/sim-cases is sound', () => {
  const dir = join(import.meta.dirname, '../../content/sim-cases')
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  assert.ok(files.length > 0, 'no cases found')
  for (const file of files) {
    const def = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    assert.equal(`${def.slug}.json`, file, `${file}: file name must match the slug`)
    assert.deepEqual(validateCase(def), [], `${file} has problems`)
  }
})
