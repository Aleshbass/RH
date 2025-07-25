'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Calendar,
  Receipt,
  BarChart3,
  Settings,
  User,
  Building2,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  FileText,
  TrendingUp,
  CreditCard,
  Clock,
  UserPlus
} from 'lucide-react'

interface SidebarProps {
  className?: string
}

const sidebarItems = [
  {
    title: 'Dashboard',
    href: '/dashboard/clinic',
    icon: LayoutDashboard,
    description: 'Overview of clinic operations'
  },
  {
    title: 'Staff Management',
    href: '/dashboard/clinic/staff',
    icon: UserCheck,
    description: 'Manage physiotherapists and staff'
  },
  {
    title: 'Patients',
    href: '/dashboard/clinic/patients',
    icon: Users,
    description: 'View and manage all clinic patients'
  },
  {
    title: 'Appointments',
    href: '/dashboard/clinic/appointments',
    icon: Calendar,
    description: 'Schedule and manage appointments'
  },
  {
    title: 'Billing & Invoicing',
    href: '/dashboard/clinic/billing',
    icon: Receipt,
    description: 'Financial management and invoicing'
  },
  {
    title: 'Reports & Analytics',
    href: '/dashboard/clinic/reports',
    icon: BarChart3,
    description: 'Clinic performance metrics'
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
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-2">
          {sidebarItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon

            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start h-10 px-3",
                    isActive && "bg-primary/10 text-primary border-primary/20",
                    isCollapsed && "px-2"
                  )}
                  title={isCollapsed ? item.title : undefined}
                >
                  <Icon className={cn("h-4 w-4", !isCollapsed && "mr-3")} />
                  {!isCollapsed && (
                    <span className="truncate">{item.title}</span>
                  )}
                </Button>
              </Link>
            )
          })}
        </nav>

        <Separator className="my-4" />

        {/* Quick Actions */}
        {!isCollapsed && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-500 px-3">Quick Actions</h4>
            <div className="space-y-1">
              <Link href="/dashboard/clinic/staff/invite">
                <Button variant="ghost" size="sm" className="w-full justify-start h-8 px-3">
                  <UserPlus className="h-3 w-3 mr-2" />
                  Invite Staff
                </Button>
              </Link>
              <Link href="/dashboard/clinic/appointments/new">
                <Button variant="ghost" size="sm" className="w-full justify-start h-8 px-3">
                  <Clock className="h-3 w-3 mr-2" />
                  New Appointment
                </Button>
              </Link>
              <Link href="/dashboard/clinic/billing/new">
                <Button variant="ghost" size="sm" className="w-full justify-start h-8 px-3">
                  <CreditCard className="h-3 w-3 mr-2" />
                  Create Invoice
                </Button>
              </Link>
            </div>
          </div>
        )}
      </ScrollArea>

      {/* Bottom Navigation */}
      <div className="border-t border-gray-200 p-3">
        <nav className="space-y-1">
          {bottomItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon

            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start h-9 px-3",
                    isActive && "bg-primary/10 text-primary",
                    isCollapsed && "px-2"
                  )}
                  title={isCollapsed ? item.title : undefined}
                >
                  <Icon className={cn("h-4 w-4", !isCollapsed && "mr-3")} />
                  {!isCollapsed && (
                    <span className="truncate">{item.title}</span>
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
