'use client'

/**
 * Which patients the signed-in physio sees, read once from their setup status (already loaded by
 * the portal shell, so this costs nothing). The rules follow the patient, not the physio:
 *
 * - independent: own patients only. Never shown Rehabify prices, payouts, the payout schedule,
 *   Rehabify services, travel zones, Rehabify Access or the network terms.
 * - both: Rehabify Care rules only for a Rehabify Care patient (useCareBillingMode), own-patient
 *   rules for everyone else.
 * - network (or unset): unchanged. Clinic members work under their clinic and are neither.
 */

import { api } from '@/convex/_generated/api'
import type { SetupStatus } from '@/components/physio/SetupChecklist'
import type { CareBillingMode } from '@/lib/rehabify-api-types'
import type { PracticeMode } from '@/lib/practiceModes'
import { useQueryUntyped } from '@/lib/convexUntyped'

const root = api as unknown as Record<string, Record<string, unknown>>

export const HOW_YOU_WORK_HREF = '/dashboard/physiotherapist/settings/practice'

export type PracticeInfo = {
  /** False until the setup status has loaded. */
  loaded: boolean
  mode: PracticeMode
  isClinicMember: boolean
  /** Own patients only: no Rehabify prices, payouts or network pages anywhere. */
  isIndependent: boolean
}

export function usePracticeMode(): PracticeInfo {
  const setup = useQueryUntyped(root.physioSetup.getMySetupStatus, {}) as SetupStatus | null | undefined
  const isClinicMember = Boolean(setup?.isClinicMember)
  const mode: PracticeMode = isClinicMember ? 'network' : (setup?.practiceMode ?? 'network')
  return { loaded: setup !== undefined, mode, isClinicMember, isIndependent: mode === 'independent' }
}

/** What an independent physio's patients always are: their own, at their own prices. */
const OWN_PATIENT: CareBillingMode = { mode: 'own', assessed: true }

/**
 * Whether a patient is a Rehabify Care patient (Rehabify prices, the physio sees only their
 * payout) or the physio's own. Independent physios never have Rehabify Care patients, so for them
 * it's always "own" and the server isn't asked. Pass null to skip.
 */
export function useCareBillingMode(patientId: string | null | undefined): CareBillingMode | null | undefined {
  const practice = usePracticeMode()
  const ask = Boolean(patientId) && practice.loaded && !practice.isIndependent
  const billing = useQueryUntyped(root.rehabifyFollowUps.getCareBillingMode, ask ? { patientId } : 'skip') as
    | CareBillingMode
    | null
    | undefined
  if (!patientId) return undefined
  if (!practice.loaded) return undefined
  return practice.isIndependent ? OWN_PATIENT : billing
}
