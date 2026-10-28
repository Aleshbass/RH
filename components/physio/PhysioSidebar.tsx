'use client'

/**
 * Physiotherapist portal navigation, built like the patient portal's: a floating sidebar card on
 * desktop, a bottom tab bar with a "More" drawer on phones, and tabs for sections made of
 * several pages (Schedule, Money, Library).
 */

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useClerk, useUser } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { ArrowLeftRight, ArrowRight, Building2, ChevronRight, LogOut, Menu, MoreVertical, PlayCircle, ShieldCheck, Store, UserRound } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PatientDrawer, initials } from '@/components/patient/ui'
import { PatientThemeToggle, SoundSwitchRow } from '@/components/patient/shell/PatientControls'
import { START_PHYSIO_TOUR_EVENT } from '@/components/physio/PhysioTour'
import { clearUserNoteDrafts } from '@/components/physio/notes/draftStore'
import { usePracticeMode } from '@/components/physio/practiceMode'
import { CLINIC_PORTAL_HOME } from '@/components/clinic/clinician-routing'
import { cn } from '@/lib/utils'
import {
  LIMITED_NAV,
  MOBILE_TABS,
  NAV,
  PHYSIO_HOME,
  PHYSIO_NAV,
  isActiveItem,
  isActiveTab,
  sectionTabsFor,
  type PhysioNavItem,
} from '@/components/physio/shell/navItems'

export { PHYSIO_HOME, PHYSIO_NAV }

/** Rehabify wordmark: ink (white in dark mode), or always white on a dark surface (`onBrand`). */
export function PhysioBrand({ className, onBrand = false }: { className?: string; onBrand?: boolean }) {
  if (onBrand) {
    return (
      <span className={cn('flex items-center', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/White%20MainRehabify.svg" alt="Rehabify" className="h-6 w-auto" />
      </span>
    )
  }
  return (
    <span className={cn('flex items-center', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logos/Ink%20MainRehabify.svg" alt="Rehabify" className="h-6 w-auto dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logos/White%20MainRehabify.svg" alt="Rehabify" className="hidden h-6 w-auto dark:block" />
    </span>
  )
}

/**
 * The clinic this physiotherapist also works at, if any, so they can switch to its workspace.
 * Their personal Rehabify account and the clinic's dashboard stay separate.
 */
function useClinicWorkspace() {
  const access = useQuery(api.clinicTools.getMyClinicAccess) as
    | { mode: string; staffKind?: string; clinicName?: string }
    | undefined
  if (!access || access.mode !== 'staff' || access.staffKind !== 'clinician' || !access.clinicName) return null
  return { name: access.clinicName }
}

function useAccount() {
  const { user } = useUser()
  const { signOut, openUserProfile } = useClerk()
  const name = user?.fullName || user?.firstName || 'Your account'
  const email = user?.primaryEmailAddress?.emailAddress
  const signOutAndClear = () => {
    // Unsaved clinical notes stay on this device only for the person who wrote them
    clearUserNoteDrafts(user?.id)
    return signOut({ redirectUrl: '/' })
  }
  return { user, name, email, openUserProfile, signOut: signOutAndClear }
}

function Badge({ count }: { count?: number }) {
  if (!count) return null
  return (
    <span className="ml-auto min-w-[20px] rounded-full bg-pt-accent px-1.5 text-center text-[11px] font-bold leading-5 text-[#06210a]">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavLink({ item, active, badge, onNavigate }: { item: PhysioNavItem; active: boolean; badge?: number; onNavigate?: () => void }) {
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

function AccountMenu() {
  const { user, name, email, openUserProfile, signOut } = useAccount()
  const clinicWorkspace = useClinicWorkspace()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-pt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50"
        >
          <Avatar className="h-9 w-9 rounded-xl">
            <AvatarImage src={user?.imageUrl} alt="" />
            <AvatarFallback className="rounded-xl bg-pt-green-bg text-xs font-semibold text-pt-green-fg">{initials(name)}</AvatarFallback>
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
          <Link href={`${PHYSIO_HOME}/settings/profile`}>
            <UserRound className="mr-2 h-4 w-4" />
            Public profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-xl px-3 py-2.5 focus:bg-pt-hover" onSelect={() => openUserProfile()}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Login &amp; security
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-xl px-3 py-2.5 focus:bg-pt-hover"
          onSelect={() => window.dispatchEvent(new Event(START_PHYSIO_TOUR_EVENT))}
        >
          <PlayCircle className="mr-2 h-4 w-4" />
          Take the tour
        </DropdownMenuItem>
        {clinicWorkspace && (
          <DropdownMenuItem asChild className="rounded-xl px-3 py-2.5 focus:bg-pt-hover">
            <Link href={CLINIC_PORTAL_HOME}>
              <Building2 className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">Switch to {clinicWorkspace.name}</span>
            </Link>
          </DropdownMenuItem>
        )}
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

/** A card at the foot of the menu: the clinic workspace if they have one, else their booking page. */
function FooterCard({ onNavigate }: { onNavigate?: () => void }) {
  const clinicWorkspace = useClinicWorkspace()
  const practice = usePracticeMode()
  if (clinicWorkspace) {
    return (
      <Link
        href={CLINIC_PORTAL_HOME}
        onClick={onNavigate}
        aria-label={`Switch to the ${clinicWorkspace.name} clinic workspace`}
        className="group flex items-center gap-3 rounded-2xl bg-pt-sunken p-4 transition-colors hover:bg-pt-hover"
      >
        <Building2 className="h-4 w-4 shrink-0 text-pt-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-pt-ink">{clinicWorkspace.name}</span>
          <span className="block text-xs text-pt-muted">Switch to the clinic workspace</span>
        </span>
        <ArrowLeftRight className="h-4 w-4 shrink-0 text-pt-faint" />
      </Link>
    )
  }
  // Services, areas and the public page are for Rehabify Care patients: not for independent physios
  if (!practice.loaded || practice.isIndependent) return null
  return (
    <Link
      href={`${PHYSIO_HOME}/settings/marketplace`}
      onClick={onNavigate}
      className="group block rounded-2xl bg-pt-sun-bg p-4 transition-colors hover:brightness-[0.98]"
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold text-pt-sun-fg">
        <Store className="h-3.5 w-3.5" />
        Get booked more
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-pt-sun-fg/80">
        Services, areas and your public page
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </p>
    </Link>
  )
}

/** Desktop sidebar: a floating card with the navigation and the account. */
export function PhysioSidebar({
  className,
  limited = false,
  unreadMessages,
}: {
  className?: string
  /** Under review: only Today and Settings are open */
  limited?: boolean
  unreadMessages?: number
}) {
  const pathname = usePathname() ?? ''
  return (
    <aside data-tour="navigation" className={cn('flex w-64 flex-col rounded-3xl border border-pt-line bg-pt-surface shadow-pt dark:shadow-none', className)}>
      <Link href={PHYSIO_HOME} className="px-5 pb-4 pt-6" aria-label="Rehabify home">
        <PhysioBrand />
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-3" aria-label="Main">
        {(limited ? LIMITED_NAV : PHYSIO_NAV).map((group, i) => (
          <div key={group.label ?? i} className="space-y-0.5">
            {group.label && <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-pt-faint">{group.label}</p>}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActiveItem(pathname, item)}
                badge={item.href === NAV.messages.href ? unreadMessages : undefined}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-2 p-3">
        {!limited && <FooterCard />}
        <div className="border-t border-pt-line pt-2">
          <AccountMenu />
        </div>
      </div>
    </aside>
  )
}

/** Bottom tab bar on phones and tablets: the four places physios go most, plus "More". */
export function PhysioMobileNav({ limited = false, unreadMessages }: { limited?: boolean; unreadMessages?: number }) {
  const pathname = usePathname() ?? ''
  const [moreOpen, setMoreOpen] = useState(false)
  const { user, name, email, openUserProfile, signOut } = useAccount()
  const tabs = limited ? [NAV.today] : MOBILE_TABS
  const tabHrefs = new Set(tabs.map((tab) => tab.href))
  const moreActive = !tabs.some((tab) => isActiveItem(pathname, tab))
  const groups = limited ? [{ items: [NAV.settings] }] : PHYSIO_NAV

  return (
    <>
      <nav
        data-tour="navigation"
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-pt-line bg-pt-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className={cn('mx-auto grid h-16 max-w-xl', limited ? 'grid-cols-2' : 'grid-cols-5')}>
          {tabs.map((tab) => {
            const active = isActiveItem(pathname, tab)
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
                {tab.title}
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
              <AvatarFallback className="rounded-xl bg-pt-green-bg text-xs font-semibold text-pt-green-fg">{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-pt-ink">{name}</p>
              {email && <p className="truncate text-xs text-pt-faint">{email}</p>}
            </div>
          </div>

          {groups.map((group, i) => {
            const items = group.items.filter((item) => !tabHrefs.has(item.href))
            if (items.length === 0) return null
            return (
              <div key={group.label ?? i}>
                {group.label && <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-pt-faint">{group.label}</p>}
                <ul className="overflow-hidden rounded-2xl border border-pt-line">
                  {items.map((item) => {
                    const Icon = item.icon
                    const active = isActiveItem(pathname, item)
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

          {!limited && <FooterCard onNavigate={() => setMoreOpen(false)} />}

          <div className="rounded-2xl border border-pt-line p-1.5">
            <PatientThemeToggle withLabel />
            <SoundSwitchRow />
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false)
                openUserProfile()
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-pt-ink hover:bg-pt-hover"
            >
              <ShieldCheck className="h-4 w-4" />
              Login &amp; security
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false)
                window.dispatchEvent(new Event(START_PHYSIO_TOUR_EVENT))
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

/** Tabs across the top of sections made of several pages (Schedule, Money, Library). */
export function SectionTabs() {
  const pathname = usePathname() ?? ''
  const section = sectionTabsFor(pathname)
  if (!section) return null
  return (
    <nav aria-label={section.section.title} className="mx-auto mb-5 w-full max-w-6xl">
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex gap-1 rounded-2xl bg-pt-sunken p-1">
          {section.tabs.map((tab) => {
            const active = isActiveTab(pathname, tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition',
                  active ? 'bg-pt-surface text-pt-ink shadow-pt dark:shadow-none' : 'text-pt-muted hover:text-pt-ink'
                )}
              >
                {tab.title}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
