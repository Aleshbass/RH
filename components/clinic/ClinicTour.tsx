'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { primaryButtonClass, useIsPhone } from '@/components/clinic/ui'
import { playSound } from '@/lib/sounds'
import { isDialogOpen, markTourOpen } from '@/lib/overlayTurn'

/** Bump to show the tour again to everyone who finished an older one. */
const CLINIC_TOUR_VERSION = 1
const LOCAL_KEY = 'rehabify:clinic-tour-version'
/** Fired by "Take the tour" in the account menu and the help drawer. */
export const START_CLINIC_TOUR_EVENT = 'rehabify:start-clinic-tour'

type TourStep = {
  /** Matches `data-tour="..."` on the element to highlight. */
  target: string
  title: string
  body: string
}

/** Everything the tour points at is on Home or in the menu, so it never navigates. */
const STEPS: TourStep[] = [
  {
    target: 'clinic-setup',
    title: 'Finish setting up',
    body: 'The few things left before your clinic is ready. Each one opens the right page.',
  },
  {
    target: 'clinic-attention',
    title: 'What needs you',
    body: 'Booking requests, patients without a clinician, unpaid invoices, low stock. Tap one to deal with it.',
  },
  {
    target: 'clinic-today',
    title: 'Today at the clinic',
    body: 'Every visit booked today, with the clinician. You see their notes and plans; your clinicians treat.',
  },
  {
    target: 'clinic-plan',
    title: 'Your plan',
    body: 'Seats, patient programmes and when your plan renews.',
  },
  {
    target: 'clinic-navigation',
    title: 'Everything else',
    body: 'Patients, messages (with your team chat), billing, team and settings. Green numbers mean something is waiting.',
  },
  {
    target: 'clinic-navigation-mobile',
    title: 'Everything else',
    body: 'Patients, messages and the rest. "More" has billing, team and settings.',
  },
  {
    target: 'clinic-help',
    title: 'Help is here',
    body: 'Quick answers about your clinic, and this tour again.',
  },
]

function readLocalVersion() {
  try {
    return Number(localStorage.getItem(LOCAL_KEY) ?? 0)
  } catch {
    return 0
  }
}

function writeLocalVersion() {
  try {
    localStorage.setItem(LOCAL_KEY, String(CLINIC_TOUR_VERSION))
  } catch {
    // The tour may show again on this browser; harmless
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

/**
 * First-visit welcome and a short coach-mark tour of the clinic Home, for owners.
 * Shows once per browser; replay from the account menu or Help. Skip, Esc and arrow keys work.
 */
export function ClinicTour({ firstName, clinicName, enabled }: { firstName?: string | null; clinicName?: string | null; enabled: boolean }) {
  const [phase, setPhase] = useState<'hidden' | 'welcome' | 'touring'>('hidden')
  const [steps, setSteps] = useState<TourStep[]>([])
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [mounted, setMounted] = useState(false)
  const isPhone = useIsPhone()

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!enabled || readLocalVersion() >= CLINIC_TOUR_VERSION) return
    // Let Home settle first so the greeting doesn't flash in during loading, and wait for a dialog
    // that's already open (app setup): two overlays at once block each other's buttons
    let timer = 0
    const greet = () => {
      if (isDialogOpen()) timer = window.setTimeout(greet, 1000)
      else setPhase((p) => (p === 'hidden' ? 'welcome' : p))
    }
    timer = window.setTimeout(greet, 900)
    return () => window.clearTimeout(timer)
  }, [enabled])

  // While the tour is on screen, the app setup prompt waits for it (lib/overlayTurn.ts)
  const showing = phase !== 'hidden'
  useEffect(() => {
    if (!showing) return
    markTourOpen(true)
    return () => markTourOpen(false)
  }, [showing])

  const finish = useCallback(() => {
    setPhase('hidden')
    setRect(null)
    writeLocalVersion()
  }, [])

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

  useEffect(() => {
    const replay = () => setPhase('welcome')
    window.addEventListener(START_CLINIC_TOUR_EVENT, replay)
    return () => window.removeEventListener(START_CLINIC_TOUR_EVENT, replay)
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
    if (index >= steps.length - 1) {
      playSound('success')
      finish()
    } else setIndex((i) => i + 1)
  }, [index, steps.length, finish])
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  useEffect(() => {
    if (phase === 'hidden') return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
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
              aria-labelledby="clinic-tour-title"
              onClick={(event) => event.stopPropagation()}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="relative w-full max-w-md rounded-t-3xl border border-pt-line bg-pt-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-pt-ink shadow-pt-lift sm:rounded-3xl sm:pb-6"
            >
              <button
                type="button"
                onClick={finish}
                aria-label="Close"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-pt-faint hover:bg-pt-hover hover:text-pt-ink"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">{clinicName ? `${clinicName} on Rehabify` : 'Welcome to Rehabify'}</p>
              <h2 id="clinic-tour-title" className="mt-2 text-xl font-semibold tracking-tight text-pt-ink">
                {firstName ? `Welcome, ${firstName}.` : 'Welcome.'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-pt-muted">
                Take 30 seconds to see where things are. You can replay this any time from Help or your account menu.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={finish} className="rounded-xl text-pt-muted hover:bg-pt-hover hover:text-pt-ink">
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
          {/* Dim everything except the highlighted element */}
          {spotlight ? (
            <div
              className="pointer-events-none fixed rounded-3xl ring-2 ring-white/70 transition-all duration-300 ease-out dark:ring-white/30"
              style={{ ...spotlight, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
            />
          ) : (
            <div className="fixed inset-0 bg-black/45" />
          )}

          <motion.div
            key={step.target}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clinic-tour-step-title"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={bubbleStyle}
            className={cn(
              'fixed border border-pt-line bg-pt-surface text-pt-ink shadow-pt-lift',
              isPhone || !bubbleStyle
                ? 'inset-x-0 bottom-0 rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-8 sm:left-1/2 sm:w-80 sm:-translate-x-1/2 sm:rounded-3xl sm:pb-5'
                : 'rounded-3xl p-5'
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium tabular-nums text-pt-faint">
                {index + 1} of {steps.length}
              </p>
              <button type="button" onClick={finish} className="text-xs font-medium text-pt-muted hover:text-pt-ink">
                Skip tour
              </button>
            </div>
            <h3 id="clinic-tour-step-title" className="mt-2 text-base font-semibold tracking-tight text-pt-ink">
              {step.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-pt-muted">{step.body}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex gap-1.5" aria-hidden="true">
                {steps.map((s, i) => (
                  <span key={s.target} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-4 bg-pt-accent' : 'w-1.5 bg-pt-line-strong')} />
                ))}
              </div>
              <div className="flex gap-2">
                {index > 0 && (
                  <Button variant="ghost" size="sm" onClick={back} className="rounded-xl text-pt-muted hover:bg-pt-hover hover:text-pt-ink">
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
    </>,
    document.body
  )
}
