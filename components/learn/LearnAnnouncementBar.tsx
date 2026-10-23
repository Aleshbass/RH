'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, X } from '@/components/icons'
import { isPromoted, PROGRAM, QuietBoundary, usePublicCohort } from './shared'

/**
 * The slim announcement bar at the top of the public site while a cohort is live with
 * "Show top banner" on. It sits inside the fixed header (see components/common/Header.tsx)
 * and folds away once the visitor scrolls; LearnAnnouncementSpacer reserves the same height
 * in the page flow so it never covers content. Dismissing hides it for that cohort only.
 */

const BAR_HEIGHT = 40
const DISMISS_KEY = 'rh-learn-banner-dismissed'
const DISMISS_EVENT = 'rh-learn-banner-dismissed'
let dismissedInMemory: string | null = null // when localStorage is unavailable

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY) ?? dismissedInMemory
  } catch {
    return dismissedInMemory
  }
}

function useAnnouncement() {
  const pathname = usePathname() ?? ''
  const cohort = usePublicCohort()
  // undefined until the browser has been checked, so nothing flashes on load
  const [dismissedId, setDismissedId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    const sync = () => setDismissedId(readDismissed())
    sync()
    window.addEventListener(DISMISS_EVENT, sync)
    return () => window.removeEventListener(DISMISS_EVENT, sync)
  }, [])

  const active =
    dismissedId !== undefined &&
    Boolean(cohort) &&
    isPromoted(cohort, 'banner') &&
    dismissedId !== cohort?.id &&
    !pathname.startsWith('/learn') &&
    // learn.* serves the program at / (the browser path, not /learn)
    !window.location.hostname.startsWith('learn.')

  const dismiss = useCallback(() => {
    if (!cohort) return
    dismissedInMemory = cohort.id
    try {
      window.localStorage.setItem(DISMISS_KEY, cohort.id)
    } catch {
      // kept in memory for this visit
    }
    window.dispatchEvent(new Event(DISMISS_EVENT))
  }, [cohort])

  return { cohort, active, dismiss }
}

/** Rendered as the first child of the fixed header. `collapsed` folds it away on scroll. */
export function LearnAnnouncementBar({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <QuietBoundary>
      <AnnouncementBar collapsed={collapsed} />
    </QuietBoundary>
  )
}

/**
 * Pushes the page down by the bar's height while the announcement is active. It stays put
 * when the bar folds away on scroll (it is above the viewport by then), so nothing jumps.
 */
export function LearnAnnouncementSpacer() {
  return (
    <QuietBoundary>
      <AnnouncementSpacer />
    </QuietBoundary>
  )
}

function AnnouncementBar({ collapsed }: { collapsed: boolean }) {
  const { cohort, active, dismiss } = useAnnouncement()
  const reduce = useReducedMotion()
  const show = active && !collapsed && cohort

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="learn-announcement"
          initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={{ height: BAR_HEIGHT, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative z-[61] overflow-hidden bg-rh-night text-white"
        >
          <div className="mx-auto flex h-10 max-w-6xl items-center justify-center gap-2.5 pl-4 pr-11 text-[13px] sm:gap-3">
            <span aria-hidden className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rh-lime opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rh-lime" />
            </span>
            <p className="min-w-0 truncate">
              <span className="font-semibold sm:hidden">
                {PROGRAM.shortTitle} · starts {cohort.startsOn}
              </span>
              <span className="hidden sm:inline">
                {cohort.bannerText || (
                  <>
                    <span className="font-semibold">{PROGRAM.title}</span>
                    <span className="text-white/70"> — next cohort {cohort.dateRange}</span>
                  </>
                )}
              </span>
            </p>
            <Link
              href="/learn"
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rh-lime px-3 py-1 text-xs font-semibold text-rh-night transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Register <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss announcement"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function AnnouncementSpacer() {
  const { active } = useAnnouncement()
  const reduce = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {active && (
        <motion.div
          key="learn-announcement-spacer"
          aria-hidden
          initial={reduce ? false : { height: 0 }}
          animate={{ height: BAR_HEIGHT }}
          exit={{ height: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        />
      )}
    </AnimatePresence>
  )
}
