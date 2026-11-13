'use client'

/**
 * Rehabify Learn's own header and footer (the main site's patient header never shows on Learn).
 * The header knows who is signed in: their tag (Rehabify physio, clinic owner, physio student…),
 * My learning, their Rehabify dashboard and the welcome step if they haven't said who they are.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useClerk, useUser } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Radio,
  Search,
  Stethoscope,
  UserCog,
  X,
} from '@/components/icons'
import { COURSE_CATEGORIES } from '@/lib/learn/catalog'
import { cn } from '@/lib/utils'
import { pillInk } from '../shared'
import { CoverImage, matchesQuery, useCatalog } from './catalog'
import { LearnerIdentityProvider, TagBadge, useLearnerIdentity } from './identity'
import { ThemeSwitchRow, ThemeToggle } from './theme'
import {
  learnPath,
  learnSignInHref,
  learnSignUpHref,
  mainSiteUrl,
  MY_LEARNING_PATH,
  WELCOME_PATH,
  type SignedInLearner,
} from './learnApi'
import { COMMUNITY_PATH, SPACES_PATH, spacesApi } from '../social/socialApi'

const SUPPORT_EMAIL = 'support@physioaroundme.com'

/** Learn pages that draw their own top bar (the MSK course app, one-tap links, certificate checks). */
const OWN_TOP_BAR = /^\/(?:learn\/)?(?:course|start|verify)(?:\/|$)/

function Logo({ onDark = false }: { onDark?: boolean }) {
  return (
    <Link href={learnPath()} className="flex shrink-0 items-center gap-2" aria-label="Rehabify Learn home">
      <Image
        src={onDark ? '/logos/White%20MainRehabify.svg' : '/logos/Ink%20MainRehabify.svg'}
        alt="Rehabify"
        width={104}
        height={32}
        className="h-6 w-auto sm:h-7"
        priority
      />
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
          onDark ? 'bg-rh-lime text-rh-ink' : 'bg-rh-ink text-rh-lime'
        )}
      >
        Learn
      </span>
    </Link>
  )
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

/**
 * Live course matches under a search field. Typing never leaves the page (owner 2026-11-13: tapping
 * search while watching a lesson must not navigate away); only picking a course or "See all" does.
 */
function SearchResults({ q, onPick }: { q: string; onPick: () => void }) {
  const items = useCatalog()
  const term = q.trim()
  const matches = useMemo(() => (items && term ? items.filter((item) => matchesQuery(item, term)).slice(0, 6) : []), [items, term])
  const allHref = term ? `${learnPath('/courses')}?q=${encodeURIComponent(term)}` : learnPath('/courses')

  if (!term) {
    return (
      <div className="p-4">
        <p className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-rh-ink/45">Browse topics</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {COURSE_CATEGORIES.map((c) => (
            <Link
              key={c.id}
              href={`${learnPath('/courses')}?category=${c.id}`}
              onClick={onPick}
              className="rounded-full border border-rh-ink/10 px-3.5 py-2 text-sm font-medium text-rh-ink transition hover:border-rh-ink/25 active:bg-rh-cream"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-2">
      {items === undefined ? (
        <div className="space-y-2 p-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-2xl bg-rh-ink/[0.05]" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <p className="px-3 py-4 text-sm text-rh-ink/60">No courses match “{term}”.</p>
      ) : (
        <ul>
          {matches.map((item) => (
            <li key={item.key}>
              <Link href={item.href} onClick={onPick} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-rh-cream active:bg-rh-cream">
                <span className="relative h-11 w-16 shrink-0 overflow-hidden rounded-xl bg-rh-sand">
                  <CoverImage cover={item.cover} sizes="64px" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-rh-ink">{item.title}</span>
                  <span className="block truncate text-xs text-rh-ink/55">
                    {item.isLive ? 'Live program' : 'Video course'} · {item.price}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={allHref}
        onClick={onPick}
        className="mt-1 flex items-center justify-between gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-rh-ink transition hover:bg-rh-cream active:bg-rh-cream"
      >
        <span className="truncate">See all results for “{term}”</span>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </Link>
    </div>
  )
}

/** The header search (tablet and up): results drop down under it as you type. */
function SearchBox({ className }: { className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useOutsideClose(open, close)

  // A new page closes the results
  useEffect(() => setOpen(false), [pathname])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const term = q.trim()
    router.push(term ? `${learnPath('/courses')}?q=${encodeURIComponent(term)}` : learnPath('/courses'))
    setOpen(false)
  }
  return (
    <div ref={ref} className={cn('relative', className)}>
      <form role="search" onSubmit={submit} className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-ink/45" />
        <label htmlFor="learn-search" className="sr-only">
          Search courses
        </label>
        <input
          id="learn-search"
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
          placeholder="What do you want to learn?"
          className="h-11 w-full rounded-full border border-rh-ink/10 bg-rh-cream/70 pl-11 pr-4 text-sm text-rh-ink placeholder:text-rh-ink/45 transition focus:border-rh-ink focus:bg-white focus:outline-none focus:ring-4 focus:ring-rh-ink/[0.07]"
        />
      </form>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="absolute left-0 right-0 top-[52px] z-50 max-h-[70vh] overflow-y-auto rounded-3xl bg-white shadow-lift ring-1 ring-rh-ink/[0.06]"
          >
            <SearchResults q={q} onPick={close} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Phone search: a panel over the page (nothing behind it moves or stops), results as you type. */
function PhoneSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const pathname = usePathname()
  const [q, setQ] = useState('')
  const closeLatest = useRef(onClose)
  closeLatest.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeLatest.current()
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // A new page closes the panel
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (lastPath.current !== pathname && open) onClose()
    lastPath.current = pathname
  }, [pathname, open, onClose])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const term = q.trim()
    router.push(term ? `${learnPath('/courses')}?q=${encodeURIComponent(term)}` : learnPath('/courses'))
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Search courses"
          className="fixed inset-0 z-[60] flex flex-col bg-white md:hidden"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        >
          <form role="search" onSubmit={submit} className="flex h-16 shrink-0 items-center gap-2 border-b border-rh-ink/[0.06] px-4">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-ink/45" />
              <input
                type="search"
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                enterKeyHint="search"
                autoComplete="off"
                aria-label="Search courses"
                placeholder="What do you want to learn?"
                className="h-11 w-full rounded-full border border-rh-ink/10 bg-rh-cream pl-11 pr-4 text-[16px] text-rh-ink placeholder:text-rh-ink/45 focus:border-rh-ink focus:outline-none"
              />
            </div>
            <button type="button" onClick={onClose} className="h-10 shrink-0 px-2 text-sm font-semibold text-rh-ink">
              Cancel
            </button>
          </form>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <SearchResults q={q} onPick={onClose} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ExploreMenu() {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-rh-ink transition hover:bg-rh-ink/[0.05]"
      >
        Explore <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-50 w-[30rem] rounded-[1.5rem] bg-white p-3 shadow-lift ring-1 ring-rh-ink/[0.06]">
          <div className="grid grid-cols-2 gap-1">
            {COURSE_CATEGORIES.map((c) => (
              <Link
                key={c.id}
                href={`${learnPath('/courses')}?category=${c.id}`}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm text-rh-ink transition hover:bg-rh-cream"
              >
                {c.label}
              </Link>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-rh-ink/[0.07] px-3 pt-3">
            <Link href={learnPath('/courses')} onClick={() => setOpen(false)} className="text-sm font-semibold text-rh-ink hover:underline">
              All courses
            </Link>
            <Link
              href={`${learnPath('/courses')}?type=live`}
              onClick={() => setOpen(false)}
              className="text-sm font-semibold text-rh-ink/70 hover:text-rh-ink hover:underline"
            >
              Live programs
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || 'R'
  )
}

function Avatar({ size = 36 }: { size?: number }) {
  const { user } = useUser()
  const name = user?.fullName || user?.firstName || ''
  return user?.imageUrl ? (
    <Image src={user.imageUrl} alt="" width={size} height={size} unoptimized className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex items-center justify-center rounded-full bg-rh-ink text-xs font-semibold text-rh-lime" style={{ width: size, height: size }}>
      {initials(name)}
    </span>
  )
}

function accountLinks(identity: SignedInLearner) {
  const links: { href: string; label: string; icon: typeof BookOpen; external?: boolean }[] = [
    { href: MY_LEARNING_PATH, label: 'My learning', icon: BookOpen },
  ]
  if (identity.hasDashboard) links.push({ href: mainSiteUrl('/dashboard'), label: 'My Rehabify dashboard', icon: LayoutDashboard, external: true })
  if (identity.needsWelcome || identity.profile) {
    links.push({ href: WELCOME_PATH, label: identity.profile ? 'Edit learner details' : 'Tell us about you', icon: UserCog })
  }
  if (identity.canJoinAsClinician && identity.profile?.kind !== 'other') {
    links.push({
      href: mainSiteUrl('/role-selection?as=physiotherapist'),
      label: 'Join Rehabify as a physio',
      icon: Stethoscope,
      external: true,
    })
  }
  return links
}

function AccountMenu({ identity }: { identity: SignedInLearner }) {
  const { user } = useUser()
  const { signOut } = useClerk()
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  const name = user?.fullName || identity.firstName || 'Your account'
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Your account"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-1 transition hover:bg-rh-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
      >
        <Avatar />
        <ChevronDown className="hidden h-3.5 w-3.5 text-rh-ink/60 sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-72 rounded-[1.5rem] bg-white p-2 shadow-lift ring-1 ring-rh-ink/[0.06]">
          <div className="flex items-center gap-3 rounded-2xl bg-rh-cream/70 p-3">
            <Avatar size={44} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-rh-ink">{name}</p>
              <TagBadge tag={identity.tag} size="xs" className="mt-1" />
              {identity.tag.detail && <p className="mt-1 truncate text-xs text-rh-ink/55">{identity.tag.detail}</p>}
            </div>
          </div>
          <nav className="mt-1 flex flex-col">
            {accountLinks(identity).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-rh-ink transition hover:bg-rh-cream"
              >
                <link.icon className="h-4 w-4 text-rh-ink/60" />
                <span className="flex-1">{link.label}</span>
                {link.external && <ArrowUpRight className="h-3.5 w-3.5 text-rh-ink/40" />}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => signOut({ redirectUrl: learnPath() })}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rh-ink transition hover:bg-rh-cream"
            >
              <LogOut className="h-4 w-4 text-rh-ink/60" /> Sign out
            </button>
          </nav>
        </div>
      )}
    </div>
  )
}

function AuthArea() {
  const identity = useLearnerIdentity()
  const pathname = usePathname()
  if (identity === undefined) return <span className="h-9 w-24 animate-pulse rounded-full bg-rh-ink/[0.06]" />
  if (!identity.signedIn) {
    return (
      <div className="flex items-center gap-1 sm:gap-2">
        <Link href={learnSignInHref(pathname || learnPath())} className="hidden h-10 items-center rounded-full px-4 text-sm font-semibold text-rh-ink hover:bg-rh-ink/[0.05] sm:inline-flex">
          Sign in
        </Link>
        <Link href={learnSignUpHref()} className={cn(pillInk, 'h-10 px-4 sm:px-5')}>
          Join for free
        </Link>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Link href={MY_LEARNING_PATH} className="hidden h-10 items-center rounded-full px-4 text-sm font-semibold text-rh-ink hover:bg-rh-ink/[0.05] md:inline-flex">
        My learning
      </Link>
      <AccountMenu identity={identity} />
    </div>
  )
}

const PANEL_EASE = [0.32, 0.72, 0, 1] as const

type Shortcut = { href: string; label: string; sub: string; icon: typeof BookOpen; live?: boolean }

/** One big tap target for the phone menu: Courses, Community, Spaces, My learning. */
function ShortcutTile({ item, active, onClose }: { item: Shortcut; active: boolean; onClose: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClose}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-col justify-between gap-5 rounded-[22px] p-4 transition active:scale-[0.97]',
        active ? 'bg-rh-ink text-white' : 'bg-rh-cream text-rh-ink'
      )}
    >
      <span className="flex items-center justify-between">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-2xl', active ? 'bg-white/10 text-rh-lime' : 'bg-white text-rh-ink')}>
          <item.icon className="h-[18px] w-[18px]" />
        </span>
        {item.live && <LiveDot />}
      </span>
      <span>
        <span className="block text-[16px] font-semibold leading-tight">{item.label}</span>
        <span className={cn('mt-0.5 block text-xs', active ? 'text-white/60' : 'text-rh-ink/55')}>{item.sub}</span>
      </span>
    </Link>
  )
}

/** The phone menu: a solid panel with the main places as big tiles, then topics and the account. */
function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const identity = useLearnerIdentity()
  const liveSpace = useLiveSpace()
  const reduce = useReducedMotion()
  const pathname = usePathname() ?? ''
  const { signOut } = useClerk()
  const closeRef = useRef<HTMLButtonElement>(null)
  const closeLatest = useRef(onClose)
  closeLatest.current = onClose

  // Lock the page behind, close on Escape, and put focus on the close button
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeLatest.current()
    document.addEventListener('keydown', onKey)
    const focus = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 50)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(focus)
    }
  }, [open])

  // A new page closes the menu
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (lastPath.current !== pathname && open) onClose()
    lastPath.current = pathname
  }, [pathname, open, onClose])

  const section = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 14 },
    shown: { opacity: 1, y: 0, transition: { duration: 0.32, ease: PANEL_EASE } },
  }
  const isActive = (href: string) => {
    const path = href.split('?')[0]
    return pathname === path || pathname.startsWith(`${path}/`) || pathname === `/learn${path}` || pathname.startsWith(`/learn${path}/`)
  }

  const shortcuts: Shortcut[] = [
    { href: learnPath('/courses'), label: 'Courses', sub: 'Browse everything', icon: GraduationCap },
    { href: COMMUNITY_PATH, label: 'Community', sub: 'Ask and discuss', icon: MessageCircle },
    { href: SPACES_PATH, label: 'Spaces', sub: liveSpace ? 'Live now' : 'Live audio rooms', icon: Radio, live: Boolean(liveSpace) },
    identity?.signedIn
      ? { href: MY_LEARNING_PATH, label: 'My learning', sub: 'Pick up where you left off', icon: BookOpen }
      : { href: `${learnPath('/courses')}?type=live`, label: 'Live programs', sub: 'Learn with a cohort', icon: BookOpen },
  ]
  const account = identity?.signedIn ? accountLinks(identity).filter((link) => link.href !== MY_LEARNING_PATH) : []

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          {/* Solid dim behind the panel on tablets (phones see only the panel) */}
          <motion.button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-default bg-[rgb(5_10_9/0.6)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-lift sm:max-w-sm"
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: reduce ? 0.2 : 0.42, ease: PANEL_EASE }}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-rh-ink/[0.06] px-4">
              <Logo />
              <motion.button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="flex h-10 w-10 items-center justify-center rounded-full text-rh-ink transition-colors hover:bg-rh-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
                initial={reduce ? false : { rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ duration: 0.35, ease: PANEL_EASE, delay: reduce ? 0 : 0.12 }}
              >
                <X className="h-5 w-5" />
              </motion.button>
            </div>
            <motion.div
              className="flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-4"
              initial="hidden"
              animate="shown"
              variants={{ hidden: {}, shown: { transition: { staggerChildren: reduce ? 0 : 0.05, delayChildren: reduce ? 0 : 0.12 } } }}
            >
              {identity?.signedIn && (
                <motion.div variants={section} className="mb-4 flex items-center gap-3 px-1">
                  <Avatar size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-rh-ink">{identity.firstName ? `Hi, ${identity.firstName}` : 'Your account'}</p>
                    <TagBadge tag={identity.tag} size="xs" className="mt-1" />
                  </div>
                </motion.div>
              )}

              {/* The main places, one tap each */}
              <motion.div variants={section} className="grid grid-cols-2 gap-2.5">
                {shortcuts.map((item) => (
                  <ShortcutTile key={item.href} item={item} active={isActive(item.href)} onClose={onClose} />
                ))}
              </motion.div>

              {liveSpace && (
                <motion.div variants={section} className="mt-2.5">
                  <Link
                    href={learnPath(`/spaces/${liveSpace.id}`)}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-[22px] bg-rh-ink p-4 text-white active:scale-[0.98]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rh-lime text-rh-ink">
                      <Radio className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-rh-lime">Live now</span>
                      <span className="block truncate text-[15px] font-semibold">{liveSpace.title}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-white/60" />
                  </Link>
                </motion.div>
              )}

              <motion.div variants={section}>
                <p className="mt-7 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-rh-ink/45">Topics</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {COURSE_CATEGORIES.map((c) => (
                    <Link
                      key={c.id}
                      href={`${learnPath('/courses')}?category=${c.id}`}
                      onClick={onClose}
                      className="rounded-full border border-rh-ink/10 px-3.5 py-2 text-sm font-medium text-rh-ink transition-colors active:bg-rh-cream"
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              </motion.div>

              {account.length > 0 && (
                <motion.div variants={section} className="mt-7 border-t border-rh-ink/[0.07] pt-3">
                  {account.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={onClose}
                      className="flex items-center gap-3 rounded-xl px-1 py-3 text-[15px] text-rh-ink active:bg-rh-cream"
                    >
                      <link.icon className="h-4 w-4 text-rh-ink/55" />
                      <span className="flex-1">{link.label}</span>
                      {link.external && <ArrowUpRight className="h-3.5 w-3.5 text-rh-ink/40" />}
                    </Link>
                  ))}
                </motion.div>
              )}

              <motion.div variants={section} className={cn(account.length > 0 ? 'mt-1' : 'mt-7 border-t border-rh-ink/[0.07] pt-4')}>
                <ThemeSwitchRow />
              </motion.div>

              {identity?.signedIn && (
                <motion.div variants={section}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      void signOut({ redirectUrl: learnPath() })
                    }}
                    className="mt-2 flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left text-[15px] text-rh-ink/70 active:bg-rh-cream"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </motion.div>
              )}

              {identity && !identity.signedIn && (
                <motion.div variants={section} className="mt-8 grid gap-2">
                  <Link href={learnSignUpHref()} onClick={onClose} className={cn(pillInk, 'h-12 w-full')}>
                    Join for free <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href={learnSignInHref()} onClick={onClose} className="flex h-12 items-center justify-center rounded-full border border-rh-ink/15 text-sm font-semibold text-rh-ink">
                    Sign in
                  </Link>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/** The first live Space, if any (for the live dot and the menu's "Live now" card). */
function useLiveSpace() {
  const spaces = useQuery(spacesApi.list, {})
  return spaces?.live[0] ?? null
}

function useSpaceLive() {
  return Boolean(useLiveSpace())
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2" aria-label="A Space is live">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rh-lime opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-rh-lime" />
    </span>
  )
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const active = pathname === href || pathname.startsWith(`${href}/`) || pathname === `/learn${href}` || pathname.startsWith(`/learn${href}/`)
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold text-rh-ink transition hover:bg-rh-ink/[0.05]',
        active && 'bg-rh-ink/[0.06]'
      )}
    >
      {children}
    </Link>
  )
}

export function LearnHeader() {
  const spaceLive = useSpaceLive()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const [searchOpen, setSearchOpen] = useState(false)
  const closeSearch = useCallback(() => setSearchOpen(false), [])
  return (
    <header className="sticky top-0 z-40 border-b border-rh-ink/[0.06] bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Logo />
        <nav className="ml-3 hidden items-center lg:flex" aria-label="Learn">
          <ExploreMenu />
          <NavLink href={COMMUNITY_PATH}>Community</NavLink>
          <NavLink href={SPACES_PATH}>
            Spaces {spaceLive && <LiveDot />}
          </NavLink>
        </nav>
        <SearchBox className="mx-auto hidden w-full max-w-md md:block" />
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search courses"
            aria-expanded={searchOpen}
            className="flex h-10 w-10 items-center justify-center rounded-full text-rh-ink transition hover:bg-rh-ink/[0.05] active:scale-95 md:hidden"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
          <ThemeToggle />
          <AuthArea />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-full text-rh-ink transition hover:bg-rh-ink/[0.05] active:scale-95 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
      <MobileMenu open={menuOpen} onClose={closeMenu} />
      <PhoneSearch open={searchOpen} onClose={closeSearch} />
    </header>
  )
}

export function LearnFooter() {
  const year = new Date().getFullYear()
  const columns: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: 'Learn',
      links: [
        { label: 'All courses', href: learnPath('/courses') },
        { label: 'Live programs', href: `${learnPath('/courses')}?type=live` },
        { label: 'Free courses', href: `${learnPath('/courses')}?type=free` },
        { label: 'Community', href: COMMUNITY_PATH },
        { label: 'Spaces', href: SPACES_PATH },
        { label: 'My learning', href: MY_LEARNING_PATH },
      ],
    },
    {
      title: 'For you',
      links: [
        { label: 'Physio students', href: `${learnPath()}#students` },
        { label: 'Join Rehabify as a physio', href: mainSiteUrl('/platform/physiotherapists') },
        { label: 'Clinics', href: mainSiteUrl('/platform/clinics') },
      ],
    },
    {
      title: 'Rehabify',
      links: [
        { label: 'physioaroundme.com', href: mainSiteUrl('/') },
        { label: 'Blog', href: mainSiteUrl('/blog') },
        { label: 'Privacy', href: mainSiteUrl('/privacy-policy') },
        { label: 'Terms', href: mainSiteUrl('/terms-and-conditions') },
      ],
    },
  ]
  return (
    <footer className="bg-rh-ink text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:py-16">
        <div className="grid gap-10 md:grid-cols-[1.3fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Logo onDark />
            <p className="mt-5 text-sm leading-6 text-white/65">Practical courses for physiotherapists and physio students, from clinicians who treat patients every day.</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-5 inline-block text-sm font-semibold text-white hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-white/80 transition hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Rehabify Health. All rights reserved.</p>
          <p className="inline-flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" /> Certificates are professional development, not a licence.
          </p>
        </div>
      </div>
    </footer>
  )
}

/** app/learn/layout.tsx: header and footer around every Learn page except those with their own top bar. */
export function LearnShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  if (OWN_TOP_BAR.test(pathname)) return <>{children}</>
  return (
    <LearnerIdentityProvider>
      <div className="flex min-h-screen flex-col bg-white">
        <LearnHeader />
        <div className="flex-1">{children}</div>
        <LearnFooter />
      </div>
    </LearnerIdentityProvider>
  )
}
