'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ClinicThemeToggle } from '@/components/clinic/ClinicTheme'
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
  Inbox,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'

interface SidebarProps {
  className?: string
  onNavigate?: () => void
  collapsible?: boolean
}

type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  badgeKey?: 'newReferrals'
}

const mainItems: NavItem[] = [
  { title: 'Home', href: '/dashboard/clinic', icon: LayoutDashboard },
  { title: 'Appointments', href: '/dashboard/clinic/appointments', icon: Calendar },
  { title: 'Patients', href: '/dashboard/clinic/patients', icon: Users },
  { title: 'Referrals', href: '/dashboard/clinic/referrals', icon: Inbox, badgeKey: 'newReferrals' },
  { title: 'Billing', href: '/dashboard/clinic/billing', icon: CreditCard },
  { title: 'Team', href: '/dashboard/clinic/staff', icon: UserCheck },
  { title: 'Reports', href: '/dashboard/clinic/analytics', icon: BarChart3 },
]

const bottomItems: NavItem[] = [
  { title: 'Clinic settings', href: '/dashboard/clinic/settings', icon: Building2 },
  { title: 'Account', href: '/dashboard/settings', icon: Settings },
]

function isActivePath(pathname: string, href: string) {
  if (href === '/dashboard/clinic') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function ClinicSidebar({ className, onNavigate, collapsible = true }: SidebarProps) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const counts = useQuery(api.clinicTools.getClinicNavCounts, {})
  const collapsed = collapsible && isCollapsed

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
          <Link href="/dashboard/clinic" onClick={onNavigate} className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#005b57] text-white">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <span className="truncate text-sm font-semibold text-neutral-900 dark:text-white">Rehabify Clinic</span>
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
        <nav className="space-y-0.5 px-2">{mainItems.map(renderItem)}</nav>
      </ScrollArea>

      <div className="border-t border-neutral-200 p-2 dark:border-neutral-800">
        <nav className="space-y-0.5">{bottomItems.map(renderItem)}</nav>
        <ClinicThemeToggle withLabel={!collapsed} className={cn('mt-0.5', collapsed && 'mx-auto')} />
      </div>
    </aside>
  )
}
