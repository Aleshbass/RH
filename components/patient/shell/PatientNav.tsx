'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useClerk, useUser } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { ArrowRight, ChevronRight, LogOut, Menu, MoreVertical, PlayCircle, Settings } from '@/components/icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PatientDrawer, initials } from '@/components/patient/ui'
import { cn } from '@/lib/utils'
import {
  FIND_A_PHYSIO,
  MOBILE_TABS,
  NAV,
  PATIENT_HOME,
  PATIENT_NAV,
  isActivePath,
  type PatientNavItem,
} from '@/components/patient/shell/navItems'
import { PatientThemeToggle, SoundSwitchRow } from '@/components/patient/shell/PatientControls'
import { START_PATIENT_TOUR_EVENT } from '@/components/patient/shell/PatientTour'
import { useCareHome } from '@/components/patient/careHome'

/**
 * The portal's brand: Rehabify's wordmark (ink, or white in dark mode), or in clinic mode the
 * clinic's logo and name with "on Rehabify" under it: the clinic leads, Rehabify is the platform.
 */
export function PatientBrand({ className }: { className?: string }) {
  const { clinic } = useCareHome()
  if (clinic) {
    return (
      <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
        {clinic.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clinic.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pt-primary text-xs font-bold text-pt-on-primary">
            {initials(clinic.name)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight text-pt-ink">{clinic.name}</span>
          <span className="block text-[11px] leading-tight text-pt-faint">on Rehabify</span>
        </span>
      </span>
    )
  }
  return (
    <span className={cn('flex items-center', className)}>
      <Image src="/logos/Black%20MainRehabify.svg" alt="Rehabify" width={112} height={28} className="h-6 w-auto dark:hidden" priority />
      <Image src="/logos/White%20MainRehabify.svg" alt="Rehabify" width={112} height={28} className="hidden h-6 w-auto dark:block" priority />
    </span>
  )
}

/**
 * The card at the foot of the menu: the clinic and how to reach it in clinic mode, otherwise
 * "Need a physio?" (a clinic's patients never get sent to the Rehabify marketplace).
 */
function FooterCard({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const { clinic, showMarketplace } = useCareHome()
  if (clinic) {
    return (
      <Link
        href={NAV.messages.href}
        onClick={onNavigate}
        className={cn('group flex items-center justify-between gap-3 rounded-2xl bg-pt-sunken p-4 transition-colors hover:bg-pt-hover', className)}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-pt-ink">Need {clinic.name}?</span>
          <span className="block truncate text-xs text-pt-muted">{clinic.phone ? `Call ${clinic.phone} or send a message` : 'Send the clinic a message'}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-pt-faint transition-transform group-hover:translate-x-0.5" />
      </Link>
    )
  }
  if (!showMarketplace) return null
  return (
    <Link
      href={FIND_A_PHYSIO.href}
      onClick={onNavigate}
      className={cn('group flex items-center justify-between gap-3 rounded-2xl bg-pt-sun-bg p-4 text-pt-sun-fg transition-colors hover:brightness-[0.98]', className)}
    >
      <span>
        <span className="block text-sm font-semibold">Need a physio?</span>
        <span className="block text-xs opacity-80">Browse physiotherapists near you</span>
      </span>
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

function Badge({ count }: { count?: number }) {
  if (!count) return null
  return (
    <span className="ml-auto min-w-[20px] rounded-full bg-pt-accent px-1.5 text-center text-[11px] font-bold leading-5 text-[#06210a]">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavLink({ item, active, badge, onNavigate }: { item: PatientNavItem; active: boolean; badge?: number; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50',
        active ? 'bg-pt-primary text-pt-on-primary' : 'text-pt-muted hover:bg-pt-hover hover:text-pt-ink'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-pt-accent' : 'text-pt-faint group-hover:text-pt-ink')} />
      <span className="truncate">{item.title}</span>
      <Badge count={badge} />
    </Link>
  )
}

function useAccount() {
  const { user } = useUser()
  const { signOut } = useClerk()
  // The name from their Rehabify profile (what Settings saves and their care team sees), not the
  // one on their Google account
  const me = useQuery(api.users.getMyUser) as { firstName?: string; lastName?: string } | null | undefined
  const profileName = [me?.firstName, me?.lastName].filter(Boolean).join(' ').trim()
  const name = profileName || user?.fullName || user?.firstName || 'Your account'
  const email = user?.primaryEmailAddress?.emailAddress
  // Joy patients start with a placeholder login address; don't show it
  const shownEmail = email && !email.endsWith('@patients.physioaroundme.com') ? email : undefined
  return { user, name, email: shownEmail, signOut: () => signOut({ redirectUrl: '/' }) }
}

function AccountMenu() {
  const { user, name, email, signOut } = useAccount()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-pt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50"
        >
          <Avatar className="h-9 w-9 rounded-xl">
            <AvatarImage src={user?.imageUrl} alt="" />
            <AvatarFallback className="rounded-xl bg-pt-sun-bg text-xs font-semibold text-pt-sun-fg">{initials(name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-pt-ink">{name}</span>
            {email && <span className="block truncate text-xs text-pt-faint">{email}</span>}
          </span>
          <MoreVertical className="h-4 w-4 shrink-0 text-pt-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60 rounded-2xl border-pt-line bg-pt-surface p-1.5 text-pt-ink shadow-pt-lift">
        <DropdownMenuItem asChild className="rounded-xl px-3 py-2.5 focus:bg-pt-hover">
          <Link href={NAV.settings.href}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-xl px-3 py-2.5 focus:bg-pt-hover"
          onSelect={() => window.dispatchEvent(new Event(START_PATIENT_TOUR_EVENT))}
        >
          <PlayCircle className="mr-2 h-4 w-4" />
          Take the tour
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-pt-line" />
        <SoundSwitchRow className="hover:bg-transparent" />
        <DropdownMenuSeparator className="bg-pt-line" />
        <DropdownMenuItem className="rounded-xl px-3 py-2.5 text-pt-rose-fg focus:bg-pt-rose-bg focus:text-pt-rose-fg" onSelect={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Desktop sidebar: a floating card with the navigation and the account. */
export function PatientSidebar({ unreadMessages, className }: { unreadMessages?: number; className?: string }) {
  const pathname = usePathname() ?? ''
  return (
    <aside
      data-tour="navigation"
      className={cn('flex w-64 flex-col rounded-3xl border border-pt-line bg-pt-surface shadow-pt dark:shadow-none', className)}
    >
      <Link href={PATIENT_HOME} className="px-5 pb-4 pt-6" aria-label="Home">
        <PatientBrand />
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-3" aria-label="Main">
        {PATIENT_NAV.map((group, i) => (
          <div key={group.label ?? i} className="space-y-0.5">
            {group.label && <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-pt-faint">{group.label}</p>}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActivePath(pathname, item.href)}
                badge={item.href === NAV.messages.href ? unreadMessages : undefined}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-2 p-3">
        <FooterCard />
        <div className="border-t border-pt-line pt-2">
          <AccountMenu />
        </div>
      </div>
    </aside>
  )
}

/** Shorter names where the full one doesn't fit a bottom tab. */
const TAB_LABELS: Record<string, string> = { Appointments: 'Visits', 'My care plan': 'Care plan' }

/**
 * Bottom tab bar on phones and tablets: the four places people go most, plus "More" for the rest.
 */
export function PatientMobileNav({ unreadMessages }: { unreadMessages?: number }) {
  const pathname = usePathname() ?? ''
  const [moreOpen, setMoreOpen] = useState(false)
  const { user, name, email, signOut } = useAccount()
  const tabHrefs = new Set(MOBILE_TABS.map((tab) => tab.href))
  const moreActive = !MOBILE_TABS.some((tab) => isActivePath(pathname, tab.href))

  return (
    <>
      <nav
        data-tour="navigation"
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-pt-line bg-pt-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-xl grid-cols-5">
          {MOBILE_TABS.map((tab) => {
            const active = isActivePath(pathname, tab.href)
            const Icon = tab.icon
            const badge = tab.href === NAV.messages.href ? unreadMessages : undefined
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  active ? 'text-pt-ink' : 'text-pt-faint hover:text-pt-ink'
                )}
              >
                <span className={cn('relative flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-pt-accent-soft')}>
                  <Icon className={cn('h-[18px] w-[18px]', active && 'text-pt-accent-ink')} />
                  {!!badge && (
                    <span className="absolute -top-1 right-1 min-w-[16px] rounded-full bg-pt-accent px-1 text-center text-[9px] font-bold leading-4 text-[#06210a]">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                {TAB_LABELS[tab.title] ?? tab.title}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
              moreActive ? 'text-pt-ink' : 'text-pt-faint hover:text-pt-ink'
            )}
          >
            <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', moreActive && 'bg-pt-accent-soft')}>
              <Menu className={cn('h-[18px] w-[18px]', moreActive && 'text-pt-accent-ink')} />
            </span>
            More
          </button>
        </div>
      </nav>

      <PatientDrawer open={moreOpen} onOpenChange={setMoreOpen} title="Menu">
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl bg-pt-sunken p-3">
            <Avatar className="h-10 w-10 rounded-xl">
              <AvatarImage src={user?.imageUrl} alt="" />
              <AvatarFallback className="rounded-xl bg-pt-sun-bg text-xs font-semibold text-pt-sun-fg">{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-pt-ink">{name}</p>
              {email && <p className="truncate text-xs text-pt-faint">{email}</p>}
            </div>
          </div>

          {PATIENT_NAV.map((group, i) => {
            const items = group.items.filter((item) => !tabHrefs.has(item.href))
            if (items.length === 0) return null
            return (
              <div key={group.label ?? i}>
                {group.label && <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-pt-faint">{group.label}</p>}
                <ul className="overflow-hidden rounded-2xl border border-pt-line">
                  {items.map((item) => {
                    const Icon = item.icon
                    const active = isActivePath(pathname, item.href)
                    return (
                      <li key={item.href} className="border-b border-pt-line last:border-b-0">
                        <Link
                          href={item.href}
                          onClick={() => setMoreOpen(false)}
                          className={cn('flex items-center gap-3 px-3 py-3 transition-colors hover:bg-pt-hover', active && 'bg-pt-sunken')}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pt-sunken text-pt-ink">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-pt-ink">{item.title}</span>
                            <span className="block truncate text-xs text-pt-muted">{item.hint}</span>
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-pt-faint" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}

          <FooterCard onNavigate={() => setMoreOpen(false)} />

          <div className="rounded-2xl border border-pt-line p-1.5">
            <Link
              href={NAV.settings.href}
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-pt-ink hover:bg-pt-hover"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <PatientThemeToggle withLabel />
            <SoundSwitchRow />
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false)
                window.dispatchEvent(new Event(START_PATIENT_TOUR_EVENT))
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-pt-ink hover:bg-pt-hover"
            >
              <PlayCircle className="h-4 w-4" />
              Take the tour
            </button>
            <button
              type="button"
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-pt-rose-fg hover:bg-pt-rose-bg"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </PatientDrawer>
    </>
  )
}
