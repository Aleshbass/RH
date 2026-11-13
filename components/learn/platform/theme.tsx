'use client'

/**
 * Rehabify Learn dark mode (owner 2026-11-13: "the smoothest transition animation and a sound").
 *
 * The theme is a class on <html> (`learn-dark`) that swaps Learn's colour tokens (app/globals.css),
 * so every Learn page follows without per-component dark styles. Switching spreads the new theme
 * out in a circle from the tap (View Transitions), with a soft ElevenLabs sound; browsers without
 * View Transitions, and reduced-motion users, get a short cross-fade instead.
 */

import { useCallback, useEffect, useSyncExternalStore, type MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Moon, Sun } from '@/components/icons'
import { playSoundFile, preloadSoundFile } from '@/lib/sounds'
import { LEARN_DARK_CLASS, LEARN_THEME_STORAGE_KEY } from '@/lib/learn/themeScript'
import { cn } from '@/lib/utils'

const STORAGE_KEY = LEARN_THEME_STORAGE_KEY
const DARK_CLASS = LEARN_DARK_CLASS

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

const isDark = () => document.documentElement.classList.contains(DARK_CLASS)

/** Every toggle on the page stays in step through the <html> class. */
export function useLearnDark() {
  return useSyncExternalStore(subscribe, isDark, () => false)
}

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle(DARK_CLASS, dark)
  try {
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
  } catch {
    // The choice just won't be remembered
  }
}

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } }

export function useToggleLearnTheme() {
  return useCallback((event?: MouseEvent) => {
    const next = !isDark()
    playSoundFile(next ? 'theme-dark' : 'theme-light')
    const doc = document as ViewTransitionDocument
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!doc.startViewTransition || reduce) {
      const html = document.documentElement
      html.classList.add('learn-theme-fade')
      applyTheme(next)
      window.setTimeout(() => html.classList.remove('learn-theme-fade'), 450)
      return
    }
    // The new theme grows from where the person tapped
    const x = event?.clientX ?? window.innerWidth - 48
    const y = event?.clientY ?? 32
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const transition = doc.startViewTransition(() => flushSync(() => applyTheme(next)))
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
        )
      })
      .catch(() => undefined)
  }, [])
}

/**
 * app/learn/layout.tsx: follows the system theme until the person chooses, warms up the sounds,
 * and takes the dark class away when they leave Learn (sign-in pages and the main site stay light).
 */
export function LearnThemeRoot() {
  useEffect(() => {
    preloadSoundFile('theme-dark')
    preloadSoundFile('theme-light')
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const follow = () => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return
      } catch {
        // fall through to the system theme
      }
      document.documentElement.classList.toggle(DARK_CLASS, media.matches)
    }
    media.addEventListener('change', follow)
    return () => {
      media.removeEventListener('change', follow)
      document.documentElement.classList.remove(DARK_CLASS)
    }
  }, [])
  return null
}

/** Round sun / moon button for the Learn header. */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useLearnDark()
  const toggle = useToggleLearnTheme()
  const reduce = useReducedMotion()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      className={cn(
        'relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-rh-ink transition hover:bg-rh-ink/[0.06] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink',
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={dark ? 'moon' : 'sun'}
          initial={reduce ? { opacity: 0 } : { rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { rotate: 90, scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="flex"
        >
          {dark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

/** "Dark mode" row with a switch, for the phone menu. */
export function ThemeSwitchRow() {
  const dark = useLearnDark()
  const toggle = useToggleLearnTheme()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={toggle}
      className="flex w-full items-center justify-between rounded-2xl bg-rh-cream px-4 py-3 text-left text-[15px] font-semibold text-rh-ink"
    >
      <span className="flex items-center gap-3">
        {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        Dark mode
      </span>
      <span className={cn('relative h-6 w-11 rounded-full transition-colors duration-300', dark ? 'bg-rh-lime' : 'bg-rh-ink/20')}>
        <motion.span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
          animate={{ left: dark ? 22 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  )
}
