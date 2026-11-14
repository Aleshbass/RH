'use client'

/** Small pieces shared by Learn community rooms and Spaces. */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Mic, X } from '@/components/icons'
import { cn } from '@/lib/utils'
import { pillInk, pillOutline } from '../shared'
import { learnSignInHref, learnSignUpHref, WELCOME_PATH } from '../platform/learnApi'
import { initials, realPhoto } from './socialApi'

/**
 * A round profile picture. Only a photo the person set up shows; otherwise `fallback` (Spaces use
 * the mic icon) or their initials.
 */
export function Avatar({
  name,
  imageUrl,
  size = 40,
  className,
  fallback,
}: {
  name: string
  imageUrl?: string | null
  size?: number
  className?: string
  fallback?: ReactNode
}) {
  const photo = realPhoto(imageUrl)
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-rh-sand font-semibold text-rh-ink', className)}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}
    >
      {photo ? (
        <Image src={photo} alt="" fill sizes={`${size}px`} unoptimized className="object-cover" />
      ) : fallback ? (
        <span aria-hidden className="flex items-center justify-center">
          {fallback}
        </span>
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  )
}

/** A person in Spaces: their photo if they set one up, otherwise the mic icon. */
export function SpaceAvatar({ name, imageUrl, size = 40, className }: { name: string; imageUrl?: string | null; size?: number; className?: string }) {
  const icon = Math.max(10, Math.round(size * 0.38))
  return <Avatar name={name} imageUrl={imageUrl} size={size} className={className} fallback={<Mic style={{ width: icon, height: icon }} />} />
}

/** A fixed dark tint. Not bg-black: Learn's dark mode turns the "black" token white, which flashed. */
const BACKDROP = 'bg-[rgb(3_8_7/0.5)]'

/**
 * How much of the screen the on-screen keyboard covers (iPhone; Android resizes the page instead,
 * see interactiveWidget in app/learn/layout.tsx), so a sheet's fields and buttons stay above it.
 */
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setInset(0)
    }
  }, [active])
  return inset
}

/**
 * A panel that slides up from the bottom on phones and sits in the middle on larger screens.
 * Escape and the backdrop close it; the page behind doesn't scroll.
 * Phone fixes (owner 2026-11-14: "breaks", "white glitch"): rendered into <body> so no page layout,
 * header or bar can cover or clip it; a plain slide up (no fade or zoom of the white panel); kept
 * above the keyboard; 16px fields so iPhones don't zoom; no tap flash on the backdrop.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const reduce = useReducedMotion()
  const panel = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const keyboard = useKeyboardInset(open)
  // Parents pass a new onClose on every render (live data updates); keep the latest without
  // re-running the open effect, which would unlock/relock scrolling and re-focus (a flicker)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    const body = document.body
    const before = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
    // Hiding the scrollbar would shift the page sideways: pad by its width instead
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
    window.addEventListener('keydown', onKey)
    // Focus the first field with a keyboard and mouse; on phones that would pop the keyboard mid-animation
    const finePointer = window.matchMedia('(pointer: fine)').matches
    const focus = finePointer
      ? window.setTimeout(
          () => panel.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), textarea')?.focus({ preventScroll: true }),
          280
        )
      : 0
    return () => {
      body.style.overflow = before.overflow
      body.style.paddingRight = before.paddingRight
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(focus)
    }
  }, [open])

  if (!mounted) return null
  const phone = window.matchMedia('(max-width: 639px)').matches
  const enter = reduce ? { opacity: 0 } : phone ? { y: '100%' } : { y: 24, opacity: 0 }
  const shown = reduce ? { opacity: 1 } : phone ? { y: 0 } : { y: 0, opacity: 1 }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-x-0 top-0 z-[100] flex items-end justify-center [-webkit-tap-highlight-color:transparent] sm:items-center sm:p-6"
          style={{ bottom: keyboard }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            aria-hidden
            onClick={onClose}
            className={cn('absolute inset-0 touch-none', BACKDROP)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          />
          <motion.div
            ref={panel}
            className={cn(
              'relative flex max-h-[calc(100%-1.5rem)] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-[28px]',
              // 16px fields on phones: iPhones zoom into anything smaller
              'max-sm:[&_input]:text-base max-sm:[&_select]:text-base max-sm:[&_textarea]:text-base',
              wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
            )}
            initial={enter}
            animate={shown}
            exit={enter}
            transition={phone ? { type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] } : { type: 'spring', stiffness: 420, damping: 36 }}
          >
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-rh-ink/15 sm:hidden" aria-hidden />
            <div className="flex items-center justify-between gap-4 px-5 pb-2 pt-3 sm:px-6 sm:pt-5">
              <h2 className="text-lg font-semibold text-rh-ink">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-rh-ink/60 transition hover:bg-rh-ink/[0.06] hover:text-rh-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">{children}</div>
            {footer && (
              <div className={cn('shrink-0 border-t border-rh-ink/[0.07] px-5 pt-4 sm:px-6 sm:pb-4', keyboard ? 'pb-3' : 'pb-[calc(1rem+env(safe-area-inset-bottom))]')}>
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/** For people who aren't signed in, or haven't told Learn who they are yet. */
export function JoinPrompt({ signedIn, returnTo, children }: { signedIn: boolean; returnTo: string; children?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-rh-ink/[0.08] bg-rh-cream p-6 text-center sm:p-10">
      <p className="mx-auto max-w-md text-[15px] leading-6 text-rh-ink/70">
        {children ??
          (signedIn
            ? 'Tell us whether you’re a physio, a student or something else, and you’re in.'
            : 'Join Rehabify Learn for free to read the conversations, ask questions and listen to Spaces.')}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {signedIn ? (
          <Link href={`${WELCOME_PATH}?next=${encodeURIComponent(returnTo)}`} className={cn(pillInk, 'h-11 px-5')}>
            Continue <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <>
            <Link href={learnSignUpHref(returnTo)} className={cn(pillInk, 'h-11 px-5')}>
              Join for free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={learnSignInHref(returnTo)} className={cn(pillOutline, 'h-11 px-5')}>
              Sign in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-rh-ink/15 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rh-cream text-rh-ink">{icon}</span>
      <p className="mt-4 text-base font-semibold text-rh-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm leading-6 text-rh-ink/60">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-rh-ink/[0.06]', className)} />
}
