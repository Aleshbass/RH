'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import { DashboardHeader } from '@/components/dashboard/shared/DashboardHeader'
import NotificationToaster from '@/components/dashboard/shared/NotificationToaster'
import { DashboardSidebarWrapper } from '@/components/dashboard/shared/DashboardSidebarWrapper'
import DashboardAuthGuard from '@/components/auth/DashboardAuthGuard'
import { hasOwnPortalShell } from '@/components/dashboard/shared/portalShells'

/**
 * The shared header + sidebar used by the doctor dashboard and the other shared /dashboard pages.
 *
 * This reads the pathname on the client because the /dashboard layout is not re-rendered on
 * client-side navigation (e.g. /dashboard redirecting to /dashboard/physiotherapist), so a
 * server-side check alone would leave the old shell wrapped around a portal's own shell.
 */
export function DashboardChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''

  if (hasOwnPortalShell(pathname)) {
    return <>{children}</>
  }

  return (
    <DashboardAuthGuard>
      <div className="min-h-screen bg-rh-canvas">
        <DashboardHeader />

        <div className="flex">
          <DashboardSidebarWrapper />

          <main className="flex-1 overflow-hidden">
            <div className="h-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8">{children}</div>
          </main>
        </div>

        <NotificationToaster />
        <Toaster position="top-right" />
      </div>
    </DashboardAuthGuard>
  )
}
