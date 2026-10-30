'use client'

import { useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { CalendarPlus, MessageSquare } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { primaryButtonClass } from '@/components/patient/ui'
import { PatientNotifications, PatientThemeToggle } from '@/components/patient/shell/PatientControls'
import { PortalBrand, PhysioMobileNav, PhysioSidebar, SectionTabs, PHYSIO_HOME } from '@/components/physio/PhysioSidebar'
import { ClinicModeBanner } from '@/components/physio/shell/ClinicModeBanner'
import { useClinicMode } from '@/components/physio/clinicMode'
import { PhysioHelp } from '@/components/physio/shell/PhysioHelp'
import { LiveSessionBanner } from '@/components/physio/shell/LiveSessionBanner'
import { PhysioDutySwitch } from '@/components/physio/PhysioDutySwitch'
import { PhysioDeclined, PhysioUnderReview } from '@/components/physio/PhysioReviewStates'
import { BookingProvider, useBooking } from '@/components/physio/schedule/BookingDrawer'
import { isClinicClinician } from '@/components/clinic/clinician-routing'
import { WebsiteLink } from '@/components/dashboard/shared/WebsiteLink'
import { AppIconBadge, AppSetupButton, AppSetupPrompt } from '@/components/pwa/AppSetup'

/** The top bar's main action: book a patient in, in a drawer, without leaving the page. */
function NewAppointmentButton() {
  const openBooking = useBooking()
  return (
    <Button className={`${primaryButtonClass} hidden h-10 px-4 sm:inline-flex`} onClick={() => openBooking()}>
      <CalendarPlus className="mr-2 h-4 w-4" />
      New appointment
    </Button>
  )
}

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

const teamUnreadRef = makeFunctionReference<'query', Record<string, never>, number>('clinicTeamChat:getTeamUnreadCount')

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
    // Clinic clinicians work here too (clinic mode); the clinic vetted them, so there's no
    // marketplace application to finish (components/clinic/clinician-routing.ts)
    else if (!u.onboarded && !u.onboardingSkipped && !isClinicClinician(u)) redirectTo = '/physiotherapist'
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
  const patientUnread = useQuery(api.chat.getUnreadCount, access === 'full' ? {} : 'skip') as number | undefined
  // Clinic members work the clinic's hours, not Rehabify's on-duty matching
  const clinic = useClinicMode()
  // Clinic members also have the team chat under Messages
  const teamUnread = useQuery(teamUnreadRef, access === 'full' && clinic.active ? {} : 'skip')
  const unreadMessages = (patientUnread ?? 0) + (teamUnread ?? 0)
  // Approved physios only: getMyAppointments needs an approved account
  const liveSessions = access === 'full' && !isUnderReview

  useEffect(() => {
    const root = document.documentElement
    root.dataset.portal = 'physio'
    return () => {
      if (root.dataset.portal === 'physio') delete root.dataset.portal
    }
  }, [])

  if (access === 'loading' || access === 'redirecting') return <ShellSkeleton />
  if (access === 'declined') return <PhysioDeclined reason={setup?.approvalComments ?? undefined} />

  return (
    <BookingProvider>
    <div className="flex min-h-screen bg-pt-canvas text-pt-ink">
      <div className="hidden shrink-0 p-3 pr-0 lg:flex">
        <PhysioSidebar className="sticky top-3 h-[calc(100vh-1.5rem)]" limited={isUnderReview} unreadMessages={unreadMessages} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 bg-pt-canvas/90 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
            <Link href={PHYSIO_HOME} aria-label="Home" className="min-w-0 lg:hidden">
              <PortalBrand />
            </Link>
            {/* An online session starting within 15 minutes (or under way): one tap to join, on every page */}
            <div className="hidden min-w-0 flex-1 lg:flex">
              <LiveSessionBanner enabled={liveSessions} layout="inline" />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <WebsiteLink tone="portal" className="hidden sm:inline-flex" />
              {!isUnderReview && clinic.loaded && !clinic.active && <PhysioDutySwitch />}
              {!isUnderReview && <NewAppointmentButton />}
              <AppSetupButton tone="portal" />
              <PhysioHelp />
              <PatientThemeToggle className="hidden sm:flex" />
              {/* Phones: Messages lives here, the bottom bar has Community */}
              {!isUnderReview && (
                <Link
                  href={`${PHYSIO_HOME}/messages`}
                  aria-label={unreadMessages ? `Messages, ${unreadMessages} unread` : 'Messages'}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full text-pt-muted transition-colors hover:bg-pt-hover hover:text-pt-ink lg:hidden"
                >
                  <MessageSquare className="h-4 w-4" />
                  {unreadMessages > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-pt-accent px-1 text-center text-[9px] font-bold leading-4 text-[#06210a]">
                      {unreadMessages > 9 ? '9+' : unreadMessages}
                    </span>
                  )}
                </Link>
              )}
              <PatientNotifications />
            </div>
          </div>
          {/* Phones and tablets: a slim strip under the top bar, inside the sticky header so it never covers the page */}
          <LiveSessionBanner enabled={liveSessions} layout="row" className="lg:hidden" />
        </header>

        {/* Bottom room so the last card clears the tab bar and the phone's home indicator */}
        <main className="w-full min-w-0 flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-2 sm:px-6 lg:px-8 lg:pb-16 lg:pt-4">
          {access === 'review' ? (
            <PhysioUnderReview setup={setup ?? null} />
          ) : (
            <>
              <ClinicModeBanner />
              <SectionTabs />
              {children}
            </>
          )}
        </main>
      </div>

      <PhysioMobileNav limited={isUnderReview} unreadMessages={unreadMessages} />
      {/* Home-screen app + notifications for new patients and messages, asked until done */}
      <AppSetupPrompt />
      {access === 'full' && <AppIconBadge />}
    </div>
    </BookingProvider>
  )
}
