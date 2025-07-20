import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { DashboardHeader } from '@/components/dashboard/shared/DashboardHeader'
import { Toaster } from "sonner"
import NotificationToaster from '@/components/dashboard/shared/NotificationToaster'
import { DashboardSidebarWrapper } from '../../components/dashboard/shared/DashboardSidebarWrapper'

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const { userId } = await auth()
  
  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Dashboard Header */}
      <DashboardHeader />
      
      <div className="flex">
        {/* Sidebar */}
        <DashboardSidebarWrapper />
        
        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <div className="h-full px-6 py-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
      
      <NotificationToaster />
      <Toaster position="top-right" />
    </div>
  )
} 