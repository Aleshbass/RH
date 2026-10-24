'use client'

import { useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { CalendarPlus } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { primaryButtonClass } from '@/components/patient/ui'
import { PatientNotifications, PatientThemeToggle } from '@/components/patient/shell/PatientControls'
import { PhysioBrand, PhysioMobileNav, PhysioSidebar, SectionTabs, PHYSIO_HOME } from '@/components/physio/PhysioSidebar'
import { PhysioHelp } from '@/components/physio/shell/PhysioHelp'
import { PhysioDutySwitch } from '@/components/physio/PhysioDutySwitch'
import { PhysioDeclined, PhysioUnderReview } from '@/components/physio/PhysioReviewStates'
import { CLINIC_PORTAL_HOME, clinicianBelongsInClinicPortal } from '@/components/clinic/clinician-routing'

/** Opens a new appointment on the calendar. */
export const NEW_APPOINTMENT_HREF = `${PHYSIO_HOME}/calendar?new=1`

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-pt-canvas">
      <div className="hidden p-3 pr-0 lg:block">
        <div className="h-[calc(100vh-1.5rem)] w-64 space-y-3 rounded-3xl border border-pt-line bg-pt-surface p-5">
          <Skeleton className="mb-6 h-6 w-28 rounded-lg bg-pt-sunken" />
          {[...Array(7)].map((_, i) => (
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

type Access = 'loading' | 'redirecting' | 'declined' | 'review' | 'full'

/**
 * Decides what a signed-in user may see in the physiotherapist portal.
 * - Not a physio / not onboarded: sent to the right place.
 * - Application under review: may finish setup in Settings; everything else shows the review screen.
 * - Declined: sees the reason and can update the application.
 */
function usePhysioAccess(pathname: string) {
  const router = useRouter()
  const user = useQuery(api.users.getMyUser)
  // Loaded alongside the user, not after it (it returns null for anyone who isn't a physio)
  const setup = useQuery(api.physioSetup.getMySetupStatus, {})

  let redirectTo: string | null = null
  if (user === null) redirectTo = '/sign-in'
  else if (user) {
    const u = user as typeof user & { clinicId?: string; onboardingSkipped?: boolean }
    if (u.role !== 'physiotherapist') redirectTo = '/dashboard'
    // Clinic clinicians without their own approved Rehabify account work from the clinic portal
    // (same rule as /dashboard: components/clinic/clinician-routing.ts)
    else if (clinicianBelongsInClinicPortal(u, setup === undefined ? undefined : (setup?.approvalStatus ?? null)))
      redirectTo = CLINIC_PORTAL_HOME
    else if (!u.onboarded && !u.onboardingSkipped) redirectTo = '/physiotherapist'
    // Onboarded but never submitted for review (older accounts): finish the application,
    // which creates the review request. Without one, every approved-only query would fail.
    else if (setup && setup.approvalStatus === null) redirectTo = '/physiotherapist'
  }

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo)
  }, [redirectTo, router])

  let access: Access
  if (redirectTo) access = 'redirecting'
  else if (user === undefined || setup === undefined) access = 'loading'
  else if (setup?.approvalStatus === 'declined') access = 'declined'
  else if (setup?.approvalStatus === 'pending_review') {
    // While under review they can finish setup in Settings
    access = pathname.startsWith(`${PHYSIO_HOME}/settings`) ? 'full' : 'review'
  } else access = 'full'

  return { access, setup, isUnderReview: setup?.approvalStatus === 'pending_review' }
}

/**
 * The physiotherapist portal, built like the patient portal: a floating sidebar (desktop), a
 * bottom tab bar (phones and tablets), a top bar with the main action, on-duty switch, help,
 * theme and notifications, and tabs for sections made of several pages. Colours come from
 * app/patient-portal.css; <html data-portal="physio"> lets older screens follow them.
 */
export function PhysioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const { access, setup, isUnderReview } = usePhysioAccess(pathname)
  const unreadMessages = useQuery(api.chat.getUnreadCount, access === 'full' ? {} : 'skip') as number | undefined

  useEffect(() => {
    const root = document.documentElement
    root.dataset.portal = 'physio'
    return () => {
      if (root.dataset.portal === 'physio') delete root.dataset.portal
    }
  }, [])

  if (access === 'loading' || access === 'redirecting') return <ShellSkeleton />
  if (access === 'declined') return <PhysioDeclined reason={setup?.approvalComments ?? undefined} />

  const onCalendar = pathname.startsWith(`${PHYSIO_HOME}/calendar`)

  return (
    <div className="flex min-h-screen bg-pt-canvas text-pt-ink">
      <div className="hidden shrink-0 p-3 pr-0 lg:flex">
        <PhysioSidebar className="sticky top-3 h-[calc(100vh-1.5rem)]" limited={isUnderReview} unreadMessages={unreadMessages} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 bg-pt-canvas/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Link href={PHYSIO_HOME} aria-label="Rehabify home" className="lg:hidden">
            <PhysioBrand />
          </Link>
          <div className="hidden lg:block" />

          <div className="flex shrink-0 items-center gap-2">
            {!isUnderReview && <PhysioDutySwitch />}
            {!isUnderReview && !onCalendar && (
              <Button asChild className={`${primaryButtonClass} hidden h-10 px-4 sm:inline-flex`}>
                <Link href={NEW_APPOINTMENT_HREF}>
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  New appointment
                </Link>
              </Button>
            )}
            <PhysioHelp />
            <PatientThemeToggle className="hidden sm:flex" />
            <PatientNotifications />
          </div>
        </header>

        {/* Bottom room so the last card clears the tab bar and the phone's home indicator */}
        <main className="w-full min-w-0 flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-2 sm:px-6 lg:px-8 lg:pb-16 lg:pt-4">
          {access === 'review' ? (
            <PhysioUnderReview setup={setup ?? null} />
          ) : (
            <>
              <SectionTabs />
              {children}
            </>
          )}
        </main>
      </div>

      <PhysioMobileNav limited={isUnderReview} unreadMessages={unreadMessages} />
    </div>
  )
}
