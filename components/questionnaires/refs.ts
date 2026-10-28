import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import type { QueryResult } from '@/lib/convexUntyped'
import type { forPatient, getMine, getResult, myPending, myQuestionnaires, seriesForPatient } from '@/convex/questionnaires'
import type { AnswerValue, PsfsActivity } from '@/lib/questionnaires/types'

/**
 * convex/questionnaires.ts, by name: the generated `api` object is at TypeScript's depth limit
 * in this repo. Result types are read from the functions themselves.
 */

type QId = Id<'patientQuestionnaires'>

export type PatientQuestionnaires = QueryResult<typeof forPatient>
export type QuestionnaireSummary = NonNullable<PatientQuestionnaires>['items'][number]
export type QuestionnaireResult = QueryResult<typeof getResult>
export type MyPending = QueryResult<typeof myPending>
export type MyQuestionnaires = QueryResult<typeof myQuestionnaires>
export type MyQuestionnaire = QueryResult<typeof getMine>
/** Completed questionnaires as progress-chart series, keyed like clinical-note measures (seriesKey) */
export type QuestionnaireSeries = NonNullable<QueryResult<typeof seriesForPatient>>[number]

export const questionnaireRefs = {
  forPatient: makeFunctionReference<'query', { patientId: Id<'users'> }, PatientQuestionnaires>('questionnaires:forPatient'),
  getResult: makeFunctionReference<'query', { id: QId }, QuestionnaireResult>('questionnaires:getResult'),
  seriesForPatient: makeFunctionReference<'query', { patientId: Id<'users'> }, QuestionnaireSeries[] | null>(
    'questionnaires:seriesForPatient'
  ),
  send: makeFunctionReference<
    'mutation',
    { patientId: Id<'users'>; instruments: string[]; message?: string; appointmentId?: Id<'appointments'>; dueAt?: number },
    { sent: number; updated: string[] }
  >('questionnaires:send'),
  remind: makeFunctionReference<'mutation', { id: QId }, null>('questionnaires:remind'),
  cancel: makeFunctionReference<'mutation', { id: QId }, null>('questionnaires:cancel'),
  markReviewed: makeFunctionReference<'mutation', { id: QId }, null>('questionnaires:markReviewed'),
  enterResponse: makeFunctionReference<
    'mutation',
    { patientId: Id<'users'>; instrument: string; answers?: AnswerValue[]; psfs?: PsfsActivity[]; requestId?: QId; completedAt?: number },
    QId
  >('questionnaires:enterResponse'),
  myPending: makeFunctionReference<'query', Record<string, never>, MyPending>('questionnaires:myPending'),
  myQuestionnaires: makeFunctionReference<'query', Record<string, never>, MyQuestionnaires>('questionnaires:myQuestionnaires'),
  getMine: makeFunctionReference<'query', { id: QId }, MyQuestionnaire>('questionnaires:getMine'),
  saveDraft: makeFunctionReference<'mutation', { id: QId; answers?: AnswerValue[]; psfs?: PsfsActivity[] }, null>('questionnaires:saveDraft'),
  submit: makeFunctionReference<'mutation', { id: QId; answers?: AnswerValue[]; psfs?: PsfsActivity[] }, { total: number | null }>(
    'questionnaires:submit'
  ),
}
