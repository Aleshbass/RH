'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { Menu } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ClinicThemeToggle } from '@/components/clinic/ClinicTheme'
import { PhysioBrand, PhysioSidebar, PHYSIO_HOME } from '@/components/physio/PhysioSidebar'
import { PhysioNotifications } from '@/components/physio/PhysioNotifications'
import { PhysioDutySwitch } from '@/components/physio/PhysioDutySwitch'
import { PhysioDeclined, PhysioUnderReview } from '@/components/physio/PhysioReviewStates'
import { CLINIC_PORTAL_HOME, clinicianBelongsInClinicPortal } from '@/components/clinic/clinician-routing'

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-rh-canvas dark:bg-rh-ink">
      <div className="m-3 hidden w-64 rounded-3xl bg-rh-teal p-5 dark:bg-rh-night md:block">
        <Skeleton className="mb-6 h-7 w-28 rounded-md" />
        <div className="space-y-2">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-6 p-6 sm:p-10">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
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

  return { access, user, setup, isUnderReview: setup?.approvalStatus === 'pending_review' }
}

export function PhysioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const [menuOpen, setMenuOpen] = useState(false)
  const { access, setup, isUnderReview } = usePhysioAccess(pathname)

  if (access === 'loading' || access === 'redirecting') return <ShellSkeleton />
  if (access === 'declined') return <PhysioDeclined reason={setup?.approvalComments ?? undefined} />

  return (
    <div className="flex min-h-screen bg-rh-canvas text-rh-night dark:bg-rh-ink dark:text-neutral-50">
      {/* Floating teal sidebar on desktop */}
      <div className="hidden shrink-0 p-3 pr-0 md:flex">
        <PhysioSidebar className="sticky top-3 h-[calc(100vh-1.5rem)] rounded-3xl shadow-lift" limited={isUnderReview} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-2 bg-rh-canvas/85 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-rh-canvas/70 dark:bg-rh-ink/85 dark:supports-[backdrop-filter]:bg-rh-ink/70 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  data-tour="navigation"
                  className="h-10 w-10 shrink-0 rounded-xl bg-white p-0 text-rh-night shadow-soft hover:bg-white dark:bg-rh-ink-2 dark:text-white"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 border-0 bg-rh-teal p-0 dark:bg-rh-night [&>button]:text-white [&>button]:opacity-80"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <PhysioSidebar
                  className="w-full border-r-0"
                  collapsible={false}
                  limited={isUnderReview}
                  onNavigate={() => setMenuOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <Link href={PHYSIO_HOME} aria-label="Rehabify home">
              <PhysioBrand />
            </Link>
          </div>

          {/* Keeps the right-hand controls right-aligned on desktop */}
          <div className="hidden md:block" />

          <div className="flex shrink-0 items-center gap-1.5">
            {!isUnderReview && <PhysioDutySwitch />}
            <ClinicThemeToggle className="h-10 w-10 rounded-xl bg-white shadow-soft hover:bg-white dark:bg-rh-ink-2 dark:hover:bg-rh-ink-3 md:hidden" />
            <PhysioNotifications />
          </div>
        </header>

        {/* Extra bottom room so the last card clears mobile browser bars and the home indicator */}
        <main className="w-full min-w-0 flex-1 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8 lg:pb-16 lg:pt-8">
          {access === 'review' ? <PhysioUnderReview setup={setup ?? null} /> : children}
        </main>
      </div>
    </div>
  )
}
