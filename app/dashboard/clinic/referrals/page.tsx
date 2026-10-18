import { redirect } from 'next/navigation'

/** Rehabify referrals are managed under Patients ("Referred by Rehabify"). Keeps old links working. */
export default function ClinicReferralsRedirect() {
  redirect('/dashboard/clinic/patients?filter=referred')
}
