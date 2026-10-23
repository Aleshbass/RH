'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useMutation, useQuery } from 'convex/react'
import { PlayCircle, X } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { primaryButtonClass } from '@/components/clinic/ui'
import { PhysioGuideVideoModal } from '@/components/dashboard/shared/PhysioGuideVideoModal'

/** Bump to show the tour again to everyone who finished an older one. */
export const PHYSIO_TOUR_VERSION = 6
const LOCAL_KEY = 'rehabify:physio-tour-version'
/** Fired by "Take the tour" in the account menu. */
export const START_PHYSIO_TOUR_EVENT = 'rehabify:start-physio-tour'

type TourStep = {
  /** Matches `data-tour="..."` on the element to highlight. */
  target: string
  title: string
  body: string
}

/**
 * Everything the tour points at lives on the Home page, so the tour never navigates
 * and never opens menus behind the user's back.
 */
const STEPS: TourStep[] = [
  {
    target: 'setup',
    title: 'Finish setting up',
    body: 'These are the few things left before patients can book you. Each one opens the right settings page.',
  },
  {
    target: 'today',
    title: 'Your day at a glance',
    body: 'Today’s appointments, in order. Open one to start a video session or add notes.',
  },
  {
    target: 'booking-link',
    title: 'Your booking link',
    body: 'Share this on WhatsApp or Instagram. Patients book and pay through it directly.',
  },
  {
    target: 'navigation',
    title: 'Everything else',
    body: 'Appointments, patients, messages and billing live here. Settings is at the bottom.',
  },
]

function readLocalVersion() {
  try {
    return Number(localStorage.getItem(LOCAL_KEY) ?? 0)
  } catch {
    return 0
  }
}

/** True when this browser has already finished or skipped the current tour. */
export function hasSeenPhysioTour() {
  return readLocalVersion() >= PHYSIO_TOUR_VERSION
}

function writeLocalVersion() {
  try {
    localStorage.setItem(LOCAL_KEY, String(PHYSIO_TOUR_VERSION))
  } catch {
    // The server copy still records it
  }
}

/** First matching element that is actually on screen (mobile and desktop may both render one). */
function findTarget(target: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)
  for (const el of candidates) {
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return el
  }
  return null
}

function useIsPhone() {
  const [isPhone, setIsPhone] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const update = () => setIsPhone(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return isPhone
}

/**
 * First-visit welcome + a short coach-mark tour of the physiotherapist Home page.
 *
 * - Shows once (saved on the account and in this browser); replay from the account menu.
 * - Every step has Skip; Esc closes; arrow keys move between steps.
 * - On phones the explanation sits in a bottom sheet instead of a floating bubble.
 */
export function PhysioTour({ firstName, enabled }: { firstName?: string; enabled: boolean }) {
  const status = useQuery(api.users.getOnboardingStatus)
  const saveCompletion = useMutation(api.users.completeOnboarding)
  const [phase, setPhase] = useState<'hidden' | 'welcome' | 'touring'>('hidden')
  const [steps, setSteps] = useState<TourStep[]>([])
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [showVideo, setShowVideo] = useState(false)
  const [mounted, setMounted] = useState(false)
  const isPhone = useIsPhone()

  useEffect(() => setMounted(true), [])

  // Decide whether to greet the user
  useEffect(() => {
    if (!enabled || status === undefined || status === null) return
    const seen =
      readLocalVersion() >= PHYSIO_TOUR_VERSION ||
      (status.hasCompletedOnboarding && status.onboardingVersion >= PHYSIO_TOUR_VERSION)
    if (seen) {
      writeLocalVersion()
      return
    }
    // Let the page settle first so the greeting doesn't flash in during loading
    const timer = window.setTimeout(() => setPhase((p) => (p === 'hidden' ? 'welcome' : p)), 700)
    return () => window.clearTimeout(timer)
  }, [enabled, status])

  const finish = useCallback(() => {
    setPhase('hidden')
    setRect(null)
    writeLocalVersion()
    saveCompletion({ version: PHYSIO_TOUR_VERSION }).catch(() => {
      // Saved locally; the account copy will be retried next time
    })
  }, [saveCompletion])

  const startTour = useCallback(() => {
    const available = STEPS.filter((step) => findTarget(step.target))
    if (available.length === 0) {
      finish()
      return
    }
    setSteps(available)
    setIndex(0)
    setPhase('touring')
  }, [finish])

  // Replay from the account menu
  useEffect(() => {
    const replay = () => setPhase('welcome')
    window.addEventListener(START_PHYSIO_TOUR_EVENT, replay)
    return () => window.removeEventListener(START_PHYSIO_TOUR_EVENT, replay)
  }, [])

  const step = phase === 'touring' ? steps[index] : undefined

  // Keep the highlight glued to its element through scrolls and resizes
  useLayoutEffect(() => {
    if (!step) return
    const el = findTarget(step.target)
    if (!el) {
      setRect(null)
      return
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })

    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setRect(el.getBoundingClientRect()))
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      observer.disconnect()
    }
  }, [step])

  const next = useCallback(() => {
    if (index >= steps.length - 1) finish()
    else setIndex((i) => i + 1)
  }, [index, steps.length, finish])
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  useEffect(() => {
    if (phase === 'hidden') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
      if (phase !== 'touring') return
      if (event.key === 'ArrowRight') next()
      if (event.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, next, back, finish])

  if (!mounted) return null

  const pad = 6
  const spotlight = rect && {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }

  // Desktop bubble: below the element when there's room, otherwise above; kept inside the viewport
  const bubbleWidth = 320
  let bubbleStyle: React.CSSProperties | undefined
  if (spotlight && !isPhone) {
    const spaceBelow = window.innerHeight - (spotlight.top + spotlight.height)
    const placeBelow = spaceBelow > 220 || spotlight.top < 220
    const left = Math.min(Math.max(16, spotlight.left), window.innerWidth - bubbleWidth - 16)
    bubbleStyle = placeBelow
      ? { top: Math.min(spotlight.top + spotlight.height + 12, window.innerHeight - 200), left, width: bubbleWidth }
      : { bottom: window.innerHeight - spotlight.top + 12, left, width: bubbleWidth }
  }

  return createPortal(
    <>
      <AnimatePresence>
        {phase === 'welcome' && (
          <motion.div
            key="welcome"
            className="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={finish}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="physio-tour-title"
              onClick={(event) => event.stopPropagation()}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="relative w-full max-w-md rounded-t-2xl border border-neutral-200 bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl dark:border-white/[0.07] dark:bg-rh-ink-2 sm:rounded-2xl sm:pb-6"
            >
              <button
                type="button"
                onClick={finish}
                aria-label="Close"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="text-xs font-medium uppercase tracking-wide text-[#005b57] dark:text-[#2dd4bf]">
                Welcome to Rehabify
              </p>
              <h2
                id="physio-tour-title"
                className="mt-2 text-xl font-semibold tracking-tight text-neutral-900 dark:text-white"
              >
                {firstName ? `You’re in, ${firstName}.` : 'You’re in.'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Take 30 seconds to see where things are. You can replay this any time from your account menu.
              </p>

              <button
                type="button"
                onClick={() => setShowVideo(true)}
                className="mt-4 flex w-full items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/[0.07] dark:text-neutral-300 dark:hover:bg-neutral-800/60"
              >
                <PlayCircle className="h-5 w-5 shrink-0 text-neutral-400" />
                <span className="flex-1">Prefer video? Watch the platform guide</span>
              </button>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={finish} className="text-neutral-600 dark:text-neutral-400">
                  Not now
                </Button>
                <Button onClick={startTour} className={primaryButtonClass}>
                  Show me around
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === 'touring' && step && (
        <div className="fixed inset-0 z-[300]" aria-live="polite">
          {/* Dim everything except the highlighted element; clicks outside do nothing */}
          {spotlight ? (
            <div
              className="pointer-events-none fixed rounded-xl ring-2 ring-white/70 transition-all duration-300 ease-out dark:ring-white/30"
              style={{ ...spotlight, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
            />
          ) : (
            <div className="fixed inset-0 bg-black/45" />
          )}

          <motion.div
            key={step.target}
            role="dialog"
            aria-modal="true"
            aria-labelledby="physio-tour-step-title"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={bubbleStyle}
            className={cn(
              'fixed border border-neutral-200 bg-white shadow-xl dark:border-white/[0.07] dark:bg-rh-ink-2',
              isPhone || !bubbleStyle
                ? 'inset-x-0 bottom-0 rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-8 sm:left-1/2 sm:w-80 sm:-translate-x-1/2 sm:rounded-2xl sm:pb-5'
                : 'rounded-2xl p-5'
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
                {index + 1} of {steps.length}
              </p>
              <button
                type="button"
                onClick={finish}
                className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              >
                Skip tour
              </button>
            </div>
            <h3
              id="physio-tour-step-title"
              className="mt-2 text-base font-semibold tracking-tight text-neutral-900 dark:text-white"
            >
              {step.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{step.body}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex gap-1.5" aria-hidden="true">
                {steps.map((s, i) => (
                  <span
                    key={s.target}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === index ? 'w-4 bg-[#005b57] dark:bg-[#2dd4bf]' : 'w-1.5 bg-neutral-200 dark:bg-neutral-700'
                    )}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                {index > 0 && (
                  <Button variant="ghost" size="sm" onClick={back}>
                    Back
                  </Button>
                )}
                <Button size="sm" onClick={next} className={primaryButtonClass}>
                  {index === steps.length - 1 ? 'Done' : 'Next'}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showVideo && (
        <PhysioGuideVideoModal
          forceShow
          title="Your Rehabify platform guide"
          subtitle="A walkthrough of your dashboard."
          onClose={() => setShowVideo(false)}
        />
      )}
    </>,
    document.body
  )
}
