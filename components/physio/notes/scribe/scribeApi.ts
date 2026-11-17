/**
 * Typed references to the AI scribe's Convex functions (convex/scribe.ts). Plain references,
 * because the generated api type is at TypeScript's depth limit.
 */
import { makeFunctionReference } from 'convex/server'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import type { ClinicalMeasure } from '@/convex/helpers/clinicalMeasures'
import type { ScribeCarePlan, ScribeDraft, ScribeNoteType, ScribeProgramme } from '@/convex/helpers/scribeDraft'

export type { ScribeCarePlan, ScribeProgramme }

/** Where an approved programme reaches the patient, and the programme the draft would update (scribe.getProgrammeDelivery) */
export type ProgrammeDelivery = {
  whatsapp: boolean
  app: boolean
  email: boolean
  current: { _id: Id<'exercisePrograms'>; title: string; itemCount: number } | null
} | null

/** The product name physios see */
export const SCRIBE_NAME = 'Rehabify Scribe'
/**
 * Pilot: free for every physio an admin switches it on for. The "Free during the pilot" label
 * follows Admin › Settings › Rehabify Scribe (getScribeAccess.pilot): gone once Scribe is part of
 * the plans. Kept for screens that don't query access.
 */
export const SCRIBE_PILOT = true

export type ScribeSession = Doc<'scribeSessions'>
export type ScribeSessionId = Id<'scribeSessions'>
export type ScribeSource = ScribeSession['source']
export type ScribeChannel = 'room' | 'physio' | 'patient'
export type ScribeSpeaker = 'physio' | 'patient'

export const scribeApi = {
  access: makeFunctionReference<'query', Record<string, never>, { enabled: boolean; pilot?: boolean }>('scribe:getScribeAccess'),
  intro: makeFunctionReference<'query', Record<string, never>, { show: boolean }>('scribe:getScribeIntro'),
  dismissIntro: makeFunctionReference<'mutation', Record<string, never>, null>('scribe:dismissScribeIntro'),
  session: makeFunctionReference<'query', { scribeSessionId: ScribeSessionId }, ScribeSession | null>('scribe:getScribeSession'),
  open: makeFunctionReference<'query', { patientId: Id<'users'> }, ScribeSession | null>('scribe:getOpenScribe'),
  start: makeFunctionReference<
    'mutation',
    { patientId: Id<'users'>; source: ScribeSource; consentRecorded: boolean; appointmentId?: Id<'appointments'> },
    { scribeSessionId: ScribeSessionId }
  >('scribe:startScribe'),
  append: makeFunctionReference<
    'mutation',
    { scribeSessionId: ScribeSessionId; lines: { speaker?: ScribeSpeaker; text: string }[]; audioSeconds: number },
    null
  >('scribe:appendTranscript'),
  updateTranscript: makeFunctionReference<'mutation', { scribeSessionId: ScribeSessionId; transcript: string }, null>(
    'scribe:updateTranscript'
  ),
  discard: makeFunctionReference<'mutation', { scribeSessionId: ScribeSessionId }, null>('scribe:discardScribe'),
  sign: makeFunctionReference<
    'mutation',
    {
      scribeSessionId: ScribeSessionId
      noteType: ScribeNoteType
      subjectiveAssessment?: string
      objectiveAssessment?: string
      treatmentAdministered?: string
      planForNextSession?: string
      diagnosis?: string
      measures?: ClinicalMeasure[]
      voiceNoteStorageId?: Id<'_storage'>
      attachments?: Id<'_storage'>[]
    },
    { noteId: Id<'sessionLogs'> }
  >('scribe:signScribeNote'),
  token: makeFunctionReference<
    'action',
    { scribeSessionId: ScribeSessionId; channel: ScribeChannel },
    { clientSecret: string; expiresAt: number; model: string }
  >('scribe:createRealtimeToken'),
  chunk: makeFunctionReference<'action', { scribeSessionId: ScribeSessionId; audio: ArrayBuffer; channel: ScribeChannel }, { text: string }>(
    'scribe:transcribeChunk'
  ),
  generate: makeFunctionReference<'action', { scribeSessionId: ScribeSessionId }, ScribeDraft>('scribe:generateSoapNote'),
  delivery: makeFunctionReference<'query', { patientId: Id<'users'> }, ProgrammeDelivery>('scribe:getProgrammeDelivery'),
}

/** A Convex error's own words for the physio, or the fallback. */
export function scribeError(error: unknown, fallback: string): string {
  const data = (error as { data?: unknown } | null)?.data
  if (typeof data === 'string' && data.trim()) return data
  if (data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string') return (data as { message: string }).message
  return fallback
}

/** Out of Scribe sessions this month (convex/scribe.ts startScribe {code: "scribe_limit"}). */
export function isScribeLimit(error: unknown) {
  const data = (error as { data?: unknown } | null)?.data
  return Boolean(data && typeof data === 'object' && (data as { code?: unknown }).code === 'scribe_limit')
}

/** The toast for "out of sessions": write by hand now, or top up / upgrade from the plan page. */
export const SCRIBE_PLAN_PAGE = '/dashboard/physiotherapist/settings/plan'
