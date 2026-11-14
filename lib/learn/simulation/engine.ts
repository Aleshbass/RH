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

export type SimChoice = {
  id: string
  label: string
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

export type SimScene = { src: string; alt: string; video?: string }
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

export function scoreState(def: SimCase, state: SimState): SimScore {
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
  const overBudget =
    def.mode === 'full' ? def.phases.filter((p) => (state.phaseSec[p.id] ?? 0) > p.budgetSec).map((p) => p.id) : []
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
  return problems
}
