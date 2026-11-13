/**
 * Camera-coach insights for physios (no network):
 *   npx tsx scripts/camera-insights.test.ts
 */
import assert from 'node:assert/strict'
import { exerciseFlags, pairPain, sessionStats, type InsightSession } from '../lib/motion/insights'
import { parseSummary, summaryAsText, summaryInput } from '../lib/motion/aiSummary'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`ok - ${name}`)
}

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 13, 12)

type SessionOptions = Partial<Omit<InsightSession, 'pain'>> & { ranges?: number[]; sets?: number[]; pain?: number | null }

function session(daysAgo: number, o: SessionOptions = {}): InsightSession {
  const ranges = o.ranges ?? [50, 50, 50, 50, 50, 50]
  const sets = o.sets ?? ranges.map((_, i) => (i < ranges.length / 2 ? 1 : 2))
  return {
    createdAt: NOW - daysAgo * DAY,
    itemIndex: 0,
    exerciseKey: 'seated-knee-extension',
    side: 'R',
    repsCounted: o.repsCounted ?? ranges.length,
    repsTarget: o.repsTarget ?? ranges.length,
    partialReps: o.partialReps ?? 0,
    averageScore: o.averageScore ?? 80,
    rehabifyScore: o.rehabifyScore ?? 80,
    repScores: o.repScores ?? ranges.map(() => 80),
    measure: { joint: 'knee', startAngle: 95, peakAngles: ranges.map((r) => 95 + r), ranges, repSeconds: ranges.map(() => 2.5), repSets: sets },
    pain: o.pain === undefined || o.pain === null ? null : { score: o.pain, difficulty: 'ok', note: null, at: NOW - daysAgo * DAY + 60_000 },
  }
}

test('session stats: range, spread, tempo, fatigue between first and last set', () => {
  const s = session(0, { ranges: [60, 60, 60, 40, 40, 40], repScores: [90, 90, 90, 70, 70, 70], partialReps: 2 })
  const st = sessionStats(s)
  assert.equal(st.rangeAvg, 50)
  assert.equal(st.rangeBest, 60)
  assert.equal(st.rangeSpread, 11)
  assert.equal(st.tempoAvg, 2.5)
  assert.equal(st.fatigueDrop, 20)
  assert.equal(st.rangeFade, 20)
  assert.equal(st.shortShare, 2 / 8)
})

test('old sessions without ranges give nulls, not zeros', () => {
  const s = { ...session(0), measure: null }
  const st = sessionStats(s)
  assert.equal(st.rangeAvg, null)
  assert.equal(st.tempoAvg, null)
  assert.equal(st.rangeFade, null)
  assert.ok(exerciseFlags([s, s]).every((f) => f.code !== 'range_drop' && f.code !== 'range_gain'))
})

test('pain pairs with the log for the same item just after the session, each log once', () => {
  const sessions = [
    { programId: 'p1', itemIndex: 0, createdAt: NOW },
    { programId: 'p1', itemIndex: 0, createdAt: NOW + 10 * 60_000 },
    { programId: 'p1', itemIndex: 1, createdAt: NOW },
  ]
  const logs = [
    { programId: 'p1', itemIndex: 0, createdAt: NOW + 2 * 60_000, painScore: 3 },
    { programId: 'p1', itemIndex: 0, createdAt: NOW + 12 * 60_000, painScore: 5 },
    { programId: 'p2', itemIndex: 1, createdAt: NOW + 60_000, painScore: 9 }, // other programme
    { programId: 'p1', itemIndex: 1, createdAt: NOW + 2 * 3_600_000, painScore: 8 }, // too late
  ]
  const pains = pairPain(sessions, logs)
  assert.equal(pains[0]?.score, 3)
  assert.equal(pains[1]?.score, 5)
  assert.equal(pains[2], null)
})

test('range up with steady pain is good news; ready to progress after two strong sessions', () => {
  const flags = exerciseFlags([
    session(10, { ranges: [40, 40, 40, 40], pain: 3 }),
    session(5, { ranges: [50, 50, 50, 50], pain: 2, rehabifyScore: 88 }),
    session(1, { ranges: [55, 55, 55, 55], pain: 2, rehabifyScore: 90 }),
  ])
  const codes = flags.map((f) => f.code)
  assert.deepEqual(codes, ['range_gain', 'ready_to_progress'])
  assert.match(flags[0].title, /Knee range up 15°/)
})

test('range down from the best earlier session is flagged, and blocks "ready to progress"', () => {
  const flags = exerciseFlags([
    session(6, { ranges: [60, 60, 60, 60], rehabifyScore: 90 }),
    session(3, { ranges: [62, 62, 62, 62], rehabifyScore: 90 }),
    session(0, { ranges: [48, 48, 48, 48], rehabifyScore: 90 }),
  ])
  assert.deepEqual(flags.map((f) => f.code), ['range_drop'])
  assert.match(flags[0].detail, /62°.*48°/)
})

test('high pain is red and first; rising pain is amber', () => {
  const high = exerciseFlags([session(3, { pain: 2 }), session(0, { pain: 8 })])
  assert.equal(high[0].code, 'pain_high')
  assert.equal(high[0].tone, 'red')
  const rising = exerciseFlags([session(9, { pain: 2 }), session(6, { pain: 2 }), session(3, { pain: 3 }), session(0, { pain: 5 })])
  assert.ok(rising.some((f) => f.code === 'pain_rising' && f.tone === 'amber'))
})

test('short reps, fading form and a dropping score are amber', () => {
  const flags = exerciseFlags([
    session(6, { rehabifyScore: 85 }),
    session(3, { rehabifyScore: 85 }),
    session(0, { rehabifyScore: 60, partialReps: 4, repScores: [90, 90, 90, 60, 60, 60] }),
  ])
  const codes = flags.map((f) => f.code)
  for (const c of ['short_reps', 'fatigue', 'score_drop']) assert.ok(codes.includes(c as never), c)
  assert.ok(flags.every((f) => f.tone === 'amber'))
})

test('the AI is given numbers only: no names, no patient notes', () => {
  const s = session(1, { pain: 4 })
  s.pain = { score: 4, difficulty: 'hard', note: 'Ada said her knee clicked at church', at: s.createdAt }
  const input = summaryInput([{ name: 'Seated knee extension', sessions: [session(9, { pain: 3 }), s] }], NOW)
  assert.ok(!input.includes('Ada'))
  assert.ok(!input.includes('church'))
  const parsed = JSON.parse(input)
  assert.equal(parsed.exercises[0].sessions.length, 2)
  assert.equal(parsed.exercises[0].sessions[1].thisWeek, true)
  assert.equal(parsed.exercises[0].sessions[0].thisWeek, false)
  assert.equal(parsed.exercises[0].sessions[1].pain, 4)
  assert.equal(parsed.exercises[0].joint, 'knee')
})

test("the AI's reply is read strictly; suggestions stay options", () => {
  assert.equal(parseSummary('not json'), null)
  assert.equal(parseSummary('{"points":[]}'), null)
  const s = parseSummary(
    'Here you go: {"headline":"Range improving, pain steady.","points":[{"text":"Knee range is up.","basis":"40° → 55°","tone":"good"},{"text":"x","basis":"","tone":"weird"},{"text":""}],"suggestions":["Add a third set.","Consider more load if pain stays ≤3."]}'
  )
  assert.ok(s)
  assert.equal(s.points.length, 2)
  assert.equal(s.points[1].tone, 'watch')
  assert.equal(s.suggestions[0], 'Consider: add a third set.')
  assert.equal(s.suggestions[1], 'Consider more load if pain stays ≤3.')
  const text = summaryAsText(s)
  assert.match(text, /AI draft, checked by me/)
  assert.match(text, /40° → 55°/)
})

console.log(`\n${passed} passed`)
