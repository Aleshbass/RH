/**
 * Typed references to the AI scribe's Convex functions (convex/scribe.ts). Plain references,
 * because the generated api type is at TypeScript's depth limit.
 */
import { makeFunctionReference } from 'convex/server'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import type { ClinicalMeasure } from '@/convex/helpers/clinicalMeasures'
import type { ScribeDraft, ScribeNoteType } from '@/convex/helpers/scribeDraft'

/** The product name physios see */
export const SCRIBE_NAME = 'Rehabify Scribe'
/**
 * Pilot: free for every physio an admin switches it on for. After the pilot it moves to the paid
 * plan; the access check (convex/scribe.ts scribeAllowedFor) is where that gate goes.
 */
export const SCRIBE_PILOT = true

export type ScribeSession = Doc<'scribeSessions'>
export type ScribeSessionId = Id<'scribeSessions'>
export type ScribeSource = ScribeSession['source']
export type ScribeChannel = 'room' | 'physio' | 'patient'
export type ScribeSpeaker = 'physio' | 'patient'

export const scribeApi = {
  access: makeFunctionReference<'query', Record<string, never>, { enabled: boolean }>('scribe:getScribeAccess'),
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
}

/** A Convex error's own words for the physio, or the fallback. */
export function scribeError(error: unknown, fallback: string): string {
  const data = (error as { data?: unknown } | null)?.data
  if (typeof data === 'string' && data.trim()) return data
  return fallback
}
