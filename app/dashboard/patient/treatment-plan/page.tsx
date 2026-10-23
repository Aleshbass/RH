import { redirect } from 'next/navigation'

/** Older notifications link here; the page is /dashboard/patient/treatment-plans. */
export default function TreatmentPlanRedirect() {
  redirect('/dashboard/patient/treatment-plans')
}
