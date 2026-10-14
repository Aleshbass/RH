'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useClerk, useUser } from '@clerk/nextjs'
import {
  BarChart3,
  BookOpen,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Dumbbell,
  Home,
  LogOut,
  MessageSquare,
  PlayCircle,
  Settings,
  Store,
  UserRound,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ClinicThemeToggle } from '@/components/clinic/ClinicTheme'
import { START_PHYSIO_TOUR_EVENT } from '@/components/physio/PhysioTour'

export const PHYSIO_HOME = '/dashboard/physiotherapist'

type NavItem = { title: string; href: string; icon: LucideIcon }
type NavGroup = { label?: string; items: NavItem[] }

/** Daily work first, clinical tools second, money last. */
export const PHYSIO_NAV: NavGroup[] = [
  {
    items: [
      { title: 'Home', href: PHYSIO_HOME, icon: Home },
      { title: 'Calendar', href: `${PHYSIO_HOME}/calendar`, icon: CalendarDays },
      { title: 'Appointments', href: `${PHYSIO_HOME}/appointments`, icon: Calendar },
      { title: 'Patients', href: `${PHYSIO_HOME}/patients`, icon: Users },
      { title: 'Messages', href: `${PHYSIO_HOME}/messages`, icon: MessageSquare },
      { title: 'Video sessions', href: `${PHYSIO_HOME}/video-calls`, icon: Video },
    ],
  },
  {
    label: 'Clinical',
    items: [
      { title: 'Exercise library', href: `${PHYSIO_HOME}/exercise-library`, icon: Dumbbell },
      { title: 'Treatment templates', href: `${PHYSIO_HOME}/treatment-templates`, icon: BookOpen },
    ],
  },
  {
    label: 'Practice',
    items: [
      { title: 'Billing', href: `${PHYSIO_HOME}/billing`, icon: CreditCard },
      { title: 'Insights', href: `${PHYSIO_HOME}/insights`, icon: BarChart3 },
      { title: 'Marketplace profile', href: `${PHYSIO_HOME}/marketplace`, icon: Store },
    ],
  },
]

function isActivePath(pathname: string, href: string) {
  if (href === PHYSIO_HOME) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Rehabify wordmark. Follows the theme, or always white on the teal sidebar. */
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
      <img src="/logos/MainRehabify.svg" alt="Rehabify" className="h-6 w-auto dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logos/White%20MainRehabify.svg" alt="Rehabify" className="hidden h-6 w-auto dark:block" />
    </span>
  )
}

function AccountMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { isLoaded, user } = useUser()
  const { openUserProfile, signOut } = useClerk()
  if (!isLoaded || !user) return null

  const name = user.fullName || user.primaryEmailAddress?.emailAddress || 'Account'
  const email = user.primaryEmailAddress?.emailAddress

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={collapsed ? name : undefined}
          className={cn(
            'mt-1 flex w-full items-center gap-3 rounded-2xl bg-white/[0.07] px-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            collapsed && 'justify-center px-0'
          )}
        >
          <Avatar className="h-8 w-8 shrink-0 ring-2 ring-white/20">
            <AvatarImage src={user.imageUrl} alt="" />
            <AvatarFallback className="bg-rh-mint text-xs font-semibold text-rh-teal">
              {name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{name}</span>
              {email && email !== name && <span className="block truncate text-xs text-white/60">{email}</span>}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuItem asChild>
          <Link href={`${PHYSIO_HOME}/settings/profile`} onClick={onNavigate}>
            <UserRound className="mr-2 h-4 w-4 text-neutral-500" />
            Public profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onNavigate?.()
            openUserProfile()
          }}
        >
          <Settings className="mr-2 h-4 w-4 text-neutral-500" />
          Login &amp; security
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onNavigate?.()
            window.dispatchEvent(new Event(START_PHYSIO_TOUR_EVENT))
          }}
        >
          <PlayCircle className="mr-2 h-4 w-4 text-neutral-500" />
          Take the tour
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ redirectUrl: '/' })}>
          <LogOut className="mr-2 h-4 w-4 text-neutral-500" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PhysioSidebar({
  className,
  onNavigate,
  collapsible = true,
  limited = false,
}: {
  className?: string
  onNavigate?: () => void
  collapsible?: boolean
  /** Under review: only Home and Settings are open */
  limited?: boolean
}) {
  const pathname = usePathname() ?? ''
  const [isCollapsed, setIsCollapsed] = useState(false)
  const collapsed = collapsible && isCollapsed

  const renderItem = (item: NavItem) => {
    const active = isActivePath(pathname, item.href)
    const Icon = item.icon
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        title={collapsed ? item.title : undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all active:scale-[0.98]',
          active
            ? 'bg-white font-semibold text-rh-teal shadow-sm dark:bg-white dark:text-rh-night'
            : 'text-white/75 hover:bg-white/10 hover:text-white',
          collapsed && 'justify-center px-0'
        )}
      >
        <Icon
          className={cn(
            'h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-105',
            active ? 'text-rh-teal dark:text-rh-night' : 'text-white/70'
          )}
        />
        {!collapsed && <span className="flex-1 truncate">{item.title}</span>}
      </Link>
    )
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-rh-teal text-white transition-[width] duration-200 dark:bg-rh-night',
        collapsed ? 'w-[72px]' : 'w-64',
        className
      )}
    >
      <div className={cn('flex h-16 items-center justify-between px-5', collapsed && 'justify-center px-0')}>
        {!collapsed && (
          <Link href={PHYSIO_HOME} onClick={onNavigate} aria-label="Rehabify home">
            <PhysioBrand onBrand />
          </Link>
        )}
        {collapsible && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8 rounded-lg p-0 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 py-2">
        <nav data-tour="navigation" aria-label="Main" className="space-y-5 px-3">
          {(limited ? [{ items: [PHYSIO_NAV[0].items[0]] }] : PHYSIO_NAV).map((group: NavGroup, i) => (
            <div key={group.label ?? i} className="space-y-0.5">
              {group.label && !collapsed && (
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">
                  {group.label}
                </p>
              )}
              {group.items.map(renderItem)}
            </div>
          ))}
        </nav>
      </ScrollArea>

      <div className="space-y-0.5 p-3">
        {renderItem({ title: 'Settings', href: `${PHYSIO_HOME}/settings`, icon: Settings })}
        <ClinicThemeToggle
          withLabel={!collapsed}
          className={cn('rounded-xl text-white/75 hover:bg-white/10 hover:text-white dark:text-white/75 dark:hover:bg-white/10', collapsed && 'mx-auto')}
        />
        <AccountMenu collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </aside>
  )
}
