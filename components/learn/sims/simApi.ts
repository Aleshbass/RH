/**
 * Learn simulations: Convex references, types and paths. Plain references because the generated
 * `api` type is at TypeScript's depth limit (TS2589).
 */

import { makeFunctionReference, type RegisteredMutation, type RegisteredQuery } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import type * as sims from '@/convex/learnSims'
import type * as consult from '@/convex/learnSimConsult'
import type { SimCase } from '@/lib/learn/simulation/engine'
import { track } from '@/lib/analytics/posthog'
import { learnPath } from '../platform/learnApi'

type Returns<T> = T extends RegisteredQuery<'public', infer _A, infer R>
  ? Awaited<R>
  : T extends RegisteredMutation<'public', infer _A, infer R>
    ? Awaited<R>
    : never

export type SimList = Returns<typeof sims.listCases>
export type SimCaseCard = SimList['cases'][number]
export type SimAttempt = NonNullable<Returns<typeof sims.getAttempt>>
export type SimDebriefView = NonNullable<Returns<typeof sims.getDebrief>>
export type SimAdmin = NonNullable<Returns<typeof sims.adminCases>>
export type SimAdminCase = SimAdmin['cases'][number]
export type SimStats = NonNullable<Returns<typeof sims.adminCaseStats>>
export type SimLineView = NonNullable<SimAttempt['node']>['lines'][number]
export type SimShare = NonNullable<Returns<typeof sims.getShare>>
export type SimShareBeat = SimShare['beats'][number]
export type ConsultTurn = NonNullable<Returns<typeof consult.conversation>>[number]
export type ConsultInfo = NonNullable<SimAttempt['consult']>
export type ConsultDebriefView = NonNullable<SimDebriefView['consult']>
export type NoteSections = { S: string; O: string; A: string; P: string }

type AttemptId = Id<'learnSimAttempts'>

export const simApi = {
  list: makeFunctionReference<'query', Record<string, never>, SimList>('learnSims:listCases'),
  start: makeFunctionReference<'mutation', { slug: string; preview?: boolean; mode?: 'consult' }, { attemptId: AttemptId; serverNow: number }>(
    'learnSims:startAttempt'
  ),
  attempt: makeFunctionReference<'query', { attemptId: string }, SimAttempt | null>('learnSims:getAttempt'),
  choose: makeFunctionReference<'mutation', { attemptId: AttemptId; choiceId: string }, { serverNow: number; applied: boolean; finished: boolean }>(
    'learnSims:choose'
  ),
  finishIfExpired: makeFunctionReference<'mutation', { attemptId: AttemptId }, { finished: boolean; serverNow?: number }>('learnSims:finishIfExpired'),
  debrief: makeFunctionReference<'query', { attemptId: string }, SimDebriefView | null>('learnSims:getDebrief'),
  registerInterest: makeFunctionReference<'mutation', { caseSlug?: string }, { interested: boolean }>('learnSims:registerInterest'),
  reviewerCases: makeFunctionReference<'query', Record<string, never>, SimCase[] | null>('learnSims:reviewerCases'),
  adminCases: makeFunctionReference<'query', Record<string, never>, SimAdmin | null>('learnSims:adminCases'),
  adminLoad: makeFunctionReference<
    'mutation',
    Record<string, never>,
    { slug: string; version: number; result: 'added' | 'updated' | 'unchanged' | 'skipped'; message?: string }[]
  >('learnSims:adminLoadCases'),
  adminSignOff: makeFunctionReference<'mutation', { slug: string; reviewerName: string; note?: string }, null>('learnSims:adminSignOff'),
  adminPublish: makeFunctionReference<'mutation', { slug: string }, null>('learnSims:adminPublish'),
  adminUnpublish: makeFunctionReference<'mutation', { slug: string }, null>('learnSims:adminUnpublish'),
  adminStats: makeFunctionReference<'query', { slug: string }, SimStats | null>('learnSims:adminCaseStats'),
  createShare: makeFunctionReference<'mutation', { attemptId: string }, { code: string }>('learnSims:createShare'),
  share: makeFunctionReference<'query', { code: string }, SimShare | null>('learnSims:getShare'),
}

/** "Talk to the patient" (convex/learnSimConsult.ts). */
export const consultApi = {
  conversation: makeFunctionReference<'query', { attemptId: string }, ConsultTurn[] | null>('learnSimConsult:conversation'),
  say: makeFunctionReference<'action', { attemptId: AttemptId; text: string }, { walkedOut: boolean; stage: string }>('learnSimConsult:say'),
  moveOn: makeFunctionReference<'mutation', { attemptId: AttemptId }, null>('learnSimConsult:moveOn'),
  finishExplaining: makeFunctionReference<'mutation', { attemptId: AttemptId }, null>('learnSimConsult:finishExplaining'),
  submitNote: makeFunctionReference<'action', { attemptId: AttemptId; sections: NoteSections; skip?: boolean }, null>('learnSimConsult:submitNote'),
  transcribe: makeFunctionReference<'action', { attemptId: AttemptId; audio: ArrayBuffer }, { text: string }>('learnSimConsult:transcribe'),
  speak: makeFunctionReference<'action', { attemptId: AttemptId; index: number }, ArrayBuffer>('learnSimConsult:speak'),
}

/** A shared run's replay page (anyone with the link can watch it). */
export const replayPath = (code: string) => learnPath(`/simulations/r/${code}`)
/** The full address to send people (the Learn host once it has its own). */
export function replayUrl(code: string) {
  const path = replayPath(code)
  const base = process.env.NEXT_PUBLIC_LEARN_URL?.replace(/\/+$/, '')
  if (base) return `${base}${path}`
  return typeof window !== 'undefined' ? `${window.location.origin}${path}` : path
}

export const SIMULATIONS_PATH = learnPath('/simulations')
export const simPath = (slug: string) => learnPath(`/simulations/${slug}`)
export const attemptPath = (slug: string, attemptId: string) => `${simPath(slug)}?attempt=${attemptId}`

/** Voice lines for a case version (generated by scripts/sims/voice.mjs). */
export const voiceUrl = (slug: string, version: number, audioId: string) => `/sims/${slug}/v${version}/${audioId}.mp3`

export const SPECIALTY_LABEL: Record<string, string> = {
  msk: 'MSK',
  neuro: 'Neuro',
  cardioresp: 'Cardio-respiratory',
  sports: 'Sports',
}

export function modeLabel(c: { mode: 'triage' | 'full'; timeLimitSec: number | null; estimatedMinutes: number }) {
  return c.mode === 'triage' ? `Triage · ${c.timeLimitSec ?? 60} s` : `Full case · ~${c.estimatedMinutes} min`
}

export function formatClock(totalSec: number) {
  const s = Math.max(0, Math.round(totalSec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function errorText(err: unknown, fallback: string) {
  const data = (err as { data?: unknown })?.data
  return typeof data === 'string' && data ? data : fallback
}

/** Product analytics (consent-gated; no-op until PostHog has started). */
export function simTrack(
  event:
    | 'sim_open'
    | 'sim_start'
    | 'sim_choice'
    | 'sim_finish'
    | 'sim_abandon'
    | 'sim_interest'
    | 'sim_share'
    | 'sim_replay'
    | 'sim_video'
    | 'sim_consult_say'
    | 'sim_consult_stage'
    | 'sim_consult_note',
  props: Record<string, string | number | boolean | null>) {
  try {
    track(event, props)
  } catch {
    // analytics never breaks the case
  }
}

export const DISCLAIMER = 'Education, not clinical advice or a licence. Cases follow published guidelines; local protocols come first.'

/** Server clock minus this device's clock, from the last mutation reply (the case clock runs on it). */
let serverOffsetMs = 0
export const noteServerTime = (serverNow?: number) => {
  if (typeof serverNow === 'number') serverOffsetMs = serverNow - Date.now()
}
export const serverNowMs = () => Date.now() + serverOffsetMs
