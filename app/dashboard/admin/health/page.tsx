import { redirect } from 'next/navigation'

// Platform status now lives on the admin home page; keep old links working.
export default function AdminHealthRedirect() {
  redirect('/dashboard/admin')
}
