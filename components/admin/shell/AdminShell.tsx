'use client'

import { Fragment, Suspense, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronRight, Menu, Search, ShieldAlert } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ClinicThemeProvider, ClinicThemeToggle } from '@/components/clinic/ClinicTheme'
import { PhysioNotifications } from '@/components/physio/PhysioNotifications'
import { AdminSidebar } from './AdminSidebar'
import { AdminCommandPalette, OPEN_ADMIN_PALETTE_EVENT } from './AdminCommandPalette'
import { adminBreadcrumbs, consoleAllows, consoleHome, toConsoleRole, type ConsoleRole } from './adminNav'
import { ConsoleRoleContext, useConsoleRole } from './consoleRole'
import { TeamAccessIntro } from '@/components/admin/TeamAccessIntro'
import { WebsiteLink } from '@/components/dashboard/shared/WebsiteLink'
import { AppIconBadge, AppSetupButton, AppSetupPrompt } from '@/components/pwa/AppSetup'

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-rh-canvas dark:bg-rh-ink">
      <div className="m-3 hidden w-[17rem] rounded-3xl bg-rh-ink p-5 dark:bg-rh-ink-2 md:block">
        <Skeleton className="mb-6 h-7 w-28 rounded-md bg-white/15" />
        <div className="space-y-2">
          {[...Array(9)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-lg bg-white/10" />
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

function AccessDenied() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-rh-canvas p-6 dark:bg-rh-ink">
      <div className="max-w-sm rounded-3xl bg-white p-8 text-center shadow-soft dark:bg-rh-ink-2">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rh-blush text-rose-600 dark:bg-rose-400/10 dark:text-rose-300">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-rh-ink dark:text-white">Admins only</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          This area needs administrator access. If you were just given access, sign out and back in.
        </p>
        <Button asChild className="mt-6 w-full rounded-xl bg-rh-lime hover:bg-rh-lime-deep">
          <Link href="/dashboard">Back to my dashboard</Link>
        </Button>
      </div>
    </div>
  )
}

function Breadcrumbs() {
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()
  const crumbs = adminBreadcrumbs(pathname, new URLSearchParams(searchParams?.toString() ?? ''))
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1
        return (
          <Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-300 dark:text-neutral-600" />}
            {crumb.href && !last ? (
              <Link href={crumb.href} className="truncate text-neutral-500 transition-colors hover:text-rh-ink dark:text-neutral-400 dark:hover:text-rh-lime">
                {crumb.label}
              </Link>
            ) : (
              <span className={last ? 'truncate font-medium text-rh-ink dark:text-white' : 'truncate text-neutral-500 dark:text-neutral-400'}>
                {crumb.label}
              </span>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}

function SearchButton() {
  const [isMac, setIsMac] = useState(false)
  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)), [])
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_ADMIN_PALETTE_EVENT))}
      className="flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm text-neutral-500 shadow-soft transition hover:text-rh-ink dark:bg-rh-ink-2 dark:text-neutral-400 dark:hover:text-white sm:w-64"
      aria-label="Search"
    >
      <Search className="h-4 w-4" />
      <span className="hidden flex-1 text-left sm:block">Search…</span>
      <kbd className="hidden rounded-md border border-black/10 px-1.5 text-[10px] dark:border-white/15 sm:block">{isMac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
  )
}

function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()
  // Enter-only fade: exit animations would hold the old page on screen while the new one loads
  return (
    <motion.div
      key={pathname}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

function ShellFrame({ children }: { children: ReactNode }) {
  const isAdmin = useConsoleRole() === 'admin'
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  useEffect(() => setMenuOpen(false), [pathname])

  return (
    <div className="flex min-h-screen bg-rh-canvas text-rh-ink dark:bg-rh-ink dark:text-neutral-50">
      {/* Floating teal rail on desktop */}
      <div className="hidden shrink-0 p-3 pr-0 md:flex">
        <AdminSidebar className="sticky top-3 h-[calc(100vh-1.5rem)] rounded-3xl shadow-lift" />
      </div>

      {/* clip, not hidden: stops sideways scroll on phones without breaking the sticky topbar */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 bg-rh-canvas/85 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-rh-canvas/70 dark:bg-rh-ink/85 dark:supports-[backdrop-filter]:bg-rh-ink/70 sm:px-6 lg:px-8">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-10 shrink-0 rounded-xl bg-white p-0 text-rh-ink shadow-soft hover:bg-white dark:bg-rh-ink-2 dark:text-white md:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[17rem] border-0 bg-rh-ink p-0 dark:bg-rh-ink-2 [&>button]:text-white [&>button]:opacity-80">
              <SheetHeader className="sr-only">
                <SheetTitle>Admin menu</SheetTitle>
              </SheetHeader>
              <AdminSidebar className="w-full" collapsible={false} instance="drawer" onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>

          <Breadcrumbs />

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <AppSetupButton tone="console" />
            <WebsiteLink tone="console" />
            <SearchButton />
            <ClinicThemeToggle className="h-10 w-10 rounded-xl bg-white shadow-soft hover:bg-white dark:bg-rh-ink-2 dark:hover:bg-rh-ink-3 md:hidden" />
            <PhysioNotifications />
          </div>
        </header>

        <main className="w-full min-w-0 flex-1 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:px-8 lg:pb-16 lg:pt-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <AdminCommandPalette />
      {/* One-time "New" pop-up for admins (Blog & Learn access) */}
      {isAdmin && <TeamAccessIntro />}
      {/* Demo requests, approvals and other alerts on the admin's phone */}
      <AppSetupPrompt />
      <AppIconBadge />
    </div>
  )
}

/** Blog writers and Learn instructors only have their own area: any other page sends them there. */
function LimitedRoleGate({ role, children }: { role: ConsoleRole; children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const allowed = consoleAllows(role, pathname)
  useEffect(() => {
    if (!allowed) router.replace(consoleHome(role))
  }, [allowed, role, router])
  return allowed ? <>{children}</> : null
}

/** Wraps every /dashboard/admin page: theme, access check, sidebar, topbar and ⌘K search. */
export function AdminShell({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.getMyUser) as { role?: string } | null | undefined
  const role = toConsoleRole(me?.role)

  let body: ReactNode
  if (me === undefined) body = <ShellSkeleton />
  else if (!me || !role) body = <AccessDenied />
  else
    body = (
      <ConsoleRoleContext.Provider value={role}>
        {/* useSearchParams needs a Suspense boundary */}
        <Suspense fallback={<ShellSkeleton />}>
          <ShellFrame>{role === 'admin' ? children : <LimitedRoleGate role={role}>{children}</LimitedRoleGate>}</ShellFrame>
        </Suspense>
      </ConsoleRoleContext.Provider>
    )

  return <ClinicThemeProvider>{body}</ClinicThemeProvider>
}
