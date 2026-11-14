import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/admin/shell/AdminShell'
import { getServerViewer, viewerIsLearnAdmin } from '@/lib/auth/serverViewer'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Server-side gate: only admins, blog writers and Learn instructors get the console (AdminShell
  // keeps the last two on their own pages, and Convex checks the role again). A null
  // viewer (e.g. Convex briefly unreachable) falls through to the client check instead of looping.
  // Learn super admins (a flag, not a role) also get the console, limited to Admin › Learn.
  const viewer = await getServerViewer()
  if (viewer && viewer.role !== 'admin' && viewer.role !== 'blog_editor' && viewer.role !== 'learn_instructor' && !(await viewerIsLearnAdmin())) {
    redirect('/dashboard')
  }

  return <AdminShell>{children}</AdminShell>
}
