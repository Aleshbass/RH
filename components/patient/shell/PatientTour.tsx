'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { primaryButtonClass, useIsPhone } from '@/components/patient/ui'

/** Bump to show the tour again to everyone who finished an older one. */
const PATIENT_TOUR_VERSION = 1
const LOCAL_KEY = 'rehabify:patient-tour-version'
/** Fired by "Take the tour" in Help and the account menu. */
export const START_PATIENT_TOUR_EVENT = 'rehabify:start-patient-tour'

type TourStep = {
  /** Matches `data-tour="..."` on the element to highlight. */
  target: string
  title: string
  body: string
}

/** Everything the tour points at is on Home, so it never navigates or opens menus. */
const STEPS: TourStep[] = [
  {
    target: 'next-visit',
    title: 'Your next visit',
    body: 'The date, time and type of your next session. For video visits, the Join button appears here.',
  },
  {
    target: 'quick-actions',
    title: 'Common tasks',
    body: 'Book a session, message your physio or open your exercises in one tap.',
  },
  {
    target: 'check-in',
    title: 'Daily check-in',
    body: 'Takes 20 seconds. Your physio sees how your pain and activity are going between visits.',
  },
  {
    target: 'navigation',
    title: 'Everything else',
    body: 'Appointments, messages, your exercises, records and invoices are all here.',
  },
  {
    target: 'help',
    title: 'Stuck?',
    body: 'Tap the question mark for quick answers, or to message Joy on WhatsApp.',
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
    localStorage.setItem(LOCAL_KEY, String(PATIENT_TOUR_VERSION))
  } catch {
    // Shows again next time; harmless
  }
}

const PENDING_KEY = 'rehabify:patient-tour-pending'

function setPendingStart() {
  try {
    sessionStorage.setItem(PENDING_KEY, '1')
  } catch {
    // The tour just won't start by itself after the move
  }
}

function takePendingStart() {
  try {
    const pending = sessionStorage.getItem(PENDING_KEY) === '1'
    sessionStorage.removeItem(PENDING_KEY)
    return pending
  } catch {
    return false
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
 * First-visit welcome and a short tour of Home. Shows once per browser; replay from Help.
 * Esc closes, arrow keys move between steps, and on phones the text sits in a bottom sheet.
 */
export function PatientTour({ firstName, enabled, homeHref }: { firstName?: string; enabled: boolean; homeHref: string }) {
  const router = useRouter()
  const [phase, setPhase] = useState<'hidden' | 'welcome' | 'touring'>('hidden')
  const [steps, setSteps] = useState<TourStep[]>([])
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [mounted, setMounted] = useState(false)
  const isPhone = useIsPhone()

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!enabled) return
    // "Take the tour" pressed on another page: it brought us Home, so start straight away
    if (takePendingStart()) {
      setPhase('welcome')
      return
    }
    if (readLocalVersion() >= PATIENT_TOUR_VERSION) return
    // Let Home settle first so the greeting doesn't flash in during loading
    const timer = window.setTimeout(() => setPhase((p) => (p === 'hidden' ? 'welcome' : p)), 900)
    return () => window.clearTimeout(timer)
  }, [enabled])

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
    const replay = () => {
      if (enabled) {
        setPhase('welcome')
        return
      }
      // The tour points at things on Home
      setPendingStart()
      router.push(homeHref)
    }
    window.addEventListener(START_PATIENT_TOUR_EVENT, replay)
    return () => window.removeEventListener(START_PATIENT_TOUR_EVENT, replay)
  }, [enabled, homeHref, router])

  const step = phase === 'touring' ? steps[index] : undefined

  // Keep the highlight on its element through scrolls and resizes
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
      // Something above us (a dialog) already handled it
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

  // Desktop bubble: below the element when there's room, otherwise above; kept on screen
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
            className="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={finish}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="patient-tour-title"
              onClick={(event) => event.stopPropagation()}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="relative w-full max-w-md rounded-t-3xl border border-pt-line bg-pt-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-pt-lift sm:rounded-3xl sm:pb-6"
            >
              <button
                type="button"
                onClick={finish}
                aria-label="Close"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-pt-faint hover:bg-pt-hover hover:text-pt-ink"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="text-xs font-semibold uppercase tracking-wider text-pt-accent-ink">Welcome to Rehabify</p>
              <h2 id="patient-tour-title" className="mt-2 text-xl font-semibold tracking-tight text-pt-ink">
                {firstName ? `Hi ${firstName}, this is your space.` : 'This is your space.'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-pt-muted">
                Your visits, exercises and messages with your physio, all in one place. Want a 30-second look around?
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
          {spotlight ? (
            <div
              className="pointer-events-none fixed rounded-2xl ring-2 ring-white/80 transition-all duration-300 ease-out"
              style={{ ...spotlight, boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }}
            />
          ) : (
            <div className="fixed inset-0 bg-black/50" />
          )}

          <motion.div
            key={step.target}
            role="dialog"
            aria-modal="true"
            aria-labelledby="patient-tour-step-title"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={bubbleStyle}
            className={cn(
              'fixed border border-pt-line bg-pt-surface shadow-pt-lift',
              isPhone || !bubbleStyle
                ? 'inset-x-0 bottom-0 rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-8 sm:left-1/2 sm:w-80 sm:-translate-x-1/2 sm:rounded-3xl sm:pb-5'
                : 'rounded-3xl p-5'
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium tabular-nums text-pt-muted">
                {index + 1} of {steps.length}
              </p>
              <button type="button" onClick={finish} className="text-xs font-medium text-pt-muted hover:text-pt-ink">
                Skip tour
              </button>
            </div>
            <h3 id="patient-tour-step-title" className="mt-2 text-base font-semibold tracking-tight text-pt-ink">
              {step.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-pt-muted">{step.body}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex gap-1.5" aria-hidden="true">
                {steps.map((s, i) => (
                  <span
                    key={s.target}
                    className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-4 bg-pt-ink' : 'w-1.5 bg-pt-line-strong')}
                  />
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
