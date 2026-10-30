import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import type { OutcomeMoment, OutcomeQuestion } from '@/lib/outcomes/moments'
import type { OutcomeSummary } from '@/lib/outcomes/stats'

/**
 * convex/outcomes.ts, referenced by name: the generated api type sits at TypeScript's depth
 * limit (TS2589), so these spell out what each function takes and returns.
 */

export type PainChange = {
  baseline: number
  latest: number | null
  change: number | null
  meaningful: boolean | null
  points: number
} | null

export type CheckAnswers = {
  pain: number
  functionScore?: number
  goalActivity?: string
  goalScore?: number
  globalChange?: number
  rating?: number
  feedback?: string
  shareConsent?: boolean
}

export type CheckByToken =
  | { state: 'not_found' }
  | { state: 'answered'; moment: OutcomeMoment; firstName: string | null; physioName: string }
  | { state: 'expired'; moment: OutcomeMoment; firstName: string | null; physioName: string }
  | {
      state: 'open'
      moment: OutcomeMoment
      firstName: string | null
      physioName: string
      questions: OutcomeQuestion[]
      goalActivity: string | null
    }

export type WeeklyPoint = { week: number; pain: number }
export type SessionPair = { appointmentId: string; at: number; before: number; after: number }

export type PatientOutcomes =
  | null
  | { episode: null; readOnly: boolean }
  | {
      readOnly: boolean
      episode: {
        _id: Id<'careEpisodes'>
        status: 'active' | 'completed' | 'cancelled'
        condition: string | null
        startedAt: number
        completedAt: number | null
        paused: boolean
      }
      pain: PainChange
      weekly: WeeklyPoint[]
      sessions: SessionPair[]
      function: { first: number; latest: number; count: number } | null
      goal: { activity: string; first: number | null; latest: number | null } | null
      recent: { _id: string; moment: OutcomeMoment; pain: number | null; by: 'patient' | 'physio'; at: number }[]
      pending: { moment: OutcomeMoment; sentAt: number; via: string[] } | null
      next: { kind: 'before_visit' | 'weekly'; at: number } | null
      final: {
        checkId: Id<'outcomeChecks'>
        pain: number | null
        globalChange: number | null
        rating: number | null
        feedback: string | null
        canShare: boolean
        at: number
      } | null
      dischargeAsked: boolean
    }

export type RecentCourse = {
  episodeId: Id<'careEpisodes'>
  patientId: Id<'users'>
  patientName: string
  condition: string | null
  completedAt: number | null
  baseline: number | null
  latest: number | null
  rating: number | null
}

export type MyOutcomes = {
  summary: (OutcomeSummary & { recent: RecentCourse[] }) | null
  showOnProfile: boolean
  updatedAt: number | null
  publicMin: number
} | null

export type MyProgress = {
  firstName: string | null
  courses: {
    episodeId: Id<'careEpisodes'>
    status: 'active' | 'completed' | 'cancelled'
    condition: string | null
    startedAt: number
    completedAt: number | null
    physioName: string
    pain: PainChange
    weekly: WeeklyPoint[]
    sessions: SessionPair[]
    waiting: { checkId: Id<'outcomeChecks'>; moment: OutcomeMoment; sentAt: number }[]
    shared: { feedback: string | null; consented: boolean; checkId: Id<'outcomeChecks'> } | null
  }[]
} | null

const q = <Args extends Record<string, unknown>, Result>(name: string) => makeFunctionReference<'query', Args, Result>(name)
const m = <Args extends Record<string, unknown>, Result>(name: string) => makeFunctionReference<'mutation', Args, Result>(name)

export const outcomeRefs = {
  checkByToken: q<{ token: string }, CheckByToken>('outcomes:getCheckByToken'),
  submitByToken: m<{ token: string; answers: CheckAnswers }, { baseline: number | null; pain: number }>('outcomes:submitByToken'),
  forPatient: q<{ patientId: Id<'users'>; episodeId?: Id<'careEpisodes'> }, PatientOutcomes>('outcomes:getPatientOutcomes'),
  sendNow: m<
    { patientId: Id<'users'> },
    { moment: OutcomeMoment; via: string[]; url: string; phone: string | null; firstName: string | null }
  >('outcomes:sendCheckNow'),
  recordScores: m<
    { patientId: Id<'users'>; when: 'pre_session' | 'post_session' | 'check_in'; pain: number; functionScore?: number },
    { moment: OutcomeMoment }
  >('outcomes:recordScores'),
  setPaused: m<{ patientId: Id<'users'>; paused: boolean }, { paused: boolean }>('outcomes:setAutoChecksPaused'),
  mine: q<Record<string, never>, MyOutcomes>('outcomes:getMyOutcomes'),
  refreshMine: m<Record<string, never>, { refreshed: boolean }>('outcomes:refreshMyOutcomes'),
  setShowOnProfile: m<{ show: boolean }, { show: boolean }>('outcomes:setShowOutcomesOnProfile'),
  myProgress: q<Record<string, never>, MyProgress>('outcomes:getMyProgress'),
  answerMine: m<{ checkId: Id<'outcomeChecks'>; answers: CheckAnswers }, { baseline: number | null; pain: number }>('outcomes:answerMyCheck'),
  revokeShare: m<{ checkId: Id<'outcomeChecks'> }, { revoked: boolean }>('outcomes:revokeShareConsent'),
}
