'use client'

import { useAuth, useClerk } from '@clerk/nextjs'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, CalendarPlus, Lock } from '@/components/icons'
import { Button } from '@/components/ui/button'
import ClinicSidebar, { CLINIC_HOME, ClinicMobileNav } from '@/components/clinic/ClinicSidebar'
import ClinicStatusBanner from '@/components/clinic/ClinicStatusBanner'
import ClinicBillingBanner from '@/components/clinic/ClinicBillingBanner'
import {
  CLINIC_AREA_LABELS,
  ClinicAccessProvider,
  useClinicAccess,
  type ClinicArea,
} from '@/components/clinic/ClinicAccessContext'
import { ClinicThemeProvider } from '@/components/clinic/ClinicTheme'
import { ClinicBrand } from '@/components/clinic/ClinicBrand'
import { ClinicHelp } from '@/components/clinic/ClinicHelp'
import { ClinicTour } from '@/components/clinic/ClinicTour'
import { CLINIC_BOOK_EVENT } from '@/components/clinic/clinicEvents'
import { EmptyState, primaryButtonClass, secondaryButtonClass } from '@/components/clinic/ui'
import { PatientNotifications, PatientThemeToggle } from '@/components/patient/shell/PatientControls'
import { toClinicPortal } from '@/components/physio/PhysioNotifications'
import { WebsiteLink } from '@/components/dashboard/shared/WebsiteLink'
import { physioPortalPageFor } from '@/components/clinic/clinician-routing'
import { AppIconBadge, AppSetupButton, AppSetupPrompt } from '@/components/pwa/AppSetup'
import { OfflineGate } from '@/components/offline/OfflineGate'
import { useOfflineSession } from '@/lib/offline/session'
import { usePortalHome } from '@/lib/pwa'
import { cn } from '@/lib/utils'

export default function ClinicLayout({ children }: { children: ReactNode }) {
  return (
    <ClinicThemeProvider>
      {/* Offline, the PIN opens the data saved on this phone before anything shows */}
      <OfflineGate>
        <ClinicAccessProvider>
          <ClinicPortal>{children}</ClinicPortal>
        </ClinicAccessProvider>
      </OfflineGate>
    </ClinicThemeProvider>
  )
}

/** Which permission each clinic page needs (home is always available). Referrals live inside Patients. */
const PAGE_AREAS: { prefix: string; area: ClinicArea; orArea?: ClinicArea }[] = [
  { prefix: '/dashboard/clinic/appointments', area: 'appointments' },
  // Someone who only handles referrals still opens Patients, where the referral inbox is
  { prefix: '/dashboard/clinic/patients', area: 'patients', orArea: 'referrals' },
  { prefix: '/dashboard/clinic/messages', area: 'patients' },
  { prefix: '/dashboard/clinic/billing', area: 'billing' },
  { prefix: '/dashboard/clinic/staff', area: 'team' },
  { prefix: '/dashboard/clinic/analytics', area: 'reports' },
  { prefix: '/dashboard/clinic/settings', area: 'settings' },
  { prefix: '/dashboard/clinic/inventory', area: 'inventory' },
  // Clock-in: who's in and their hours, with the Team page
  { prefix: '/dashboard/clinic/attendance', area: 'team' },
]

function pageForPath(pathname: string) {
  return PAGE_AREAS.find((page) => pathname === page.prefix || pathname.startsWith(`${page.prefix}/`)) ?? null
}

function PortalSkeleton() {
  return (
    <div className="flex min-h-screen bg-pt-canvas">
      <div className="hidden p-3 pr-0 lg:block">
        <div className="h-[calc(100vh-1.5rem)] w-64 space-y-3 rounded-3xl border border-pt-line bg-pt-surface p-5">
          <Skeleton className="mb-6 h-8 w-36 rounded-lg bg-pt-sunken" />
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-xl bg-pt-sunken" />
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-6 p-4 pt-20 sm:p-8 sm:pt-20">
        <Skeleton className="h-9 w-64 rounded-xl bg-pt-sunken" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-3xl bg-pt-sunken" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-3xl bg-pt-sunken" />
      </div>
    </div>
  )
}

/** A full-page message card (declined, not a member). */
function StateCard({ icon, title, body, action, tone = 'neutral' }: { icon: ReactNode; title: string; body: string; action: ReactNode; tone?: 'neutral' | 'rose' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-pt-canvas p-4 text-pt-ink">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-pt-line bg-pt-surface p-8 text-center shadow-pt dark:shadow-none">
        <div
          className={cn(
            'mx-auto flex h-12 w-12 items-center justify-center rounded-2xl [&_svg]:h-6 [&_svg]:w-6',
            tone === 'rose' ? 'bg-pt-rose-bg text-pt-rose-fg' : 'bg-pt-sunken text-pt-muted'
          )}
        >
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-pt-ink">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-pt-muted">{body}</p>
        </div>
        {action}
      </div>
    </div>
  )
}

/**
 * Where someone who isn't a clinic owner or team member belongs. Null for clinic staff who were
 * removed from their clinic: /dashboard would send them straight back here.
 */
function nonMemberHome(role: string | null): string | null {
  switch (role) {
    case null:
    case 'clinic_owner':
      return '/clinic-owner' // set up a clinic (asks them to sign in first if needed)
    case 'physiotherapist':
      return '/dashboard/physiotherapist'
    case 'patient':
      return '/dashboard/patient'
    case 'family_member':
      return '/dashboard/family'
    case 'admin':
      return '/dashboard/admin'
    case 'doctor':
    case 'partner':
      return '/partners/portal'
    default:
      return null
  }
}

/** The one main action in the top bar: book a visit, from any page. */
function BookButton() {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const { canUse, isClinician } = useClinicAccess()
  if (isClinician || !canUse('appointments')) return null
  const href = `${CLINIC_HOME}/appointments`
  return (
    <Button
      className={cn(primaryButtonClass, 'hidden h-10 px-4 sm:inline-flex')}
      onClick={() => {
        // On the diary the form opens in place; elsewhere the diary opens with it
        if (pathname === href) window.dispatchEvent(new Event(CLINIC_BOOK_EVENT))
        else router.push(`${href}?book=1`)
      }}
    >
      <CalendarPlus className="mr-2 h-4 w-4" />
      Book appointment
    </Button>
  )
}

/**
 * The clinic portal, built like the physio and patient portals: a floating sidebar (desktop), a
 * bottom tab bar (phones and tablets), a top bar with the main action, help, theme and
 * notifications. Colours come from app/patient-portal.css; <html data-portal="clinic"> lets older
 * screens follow them.
 */
function ClinicPortal({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const session = useOfflineSession()
  usePortalHome(CLINIC_HOME)
  const { signOut } = useClerk()
  const {
    isLoaded,
    isReadOnly,
    isDeclined,
    isOwner,
    isClinician,
    canUse,
    isClinicSuspended,
    isBillingReadOnly,
    isOnboardingIncomplete,
    nonMember,
    firstName,
    clinicName,
  } = useClinicAccess()
  const nonMemberDestination = nonMember ? nonMemberHome(nonMember.role) : null
  // Clinicians do their clinical work in the physio portal; only clinic pages their role adds
  // (Billing, Team, Reports, Settings) open here
  const clinicianDestination = isClinician ? physioPortalPageFor(pathname) : null

  // The clinic portal is for clinic owners and their teams only
  useEffect(() => {
    if (!authLoaded) return
    if (!isSignedIn) {
      router.replace(`/sign-in?redirect_url=${encodeURIComponent(pathname || CLINIC_HOME)}`)
    } else if (nonMemberDestination) {
      router.replace(nonMemberDestination)
    } else if (clinicianDestination) {
      router.replace(clinicianDestination)
    }
  }, [authLoaded, isSignedIn, nonMemberDestination, clinicianDestination, pathname, router])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.portal = 'clinic'
    return () => {
      if (root.dataset.portal === 'clinic') delete root.dataset.portal
    }
  }, [])

  if (nonMember && !nonMemberDestination) {
    return (
      <StateCard
        icon={<Lock />}
        title="You're not part of a clinic team"
        body="Ask the clinic owner to invite you again, or sign in with a different account."
        action={
          <Button onClick={() => signOut({ redirectUrl: '/sign-in' })} className={cn(secondaryButtonClass, 'w-full')}>
            Sign out
          </Button>
        }
      />
    )
  }

  // Online, Clerk says who's signed in; offline (Clerk can't load) it's the person whose PIN
  // opened this phone's saved data (components/offline/OfflineGate.tsx)
  const signedIn =
    session.mode === 'online' ? session.userId !== null : session.mode === 'offline' && session.unlocked
  if (!signedIn || !isLoaded || nonMember || clinicianDestination) {
    return <PortalSkeleton />
  }

  // The owner's application was declined by Rehabify
  if (isDeclined && isOwner) {
    return (
      <StateCard
        tone="rose"
        icon={<AlertCircle />}
        title="Application not approved"
        body="We couldn't verify your clinic. Contact support@physioaroundme.com with updated documents."
        action={
          <Button onClick={() => router.push('/clinic-owner')} className={cn(secondaryButtonClass, 'w-full')}>
            Update application
          </Button>
        }
      />
    )
  }

  const page = pageForPath(pathname)
  const area = page?.area ?? null
  const blocked = page !== null && !canUse(page.area) && !(page.orArea && canUse(page.orArea))
  const statusChip = isClinicSuspended ? 'Suspended' : isBillingReadOnly ? 'Read-only' : isReadOnly ? 'Not live yet' : null

  return (
    <div className="flex min-h-screen bg-pt-canvas text-pt-ink">
      <div className="hidden shrink-0 p-3 pr-0 lg:flex">
        <ClinicSidebar className="sticky top-3 h-[calc(100vh-1.5rem)]" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 bg-pt-canvas/90 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
            <Link href={CLINIC_HOME} aria-label="Home" className="min-w-0 lg:hidden">
              <ClinicBrand />
            </Link>
            <div className="hidden min-w-0 flex-1 lg:block" />

            <div className="flex shrink-0 items-center gap-2">
              {statusChip && (
                <span
                  className={cn(
                    'hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex',
                    isClinicSuspended ? 'bg-pt-rose-bg text-pt-rose-fg' : 'bg-pt-primary text-pt-on-primary'
                  )}
                >
                  {statusChip}
                </span>
              )}
              <WebsiteLink tone="portal" className="hidden sm:inline-flex" />
              {!isReadOnly && <BookButton />}
              <AppSetupButton tone="portal" />
              <ClinicHelp />
              <PatientThemeToggle className="hidden sm:flex" />
              {!isReadOnly && <PatientNotifications mapLink={toClinicPortal} />}
            </div>
          </div>
        </header>

        {/* Bottom room so the last card clears the tab bar and the phone's home indicator */}
        <main className="w-full min-w-0 flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-2 sm:px-6 lg:px-8 lg:pb-16 lg:pt-4">
          {/* Set-up / verification / suspension status, and Rehabify's own billing */}
          <div className="mx-auto w-full max-w-6xl space-y-3 empty:hidden [&:has(>*)]:mb-5">
            <ClinicStatusBanner />
            <ClinicBillingBanner />
          </div>
          {blocked && area ? (
            <div className="mx-auto w-full max-w-6xl py-16">
              <EmptyState
                icon={<Lock />}
                title={`${CLINIC_AREA_LABELS[area]} isn't part of your role`}
                description="Ask the clinic owner if you need access to this page."
                action={
                  <Button asChild className={secondaryButtonClass}>
                    <Link href={CLINIC_HOME}>Go to Home</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      <ClinicMobileNav />
      {/* First visit: a short tour of Home, for the owner (after set-up, so it never fights the wizard) */}
      <ClinicTour enabled={isOwner && pathname === CLINIC_HOME && !isOnboardingIncomplete} firstName={firstName} clinicName={clinicName} />
      {/* Home-screen app + notifications for new patients and messages, asked until done */}
      <AppSetupPrompt />
      {!isReadOnly && <AppIconBadge />}
    </div>
  )
}
