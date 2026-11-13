import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import type { SessionSummary } from './session'
import type { SessionMeasure, SessionPain } from './insights'
import type { CameraSummary } from './aiSummary'

/**
 * Convex functions of the camera coach (convex/guidedSessions.ts), by name: the generated `api`
 * type is at TypeScript's depth limit, so new code refers to functions this way.
 */

/** What a finished session sends to Convex. */
export type GuidedResult = Omit<SessionSummary, 'mistakes' | 'snapshots'> & {
  itemIndex: number
  clipId: string
  exerciseKey: string
  side: 'L' | 'R'
  startedAt: number
  durationSeconds: number
  mistakes: { code: string; count: number }[]
  snapshots: { rep: number; score: number; mistakes: string[]; frames: number[][] }[]
  tracking: { model: string; delegate: string; fps: number }
}

export const saveMineRef = makeFunctionReference<'mutation', GuidedResult & { programId: Id<'exercisePrograms'> }, Id<'guidedSessions'>>(
  'guidedSessions:saveMine'
)

export const saveFromLinkRef = makeFunctionReference<'mutation', GuidedResult & { code: string; session: string }, Id<'guidedSessions'>>(
  'guidedSessions:saveFromLink'
)

export type GuidedHistoryRow = { createdAt: number; rehabifyScore: number; averageScore: number; repsCounted: number }
export const myHistoryRef = makeFunctionReference<
  'query',
  { programId: Id<'exercisePrograms'>; itemIndex: number },
  GuidedHistoryRow[] | null
>('guidedSessions:myHistory')

export type CareTeamSessionRow = {
  _id: Id<'guidedSessions'>
  programId: Id<'exercisePrograms'>
  itemIndex: number
  clipId: string
  exerciseKey: string
  side: 'L' | 'R'
  createdAt: number
  durationSeconds: number
  setsDone: number
  setsPlanned: number
  repsCounted: number
  repsTarget: number
  partialReps: number
  averageScore: number
  rehabifyScore: number
  mistakes: { code: string; count: number }[]
  topMistake: string | null
  snapshotCount: number
  source: 'app' | 'link'
  repScores: number[]
  /** Range per rep; null for sessions saved before Nov 2026 */
  measure: SessionMeasure | null
  /** Pain the patient reported straight after the session, if any */
  pain: SessionPain | null
}
export const forPatientRef = makeFunctionReference<'query', { patientId: Id<'users'> }, CareTeamSessionRow[] | null>(
  'guidedSessions:forPatient'
)

export type SessionDetail = {
  _id: Id<'guidedSessions'>
  exerciseKey: string
  side: 'L' | 'R'
  createdAt: number
  repScores: number[]
  snapshots: { rep: number; score: number; mistakes: string[]; frames: number[][] }[]
  tracking: { model: string; delegate: string; fps: number }
}
export const sessionDetailRef = makeFunctionReference<'query', { sessionId: Id<'guidedSessions'> }, SessionDetail | null>(
  'guidedSessions:sessionDetail'
)

/** AI weekly summary of a programme's camera sessions (convex/cameraInsights.ts) */
export type LatestCameraSummary = {
  enabled: boolean
  summary: (CameraSummary & { createdAt: number; weekSessions: number; totalSessions: number }) | null
}
export const latestSummaryRef = makeFunctionReference<'query', { programId: Id<'exercisePrograms'> }, LatestCameraSummary | null>(
  'cameraInsights:latestSummary'
)
export const draftSummaryRef = makeFunctionReference<'action', { programId: Id<'exercisePrograms'> }, CameraSummary>(
  'cameraInsights:draftSummary'
)
