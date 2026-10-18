/**
 * Where a clinic team member works. Shared by /dashboard (app/dashboard/page.tsx), the physio
 * portal (components/physio/PhysioShell.tsx) and the clinic portal so they never disagree.
 *
 * - Clinic owner (role clinic_owner): the clinic portal, with the clinic overview.
 * - Front desk (role clinic_staff with a clinic): the clinic portal.
 * - Clinic clinician (role physiotherapist with a clinic):
 *   - with their own approved Rehabify physio account: the physio portal, with a link to the
 *     clinic workspace;
 *   - otherwise: the clinic portal, on their personal clinician home.
 *
 * convex/clinicTools.ts getMyClinicAccess (hasOwnPhysioPortal) applies the same rule server-side.
 */

export const CLINIC_PORTAL_HOME = '/dashboard/clinic'
export const PHYSIO_PORTAL_HOME = '/dashboard/physiotherapist'

type TeamUser = {
  role?: string | null
  clinicId?: unknown
  onboarded?: boolean | null
}

/** A physiotherapist who belongs to a clinic team (not the clinic's owner, whose role is clinic_owner). */
export function isClinicClinician(user: TeamUser | null | undefined) {
  return Boolean(user?.clinicId) && user?.role === 'physiotherapist'
}

/** Front-desk staff of a clinic. */
export function isClinicFrontDesk(user: TeamUser | null | undefined) {
  return Boolean(user?.clinicId) && user?.role === 'clinic_staff'
}

/**
 * Their own Rehabify physio account: physio onboarding finished and the account approved.
 * `approvalStatus` is the user's accountApprovalStatus.status (physioSetup.getMySetupStatus).
 */
export function hasOwnPhysioAccount(user: TeamUser | null | undefined, approvalStatus: string | null | undefined) {
  return Boolean(user?.onboarded) && approvalStatus === 'approved'
}

/**
 * True when a clinic clinician should work from the clinic portal rather than the physio portal.
 * `approvalStatus` undefined means it's still loading: only decide what's already certain.
 */
export function clinicianBelongsInClinicPortal(
  user: TeamUser | null | undefined,
  approvalStatus: string | null | undefined
) {
  if (!isClinicClinician(user)) return false
  if (!user?.onboarded) return true
  if (approvalStatus === undefined) return false
  return !hasOwnPhysioAccount(user, approvalStatus)
}
