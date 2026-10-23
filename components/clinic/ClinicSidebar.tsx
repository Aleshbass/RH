'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
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
import { useClerk, useUser } from '@clerk/nextjs'
import { ClinicThemeToggle } from '@/components/clinic/ClinicTheme'
import { ClinicBrand, PoweredByRehabify } from '@/components/clinic/ClinicBrand'
import { useClinicAccess, type ClinicArea } from '@/components/clinic/ClinicPreviewContext'
import {
  Users,
  Calendar,
  Settings,
  ChevronRight,
  ChevronLeft,
  LayoutDashboard,
  UserCheck,
  CreditCard,
  Building2,
  BarChart3,
  MessageSquare,
  LogIn,
  LogOut,
  type IconComponent,
} from '@/components/icons'

interface SidebarProps {
  className?: string
  onNavigate?: () => void
  collapsible?: boolean
}

type NavItem = {
  title: string
  href: string
  icon: IconComponent
  badgeKey?: 'newReferrals' | 'unreadMessages'
  /** Page permission needed; Home has none */
  area?: ClinicArea
  /** Another permission that also opens this page */
  orArea?: ClinicArea
}

// Rehabify referrals live inside Patients (the "Referred by Rehabify" filter), so their
// new-referral badge sits on Patients and there is no separate Referrals entry
const mainItems: NavItem[] = [
  { title: 'Home', href: '/dashboard/clinic', icon: LayoutDashboard },
  { title: 'Appointments', href: '/dashboard/clinic/appointments', icon: Calendar, area: 'appointments' },
  { title: 'Patients', href: '/dashboard/clinic/patients', icon: Users, area: 'patients', orArea: 'referrals', badgeKey: 'newReferrals' },
  { title: 'Messages', href: '/dashboard/clinic/messages', icon: MessageSquare, area: 'patients', badgeKey: 'unreadMessages' },
  { title: 'Billing', href: '/dashboard/clinic/billing', icon: CreditCard, area: 'billing' },
  { title: 'Team', href: '/dashboard/clinic/staff', icon: UserCheck, area: 'team' },
  { title: 'Reports', href: '/dashboard/clinic/analytics', icon: BarChart3, area: 'reports' },
]

const bottomItems: NavItem[] = [
  { title: 'Clinic settings', href: '/dashboard/clinic/settings', icon: Building2, area: 'settings' },
]

function isActivePath(pathname: string, href: string) {
  if (href === '/dashboard/clinic') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Who is signed in, with account settings (Clerk) and sign out.
 */
function AccountMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { isLoaded, isSignedIn, user } = useUser()
  const { openUserProfile, signOut } = useClerk()

  if (!isLoaded) return null

  if (!isSignedIn) {
    return (
      <Link
        href="/sign-in?redirect_url=/dashboard/clinic"
        onClick={onNavigate}
        title={collapsed ? 'Sign in' : undefined}
        className={cn(
          'mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-white',
          collapsed && 'justify-center px-0'
        )}
      >
        <LogIn className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" />
        {!collapsed && <span>Sign in</span>}
      </Link>
    )
  }

  const name = user.fullName || user.primaryEmailAddress?.emailAddress || 'Account'
  const email = user.primaryEmailAddress?.emailAddress

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={collapsed ? name : undefined}
          className={cn(
            'mt-1 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-neutral-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005b57]/40 dark:hover:bg-neutral-800/60',
            collapsed && 'justify-center px-0'
          )}
        >
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={user.imageUrl} alt="" />
            <AvatarFallback className="bg-neutral-100 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-neutral-900 dark:text-white">{name}</span>
              {email && email !== name && (
                <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{email}</span>
              )}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuItem
          onClick={() => {
            onNavigate?.()
            openUserProfile()
          }}
        >
          <Settings className="mr-2 h-4 w-4 text-neutral-500" />
          Account settings
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

export default function ClinicSidebar({ className, onNavigate, collapsible = true }: SidebarProps) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const navCounts = useQuery(api.clinicTools.getClinicNavCounts, {})
  const { isPreviewMode } = useClinicAccess()
  const unreadMessages = useQuery(api.chat.getUnreadCount, isPreviewMode ? 'skip' : {}) as number | undefined
  const counts = navCounts ? { ...navCounts, unreadMessages: unreadMessages ?? 0 } : undefined
  const collapsed = collapsible && isCollapsed
  const { canUse } = useClinicAccess()
  // Team members only see the pages their role includes
  const allowed = (item: NavItem) => !item.area || canUse(item.area) || (item.orArea ? canUse(item.orArea) : false)

  const renderItem = (item: NavItem) => {
    const active = isActivePath(pathname, item.href)
    const Icon = item.icon
    const badge = item.badgeKey ? counts?.[item.badgeKey] ?? 0 : 0

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        title={collapsed ? item.title : undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          active
            ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-white'
            : 'text-neutral-600 hover:bg-neutral-100/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-white',
          collapsed && 'justify-center px-0'
        )}
      >
        <Icon
          className={cn(
            'h-4 w-4 shrink-0',
            active ? 'text-[#005b57] dark:text-[#2dd4bf]' : 'text-neutral-400 dark:text-neutral-500'
          )}
        />
        {!collapsed && <span className="flex-1 truncate">{item.title}</span>}
        {badge > 0 && (
          <span
            className={cn(
              'min-w-5 rounded-full bg-[#005b57] px-1.5 text-center text-[11px] font-medium leading-5 text-white dark:bg-[#2dd4bf] dark:text-neutral-950',
              collapsed && 'absolute right-1 top-0.5 min-w-4 px-1 text-[10px] leading-4'
            )}
            aria-label={`${badge} new`}
          >
            {badge}
          </span>
        )}
      </Link>
    )
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-neutral-200 bg-white transition-[width] duration-200 dark:border-neutral-800 dark:bg-neutral-950',
        collapsed ? 'w-16' : 'w-60',
        className
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
        {!collapsed && (
          <Link href="/dashboard/clinic" onClick={onNavigate} className="min-w-0">
            <ClinicBrand />
          </Link>
        )}
        {collapsible && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-7 w-7 p-0 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 py-3">
        <nav className="space-y-0.5 px-2">{mainItems.filter(allowed).map(renderItem)}</nav>
      </ScrollArea>

      <div className="border-t border-neutral-200 p-2 dark:border-neutral-800">
        <nav className="space-y-0.5">{bottomItems.filter(allowed).map(renderItem)}</nav>
        <ClinicThemeToggle withLabel={!collapsed} className={cn('mt-0.5', collapsed && 'mx-auto')} />
        <AccountMenu collapsed={collapsed} onNavigate={onNavigate} />
        {!collapsed && <PoweredByRehabify className="px-3 pb-1 pt-2" />}
      </div>
    </aside>
  )
}
