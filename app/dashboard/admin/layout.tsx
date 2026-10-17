import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/admin/shell/AdminShell'
import { getServerViewer } from '@/lib/auth/serverViewer'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Server-side gate: non-admins never receive the admin pages. A null viewer (e.g. Convex
  // briefly unreachable) falls through to the client check in AdminShell instead of looping.
  const viewer = await getServerViewer()
  if (viewer && viewer.role !== 'admin') redirect('/dashboard')

  return <AdminShell>{children}</AdminShell>
}
