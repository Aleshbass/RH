/**
 * Where a clinic team member works. Shared by /dashboard (app/dashboard/page.tsx), the physio
 * portal (components/physio/PhysioShell.tsx) and the clinic portal so they never disagree.
 *
 * - Clinic owner (role clinic_owner): the clinic portal, with the clinic overview.
 * - Front desk (role clinic_staff with a clinic): the clinic portal.
 * - Clinic clinician (role physiotherapist with a clinic): the physio portal, in clinic mode
 *   (the clinic's name and plan rules, no Rehabify Care). Clinic pages their role includes beyond
 *   their own clinical work (Billing, Team, Reports, Settings) stay one tap away from its sidebar.
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
 * Clinic pages a clinician opens in the physio portal instead: their day, patients, schedule and
 * messages all live there, with the full clinical workspace.
 */
const CLINICIAN_PAGES_IN_PHYSIO_PORTAL: { prefix: string; to: string }[] = [
  { prefix: `${CLINIC_PORTAL_HOME}/patients`, to: `${PHYSIO_PORTAL_HOME}/patients` },
  { prefix: `${CLINIC_PORTAL_HOME}/appointments`, to: `${PHYSIO_PORTAL_HOME}/calendar` },
  { prefix: `${CLINIC_PORTAL_HOME}/messages`, to: `${PHYSIO_PORTAL_HOME}/messages` },
]

/** Where a clinician who opened a clinic page belongs, or null when the clinic page is right. */
export function physioPortalPageFor(pathname: string): string | null {
  if (pathname === CLINIC_PORTAL_HOME) return PHYSIO_PORTAL_HOME
  // A patient's record: the same patient in their own workspace
  const record = pathname.match(/^\/dashboard\/clinic\/patients\/([^/?#]+)/)
  if (record) return `${PHYSIO_PORTAL_HOME}/patients/${record[1]}`
  const match = CLINICIAN_PAGES_IN_PHYSIO_PORTAL.find((page) => pathname === page.prefix || pathname.startsWith(`${page.prefix}/`))
  return match?.to ?? null
}
