// "Talk to the patient" mode: the referee side (lib/learn/simulation/engine.ts, Consult section).
// The AI's verdicts are simulated here; the engine must stay fair whatever the AI says.
// Run with `npm run test:sim`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyChoice,
  applyConsultTurn,
  applyExplainTurn,
  buildConsultDebrief,
  consultFacts,
  consultMoveOn,
  consultScores,
  consultSkills,
  consultStart,
  MAX_FACTS_PER_TURN,
  moodOf,
  scoreNote,
  startState,
  WALKOUT_RAPPORT,
} from '../../lib/learn/simulation/engine.ts'

const ankle = JSON.parse(readFileSync(join(import.meta.dirname, '../../content/sim-cases/ankle-sprain-after-football.json'), 'utf8'))
const quiet = { open: false, empathy: false, plain: false, checks: false, jargon: false, dismissive: false, rude: false, stacked: false }
const turn = (facts, signals = {}, jargon = []) => ({ facts, signals: { ...quiet, ...signals }, jargon })

function begin() {
  return { state: startState(ankle, 0), consult: consultStart(ankle) }
}

test('starts in the history with the case’s starting trust', () => {
  const { consult } = begin()
  assert.equal(consult.stage, 'history')
  assert.equal(consult.rapport, ankle.consult.startRapport)
  assert.equal(moodOf(consult.rapport), 'okay')
})

test('facts asked become the same choices as the tap game (points, findings, time)', () => {
  let { state, consult } = begin()
  const r = applyConsultTurn(ankle, state, consult, turn(['a-mech'], { open: true }), 1000)
  assert.deepEqual(r.applied, ['a-mech'])
  assert.ok(r.state.findings.includes('f-mech'))
  assert.equal(r.state.steps.at(-1).choiceId, 'a-mech')
  assert.equal(r.consult.turns, 1)
  assert.equal(r.consult.rapport, ankle.consult.startRapport + 2)
})

test('the AI can’t hand out facts that aren’t there, and one message draws out at most three', () => {
  const { state, consult } = begin()
  const r = applyConsultTurn(ankle, state, consult, turn(['b-ottawa', 'made-up', 'to-exam', 'a-mech', 'a-weight', 'a-history', 'a-goals', 'a-pain']), 0)
  assert.equal(r.applied.length, MAX_FACTS_PER_TURN)
  assert.ok(!r.applied.includes('b-ottawa'), 'examination choices are not facts')
  assert.ok(!r.applied.includes('to-exam'), 'moving on is not a fact')
  assert.equal(r.state.nodeId, 'history')
})

test('the hidden worry stays hidden until he trusts you, and asking too early is remembered', () => {
  let { state, consult } = begin()
  // 55 < 60: held back
  let r = applyConsultTurn(ankle, state, consult, turn(['a-worry']), 0)
  assert.deepEqual(r.applied, [])
  assert.deepEqual(r.locked, ['a-worry'])
  assert.ok(r.consult.deflected.includes('a-worry'))
  assert.ok(!r.state.findings.includes('f-worry'))
  // Empathy earns trust; the next time he tells you
  r = applyConsultTurn(ankle, r.state, r.consult, turn([], { empathy: true }), 0)
  assert.ok(r.consult.rapport >= 60)
  assert.equal(consultFacts(ankle, r.state, r.consult).find((f) => f.id === 'a-worry').locked, false)
  r = applyConsultTurn(ankle, r.state, r.consult, turn(['a-worry'], { open: true }), 0)
  assert.deepEqual(r.applied, ['a-worry'])
  assert.ok(r.state.findings.includes('f-worry'))
})

test('jargon and dismissiveness cost trust; low enough and he walks out', () => {
  let { state, consult } = begin()
  let r = applyConsultTurn(ankle, state, consult, turn([], { jargon: true }, ['ATFL', 'inversion']), 0)
  assert.equal(r.consult.rapport, ankle.consult.startRapport - 7)
  assert.deepEqual(r.consult.jargon, ['ATFL', 'inversion'])
  // One rude reply hurts, but he gives you a chance; a second brush-off and he's gone
  r = applyConsultTurn(ankle, r.state, r.consult, turn([], { rude: true, dismissive: true }), 0)
  assert.equal(r.walkedOut, false)
  r = applyConsultTurn(ankle, r.state, r.consult, turn([], { dismissive: true }), 0)
  assert.ok(r.consult.rapport <= WALKOUT_RAPPORT)
  assert.equal(r.walkedOut, true)
  assert.equal(r.consult.stage, 'done')
  assert.throws(() => applyConsultTurn(ankle, r.state, r.consult, turn(['a-mech']), 0))
  const debrief = buildConsultDebrief(ankle, r.state, r.consult)
  assert.equal(debrief.ending.title, 'Tunde walked out')
  assert.equal(debrief.scores.passed, false)
})

test('the conversation has a turn limit', () => {
  let { state, consult } = begin()
  for (let i = 0; i < ankle.consult.maxTurns; i++) ({ state, consult } = applyConsultTurn(ankle, state, consult, turn([]), 0))
  assert.throws(() => applyConsultTurn(ankle, state, consult, turn(['a-mech']), 0), /examine/)
})

/** A strong learner: every history fact with good communication, the expert's examination and plan. */
function strongRun({ note = 'full', extra = [] } = {}) {
  let { state, consult } = begin()
  const history = [...ankle.expertPath.filter((id) => ankle.nodes.history.choices.some((c) => c.id === id) && id !== 'to-exam'), ...extra]
  ;({ state, consult } = applyConsultTurn(ankle, state, consult, turn([], { open: true, empathy: true }), 0))
  for (const id of history) ({ state, consult } = applyConsultTurn(ankle, state, consult, turn([id], { open: true }), 0))
  ;({ state, consult } = consultMoveOn(ankle, state, consult, 0))
  assert.equal(consult.stage, 'case')
  assert.equal(state.nodeId, 'exam')
  const rest = ankle.expertPath.slice(ankle.expertPath.indexOf('to-exam') + 1)
  for (const id of rest) state = applyChoice(ankle, state, id, 0)
  assert.equal(state.status, 'finished')
  consult = { ...consult, stage: 'explain' }
  ;({ consult } = applyExplainTurn(ankle, consult, { ...turn([], { plain: true, empathy: true }), covered: ['e-plain', 'e-xray', 'e-worry', 'nonsense'] }))
  ;({ consult } = applyExplainTurn(ankle, consult, { ...turn([], { checks: true }), covered: ['e-final', 'e-home', 'e-safety', 'e-check'] }))
  const allMet = ankle.consult.note.rubric.map((r) => r.id)
  const noteResult = note === 'full' ? scoreNote(ankle, state, { met: allMet }) : scoreNote(ankle, state, { met: [] })
  consult = { ...consult, stage: 'done', note: { sections: { S: 's', O: 'o', A: 'a', P: 'p' }, skipped: note !== 'full' }, noteResult }
  return { state, consult }
}

test('a strong consult passes, with every skill high', () => {
  const { state, consult } = strongRun()
  const scores = consultScores(ankle, state, consult)
  assert.equal(scores.case, 100)
  assert.equal(scores.explain, 100)
  // Every rubric item ticked except the swelling, which the expert path never looks at
  assert.equal(scores.note, 98)
  assert.equal(scores.passed, true)
  assert.ok(scores.overall >= 90, `overall ${scores.overall}`)
  const skills = consultSkills(ankle, state, consult)
  for (const [k, v] of Object.entries(skills)) assert.ok(v >= 70, `${k} ${v}`)
  const debrief = buildConsultDebrief(ankle, state, consult)
  assert.deepEqual(debrief.missedQuestions, [])
  assert.deepEqual(debrief.heldBack, [])
  assert.equal(debrief.ending.outcome, 'good')
})

test('talking takes longer than tapping: the history time budget doesn’t count in a consult', () => {
  const { state, consult } = strongRun({ extra: ['a-pain'] })
  assert.ok(state.phaseSec.subjective > ankle.phases.find((p) => p.id === 'subjective').budgetSec)
  assert.equal(consultScores(ankle, state, consult).case, 100)
})

test('no note, no pass', () => {
  const { state, consult } = strongRun({ note: 'skip' })
  const scores = consultScores(ankle, state, consult)
  assert.equal(scores.note, 0)
  assert.equal(scores.passed, false)
})

test('the note can’t earn marks for findings never found, and made-up findings cost points', () => {
  let { state } = begin()
  state = applyChoice(ankle, state, 'a-mech', 0)
  const r = scoreNote(ankle, state, {
    met: ['s-mech', 'o-ottawa', 'a-dx', 'unknown'],
    quotes: { 's-mech': 'rolled it in', 'o-ottawa': 'Ottawa negative' },
    fabricated: [{ text: 'Ottawa negative', why: 'never examined' }],
  })
  assert.deepEqual(r.met, ['s-mech', 'a-dx'])
  assert.equal(r.points, 3 + 5 - 2)
  assert.equal(r.quotes['o-ottawa'], undefined)
  assert.ok(r.pct > 0 && r.pct < 100)
})

test('the debrief lists the expert’s questions you skipped and what he kept to himself', () => {
  let { state, consult } = begin()
  ;({ state, consult } = applyConsultTurn(ankle, state, consult, turn(['a-mech', 'a-worry']), 0))
  ;({ state, consult } = consultMoveOn(ankle, state, consult, 0))
  const debrief = buildConsultDebrief(ankle, state, consult)
  const missed = debrief.missedQuestions.map((q) => q.id)
  assert.ok(missed.includes('a-weight'))
  assert.ok(missed.includes('a-worry'))
  assert.ok(!missed.includes('a-mech'))
  assert.deepEqual(debrief.heldBack.map((h) => [h.id, h.askedTooEarly]), [['a-worry', true]])
  assert.ok(debrief.heldBack[0].answer.includes('scholarship'))
})
