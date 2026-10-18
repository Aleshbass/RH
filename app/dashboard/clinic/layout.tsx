'use client'

import { useAuth } from '@clerk/nextjs'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, Lock, Menu, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from '@/components/ui/sheet'
import ClinicSidebar from '@/components/clinic/ClinicSidebar'
import ClinicPreviewBanner from '@/components/clinic/ClinicPreviewBanner'
import {
  CLINIC_AREA_LABELS,
  ClinicPreviewProvider,
  useClinicAccess,
  type ClinicArea,
} from '@/components/clinic/ClinicPreviewContext'
import { ClinicThemeProvider, ClinicThemeToggle } from '@/components/clinic/ClinicTheme'
import { ClinicBrand, PoweredByRehabify } from '@/components/clinic/ClinicBrand'
import { EmptyState } from '@/components/clinic/ui'
import Link from 'next/link'

export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicThemeProvider>
      <ClinicPreviewProvider>
        <ClinicPortal>{children}</ClinicPortal>
      </ClinicPreviewProvider>
    </ClinicThemeProvider>
  )
}

/** Which permission each clinic page needs (home is always available). Referrals live inside Patients. */
const PAGE_AREAS: { prefix: string; area: ClinicArea; orArea?: ClinicArea }[] = [
  { prefix: '/dashboard/clinic/appointments', area: 'appointments' },
  // Someone who only handles referrals still opens Patients, where the referral inbox is
  { prefix: '/dashboard/clinic/patients', area: 'patients', orArea: 'referrals' },
  { prefix: '/dashboard/clinic/billing', area: 'billing' },
  { prefix: '/dashboard/clinic/staff', area: 'team' },
  { prefix: '/dashboard/clinic/analytics', area: 'reports' },
  { prefix: '/dashboard/clinic/settings', area: 'settings' },
]

function pageForPath(pathname: string) {
  return PAGE_AREAS.find((page) => pathname === page.prefix || pathname.startsWith(`${page.prefix}/`)) ?? null
}

function PortalSkeleton() {
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

function ClinicPortal({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isLoaded: authLoaded } = useAuth()
  const { isLoaded, isPreviewMode, isDeclined, isOwner, canUse, isClinicSuspended } = useClinicAccess()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  if (!authLoaded || !isLoaded) {
    return <PortalSkeleton />
  }

  // The owner's application was declined by Rehabify
  if (isDeclined && isOwner) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50 dark:bg-neutral-950 p-4">
        <div className="max-w-md w-full bg-white dark:bg-neutral-900 p-8 rounded-xl border border-red-200 dark:border-red-900/50 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 mx-auto flex items-center justify-center dark:bg-red-500/10 dark:text-red-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-neutral-950 dark:text-white">
              Application not approved
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
              We couldn&apos;t verify your clinic. Contact support@rehabify.ng with updated documents.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push('/clinic-owner')} className="w-full">
            Update application
          </Button>
        </div>
      </div>
    )
  }

  const page = pageForPath(pathname)
  const area = page?.area ?? null
  const blocked = page !== null && !canUse(page.area) && !(page.orArea && canUse(page.orArea))

  return (
    <div className="flex min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <ClinicSidebar className="sticky top-0 h-screen" />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar (< 768px) */}
        <header className="md:hidden sticky top-0 z-40 bg-white dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 shrink-0 p-0 rounded-xl text-neutral-700 dark:text-neutral-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 bg-white dark:bg-neutral-950 border-r border-neutral-200 dark:border-neutral-800">
                <SheetHeader className="sr-only">
                  <SheetTitle>Clinic navigation</SheetTitle>
                </SheetHeader>
                <ClinicSidebar
                  className="w-full border-r-0"
                  collapsible={false}
                  onNavigate={() => setIsMobileMenuOpen(false)}
                />
              </SheetContent>
            </Sheet>

            <Link href="/dashboard/clinic" className="min-w-0">
              <ClinicBrand />
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {isClinicSuspended ? (
              <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                Suspended
              </span>
            ) : isPreviewMode ? (
              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
                Preview
              </span>
            ) : null}

            <ClinicThemeToggle />

            {canUse('settings') && (
              <Link
                href="/dashboard/clinic/settings"
                className="h-9 w-9 rounded-lg flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Clinic settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
            )}
          </div>
        </header>

        {/* Preview / verification status */}
        <ClinicPreviewBanner />

        <main className="flex-1 w-full min-w-0">
          {blocked && area ? (
            <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
              <EmptyState
                icon={<Lock className="h-8 w-8" />}
                title={`${CLINIC_AREA_LABELS[area]} isn't part of your role`}
                description="Ask the clinic owner if you need access to this page."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/clinic">Go to Home</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            children
          )}
        </main>

        {/* The desktop sidebar carries this; on phones it sits under the page */}
        <PoweredByRehabify className="md:hidden px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center" />
      </div>
    </div>
  )
}
