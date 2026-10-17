import { notFound } from 'next/navigation'
import { devToolsEnabled } from '@/components/admin/shell/adminNav'
import { ApprovalsDebug } from './ApprovalsDebug'

// Developer tools for the approval workflow. Hidden (404) in production unless
// NEXT_PUBLIC_ADMIN_DEV_TOOLS=true. The Convex functions behind it are admin-only.
export default function ApprovalsDebugPage() {
  if (!devToolsEnabled()) notFound()
  return <ApprovalsDebug />
}
