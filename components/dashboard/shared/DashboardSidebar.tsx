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
} from 'lucide-react'
import { LucideIcon } from 'lucide-react'

interface NavItem {
  title: string
  href: string
  icon: LucideIcon
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

  return (
    <div className={cn('relative border-r bg-background duration-300 ease-in-out', isCollapsed ? 'w-[80px]' : 'w-[240px]')}>
      <div className="flex h-[60px] items-center justify-between px-4">
        <Link href="/dashboard" className={cn('flex items-center space-x-2', isCollapsed && 'hidden')}>
          <Stethoscope className="h-6 w-6 text-primary" />
          <span className="font-bold">Rehabify</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <ScrollArea className="h-[calc(100vh-60px)] pb-10">
        <div className="px-3 py-2">
          <div className="space-y-1">
            {filteredItems.map((item, index) => (
              <Link key={index} href={item.href}>
                <Button
                  variant={pathname === item.href ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start',
                    pathname === item.href && 'bg-secondary/50'
                  )}
                >
                  <item.icon className={cn('h-5 w-5', isCollapsed ? 'mx-auto' : 'mr-2')} />
                  {!isCollapsed && (
                    <span>{item.title}</span>
                  )}
                  {item.badge && !isCollapsed && (
                    <Badge variant="secondary" className="ml-auto">
                      {item.badge}
                    </Badge>
                  )}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
} 