'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Users,
  Calendar,
  Settings,
  ChevronRight,
  BarChart3,
  LayoutDashboard,
  UserCheck,
  Receipt,
  User,
  Building2,
  ChevronLeft
} from 'lucide-react'

interface SidebarProps {
  className?: string
}

// Simplified sidebar - Clinic owners focus on staff management
// Patients, appointments, billing, etc. are managed by individual physiotherapists
const sidebarGroups = [
  {
    label: 'Main',
    items: [
      {
        title: 'Dashboard',
        href: '/dashboard/clinic',
        icon: LayoutDashboard,
        description: 'Overview'
      }
    ]
  },
  {
    label: 'Management',
    items: [
      {
        title: 'Staff',
        href: '/dashboard/clinic/staff',
        icon: UserCheck,
        description: 'Manage physiotherapists'
      },
      {
        title: 'Patients',
        href: '/dashboard/clinic/patients',
        icon: Users,
        description: 'View all patients'
      },
      {
        title: 'Appointments',
        href: '/dashboard/clinic/appointments',
        icon: Calendar,
        description: 'Clinic schedule'
      }
    ]
  },
  {
    label: 'Insights',
    items: [
      {
        title: 'Reports',
        href: '/dashboard/clinic/reports',
        icon: BarChart3,
        description: 'Analytics'
      }
    ]
  }
]

const bottomItems = [
  {
    title: 'Settings',
    href: '/dashboard/clinic/settings',
    icon: Settings,
    description: 'Clinic configuration'
  },
  {
    title: 'Profile',
    href: '/dashboard/profile',
    icon: User,
    description: 'Personal account management'
  }
]

export default function ClinicSidebar({ className }: SidebarProps) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className={cn(
      "flex flex-col h-full bg-white border-r border-gray-200 transition-all duration-300",
      isCollapsed ? "w-16" : "w-64",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!isCollapsed && (
          <div className="flex items-center space-x-2">
            <Building2 className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">Clinic Portal</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-8 w-8 p-0"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        <nav className="px-2 space-y-6">
          {sidebarGroups.map((group, groupIndex) => (
            <div key={group.label} className="space-y-1">
              {!isCollapsed && (
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">
                  {group.label}
                </h4>
              )}
              {group.items.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon

                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start h-auto py-2 px-2",
                        isActive && "bg-primary/10 text-primary hover:bg-primary/15",
                        "hover:bg-gray-100 transition-colors",
                        isCollapsed && "px-0 justify-center"
                      )}
                      title={isCollapsed ? item.title : undefined}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", !isCollapsed && "mr-2")} />
                      {!isCollapsed && (
                        <span className="text-sm">{item.title}</span>
                      )}
                    </Button>
                  </Link>
                )
              })}
              {groupIndex < sidebarGroups.length - 1 && !isCollapsed && (
                <Separator className="my-2" />
              )}
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Bottom Navigation */}
      <div className="border-t border-gray-200 p-2">
        <nav className="space-y-1">
          {bottomItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon

            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start h-auto py-2 px-2",
                    isActive && "bg-primary/10 text-primary",
                    "hover:bg-gray-100 transition-colors",
                    isCollapsed && "px-0 justify-center"
                  )}
                  title={isCollapsed ? item.title : undefined}
                >
                  <Icon className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
                  {!isCollapsed && (
                    <span className="text-sm">{item.title}</span>
                  )}
                </Button>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
