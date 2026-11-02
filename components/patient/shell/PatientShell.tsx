'use client'

import { useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { CalendarPlus } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import DashboardAuthGuard from '@/components/auth/DashboardAuthGuard'
import { OfflineGate } from '@/components/offline/OfflineGate'
import { usePortalHome } from '@/lib/pwa'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { primaryButtonClass } from '@/components/patient/ui'
import { NAV, PATIENT_HOME } from '@/components/patient/shell/navItems'
import { PatientBrand, PatientMobileNav, PatientSidebar } from '@/components/patient/shell/PatientNav'
import { PatientHelp, PatientNotifications, PatientThemeToggle } from '@/components/patient/shell/PatientControls'
import { PatientTour } from '@/components/patient/shell/PatientTour'
import { ConsentDialog, useConsentsSettled } from '@/components/patient/ConsentDialog'
import { WebsiteLink } from '@/components/dashboard/shared/WebsiteLink'

// Staff accounts have their own dashboards; the patient pages would only show them an empty record
const STAFF_ROLES = new Set(['physiotherapist', 'clinic_owner', 'clinic_staff', 'doctor', 'admin', 'partner'])

/** Opens the booking drawer on the Appointments page. */
export const BOOK_SESSION_HREF = `${NAV.appointments.href}?book=1`

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-pt-canvas">
      <div className="hidden p-3 pr-0 lg:block">
        <div className="h-[calc(100vh-1.5rem)] w-64 space-y-3 rounded-3xl border border-pt-line bg-pt-surface p-5">
          <Skeleton className="mb-6 h-6 w-28 rounded-lg bg-pt-sunken" />
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-xl bg-pt-sunken" />
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-6 p-4 pt-20 sm:p-8 sm:pt-20">
        <Skeleton className="h-9 w-64 rounded-xl bg-pt-sunken" />
        <Skeleton className="h-40 rounded-3xl bg-pt-sunken" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-3xl bg-pt-sunken" />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * The patient portal: its own sidebar (desktop), bottom tab bar (phones and tablets), top bar
 * with help, theme and notifications, and the first-visit tour. Colours come from
 * app/patient-portal.css; <html data-portal="patient"> lets shared components follow them.
 */
export function PatientShell({ children }: { children: ReactNode }) {
  // Offline, the PIN opens the data saved on this phone before anything shows
  return (
    <OfflineGate>
      <PatientPortal>{children}</PatientPortal>
    </OfflineGate>
  )
}

function PatientPortal({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  // Offline, the app opens on My care plan (the patient home isn't kept: its data is in the page)
  usePortalHome(NAV.carePlan.href)
  const router = useRouter()
  const user = useQuery(api.users.getMyUser) as { role?: string; firstName?: string } | null | undefined
  const isStaff = Boolean(user?.role && STAFF_ROLES.has(user.role))
  const unreadMessages = useQuery(api.chat.getUnreadCount, user?.role === 'patient' ? {} : 'skip') as number | undefined
  // The welcome tour waits until consent is done: two overlays at once block each other's buttons
  const consentsSettled = useConsentsSettled(user?.role === 'patient')

  useEffect(() => {
    if (isStaff) router.replace('/dashboard')
  }, [isStaff, router])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.portal = 'patient'
    return () => {
      delete root.dataset.portal
    }
  }, [])

  if (isStaff) return <ShellSkeleton />

  const onAppointments = pathname.startsWith(NAV.appointments.href)

  return (
    <DashboardAuthGuard loadingFallback={<ShellSkeleton />}>
      <div className="flex min-h-screen bg-pt-canvas text-pt-ink">
        <div className="hidden shrink-0 p-3 pr-0 lg:flex">
          <PatientSidebar unreadMessages={unreadMessages} className="sticky top-3 h-[calc(100vh-1.5rem)]" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 bg-pt-canvas/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
            <Link href={PATIENT_HOME} aria-label="Rehabify home" className="lg:hidden">
              <PatientBrand />
            </Link>
            <div className="hidden lg:block" />

            <div className="flex items-center gap-2">
              <WebsiteLink tone="portal" />
              {!onAppointments && (
                <Button asChild className={`${primaryButtonClass} hidden h-10 px-4 sm:inline-flex`}>
                  <Link href={BOOK_SESSION_HREF}>
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    Book a session
                  </Link>
                </Button>
              )}
              <span data-tour="help" className="inline-flex">
                <PatientHelp />
              </span>
              <PatientThemeToggle />
              <PatientNotifications />
            </div>
          </header>

          {/* Bottom room so the last card clears the tab bar and the phone's home indicator */}
          <main className="w-full min-w-0 flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-2 sm:px-6 lg:px-8 lg:pb-16 lg:pt-4">
            {children}
          </main>
        </div>

        <PatientMobileNav unreadMessages={unreadMessages} />
        <PatientTour enabled={pathname === PATIENT_HOME && consentsSettled}firstName={user?.firstName} homeHref={PATIENT_HOME} />
        {/* Terms and Privacy, asked once if missing */}
        {user?.role === 'patient' && <ConsentDialog />}
      </div>
    </DashboardAuthGuard>
  )
}
