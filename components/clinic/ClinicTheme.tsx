'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'
import { Toaster } from 'sonner'
import { cn } from '@/lib/utils'
import { CLINIC_THEME_STORAGE_KEY as STORAGE_KEY } from '@/lib/clinic-theme'

type Theme = 'light' | 'dark'

const SOUND_SRC = '/sound/magic-sweep.wav'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> }
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage blocked: fall through to the system preference
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

type ClinicThemeContextValue = {
  theme: Theme
  toggleTheme: (origin?: { x: number; y: number }) => void
}

const ClinicThemeContext = createContext<ClinicThemeContextValue | null>(null)

export function useClinicTheme() {
  const value = useContext(ClinicThemeContext)
  if (!value) throw new Error('useClinicTheme must be used inside ClinicThemeProvider')
  return value
}

/**
 * Light/dark mode for the clinic portal only. The `dark` class goes on <html>
 * so dialogs and popovers rendered in portals follow it, and is restored when
 * the user leaves the clinic portal.
 */
export function ClinicThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains('dark')
    const previousScheme = root.style.colorScheme

    const initial = readStoredTheme()
    applyTheme(initial)
    setTheme(initial)

    return () => {
      root.classList.toggle('dark', hadDark)
      root.style.colorScheme = previousScheme
    }
  }, [])

  useEffect(() => {
    const audio = new Audio(SOUND_SRC)
    audio.preload = 'auto'
    audio.volume = 0.35
    audioRef.current = audio
    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [])

  const toggleTheme = useCallback(
    (origin?: { x: number; y: number }) => {
      const next: Theme = theme === 'dark' ? 'light' : 'dark'

      const audio = audioRef.current
      if (audio) {
        audio.currentTime = 0
        audio.play().catch(() => {
          // Autoplay blocked or file missing: the switch still happens
        })
      }

      const commit = () => {
        flushSync(() => setTheme(next))
        applyTheme(next)
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {
          // Preference just won't persist
        }
      }

      const doc = document as ViewTransitionDocument
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!doc.startViewTransition || reduceMotion) {
        commit()
        return
      }

      const x = origin?.x ?? window.innerWidth / 2
      const y = origin?.y ?? 0
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))

      doc
        .startViewTransition(commit)
        .ready.then(() => {
          document.documentElement.animate(
            {
              clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
            },
            {
              duration: 600,
              easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
              pseudoElement: '::view-transition-new(root)',
            }
          )
        })
        .catch(() => {
          // Transition skipped: theme is already applied by commit
        })
    },
    [theme]
  )

  return (
    <ClinicThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
      <Toaster position="top-right" theme={theme} closeButton />
    </ClinicThemeContext.Provider>
  )
}

/**
 * Sun/moon switch. `withLabel` shows the text in the expanded sidebar.
 */
export function ClinicThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const { theme, toggleTheme } = useClinicTheme()
  const isDark = theme === 'dark'
  const label = isDark ? 'Light mode' : 'Dark mode'

  return (
    <button
      type="button"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      }}
      aria-label={`Switch to ${label.toLowerCase()}`}
      title={withLabel ? undefined : label}
      className={cn(
        'relative flex items-center gap-3 rounded-lg text-sm text-neutral-600 transition-colors hover:bg-neutral-100/70 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005b57]/40 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-white',
        withLabel ? 'w-full px-3 py-2' : 'h-9 w-9 justify-center',
        className
      )}
    >
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {isDark ? (
              <Moon className="h-4 w-4 text-[#2dd4bf]" />
            ) : (
              <Sun className="h-4 w-4 text-amber-500" />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
      {withLabel && <span className="flex-1 truncate text-left">{label}</span>}
    </button>
  )
}
