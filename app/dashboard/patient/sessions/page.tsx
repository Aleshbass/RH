import { redirect } from 'next/navigation'

/** Session-log notifications link here; patients see their sessions under Appointments. */
export default function SessionsRedirect() {
  redirect('/dashboard/patient/appointments')
}
