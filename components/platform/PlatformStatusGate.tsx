'use client'

import { Component, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useConvexAuth, useQuery } from 'convex/react'
import { CalendarOff, Wrench } from 'lucide-react'
import { api } from '@/convex/_generated/api'

/**
 * Enforces the switches on /dashboard/admin/system in the browser:
 * - Maintenance mode covers every page with a maintenance screen, except sign-in and the
 *   admin console. Admins are never blocked.
 * - Turning the marketplace off covers the public booking pages (find a physio, booking).
 *
 * This is a UI gate, not an API lock: Convex functions and API routes keep working.
 */
const MAINTENANCE_OPEN_PATHS = ['/sign-in', '/sso-callback', '/dashboard/admin', '/docs']
const MARKETPLACE_PATHS = ['/book', '/find-a-physio', '/find-my-physio']

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Mounted in the root layout, so it must never take a page down: if the status query
 * fails (e.g. the frontend ships before the Convex functions are pushed), render nothing.
 */
class GateBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export default function PlatformStatusGate() {
  return (
    <GateBoundary>
      <Gate />
    </GateBoundary>
  )
}

function Gate() {
  const pathname = usePathname() ?? '/'
  const status = useQuery(api.platformSettings.getPublicPlatformStatus)
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth()

  const maintenanceBlocks = !!status?.maintenanceMode && !matches(pathname, MAINTENANCE_OPEN_PATHS)
  const marketplaceBlocks = status?.marketplaceEnabled === false && matches(pathname, MARKETPLACE_PATHS)
  const mightBlock = maintenanceBlocks || marketplaceBlocks

  // Only look up the viewer when a screen might be shown (it's shared with SyncUserWithConvex anyway)
  const me = useQuery(api.users.getMyUser, mightBlock && isAuthenticated ? {} : 'skip')

  // Wait until we know who's looking, so admins never see a flash of the screen
  const viewerKnown = !authLoading && (!isAuthenticated || me !== undefined)
  const isAdmin = me?.role === 'admin'
  const show = mightBlock && viewerKnown && !isAdmin
  const kind = maintenanceBlocks ? 'maintenance' : 'marketplace'

  useEffect(() => {
    if (!show) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [show])

  if (!show) return null

  const message =
    kind === 'maintenance'
      ? status?.maintenanceMessage || 'We’re making some improvements and will be back shortly. Thank you for your patience.'
      : 'Online booking is paused for a moment. Please check back soon.'

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="platform-status-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-rh-canvas px-4 py-10 dark:bg-rh-ink"
    >
      <div className="w-full max-w-md rounded-3xl border border-black/[0.04] bg-white p-8 text-center shadow-soft dark:border-white/[0.06] dark:bg-rh-ink-2 dark:shadow-none">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rh-mist text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
          {kind === 'maintenance' ? <Wrench className="h-7 w-7" /> : <CalendarOff className="h-7 w-7" />}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-teal dark:text-rh-aqua">Rehabify Health</p>
        <h1 id="platform-status-title" className="mt-1 text-2xl font-semibold tracking-tight text-rh-night dark:text-white">
          {kind === 'maintenance' ? 'We’ll be right back' : 'Booking is paused'}
        </h1>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {kind === 'marketplace' && (
            <Link
              href="/"
              className="rounded-xl bg-rh-teal px-4 py-2 text-sm font-medium text-white transition hover:bg-rh-teal-deep dark:bg-rh-aqua dark:text-rh-night"
            >
              Back to home
            </Link>
          )}
          {kind === 'maintenance' && !isAuthenticated && (
            <Link
              href="/sign-in"
              className="rounded-xl bg-rh-mist px-4 py-2 text-sm font-medium text-rh-teal transition hover:bg-[#d6e8e6] dark:bg-white/[0.06] dark:text-white"
            >
              Team sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
