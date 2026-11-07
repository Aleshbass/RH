'use client'

/**
 * Clinic portal navigation, built like the physio and patient portals': a floating sidebar card on
 * desktop and a bottom tab bar with a "More" drawer on phones. Everyone only sees the pages their
 * clinic role includes; badges show what waits on the clinic.
 */

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { useClerk, useUser } from '@clerk/nextjs'
import { api } from '@/convex/_generated/api'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ClinicBrand, PoweredByRehabify } from '@/components/clinic/ClinicBrand'
import { useClinicAccess, type ClinicArea } from '@/components/clinic/ClinicAccessContext'
import { START_CLINIC_TOUR_EVENT } from '@/components/clinic/ClinicTour'
import { PatientDrawer, initials } from '@/components/patient/ui'
import { PatientThemeToggle, SoundSwitchRow } from '@/components/patient/shell/PatientControls'
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  CreditCard,
  FileSignature,
  Home,
  Layers,
  LogOut,
  Menu,
  MessageSquare,
  MoreVertical,
  Package,
  PlayCircle,
  ShieldCheck,
  UserCheck,
  Users,
  type IconComponent,
} from '@/components/icons'
import { PHYSIO_PORTAL_HOME, physioPortalPageFor } from '@/components/clinic/clinician-routing'

export const CLINIC_HOME = '/dashboard/clinic'

type BadgeKey = 'appointments' | 'patients' | 'messages'

type NavItem = {
  title: string
  href: string
  icon: IconComponent
  /** One line under the title in the phone menu */
  hint: string
  badge?: BadgeKey
  /** Page permission needed; Home has none */
  area?: ClinicArea
  /** Another permission that also opens this page */
  orArea?: ClinicArea
}

const NAV = {
  home: { title: 'Home', href: CLINIC_HOME, icon: Home, hint: 'Today at your clinic' },
  appointments: { title: 'Appointments', href: `${CLINIC_HOME}/appointments`, icon: Calendar, hint: 'Diary, bookings and requests', area: 'appointments', badge: 'appointments' },
  // Rehabify referrals live inside Patients (the "Referred by Rehabify" filter)
  patients: { title: 'Patients', href: `${CLINIC_HOME}/patients`, icon: Users, hint: 'Records, referrals and invites', area: 'patients', orArea: 'referrals', badge: 'patients' },
  messages: { title: 'Messages', href: `${CLINIC_HOME}/messages`, icon: MessageSquare, hint: 'Patients and your team', area: 'patients', badge: 'messages' },
  billing: { title: 'Billing', href: `${CLINIC_HOME}/billing`, icon: CreditCard, hint: 'Invoices and payments', area: 'billing' },
  plan: { title: 'Plan', href: `${CLINIC_HOME}/billing/plan`, icon: Layers, hint: 'Your Rehabify plan', area: 'billing' },
  reports: { title: 'Reports', href: `${CLINIC_HOME}/analytics`, icon: BarChart3, hint: 'How the clinic is doing', area: 'reports' },
  inventory: { title: 'Inventory', href: `${CLINIC_HOME}/inventory`, icon: Package, hint: 'Supplies and equipment', area: 'inventory' },
  team: { title: 'Team', href: `${CLINIC_HOME}/staff`, icon: UserCheck, hint: 'Clinicians, front desk and roles', area: 'team' },
  clock: { title: 'Clock-in', href: `${CLINIC_HOME}/attendance`, icon: Clock, hint: 'Who’s in and the hours they work', area: 'team' },
  settings: { title: 'Clinic settings', href: `${CLINIC_HOME}/settings`, icon: Building2, hint: 'Profile, hours and payouts', area: 'settings' },
  agreement: { title: 'Agreement', href: `${CLINIC_HOME}/agreement`, icon: FileSignature, hint: 'Your agreement with Rehabify', area: 'settings' },
} satisfies Record<string, NavItem>

const GROUPS: { label?: string; items: NavItem[] }[] = [
  { items: [NAV.home] },
  { label: 'Care', items: [NAV.appointments, NAV.patients, NAV.messages] },
  { label: 'Business', items: [NAV.billing, NAV.plan, NAV.reports, NAV.inventory] },
  { label: 'Clinic', items: [NAV.team, NAV.clock, NAV.settings, NAV.agreement] },
]

/** The phone tab bar: the places owners go most (when their role includes them), then "More". */
const TAB_ORDER: NavItem[] = [NAV.home, NAV.appointments, NAV.patients, NAV.messages, NAV.billing, NAV.team]

const ALL_HREFS = GROUPS.flatMap((group) => group.items.map((item) => item.href))
const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`)

function isActivePath(pathname: string, href: string) {
  if (href === CLINIC_HOME) return pathname === href
  if (!under(pathname, href)) return false
  // Billing → Plan has its own entry: only the closest match is highlighted
  return !ALL_HREFS.some((other) => other.length > href.length && other.startsWith(`${href}/`) && under(pathname, other))
}

const teamUnreadRef = makeFunctionReference<'query', Record<string, never>, number>('clinicTeamChat:getTeamUnreadCount')

type NavCounts = { newReferrals: number; bookingRequests?: number; needsClinician?: number; invitesPending?: number }

/** What waits on the clinic, per menu item. */
export function useClinicBadges(): Record<BadgeKey, number> {
  const { isReadOnly } = useClinicAccess()
  const counts = useQuery(api.clinicTools.getClinicNavCounts, {}) as NavCounts | undefined
  const unread = useQuery(api.chat.getUnreadCount, isReadOnly ? 'skip' : {}) as number | undefined
  const teamUnread = useQuery(teamUnreadRef, isReadOnly ? 'skip' : {})
  return {
    appointments: counts?.bookingRequests ?? 0,
    patients: (counts?.newReferrals ?? 0) + (counts?.needsClinician ?? 0),
    messages: (unread ?? 0) + (teamUnread ?? 0),
  }
}

/** Menu groups with only the pages this person's clinic role includes. */
function useNavGroups() {
  const { canUse, isClinician } = useClinicAccess()
  // Clinicians do their clinical work in the physio portal: here they only get the pages their role adds
  const allowed = (item: NavItem) =>
    (!isClinician || !physioPortalPageFor(item.href)) && (!item.area || canUse(item.area) || (item.orArea ? canUse(item.orArea) : false))
  return GROUPS.map((group) => ({ ...group, items: group.items.filter(allowed) })).filter((group) => group.items.length > 0)
}

function useAccount() {
  const { user } = useUser()
  const { signOut, openUserProfile } = useClerk()
  const name = user?.fullName || user?.firstName || 'Your account'
  const email = user?.primaryEmailAddress?.emailAddress
  return { user, name, email, openUserProfile, signOut: () => signOut({ redirectUrl: '/' }) }
}

function Badge({ count }: { count?: number }) {
  if (!count) return null
  return (
    <span className="ml-auto min-w-[20px] rounded-full bg-pt-accent px-1.5 text-center text-[11px] font-bold leading-5 text-[#06210a]" aria-label={`${count} waiting`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavLink({ item, active, badge, onNavigate }: { item: NavItem; active: boolean; badge?: number; onNavigate?: () => void }) {
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
        <DropdownMenuItem className="rounded-xl px-3 py-2.5 focus:bg-pt-hover" onSelect={() => openUserProfile()}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Login &amp; security
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-xl px-3 py-2.5 focus:bg-pt-hover"
          onSelect={() => window.dispatchEvent(new Event(START_CLINIC_TOUR_EVENT))}
        >
          <PlayCircle className="mr-2 h-4 w-4" />
          Take the tour
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-pt-line" />
        <PatientThemeToggle withLabel />
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

/** Clinicians who opened a clinic page their role adds: one tap back to their own workspace. */
function WorkspaceLink({ onNavigate }: { onNavigate?: () => void }) {
  const { isClinician } = useClinicAccess()
  if (!isClinician) return null
  return (
    <Link
      href={PHYSIO_PORTAL_HOME}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-2xl bg-pt-sunken p-4 transition-colors hover:bg-pt-hover"
    >
      <ArrowLeft className="h-4 w-4 shrink-0 text-pt-muted" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-pt-ink">My workspace</span>
        <span className="block text-xs text-pt-muted">Your patients and diary</span>
      </span>
    </Link>
  )
}

/** Desktop sidebar: a floating card with the navigation and the account. */
export default function ClinicSidebar({ className }: { className?: string }) {
  const pathname = usePathname() ?? ''
  const groups = useNavGroups()
  const badges = useClinicBadges()
  return (
    <aside data-tour="clinic-navigation" className={cn('flex w-64 flex-col rounded-3xl border border-pt-line bg-pt-surface shadow-pt dark:shadow-none', className)}>
      <Link href={CLINIC_HOME} className="px-5 pb-4 pt-6" aria-label="Home">
        <ClinicBrand />
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-3" aria-label="Main">
        {groups.map((group, i) => (
          <div key={group.label ?? i} className="space-y-0.5">
            {group.label && <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-pt-faint">{group.label}</p>}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} active={isActivePath(pathname, item.href)} badge={item.badge ? badges[item.badge] : undefined} />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-2 p-3">
        <WorkspaceLink />
        <div className="border-t border-pt-line pt-2">
          <AccountMenu />
          <PoweredByRehabify className="px-2 pb-1 pt-2" />
        </div>
      </div>
    </aside>
  )
}

/** Bottom tab bar on phones and tablets: the four places owners go most, plus "More". */
export function ClinicMobileNav() {
  const pathname = usePathname() ?? ''
  const [moreOpen, setMoreOpen] = useState(false)
  const { user, name, email, openUserProfile, signOut } = useAccount()
  const groups = useNavGroups()
  const badges = useClinicBadges()
  const allowedHrefs = new Set(groups.flatMap((group) => group.items.map((item) => item.href)))
  const tabs = TAB_ORDER.filter((item) => allowedHrefs.has(item.href)).slice(0, 4)
  const tabHrefs = new Set(tabs.map((tab) => tab.href))
  const moreActive = !tabs.some((tab) => isActivePath(pathname, tab.href))
  // Anything not on the tab bar that has something waiting shows a dot on "More"
  const moreBadge = groups.some((group) => group.items.some((item) => !tabHrefs.has(item.href) && item.badge && badges[item.badge] > 0))

  return (
    <>
      <nav
        data-tour="clinic-navigation-mobile"
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-pt-line bg-pt-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-xl" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((tab) => {
            const active = isActivePath(pathname, tab.href)
            const Icon = tab.icon
            const badge = tab.badge ? badges[tab.badge] : 0
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
                  {badge > 0 && (
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
            <span className={cn('relative flex h-7 w-12 items-center justify-center rounded-full', moreActive && 'bg-pt-accent-soft')}>
              <Menu className={cn('h-[18px] w-[18px]', moreActive && 'text-pt-accent-ink')} />
              {moreBadge && <span className="absolute right-2.5 top-0.5 h-2 w-2 rounded-full bg-pt-accent" aria-label="Something is waiting" />}
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

          <WorkspaceLink onNavigate={() => setMoreOpen(false)} />

          {groups.map((group, i) => {
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
                          <Badge count={item.badge ? badges[item.badge] : undefined} />
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-pt-faint" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}

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
                window.dispatchEvent(new Event(START_CLINIC_TOUR_EVENT))
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

          <PoweredByRehabify className="text-center" />
        </div>
      </PatientDrawer>
    </>
  )
}
