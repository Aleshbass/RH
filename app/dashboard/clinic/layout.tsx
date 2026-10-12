'use client'

import { useAuth } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Menu, Building2, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from '@/components/ui/sheet'
import ClinicSidebar from '@/components/clinic/ClinicSidebar'
import ClinicPreviewBanner from '@/components/clinic/ClinicPreviewBanner'
import { ClinicPreviewProvider } from '@/components/clinic/ClinicPreviewContext'
import { ClinicThemeProvider, ClinicThemeToggle } from '@/components/clinic/ClinicTheme'
import Link from 'next/link'

export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicThemeProvider>
      <ClinicPortal>{children}</ClinicPortal>
    </ClinicThemeProvider>
  )
}

function ClinicPortal({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const currentUser = useQuery(api.users.getMyUser)
  const approvalStatus = useQuery(
    api.users.getUserApprovalStatus,
    isSignedIn && currentUser ? {} : "skip"
  )
  const authRedirected = useRef(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Only show loading if Clerk auth itself is loading, or if signed in and Convex profile is still fetching
  if (!isLoaded || (isSignedIn && currentUser === undefined)) {
    return (
      <div className="flex h-screen bg-neutral-50 dark:bg-neutral-950">
        <div className="hidden md:block w-60 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4">
          <Skeleton className="h-10 w-full mb-6 rounded-xl" />
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6 sm:p-10 space-y-6">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    )
  }

  // If application was explicitly declined by admin
  if (approvalStatus && approvalStatus.status === 'declined') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50 dark:bg-neutral-950 p-4">
        <div className="max-w-md w-full bg-white dark:bg-neutral-900 p-8 rounded-xl border border-red-200 dark:border-red-900/50 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-neutral-950 dark:text-white">
              Application Not Approved
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
              Your clinic owner verification could not be approved at this time. Please contact support@rehabify.ng with your updated clinical documentation.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push('/clinic-owner')}
            className="w-full h-11 rounded-full text-xs font-medium"
          >
            Update Application
          </Button>
        </div>
      </div>
    )
  }

  // Preview mode is active for guests, users who skipped onboarding, unapproved owners, or non-owners exploring
  const isPreviewMode =
    !isSignedIn ||
    !currentUser ||
    currentUser.role !== 'clinic_owner' ||
    !currentUser.onboarded ||
    // Live actions need approval; no review record yet also counts as waiting
    (approvalStatus !== undefined && approvalStatus?.status !== 'approved')

  return (
    <ClinicPreviewProvider>
      <div className="flex min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50">
        {/* Desktop Sidebar (Fixed / Sticky on Left) */}
        <div className="hidden md:flex shrink-0">
          <ClinicSidebar className="sticky top-0 h-screen" />
        </div>

        {/* Main Content Viewport */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile Top Navigation Bar (Shown on screens < 768px) */}
          <header className="md:hidden sticky top-0 z-40 bg-white dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 rounded-xl text-neutral-700 dark:text-neutral-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
                    aria-label="Open navigation menu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-64 bg-white dark:bg-neutral-950 border-r border-neutral-200 dark:border-neutral-800">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Clinic Portal Navigation</SheetTitle>
                  </SheetHeader>
                  <ClinicSidebar
                    className="w-full border-r-0"
                    collapsible={false}
                    onNavigate={() => setIsMobileMenuOpen(false)}
                  />
                </SheetContent>
              </Sheet>

              <Link href="/dashboard/clinic" className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-[#005b57] flex items-center justify-center text-white">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <span className="font-semibold text-sm text-neutral-900 dark:text-white">Rehabify Clinic</span>
              </Link>
            </div>

            <div className="flex items-center gap-1">
              {isPreviewMode && (
                <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
                  Preview
                </span>
              )}

              <ClinicThemeToggle />

              <Link
                href="/dashboard/clinic/settings"
                className="h-9 w-9 rounded-lg flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Clinic settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </header>

          {/* Preview / verification status */}
          <ClinicPreviewBanner />

          {/* Page Body */}
          <main className="flex-1 w-full min-w-0">
            {children}
          </main>
        </div>
      </div>
    </ClinicPreviewProvider>
  )
}
