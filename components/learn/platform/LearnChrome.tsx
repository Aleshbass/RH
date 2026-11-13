'use client'

/**
 * Rehabify Learn's own header and footer (the main site's patient header never shows on Learn).
 * The header knows who is signed in: their tag (Rehabify physio, clinic owner, physio student…),
 * My learning, their Rehabify dashboard and the welcome step if they haven't said who they are.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
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

function SearchBox({ className, autoFocus, onDone }: { className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const term = q.trim()
    router.push(term ? `${learnPath('/courses')}?q=${encodeURIComponent(term)}` : learnPath('/courses'))
    onDone?.()
  }
  return (
    <form role="search" onSubmit={submit} className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-ink/45" />
      <label htmlFor="learn-search" className="sr-only">
        Search courses
      </label>
      <input
        id="learn-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        placeholder="What do you want to learn?"
        className="h-11 w-full rounded-full border border-rh-ink/10 bg-rh-cream/70 pl-11 pr-4 text-sm text-rh-ink placeholder:text-rh-ink/45 transition focus:border-rh-ink focus:bg-white focus:outline-none focus:ring-4 focus:ring-rh-ink/[0.07]"
      />
    </form>
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

/** The phone menu: a panel that slides in over a soft backdrop, its sections easing in one after another. */
function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const identity = useLearnerIdentity()
  const spaceLive = useSpaceLive()
  const reduce = useReducedMotion()
  const pathname = usePathname()
  const closeRef = useRef<HTMLButtonElement>(null)

  // Lock the page behind, close on Escape, and put focus on the close button
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const focus = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 50)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(focus)
    }
  }, [open, onClose])

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

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <motion.button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-default bg-[rgb(5_10_9/0.4)] backdrop-blur-[2px]"
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
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-rh-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
                initial={reduce ? false : { rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ duration: 0.35, ease: PANEL_EASE, delay: reduce ? 0 : 0.12 }}
              >
                <X className="h-5 w-5" />
              </motion.button>
            </div>
            <motion.div
              className="flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-5"
              initial="hidden"
              animate="shown"
              variants={{ hidden: {}, shown: { transition: { staggerChildren: reduce ? 0 : 0.05, delayChildren: reduce ? 0 : 0.12 } } }}
            >
              <motion.div variants={section}>
                <SearchBox onDone={onClose} />
              </motion.div>
              <motion.div variants={section} className="mt-4">
                <ThemeSwitchRow />
              </motion.div>
              {identity?.signedIn && (
                <motion.div variants={section} className="mt-5 rounded-2xl bg-rh-cream p-4">
                  <p className="text-sm font-semibold text-rh-ink">{identity.firstName ? `Hi, ${identity.firstName}` : 'Your account'}</p>
                  <TagBadge tag={identity.tag} size="xs" className="mt-1.5" />
                  <div className="mt-3 flex flex-col">
                    {accountLinks(identity).map((link) => (
                      <Link key={link.href} href={link.href} onClick={onClose} className="flex items-center gap-3 rounded-lg py-2 text-sm text-rh-ink active:bg-rh-ink/[0.04]">
                        <link.icon className="h-4 w-4 text-rh-ink/60" /> {link.label}
                      </Link>
                    ))}
                  </div>
                </motion.div>
              )}
              <motion.div variants={section}>
                <p className="mt-7 text-xs font-semibold uppercase tracking-[0.14em] text-rh-ink/45">Explore</p>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {COURSE_CATEGORIES.map((c) => (
                    <Link
                      key={c.id}
                      href={`${learnPath('/courses')}?category=${c.id}`}
                      onClick={onClose}
                      className="rounded-xl px-2 py-2.5 text-sm text-rh-ink transition-colors active:bg-rh-cream"
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              </motion.div>
              <motion.div variants={section} className="mt-5 grid grid-cols-2 gap-2">
                <Link href={COMMUNITY_PATH} onClick={onClose} className="flex items-center gap-2.5 rounded-2xl bg-rh-cream px-4 py-3.5 text-[15px] font-semibold text-rh-ink active:scale-[0.98]">
                  <MessageCircle className="h-4 w-4" /> Community
                </Link>
                <Link href={SPACES_PATH} onClick={onClose} className="flex items-center gap-2.5 rounded-2xl bg-rh-cream px-4 py-3.5 text-[15px] font-semibold text-rh-ink active:scale-[0.98]">
                  <Radio className="h-4 w-4" /> Spaces {spaceLive && <LiveDot />}
                </Link>
              </motion.div>
              <motion.div variants={section} className="mt-5 flex flex-col gap-1 border-t border-rh-ink/[0.07] pt-5">
                <Link href={learnPath('/courses')} onClick={onClose} className="py-2 text-[15px] font-semibold text-rh-ink">
                  All courses
                </Link>
                <Link href={`${learnPath('/courses')}?type=live`} onClick={onClose} className="py-2 text-[15px] font-semibold text-rh-ink">
                  Live programs
                </Link>
              </motion.div>
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

/** Lime dot while a Space is live. */
function useSpaceLive() {
  const spaces = useQuery(spacesApi.list, {})
  return Boolean(spaces?.live.length)
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
  return (
    <header className="sticky top-0 z-40 border-b border-rh-ink/[0.06] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
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
