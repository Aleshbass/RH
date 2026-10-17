import { redirect } from 'next/navigation'

// Security events are part of the activity & audit log now; keep old links working.
export default function AdminSecurityRedirect() {
  redirect('/dashboard/admin/activity')
}
