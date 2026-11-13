'use client'

/** Small pieces shared by Learn community rooms and Spaces. */

import { useEffect, useRef, type ReactNode } from 'react'
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
 * A panel that slides up from the bottom on phones and sits in the middle on larger screens.
 * Escape and the backdrop close it; the page behind doesn't scroll.
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

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
          <motion.button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn('absolute inset-0 cursor-default', BACKDROP)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          />
          <motion.div
            ref={panel}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]',
              wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
            )}
            initial={reduce ? { opacity: 0 } : { y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          >
            <div className="flex items-center justify-between gap-4 px-5 pb-2 pt-5 sm:px-6">
              <h2 className="text-lg font-semibold text-rh-ink">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-rh-ink/60 transition hover:bg-rh-ink/[0.06] hover:text-rh-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
            {footer && <div className="border-t border-rh-ink/[0.07] px-5 py-4 sm:px-6">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
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
