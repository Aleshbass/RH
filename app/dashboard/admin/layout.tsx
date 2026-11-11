import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/admin/shell/AdminShell'
import { getServerViewer } from '@/lib/auth/serverViewer'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Server-side gate: only admins and blog writers get the console (AdminShell keeps blog writers
  // on /dashboard/admin/blog, and every blog function checks the role again in Convex). A null
  // viewer (e.g. Convex briefly unreachable) falls through to the client check instead of looping.
  const viewer = await getServerViewer()
  if (viewer && viewer.role !== 'admin' && viewer.role !== 'blog_editor') redirect('/dashboard')

  return <AdminShell>{children}</AdminShell>
}
