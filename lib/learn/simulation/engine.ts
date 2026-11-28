/**
 * Rehabify Learn clinical simulations: the case engine (owner 2026-11-13, Stage 1).
 *
 * A case is a set of nodes (what's happening) with choices (what the physio does). Each choice costs
 * virtual time, can change the patient's vitals and pain, reveals findings, and carries points, a tag
 * (critical … harmful) and feedback for the debrief. Triage cases also run against a real clock.
 *
 * Pure TypeScript with no imports and only erasable syntax, so this one file runs unchanged in Node
 * tests (`node --test`), in Convex (the server is the referee: it applies choices and scores) and in
 * the browser (live vitals between server updates). Never trust a score computed in the browser.
 */

// ── Case definition ───────────────────────────────────────────────────────────

export type Vitals = { hr: number; spo2: number; bpSys: number; bpDia: number; rr: number }
export type PhaseId = 'triage' | 'subjective' | 'objective' | 'plan'
export type ScoreTag = 'critical' | 'high-yield' | 'neutral' | 'wasteful' | 'harmful'
export type Outcome = 'good' | 'fair' | 'poor' | 'harm'

/** Something said aloud: shown as a caption and voiced (public/sims/<slug>/v<version>/<audio id>.mp3). */
export type SimLine = { speaker: string; text: string }

/**
 * How an action reads in the player's dock (Ask · Examine · Do · Get help, or a "move on" button).
 * Neutral on purpose: it says what kind of action it is, never whether it's right.
 */
export type SimCategory = 'ask' | 'examine' | 'do' | 'help' | 'next'
export const SIM_CATEGORIES: SimCategory[] = ['ask', 'examine', 'do', 'help', 'next']

export type SimChoice = {
  id: string
  label: string
  /** Optional; otherwise read from the wording (choiceCategory). */
  category?: SimCategory
  costSec: number
  next: string
  points: number
  tag: ScoreTag
  feedback: string
  /** What the patient (or someone) says back. */
  reply?: SimLine
  reveals?: string[]
  effects?: { vitals?: Partial<Vitals>; pain?: number; flags?: string[]; scene?: string }
  /** Choices can be taken once (questions in a history-taking hub); repeatable ones stay. */
  repeatable?: boolean
}

export type SimEnd = { outcome: Outcome; title: string; summary: string }

export type SimNode = {
  id: string
  phase: PhaseId
  prompt: string
  lines?: SimLine[]
  scene?: string
  choices?: SimChoice[]
  /** An ending: no choices. */
  end?: SimEnd
}

/**
 * A scene: the still (also the video's first frame) and a silent idle loop. `mouth`: where the
 * patient's mouth is in each frame of that video (JSON from Blender), so the browser moves their lips
 * to their voice right in the scene (components/learn/sims/talkingFace.ts; no cut to a close-up,
 * owner 2026-11-14). `credit`: attribution a CC BY model needs.
 */
export type SimScene = {
  src: string
  alt: string
  video?: string
  mouth?: string
  credit?: string
  /** Drawn in 2D instead of video (components/learn/sims/art2d): the pose to draw; `src` is its still. */
  art2d?: { pose: string; character?: string; mood?: 'calm' | 'uneasy' | 'worried' | 'pain' }
}
export type SimFinding = { id: string; label: string; detail: string; abnormal?: boolean }
export type SimSpeaker = { name: string; role: string; voice?: string }
export type SimPhase = { id: PhaseId; label: string; budgetSec: number }
export type SimReference = { label: string; url?: string }
/** The patient worsens with time until a flag (e.g. "escalated") is set. */
export type SimDrift = { everySec: number; vitals: Partial<Vitals>; maxSteps: number; stopFlag: string }

export type SimCase = {
  slug: string
  version: number
  title: string
  summary: string
  specialty: 'msk' | 'neuro' | 'cardioresp' | 'sports'
  difficulty: 1 | 2 | 3
  mode: 'triage' | 'full'
  /** Triage: the hard limit for real time + action time. */
  timeLimitSec?: number
  estimatedMinutes: number
  setting: string
  patient: { name: string; age: number; sex: 'M' | 'F'; occupation?: string; presentingComplaint: string }
  speakers: Record<string, SimSpeaker>
  /** Whether a bedside monitor is part of the scene (it switches on with the "monitor" flag). */
  monitor: boolean
  vitals: Vitals
  pain: number
  drift?: SimDrift
  phases: SimPhase[]
  startNode: string
  nodes: Record<string, SimNode>
  findings: Record<string, SimFinding>
  mustDo: string[]
  autoFail: string[]
  /** The best path, choice by choice: also defines the maximum score. */
  expertPath: string[]
  passMark: number
  learningPoints: string[]
  references: SimReference[]
  /** Scene art: a still (also the video's first frame) and, optionally, a looping video of the patient. */
  scenes?: Record<string, SimScene>
  timeoutEnd?: SimEnd
  /** Voice lines have been generated for this version. */
  audio?: boolean
  /**
   * A narrator reads each situation ("<node>-narration") and ending ("<node>-ending") in the shared
   * replay and its video (scripts/sims/voice.mjs). Not used in the game itself.
   */
  narration?: boolean
  /** Narrator voice (ElevenLabs id); voice.mjs picks one no speaker uses when unset. */
  narrator?: { voice: string }
  /** "Talk to the patient" mode (owner 2026-11-26): see the Consult section below. */
  consult?: ConsultSpec
}

// ── Attempt state ─────────────────────────────────────────────────────────────

export type SimStep = { nodeId: string; choiceId: string; atMs: number; clockSec: number }
export type FinishReason = 'end' | 'timeout' | 'auto-fail'

export type SimState = {
  nodeId: string
  startedAt: number
  virtualSec: number
  phaseSec: Partial<Record<PhaseId, number>>
  vitals: Vitals
  pain: number
  flags: string[]
  findings: string[]
  scene: string | null
  lastChoiceId: string | null
  steps: SimStep[]
  driftFrozen: number | null
  status: 'active' | 'finished'
  finish: null | { reason: FinishReason; endNodeId: string | null; atMs: number; clockSec: number }
}

export class SimError extends Error {
  code: 'finished' | 'unavailable' | 'invalid'
  constructor(code: 'finished' | 'unavailable' | 'invalid', message: string) {
    super(message)
    this.code = code
  }
}

/** Seconds allowed for network lag when a triage choice arrives right at the limit. */
export const GRACE_SEC = 3
export const MONITOR_FLAG = 'monitor'

/** The dock group for an action: the case's own category, else read from the wording. */
export function choiceCategory(choice: Pick<SimChoice, 'label' | 'category' | 'costSec'>): SimCategory {
  if (choice.category) return choice.category
  const l = choice.label.toLowerCase().trim()
  if (choice.costSec === 0) return 'next'
  if (l.startsWith('“') || /^(call|escalate)|referral|refer |emergency department|doctor on call|phone ahead/.test(l)) return 'help'
  if (l.endsWith('?') || /^(ask|how |what |where |any |have you|could you|tell me|did you)/.test(l)) return 'ask'
  if (/^(check|look|test|press|measure|palpate|gentle|squeeze|straight leg|full lower|lumbar|observe|do a |feel)/.test(l)) return 'examine'
  return 'do'
}

/** Whether taking this action puts the patient on the monitor (the player offers it as a chip). */
export const attachesMonitor = (choice: Pick<SimChoice, 'effects'>) => Boolean(choice.effects?.flags?.includes(MONITOR_FLAG))

const VITAL_LIMITS: Record<keyof Vitals, [number, number]> = {
  hr: [30, 200],
  spo2: [60, 100],
  bpSys: [60, 240],
  bpDia: [30, 140],
  rr: [6, 50],
}
const VITAL_KEYS = Object.keys(VITAL_LIMITS) as (keyof Vitals)[]

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function addVitals(base: Vitals, delta: Partial<Vitals> | undefined, times = 1): Vitals {
  const out = { ...base }
  for (const key of VITAL_KEYS) {
    const d = delta?.[key]
    if (typeof d === 'number') out[key] = base[key] + d * times
    out[key] = clamp(Math.round(out[key]), VITAL_LIMITS[key][0], VITAL_LIMITS[key][1])
  }
  return out
}

function copyState(s: SimState): SimState {
  return {
    ...s,
    phaseSec: { ...s.phaseSec },
    vitals: { ...s.vitals },
    flags: [...s.flags],
    findings: [...s.findings],
    steps: s.steps.map((step) => ({ ...step })),
    finish: s.finish ? { ...s.finish } : null,
  }
}

export function timeLimit(def: SimCase): number | null {
  return def.mode === 'triage' ? (def.timeLimitSec ?? 60) : null
}

/** Case time so far: triage counts real time plus action time; full cases count action time. */
export function clockSec(def: SimCase, state: SimState, now: number): number {
  if (state.finish) return state.finish.clockSec
  const real = def.mode === 'triage' ? Math.max(0, (now - state.startedAt) / 1000) : 0
  return real + state.virtualSec
}

export function startState(def: SimCase, now: number): SimState {
  const start = def.nodes[def.startNode]
  if (!start) throw new SimError('invalid', 'This case has no start.')
  return {
    nodeId: def.startNode,
    startedAt: now,
    virtualSec: 0,
    phaseSec: {},
    vitals: addVitals(def.vitals, undefined),
    pain: clamp(def.pain, 0, 10),
    flags: [],
    findings: [],
    scene: start.scene ?? null,
    lastChoiceId: null,
    steps: [],
    driftFrozen: null,
    status: 'active',
    finish: null,
  }
}

// ── Vitals over time ──────────────────────────────────────────────────────────

/** Public, answer-free description of how the vitals move, for the browser's monitor. */
export type VitalsTimeline = {
  base: Vitals
  perStep: Partial<Vitals>
  everySec: number
  maxSteps: number
  frozen: number | null
}

function rawDriftSteps(drift: SimDrift | undefined, clock: number) {
  if (!drift || drift.everySec <= 0) return 0
  return Math.min(drift.maxSteps, Math.floor(clock / drift.everySec))
}

export function vitalsTimeline(def: SimCase, state: SimState): VitalsTimeline {
  return {
    base: { ...state.vitals },
    perStep: def.drift?.vitals ?? {},
    everySec: def.drift?.everySec ?? 0,
    maxSteps: def.drift?.maxSteps ?? 0,
    frozen: def.drift ? state.driftFrozen : 0,
  }
}

export function vitalsFromTimeline(t: VitalsTimeline, clock: number): Vitals {
  const steps = t.frozen ?? (t.everySec > 0 ? Math.min(t.maxSteps, Math.floor(clock / t.everySec)) : 0)
  return addVitals(t.base, t.perStep, steps)
}

export function vitalsAt(def: SimCase, state: SimState, clock: number): Vitals {
  return vitalsFromTimeline(vitalsTimeline(def, state), clock)
}

// ── Playing ───────────────────────────────────────────────────────────────────

/** The choices on offer at the current node (questions already asked drop away). */
export function availableChoices(def: SimCase, state: SimState): SimChoice[] {
  if (state.status !== 'active') return []
  const node = def.nodes[state.nodeId]
  const taken = new Set(state.steps.map((s) => s.choiceId))
  return (node?.choices ?? []).filter((c) => c.repeatable || !taken.has(c.id))
}

export function isExpired(def: SimCase, state: SimState, now: number, grace = GRACE_SEC): boolean {
  const limit = timeLimit(def)
  return state.status === 'active' && limit !== null && clockSec(def, state, now) > limit + grace
}

function finishState(s: SimState, reason: FinishReason, endNodeId: string | null, now: number, clock: number): SimState {
  s.status = 'finished'
  s.finish = { reason, endNodeId, atMs: now, clockSec: Math.round(clock * 10) / 10 }
  return s
}

/** Ends a triage attempt whose time ran out (the server calls this before anything else). */
export function expire(def: SimCase, state: SimState, now: number): SimState {
  if (!isExpired(def, state, now)) return state
  const limit = timeLimit(def) ?? 0
  return finishState(copyState(state), 'timeout', null, now, limit)
}

/** Applies one choice. Throws SimError if it isn't on offer; returns the new state. */
export function applyChoice(def: SimCase, state: SimState, choiceId: string, now: number): SimState {
  if (state.status !== 'active') throw new SimError('finished', 'This case has ended.')
  const limit = timeLimit(def)
  if (isExpired(def, state, now)) return finishState(copyState(state), 'timeout', null, now, limit ?? 0)

  const node = def.nodes[state.nodeId]
  const choice = availableChoices(def, state).find((c) => c.id === choiceId)
  if (!node || !choice) throw new SimError('unavailable', 'That option isn’t available now.')

  const s = copyState(state)
  s.virtualSec += choice.costSec
  s.phaseSec[node.phase] = (s.phaseSec[node.phase] ?? 0) + choice.costSec
  const fx = choice.effects
  if (fx?.vitals) s.vitals = addVitals(s.vitals, fx.vitals)
  if (typeof fx?.pain === 'number') s.pain = clamp(s.pain + fx.pain, 0, 10)
  for (const flag of fx?.flags ?? []) if (!s.flags.includes(flag)) s.flags.push(flag)
  for (const id of choice.reveals ?? []) if (!s.findings.includes(id)) s.findings.push(id)
  if (fx?.scene) s.scene = fx.scene
  s.lastChoiceId = choice.id

  const after = clockSec(def, s, now)
  s.steps.push({ nodeId: node.id, choiceId: choice.id, atMs: now, clockSec: Math.round(after * 10) / 10 })
  // Escalating (etc.) stops the patient getting worse from here on
  if (def.drift && s.driftFrozen === null && s.flags.includes(def.drift.stopFlag)) s.driftFrozen = rawDriftSteps(def.drift, after)

  const next = def.nodes[choice.next]
  if (def.autoFail.includes(choice.id)) return finishState(s, 'auto-fail', next?.end ? next.id : null, now, after)
  if (!next) throw new SimError('invalid', 'This case is broken: the next step is missing.')
  if (next.end) return finishState(s, 'end', next.id, now, after)
  if (limit !== null && after >= limit) return finishState(s, 'timeout', null, now, limit)
  s.nodeId = next.id
  if (next.scene) s.scene = next.scene
  return s
}

// ── Scoring and debrief ───────────────────────────────────────────────────────

type IndexedChoice = { choice: SimChoice; node: SimNode }

export function choiceIndex(def: SimCase): Map<string, IndexedChoice> {
  const map = new Map<string, IndexedChoice>()
  for (const node of Object.values(def.nodes)) for (const choice of node.choices ?? []) map.set(choice.id, { choice, node })
  return map
}

export function maxPoints(def: SimCase): number {
  const index = choiceIndex(def)
  return def.expertPath.reduce((sum, id) => sum + Math.max(0, index.get(id)?.choice.points ?? 0), 0)
}

/** Points taken off per phase that ran over its time budget (full cases). */
export const OVER_BUDGET_PENALTY = 5

export type SimScore = {
  points: number
  maxPoints: number
  pct: number
  passed: boolean
  outcome: Outcome
  reason: FinishReason | null
  mustDoMissed: string[]
  harmful: string[]
  overBudget: PhaseId[]
}

export function endingOf(def: SimCase, state: SimState): SimEnd | null {
  const f = state.finish
  if (!f) return null
  const node = f.endNodeId ? def.nodes[f.endNodeId] : undefined
  if (node?.end) return node.end
  if (f.reason === 'timeout') {
    return def.timeoutEnd ?? { outcome: 'poor', title: 'Time ran out', summary: 'The patient needed action sooner.' }
  }
  const last = state.lastChoiceId ? choiceIndex(def).get(state.lastChoiceId)?.choice : undefined
  return { outcome: 'harm', title: 'Unsafe decision', summary: last?.feedback ?? 'That choice put the patient at risk.' }
}

/** `skipBudget`: phases whose time budget doesn't count (a consult's conversation runs on real talk). */
export function scoreState(def: SimCase, state: SimState, opts: { skipBudget?: PhaseId[] } = {}): SimScore {
  const index = choiceIndex(def)
  const taken = state.steps.map((s) => s.choiceId)
  const takenSet = new Set(taken)
  const max = maxPoints(def)
  let points = 0
  const harmful: string[] = []
  for (const id of taken) {
    const choice = index.get(id)?.choice
    if (!choice) continue
    points += choice.points
    if (choice.tag === 'harmful') harmful.push(id)
  }
  const skip = opts.skipBudget ?? []
  const overBudget =
    def.mode === 'full'
      ? def.phases.filter((p) => !skip.includes(p.id) && (state.phaseSec[p.id] ?? 0) > p.budgetSec).map((p) => p.id)
      : []
  points -= overBudget.length * OVER_BUDGET_PENALTY
  const pct = max > 0 ? clamp(Math.round((points / max) * 100), 0, 100) : 0
  const mustDoMissed = def.mustDo.filter((id) => !takenSet.has(id))
  const ending = endingOf(def, state)
  const outcome: Outcome = ending?.outcome ?? 'poor'
  const reason = state.finish?.reason ?? null
  const passed =
    state.status === 'finished' &&
    reason === 'end' &&
    mustDoMissed.length === 0 &&
    pct >= def.passMark &&
    (outcome === 'good' || outcome === 'fair')
  return { points, maxPoints: max, pct, passed, outcome, reason, mustDoMissed, harmful, overBudget }
}

export type SimDebrief = {
  score: SimScore
  ending: SimEnd
  timeSec: number
  timeline: { choiceId: string; label: string; phase: PhaseId; tag: ScoreTag; points: number; feedback: string; costSec: number; clockSec: number }[]
  critical: { choiceId: string; label: string; done: boolean; feedback: string }[]
  expertPath: { choiceId: string; label: string; feedback: string }[]
  foundFindings: SimFinding[]
  missedFindings: SimFinding[]
  learningPoints: string[]
  references: SimReference[]
}

export function buildDebrief(def: SimCase, state: SimState): SimDebrief {
  const index = choiceIndex(def)
  const score = scoreState(def, state)
  const taken = new Set(state.steps.map((s) => s.choiceId))
  const found = new Set(state.findings)
  return {
    score,
    ending: endingOf(def, state) ?? { outcome: 'poor', title: 'Unfinished', summary: '' },
    timeSec: Math.round(state.finish?.clockSec ?? state.virtualSec),
    timeline: state.steps.map((step) => {
      const hit = index.get(step.choiceId)
      return {
        choiceId: step.choiceId,
        label: hit?.choice.label ?? step.choiceId,
        phase: hit?.node.phase ?? 'triage',
        tag: hit?.choice.tag ?? 'neutral',
        points: hit?.choice.points ?? 0,
        feedback: hit?.choice.feedback ?? '',
        costSec: hit?.choice.costSec ?? 0,
        clockSec: step.clockSec,
      }
    }),
    critical: def.mustDo.map((id) => {
      const choice = index.get(id)?.choice
      return { choiceId: id, label: choice?.label ?? id, done: taken.has(id), feedback: choice?.feedback ?? '' }
    }),
    expertPath: def.expertPath.map((id) => {
      const choice = index.get(id)?.choice
      return { choiceId: id, label: choice?.label ?? id, feedback: choice?.feedback ?? '' }
    }),
    foundFindings: state.findings.map((id) => def.findings[id]).filter((f): f is SimFinding => Boolean(f)),
    missedFindings: Object.values(def.findings).filter((f) => f.abnormal && !found.has(f.id)),
    learningPoints: def.learningPoints,
    references: def.references,
  }
}

// ── Case lint ─────────────────────────────────────────────────────────────────

/** Problems that would make a case unplayable or unfair. Empty means the case is sound. */
export function validateCase(def: SimCase): string[] {
  const problems: string[] = []
  const say = (msg: string) => problems.push(msg)
  if (!def.slug || !/^[a-z0-9-]+$/.test(def.slug)) say('slug must be lowercase letters, numbers and dashes')
  if (!def.title) say('title is missing')
  if (!Number.isInteger(def.version) || def.version < 1) say('version must be a whole number from 1')
  if (def.mode === 'triage' && !def.timeLimitSec) say('triage cases need timeLimitSec')
  if (def.passMark < 0 || def.passMark > 100) say('passMark must be 0–100')
  if (!def.references?.length) say('add at least one reference')
  if (!def.learningPoints?.length) say('add learning points')
  const phases = new Set(def.phases.map((p) => p.id))
  if (!def.nodes[def.startNode]) say(`startNode "${def.startNode}" doesn't exist`)

  const seenChoices = new Set<string>()
  const speakerOk = (line: SimLine | undefined, where: string) => {
    if (line && !def.speakers[line.speaker]) say(`${where}: unknown speaker "${line.speaker}"`)
  }
  for (const [key, node] of Object.entries(def.nodes)) {
    if (node.id !== key) say(`node "${key}" has id "${node.id}"`)
    if (!phases.has(node.phase)) say(`node "${key}" uses phase "${node.phase}" that isn't in phases`)
    if (node.scene && def.scenes && !def.scenes[node.scene]) say(`node "${key}": unknown scene "${node.scene}"`)
    node.lines?.forEach((line, i) => speakerOk(line, `node "${key}" line ${i}`))
    if (node.end) {
      if (node.choices?.length) say(`ending "${key}" must not have choices`)
      continue
    }
    if (!node.choices?.length) {
      say(`node "${key}" has no choices and no ending`)
      continue
    }
    if (!node.choices.some((c) => c.next !== key)) say(`node "${key}" has no way out`)
    for (const c of node.choices) {
      if (seenChoices.has(c.id)) say(`choice id "${c.id}" is used twice`)
      seenChoices.add(c.id)
      if (!def.nodes[c.next]) say(`choice "${c.id}" goes to missing node "${c.next}"`)
      if (c.costSec < 0) say(`choice "${c.id}" has a negative time cost`)
      if (c.category && !SIM_CATEGORIES.includes(c.category)) say(`choice "${c.id}" has an unknown category "${c.category}"`)
      if (!c.feedback) say(`choice "${c.id}" has no feedback`)
      for (const f of c.reveals ?? []) if (!def.findings[f]) say(`choice "${c.id}" reveals missing finding "${f}"`)
      if (c.effects?.scene && def.scenes && !def.scenes[c.effects.scene]) say(`choice "${c.id}": unknown scene "${c.effects.scene}"`)
      speakerOk(c.reply, `choice "${c.id}" reply`)
    }
  }
  for (const id of def.mustDo) if (!seenChoices.has(id)) say(`mustDo "${id}" isn't a choice`)
  for (const id of def.autoFail) if (!seenChoices.has(id)) say(`autoFail "${id}" isn't a choice`)
  const index = choiceIndex(def)
  for (const id of def.autoFail) if (index.get(id)?.choice.tag !== 'harmful') say(`autoFail "${id}" should be tagged harmful`)
  if (def.drift && !Object.values(def.nodes).some((n) => n.choices?.some((c) => c.effects?.flags?.includes(def.drift!.stopFlag)))) {
    say(`no choice sets the drift stop flag "${def.drift.stopFlag}"`)
  }

  // Everything is reachable from the start
  const reached = new Set<string>()
  const queue = [def.startNode]
  while (queue.length) {
    const id = queue.shift()!
    if (reached.has(id) || !def.nodes[id]) continue
    reached.add(id)
    for (const c of def.nodes[id].choices ?? []) queue.push(c.next)
  }
  for (const key of Object.keys(def.nodes)) if (!reached.has(key)) say(`node "${key}" can't be reached`)

  // The expert path is playable from the start and ends well, covering every mustDo
  if (def.nodes[def.startNode]) {
    let state = startState(def, 0)
    for (const id of def.expertPath) {
      try {
        state = applyChoice(def, state, id, 0)
      } catch {
        say(`expertPath: "${id}" isn't on offer at that point`)
        break
      }
    }
    const score = scoreState(def, state)
    if (state.status !== 'finished' || state.finish?.reason !== 'end') say('expertPath must reach an ending')
    else if (score.outcome !== 'good') say('expertPath must reach a good ending')
    else if (!score.passed) say('expertPath must pass (check mustDo, passMark and phase budgets)')
    if (maxPoints(def) <= 0) say('expertPath must earn points')
  }
  if (def.consult) problems.push(...validateConsult(def))
  return problems
}

// ── Consult mode: talk to the patient (owner 2026-11-26) ─────────────────────
//
// The learner clerks the patient in their own words instead of tapping questions. An AI plays the
// patient, but it never scores: for each message it says which of the history node's questions
// (the case's facts) the learner asked and which communication behaviours it showed. Everything
// else happens here, in the same referee as the tap-to-choose game:
//   - facts asked become the same choices (points, findings, time), so scores stay comparable;
//   - trust (rapport) moves by fixed weights per behaviour; guarded facts (the worry the patient
//     holds back) are only shared once trust is high enough, and very low trust ends the visit;
//   - after the plan the learner explains it to the patient (a checklist the AI ticks), then writes
//     a SOAP note marked against the case's rubric.

/** What one learner message did, as judged by the AI from the patient's chair. */
export type ConsultSignals = {
  /** An open question ("Tell me what happened") */
  open: boolean
  /** Acknowledges a feeling or worry */
  empathy: boolean
  /** Explains something in plain words */
  plain: boolean
  /** Checks understanding or summarises back */
  checks: boolean
  /** Medical words a layperson wouldn't know, unexplained */
  jargon: boolean
  /** Ignores or brushes off what the patient just said */
  dismissive: boolean
  rude: boolean
  /** Three or more questions at once */
  stacked: boolean
}
export const SIGNAL_KEYS: (keyof ConsultSignals)[] = ['open', 'empathy', 'plain', 'checks', 'jargon', 'dismissive', 'rude', 'stacked']

/** How much each behaviour moves the patient's trust (0–100). */
export const RAPPORT_WEIGHTS: Record<keyof ConsultSignals, number> = {
  open: 2,
  empathy: 8,
  plain: 3,
  checks: 4,
  jargon: -7,
  dismissive: -12,
  rude: -25,
  stacked: -3,
}
/** At or below this trust the patient leaves. */
export const WALKOUT_RAPPORT = 10
/** The most facts one message can draw out (a "tell me everything" message can't empty the case). */
export const MAX_FACTS_PER_TURN = 3
/** Each made-up finding in the note costs this many points (at most three count). */
export const FABRICATION_PENALTY = 2
/** The least communication and note score (%) a consult needs to pass, whatever the total. */
export const PASS_PART = 50

export type NoteSection = 'S' | 'O' | 'A' | 'P'
export const NOTE_SECTIONS: NoteSection[] = ['S', 'O', 'A', 'P']

export type ConsultSpec = {
  /** The history hub whose choices are the facts the patient can share */
  node: string
  /** The choice that ends the history (to the examination) */
  moveOn: string
  persona: {
    /** How they talk */
    voice: string
    /** Non-clinical colour the patient may use freely */
    background: string
    worries: string[]
    annoyances: string[]
    /** A hint at the hidden worry, dropped once early on */
    cue?: string
    /** How to answer health questions the case doesn't cover */
    unknown: string
    language?: string
    /** What happens if they leave (the ending) */
    walkout: string
  }
  startRapport: number
  /** Facts held back until trust is high enough; `deflect` is how they dodge it before then */
  guarded: { choice: string; minRapport: number; deflect: string }[]
  /**
   * After the plan: the questions and what a good explanation covers. `speaker`: someone else you
   * explain to (a speaker key, e.g. the daughter once the patient has left in the ambulance), with
   * `who` describing them for the AI; `intro` sets the scene.
   */
  explain: { questions: string[]; items: { id: string; label: string; points: number }[]; speaker?: string; who?: string; intro?: string }
  note: {
    /** `finding`: only creditable if the learner found it (otherwise it was made up) */
    rubric: { id: string; section: NoteSection; label: string; points: number; finding?: string }[]
    model: Record<NoteSection, string>
  }
  /** A model consultation to compare with (draft until a physio signs the case off) */
  expert: { label: string; transcript: { speaker: 'physio' | 'patient'; text: string; note?: string }[] }
  maxTurns: number
  explainTurns: number
  /**
   * The home exercise programme (owner 2026-11-27: "build an exercise programme"), picked from the
   * exercise library and marked here, without AI. `include`: what a good programme covers, each met
   * by any one of `anyOf` (library exercise ids); `avoid`: wrong at this stage; `maxItems`: more
   * than this and patients don't do them.
   */
  programme?: ProgrammeSpec
}

export type ProgrammeSpec = {
  include: { id: string; label: string; points: number; anyOf: string[]; why: string }[]
  avoid: { id: string; label: string; penalty: number; anyOf: string[]; why: string }[]
  maxItems: number
  model: { exerciseId: string; dose: string; note?: string }[]
}

/**
 * One exercise in a learner's programme, dosed as on the platform (exercisePrograms items):
 * `exerciseId` is the library slug (convex/exerciseLibraryContent.ts).
 */
export type ProgrammeItem = { exerciseId: string; side?: 'L' | 'R' | null; sets?: number; reps?: number; holdSeconds?: number | null; frequency?: string }

export type ProgrammeResult = {
  met: string[]
  avoided: { id: string; label: string; why: string; exerciseIds: string[] }[]
  tooMany: boolean
  points: number
  max: number
  pct: number
}

/** Points off when a programme has more exercises than the case allows. */
export const TOO_MANY_PENALTY = 3

export type ConsultStage = 'history' | 'case' | 'explain' | 'programme' | 'note' | 'done'

export type NoteResult = {
  met: string[]
  quotes: Record<string, string>
  fabricated: { text: string; why: string }[]
  feedback: Record<NoteSection, string>
  points: number
  max: number
  pct: number
}

export type ConsultCoach = {
  moments: { turn: number; quote: string; what: string; tryInstead: string }[]
  strengths: string[]
  practise: string
}

export type ConsultState = {
  stage: ConsultStage
  rapport: number
  /** Trust after each learner message (history, then explanation) */
  rapportLog: number[]
  turns: number
  explainTurns: number
  /** Guarded facts asked about before the patient trusted them */
  deflected: string[]
  jargon: string[]
  signalCounts: Record<keyof ConsultSignals, number>
  explainCovered: string[]
  walkedOut: boolean
  note: null | { sections: Record<NoteSection, string>; skipped: boolean }
  noteResult: null | NoteResult
  coach: null | ConsultCoach
  /** Older attempts (before the programme step) don't have these */
  programme?: null | { items: ProgrammeItem[]; skipped: boolean }
  programmeResult?: null | ProgrammeResult
}

const emptySignals = (): Record<keyof ConsultSignals, number> => ({
  open: 0,
  empathy: 0,
  plain: 0,
  checks: 0,
  jargon: 0,
  dismissive: 0,
  rude: 0,
  stacked: 0,
})

export function consultStart(def: SimCase): ConsultState {
  const spec = def.consult
  if (!spec) throw new SimError('invalid', 'This case has no consult mode.')
  return {
    stage: 'history',
    rapport: clamp(spec.startRapport, 0, 100),
    rapportLog: [],
    turns: 0,
    explainTurns: 0,
    deflected: [],
    jargon: [],
    signalCounts: emptySignals(),
    explainCovered: [],
    walkedOut: false,
    note: null,
    noteResult: null,
    coach: null,
    programme: null,
    programmeResult: null,
  }
}

/** After explaining the plan: the programme if the case has one, else the note. */
export const stageAfterExplain = (def: SimCase): ConsultStage => (def.consult?.programme ? 'programme' : 'note')

/** Marks a home programme against the case: what it covers, what's unsafe now, and its length. */
export function scoreProgramme(def: SimCase, items: ProgrammeItem[]): ProgrammeResult {
  const spec = def.consult?.programme
  if (!spec) return { met: [], avoided: [], tooMany: false, points: 0, max: 0, pct: 0 }
  const picked = new Set(items.map((i) => i.exerciseId))
  const met = spec.include.filter((r) => r.anyOf.some((id) => picked.has(id))).map((r) => r.id)
  const avoided = spec.avoid
    .map((r) => ({ id: r.id, label: r.label, why: r.why, exerciseIds: r.anyOf.filter((id) => picked.has(id)) }))
    .filter((r) => r.exerciseIds.length > 0)
  const tooMany = picked.size > spec.maxItems
  const max = spec.include.reduce((s, r) => s + Math.max(0, r.points), 0)
  const earned = spec.include.filter((r) => met.includes(r.id)).reduce((s, r) => s + r.points, 0)
  const penalty = avoided.reduce((s, a) => s + (spec.avoid.find((r) => r.id === a.id)?.penalty ?? 0), 0) + (tooMany ? TOO_MANY_PENALTY : 0)
  const points = Math.max(0, earned - penalty)
  return { met, avoided, tooMany, points, max, pct: max > 0 ? clamp(Math.round((points / max) * 100), 0, 100) : 0 }
}

/** How the patient feels at a trust level (the player shows this, never the number). */
export type ConsultMood = 'at-ease' | 'okay' | 'uneasy' | 'upset'
export function moodOf(rapport: number): ConsultMood {
  if (rapport >= 70) return 'at-ease'
  if (rapport >= 45) return 'okay'
  if (rapport >= 25) return 'uneasy'
  return 'upset'
}

/**
 * Clinical words a patient wouldn't know. Found in a learner's message, they count as jargon even if
 * the AI misses them (the quick model sometimes does), unless the same message explains them.
 * Everyday words people know (ligament, sprain, fracture, X-ray, swelling) aren't here.
 */
export const JARGON_TERMS = [
  'ATFL', 'CFL', 'PTFL', 'ACL', 'PCL', 'MCL', 'LCL', 'inversion', 'eversion', 'paraesthesia', 'paresthesia', 'paraesthesiae',
  'neurovascular', 'distal', 'distally', 'proximal', 'proximally', 'lateral', 'medial', 'malleolus', 'malleoli', 'malleolar',
  'syndesmosis', 'syndesmotic', 'proprioception', 'proprioceptive', 'neuromuscular', 'effusion', 'oedema', 'edema', 'ecchymosis',
  'dorsiflexion', 'plantarflexion', 'Ottawa', 'talar', 'talus', 'fibula', 'tibiofibular', 'anterior drawer', 'instability',
  'recurrent', 'aetiology', 'etiology', 'radiculopathy', 'myotomes', 'dermatomes', 'sensorimotor', 'contralateral', 'ipsilateral',
  'bilateral', 'unilateral', 'palpation', 'palpate', 'subluxation', 'cauda equina', 'saddle anaesthesia', 'DVT', 'PE', 'NSAIDs',
]
const EXPLAINING = /\b(which means|that means|meaning|in other words|basically|that's the|that is the|it's the part|it's a)\b/i

/** Jargon words in a learner's message (none if they explain what they mean in the same message). */
export function findJargon(text: string): string[] {
  if (EXPLAINING.test(text)) return []
  const found: string[] = []
  for (const term of JARGON_TERMS) {
    const acronym = term.length <= 5 && term === term.toUpperCase()
    const re = new RegExp(`(^|[^A-Za-z])${term.replace(/ /g, '\\s+')}([^A-Za-z]|$)`, acronym ? '' : 'i')
    if (re.test(text)) found.push(term)
  }
  return found
}

/** Trust change for one message. */
export function rapportDelta(signals: Partial<ConsultSignals>): number {
  let d = 0
  for (const key of SIGNAL_KEYS) if (signals[key]) d += RAPPORT_WEIGHTS[key]
  return d
}

/**
 * The facts the patient can talk about, with whether each is held back right now. `warmUnlocks`:
 * held back, but a warm message (empathy) would earn enough trust to tell it in the same breath.
 */
export type ConsultFact = { id: string; topic: string; answer: string; shared: boolean; locked: boolean; warmUnlocks: boolean; deflect: string | null }
export function consultFacts(def: SimCase, state: SimState, consult: ConsultState): ConsultFact[] {
  const spec = def.consult
  const node = spec ? def.nodes[spec.node] : undefined
  if (!spec || !node) return []
  const taken = new Set(state.steps.map((s) => s.choiceId))
  return (node.choices ?? [])
    .filter((c) => c.id !== spec.moveOn && c.reply)
    .map((c) => {
      const guard = spec.guarded.find((g) => g.choice === c.id)
      const locked = Boolean(guard && consult.rapport < guard.minRapport && !taken.has(c.id))
      return {
        id: c.id,
        topic: c.label,
        answer: c.reply!.text,
        shared: taken.has(c.id),
        locked,
        warmUnlocks: Boolean(locked && guard && consult.rapport + RAPPORT_WEIGHTS.empathy >= guard.minRapport),
        deflect: guard?.deflect ?? null,
      }
    })
}

const unique = (xs: string[]) => [...new Set(xs)]

function copyConsult(c: ConsultState): ConsultState {
  return {
    ...c,
    rapportLog: [...c.rapportLog],
    deflected: [...c.deflected],
    jargon: [...c.jargon],
    signalCounts: { ...c.signalCounts },
    explainCovered: [...c.explainCovered],
  }
}

export type ConsultTurnInput = { facts: string[]; signals: Partial<ConsultSignals>; jargon?: string[] }
export type ConsultTurnResult = {
  state: SimState
  consult: ConsultState
  /** Facts newly shared (applied as choices) */
  applied: string[]
  /** Guarded facts asked about too early */
  locked: string[]
  walkedOut: boolean
}

function countSignals(c: ConsultState, input: ConsultTurnInput) {
  for (const key of SIGNAL_KEYS) if (input.signals[key]) c.signalCounts[key] += 1
  const terms = (input.jargon ?? []).map((t) => t.trim().slice(0, 40)).filter(Boolean)
  c.jargon = unique([...c.jargon, ...terms]).slice(0, 20)
  c.rapport = clamp(c.rapport + rapportDelta(input.signals), 0, 100)
  c.rapportLog.push(c.rapport)
}

/**
 * One learner message during the history. The AI's verdict is only advice: facts outside the
 * history node are dropped, at most MAX_FACTS_PER_TURN count, and guarded facts stay held back
 * unless trust after this message is high enough (a warm "it sounds like a lot is riding on this:
 * is anything worrying you?" can open the patient up in one go, as it would in real life).
 */
export function applyConsultTurn(def: SimCase, state: SimState, consult: ConsultState, input: ConsultTurnInput, now: number): ConsultTurnResult {
  const spec = def.consult
  if (!spec) throw new SimError('invalid', 'This case has no consult mode.')
  if (consult.stage !== 'history' || state.status !== 'active' || state.nodeId !== spec.node) {
    throw new SimError('unavailable', 'The conversation has moved on.')
  }
  if (consult.turns >= spec.maxTurns) throw new SimError('unavailable', 'Time to examine the patient.')
  // Held back judged on trust after this message
  const after = clamp(consult.rapport + rapportDelta(input.signals), 0, 100)
  const facts = consultFacts(def, state, { ...consult, rapport: after })
  const byId = new Map(facts.map((f) => [f.id, f]))
  const asked = unique(input.facts.filter((id) => byId.has(id))).slice(0, MAX_FACTS_PER_TURN)
  const locked = asked.filter((id) => byId.get(id)!.locked)
  let s = state
  const applied: string[] = []
  for (const id of asked) {
    const fact = byId.get(id)!
    if (fact.locked || fact.shared) continue
    s = applyChoice(def, s, id, now)
    applied.push(id)
  }
  const c = copyConsult(consult)
  c.turns += 1
  c.deflected = unique([...c.deflected, ...locked])
  countSignals(c, input)
  if (c.rapport <= WALKOUT_RAPPORT) {
    c.walkedOut = true
    c.stage = 'done'
  }
  return { state: s, consult: c, applied, locked, walkedOut: c.walkedOut }
}

/** Ends the history: applies the move-on choice (to the examination). */
export function consultMoveOn(def: SimCase, state: SimState, consult: ConsultState, now: number): { state: SimState; consult: ConsultState } {
  const spec = def.consult
  if (!spec || consult.stage !== 'history') throw new SimError('unavailable', 'The conversation has moved on.')
  const next = applyChoice(def, state, spec.moveOn, now)
  return { state: next, consult: { ...copyConsult(consult), stage: next.status === 'finished' ? 'explain' : 'case' } }
}

/** One learner message while explaining the plan: ticks checklist items and moves trust. */
export function applyExplainTurn(def: SimCase, consult: ConsultState, input: ConsultTurnInput & { covered: string[] }): { consult: ConsultState; newlyCovered: string[] } {
  const spec = def.consult
  if (!spec || consult.stage !== 'explain') throw new SimError('unavailable', 'This part of the visit is over.')
  if (consult.explainTurns >= spec.explainTurns) throw new SimError('unavailable', 'Time to write your note.')
  const ids = new Set(spec.explain.items.map((i) => i.id))
  const newlyCovered = unique(input.covered.filter((id) => ids.has(id) && !consult.explainCovered.includes(id)))
  const c = copyConsult(consult)
  c.explainTurns += 1
  c.explainCovered = [...c.explainCovered, ...newlyCovered]
  countSignals(c, input)
  return { consult: c, newlyCovered }
}

/**
 * The note's marks from the AI's ticks: unknown ids are ignored, and an item that depends on a
 * finding the learner never found can't be met (writing it down means it was made up).
 */
export function scoreNote(
  def: SimCase,
  state: SimState,
  verdict: { met: string[]; quotes?: Record<string, string>; fabricated?: { text: string; why: string }[]; feedback?: Partial<Record<NoteSection, string>> }
): NoteResult {
  const rubric = def.consult?.note.rubric ?? []
  const found = new Set(state.findings)
  const metSet = new Set(verdict.met)
  const met = rubric.filter((r) => metSet.has(r.id) && (!r.finding || found.has(r.finding))).map((r) => r.id)
  const max = rubric.reduce((sum, r) => sum + Math.max(0, r.points), 0)
  const fabricated = (verdict.fabricated ?? []).filter((f) => f && f.text).slice(0, 3)
  const earned = rubric.filter((r) => met.includes(r.id)).reduce((sum, r) => sum + r.points, 0)
  const points = Math.max(0, earned - fabricated.length * FABRICATION_PENALTY)
  const quotes: Record<string, string> = {}
  for (const id of met) if (verdict.quotes?.[id]) quotes[id] = verdict.quotes[id].slice(0, 200)
  const feedback = { S: '', O: '', A: '', P: '' } as Record<NoteSection, string>
  for (const k of NOTE_SECTIONS) feedback[k] = (verdict.feedback?.[k] ?? '').slice(0, 400)
  return { met, quotes, fabricated, feedback, points, max, pct: max > 0 ? clamp(Math.round((points / max) * 100), 0, 100) : 0 }
}

/** `programme` is null for cases without a programme step. */
export type ConsultScores = { case: number; communication: number; explain: number; note: number; programme: number | null; overall: number; passed: boolean }

/** History time doesn't count against a consult: talking well takes longer than tapping. */
const consultScore = (def: SimCase, state: SimState) => scoreState(def, state, { skipBudget: [def.nodes[def.consult?.node ?? '']?.phase ?? 'subjective'] })

export function consultScores(def: SimCase, state: SimState, consult: ConsultState): ConsultScores {
  const spec = def.consult
  const score = consultScore(def, state)
  const explainMax = spec ? spec.explain.items.reduce((s, i) => s + i.points, 0) : 0
  const explainGot = spec ? spec.explain.items.filter((i) => consult.explainCovered.includes(i.id)).reduce((s, i) => s + i.points, 0) : 0
  const explain = explainMax > 0 ? Math.round((explainGot / explainMax) * 100) : 0
  const communication = consult.walkedOut ? Math.min(consult.rapport, 20) : Math.round(0.4 * consult.rapport + 0.6 * explain)
  const note = consult.noteResult?.pct ?? 0
  const programme = spec?.programme ? (consult.programmeResult?.pct ?? 0) : null
  const overall =
    programme === null
      ? Math.round(0.5 * score.pct + 0.2 * communication + 0.3 * note)
      : Math.round(0.45 * score.pct + 0.2 * communication + 0.2 * note + 0.15 * programme)
  // A safe case alone isn't a pass: the patient must have understood you, and the note (and the
  // programme, when there is one) must stand up
  const passed =
    !consult.walkedOut &&
    score.passed &&
    overall >= def.passMark &&
    communication >= PASS_PART &&
    note >= PASS_PART &&
    (programme === null || programme >= PASS_PART)
  return { case: score.pct, communication, explain, note, programme, overall, passed }
}

/** `exercise`: the programme, for cases that have one. */
export type ConsultSkills = { history: number; safety: number; reasoning: number; communication: number; documentation: number; exercise?: number }

/** The skills radar for one consult (0–100 each). */
export function consultSkills(def: SimCase, state: SimState, consult: ConsultState): ConsultSkills {
  const index = choiceIndex(def)
  const spec = def.consult
  const historyNode = spec?.node
  const taken = state.steps.map((s) => s.choiceId)
  const pct = (got: number, max: number) => (max > 0 ? clamp(Math.round((got / max) * 100), 0, 100) : 0)
  let hMax = 0
  let rMax = 0
  for (const id of def.expertPath) {
    const hit = index.get(id)
    if (!hit) continue
    if (hit.node.id === historyNode) hMax += Math.max(0, hit.choice.points)
    else rMax += Math.max(0, hit.choice.points)
  }
  let hGot = 0
  let rGot = 0
  for (const id of taken) {
    const hit = index.get(id)
    if (!hit) continue
    if (hit.node.id === historyNode) hGot += Math.max(0, hit.choice.points)
    else rGot += hit.choice.points
  }
  const done = def.mustDo.filter((id) => taken.includes(id)).length
  const harmful = taken.some((id) => index.get(id)?.choice.tag === 'harmful')
  const safety = pct(done, def.mustDo.length) * (harmful ? 0.5 : 1)
  const scores = consultScores(def, state, consult)
  return {
    history: pct(hGot, hMax),
    safety: Math.round(safety),
    reasoning: pct(rGot, rMax),
    communication: scores.communication,
    documentation: scores.note,
    ...(scores.programme === null ? {} : { exercise: scores.programme }),
  }
}

/** The ending for a consult: the case's own, unless the patient walked out. */
export function consultEnding(def: SimCase, state: SimState, consult: ConsultState): SimEnd {
  if (consult.walkedOut) {
    return { outcome: 'poor', title: `${def.patient.name.split(' ')[0]} walked out`, summary: def.consult?.persona.walkout ?? 'The patient left before you finished.' }
  }
  return endingOf(def, state) ?? { outcome: 'poor', title: 'Unfinished', summary: '' }
}

export type ConsultDebrief = {
  scores: ConsultScores
  skills: ConsultSkills
  ending: SimEnd
  rapportStart: number
  rapportLog: number[]
  /** Questions the expert asks that the learner didn't (in the expert's words) */
  missedQuestions: { id: string; label: string; feedback: string; heldBack: boolean }[]
  /** What the patient was holding back, and why it stayed hidden */
  heldBack: { id: string; label: string; answer: string; askedTooEarly: boolean }[]
  explain: { id: string; label: string; points: number; covered: boolean }[]
  jargon: string[]
  note: null | {
    skipped: boolean
    sections: Record<NoteSection, string>
    result: NoteResult | null
    rubric: { id: string; section: NoteSection; label: string; points: number; met: boolean; quote: string | null }[]
    model: Record<NoteSection, string>
  }
  expert: ConsultSpec['expert'] | null
  coach: ConsultCoach | null
  programme: null | {
    skipped: boolean
    items: ProgrammeItem[]
    result: ProgrammeResult | null
    include: { id: string; label: string; points: number; why: string; met: boolean }[]
    maxItems: number
    model: ProgrammeSpec['model']
  }
}

export function buildConsultDebrief(def: SimCase, state: SimState, consult: ConsultState): ConsultDebrief {
  const spec = def.consult!
  const index = choiceIndex(def)
  const taken = new Set(state.steps.map((s) => s.choiceId))
  const guarded = new Map(spec.guarded.map((g) => [g.choice, g]))
  const historyNode = def.nodes[spec.node]
  const missedQuestions = def.expertPath
    .map((id) => index.get(id))
    .filter((hit): hit is IndexedChoice => Boolean(hit && hit.node.id === spec.node && hit.choice.id !== spec.moveOn && hit.choice.points > 0))
    .filter((hit) => !taken.has(hit.choice.id))
    .map((hit) => ({ id: hit.choice.id, label: hit.choice.label, feedback: hit.choice.feedback, heldBack: guarded.has(hit.choice.id) }))
  const heldBack = spec.guarded
    .filter((g) => !taken.has(g.choice))
    .map((g) => {
      const choice = (historyNode?.choices ?? []).find((c) => c.id === g.choice)
      return { id: g.choice, label: choice?.label ?? g.choice, answer: choice?.reply?.text ?? '', askedTooEarly: consult.deflected.includes(g.choice) }
    })
  const result = consult.noteResult
  return {
    scores: consultScores(def, state, consult),
    skills: consultSkills(def, state, consult),
    ending: consultEnding(def, state, consult),
    rapportStart: spec.startRapport,
    rapportLog: consult.rapportLog,
    missedQuestions,
    heldBack,
    explain: spec.explain.items.map((i) => ({ ...i, covered: consult.explainCovered.includes(i.id) })),
    jargon: consult.jargon,
    note: consult.note
      ? {
          skipped: consult.note.skipped,
          sections: consult.note.sections,
          result,
          rubric: spec.note.rubric.map((r) => ({
            id: r.id,
            section: r.section,
            label: r.label,
            points: r.points,
            met: Boolean(result?.met.includes(r.id)),
            quote: result?.quotes[r.id] ?? null,
          })),
          model: spec.note.model,
        }
      : null,
    expert: spec.expert ?? null,
    coach: consult.coach,
    programme:
      spec.programme && consult.programme
        ? {
            skipped: consult.programme.skipped,
            items: consult.programme.items,
            result: consult.programmeResult ?? null,
            include: spec.programme.include.map((r) => ({
              id: r.id,
              label: r.label,
              points: r.points,
              why: r.why,
              met: Boolean(consult.programmeResult?.met.includes(r.id)),
            })),
            maxItems: spec.programme.maxItems,
            model: spec.programme.model,
          }
        : null,
  }
}

function validateConsult(def: SimCase): string[] {
  const spec = def.consult!
  const problems: string[] = []
  const say = (msg: string) => problems.push(`consult: ${msg}`)
  if (def.mode !== 'full') say('only full cases can have a consult')
  const node = def.nodes[spec.node]
  if (!node) return [`consult: node "${spec.node}" doesn't exist`]
  const ids = new Set((node.choices ?? []).map((c) => c.id))
  if (!ids.has(spec.moveOn)) say(`moveOn "${spec.moveOn}" isn't a choice of "${spec.node}"`)
  if (!node.lines?.length) say(`node "${spec.node}" needs an opening line (the patient speaks first)`)
  for (const c of node.choices ?? []) {
    if (c.id !== spec.moveOn && !c.reply) say(`choice "${c.id}" needs a reply (it's what the patient says)`)
    if (c.id !== spec.moveOn && c.next !== spec.node) say(`choice "${c.id}" must stay in "${spec.node}"`)
  }
  for (const g of spec.guarded) {
    if (!ids.has(g.choice)) say(`guarded "${g.choice}" isn't a choice of "${spec.node}"`)
    if (g.minRapport <= WALKOUT_RAPPORT || g.minRapport > 100) say(`guarded "${g.choice}" needs minRapport between ${WALKOUT_RAPPORT + 1} and 100`)
    if (!g.deflect) say(`guarded "${g.choice}" needs a deflect line`)
  }
  if (spec.startRapport <= WALKOUT_RAPPORT || spec.startRapport > 100) say('startRapport must be above the walk-out level')
  if (!spec.persona?.voice || !spec.persona.unknown || !spec.persona.walkout) say('persona needs voice, unknown and walkout')
  if (!(spec.maxTurns > 0) || !(spec.explainTurns > 0)) say('maxTurns and explainTurns must be above 0')
  const explainIds = new Set<string>()
  for (const item of spec.explain.items) {
    if (explainIds.has(item.id)) say(`explain item "${item.id}" is used twice`)
    explainIds.add(item.id)
    if (!(item.points > 0)) say(`explain item "${item.id}" needs points`)
  }
  if (!spec.explain.questions.length) say('explain needs the patient’s questions')
  if (spec.explain.speaker && !def.speakers[spec.explain.speaker]) say(`explain speaker "${spec.explain.speaker}" isn't in speakers`)
  if (spec.explain.speaker && spec.explain.speaker !== 'patient' && !spec.explain.who) say('explain needs "who" when someone other than the patient is told')
  const rubricIds = new Set<string>()
  for (const r of spec.note.rubric) {
    if (rubricIds.has(r.id)) say(`rubric item "${r.id}" is used twice`)
    rubricIds.add(r.id)
    if (!NOTE_SECTIONS.includes(r.section)) say(`rubric item "${r.id}" has an unknown section`)
    if (r.finding && !def.findings[r.finding]) say(`rubric item "${r.id}" refers to missing finding "${r.finding}"`)
    if (!(r.points > 0)) say(`rubric item "${r.id}" needs points`)
  }
  for (const k of NOTE_SECTIONS) if (!spec.note.model?.[k]) say(`model note needs section ${k}`)
  if (!spec.expert?.transcript?.length) say('add the expert consultation')
  if (spec.programme) {
    const p = spec.programme
    const ids = new Set<string>()
    for (const r of [...p.include, ...p.avoid]) {
      if (ids.has(r.id)) say(`programme rule "${r.id}" is used twice`)
      ids.add(r.id)
      if (!r.anyOf?.length) say(`programme rule "${r.id}" needs exercises in anyOf`)
      if (!r.why) say(`programme rule "${r.id}" needs a why`)
    }
    for (const r of p.include) if (!(r.points > 0)) say(`programme rule "${r.id}" needs points`)
    for (const r of p.avoid) if (!(r.penalty > 0)) say(`programme rule "${r.id}" needs a penalty`)
    if (!(p.maxItems > 0)) say('programme needs maxItems')
    if (!p.model?.length) say('programme needs a model programme')
    // The model programme must itself score full marks and avoid everything on the avoid list
    const result = scoreProgramme(def, p.model.map((m) => ({ exerciseId: m.exerciseId })))
    if (result.pct !== 100) say('the model programme must meet every include rule (and nothing on the avoid list)')
  }
  return problems
}
