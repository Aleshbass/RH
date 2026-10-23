'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  X,
} from '@/components/icons'
import { IconComponent } from '@/components/icons'
import { useSidebarStore } from '@/stores/sidebarStore'

interface NavItem {
  title: string
  href: string
  icon: IconComponent
  badge?: number
  roles: string[]
}

interface SidebarProps {
  /**
   * Navigation items to show in the sidebar. If not provided, an empty sidebar renders.
   */
  items?: NavItem[]
  /** Whether the sidebar starts collapsed. */
  defaultCollapsed?: boolean
}

export function DashboardSidebar({ items = [], defaultCollapsed = false }: SidebarProps) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)

  // Get user role from database
  const userRecord = useQuery(api.users.getMyUser)
  const userRole = userRecord?.role || 'patient'

  // Filter items based on user role
  const filteredItems = items.filter(item => item.roles.includes(userRole))

  // Mobile sidebar state
  const { mobileOpen, closeMobile } = useSidebarStore()

  const NavList = ({ collapsed }: { collapsed: boolean }) => (
    <ScrollArea className="h-[calc(100vh-60px)] pb-10">
      <div className="px-3 py-2">
        <div className="space-y-1">
          {filteredItems.map((item, index) => (
            <Link
              key={index}
              href={item.href}
              onClick={() => { if (mobileOpen) closeMobile() }}
              id={`nav-item-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Button
                variant={pathname === item.href ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start text-white hover:bg-white/10',
                  pathname === item.href && 'bg-[#D4FAE8] text-[#005b57] hover:bg-[#D4FAE8] hover:text-[#005b57]'
                )}
              >
                <item.icon className={cn('h-5 w-5', collapsed ? 'mx-auto' : 'mr-2')} />
                {!collapsed && (
                  <span>{item.title}</span>
                )}
                {item.badge && !collapsed && (
                  <Badge className="ml-auto bg-[#00cd0f] text-white border-0">
                    {item.badge}
                  </Badge>
                )}
              </Button>
            </Link>
          ))}
        </div>
      </div>
    </ScrollArea>
  )

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cn('fixed inset-0 z-40 bg-black/40 md:hidden', mobileOpen ? 'block' : 'hidden')}
        onClick={closeMobile}
      />
      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[240px] border-r bg-[#005b57] shadow-lg transition-transform duration-300 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-[60px] items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <Stethoscope className="h-6 w-6 text-[#00cd0f]" /> {/* 10% - Highlighter accent */}
            <span className="font-bold text-white">Rehabify</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white hover:bg-white/10"
            onClick={closeMobile}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <NavList collapsed={false} />
      </div>

      {/* Desktop sidebar */}
      <div className={cn('relative hidden md:flex md:flex-col border-r bg-[#005b57] duration-300 ease-in-out', isCollapsed ? 'w-[80px]' : 'w-[240px]')}> {/* 30% - Core Green sidebar */}
        <div className="flex h-[60px] items-center justify-between px-4">
          <Link href="/dashboard" className={cn('flex items-center space-x-2', isCollapsed && 'hidden')}>
            <Stethoscope className="h-6 w-6 text-[#00cd0f]" /> {/* 10% - Highlighter accent */}
            <span className="font-bold text-white">Rehabify</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white hover:bg-white/10"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        <NavList collapsed={isCollapsed} />
      </div>
    </>
  )
}
