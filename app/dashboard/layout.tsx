import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { DashboardHeader } from '@/components/dashboard/shared/DashboardHeader'
import { Toaster } from "sonner"
import NotificationToaster from '@/components/dashboard/shared/NotificationToaster'
import { DashboardSidebarWrapper } from '../../components/dashboard/shared/DashboardSidebarWrapper'
import DashboardAuthGuard from '@/components/auth/DashboardAuthGuard'

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const headerList = await headers()
  const pathname = headerList.get('x-pathname') || ''

  // /dashboard/clinic is a self-contained clinic portal with its own layout, preview sandbox, and auth rules
  if (pathname.startsWith('/dashboard/clinic')) {
    return <>{children}</>
  }

  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <DashboardAuthGuard>
      <div className="min-h-screen bg-[#F5F5DC]"> {/* 60% - Bone background */}
        {/* Dashboard Header */}
        <DashboardHeader />

        <div className="flex">
          {/* Sidebar */}
          <DashboardSidebarWrapper />

          {/* Main Content */}
          <main className="flex-1 overflow-hidden">
            <div className="h-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>

        <NotificationToaster />
        <Toaster position="top-right" />
      </div>
    </DashboardAuthGuard>
  )
}