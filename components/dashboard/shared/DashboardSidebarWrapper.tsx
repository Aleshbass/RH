'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { DashboardSidebar } from './DashboardSidebar'
import { LayoutDashboard, Calendar, Clock, Users, FileText, Video, MessageSquare, CreditCard, Settings } from 'lucide-react'

// Navigation configuration for physiotherapists
const physiotherapistNavItems = [
  { title: 'Dashboard', href: '/dashboard/physiotherapist', icon: LayoutDashboard, roles: ['physiotherapist'] },
  { title: 'Appointments', href: '/dashboard/physiotherapist/appointments', icon: Calendar, roles: ['physiotherapist'] },
  { title: 'Calendar', href: '/dashboard/physiotherapist/calendar', icon: Clock, roles: ['physiotherapist'] },
  { title: 'Patients', href: '/dashboard/physiotherapist/patients', icon: Users, roles: ['physiotherapist'] },
  { title: 'Reports', href: '/dashboard/physiotherapist/reports', icon: FileText, roles: ['physiotherapist'] },
  { title: 'Templates', href: '/dashboard/physiotherapist/templates', icon: FileText, roles: ['physiotherapist'] },
  { title: 'Messages', href: '/dashboard/physiotherapist/messages', icon: MessageSquare, roles: ['physiotherapist'] },
  { title: 'Billing', href: '/dashboard/physiotherapist/billing', icon: CreditCard, roles: ['physiotherapist'] },
  { title: 'Video Calls', href: '/dashboard/physiotherapist/video-calls', icon: Video, roles: ['physiotherapist'] },
  { title: 'Settings', href: '/dashboard/physiotherapist/settings', icon: Settings, roles: ['physiotherapist'] },
]

// Navigation configuration for patients
const patientNavItems = [
  { title: 'Dashboard', href: '/dashboard/patient', icon: LayoutDashboard, roles: ['patient'] },
  { title: 'Appointments', href: '/dashboard/patient/appointments', icon: Calendar, roles: ['patient'] },
  { title: 'Video Calls', href: '/dashboard/patient/video-calls', icon: Video, roles: ['patient'] },
  { title: 'Messages', href: '/dashboard/patient/messages', icon: MessageSquare, roles: ['patient'] },
  { title: 'Invoices', href: '/dashboard/patient/invoices', icon: CreditCard, roles: ['patient'] },
  { title: 'Health Records', href: '/dashboard/patient/records', icon: FileText, roles: ['patient'] },
  { title: 'Settings', href: '/dashboard/patient/settings', icon: Settings, roles: ['patient'] },
]

// Navigation configuration for clinic owners
const clinicOwnerNavItems = [
  { title: 'Dashboard', href: '/dashboard/clinic', icon: LayoutDashboard, roles: ['clinic_owner'] },
  { title: 'Staff', href: '/dashboard/clinic/staff', icon: Users, roles: ['clinic_owner'] },
  { title: 'Patients', href: '/dashboard/clinic/patients', icon: Users, roles: ['clinic_owner'] },
  { title: 'Appointments', href: '/dashboard/clinic/appointments', icon: Calendar, roles: ['clinic_owner'] },
  { title: 'Video Calls', href: '/dashboard/clinic/video-calls', icon: Video, roles: ['clinic_owner'] },
  { title: 'Billing', href: '/dashboard/clinic/billing', icon: CreditCard, roles: ['clinic_owner'] },
  { title: 'Reports', href: '/dashboard/clinic/reports', icon: FileText, roles: ['clinic_owner'] },
  { title: 'Settings', href: '/dashboard/clinic/settings', icon: Settings, roles: ['clinic_owner'] },
]



interface DashboardSidebarWrapperProps {
  defaultCollapsed?: boolean
}

export function DashboardSidebarWrapper({ defaultCollapsed = false }: DashboardSidebarWrapperProps) {
  // Get current user to determine which sidebar to show
  const currentUser = useQuery(api.users.getMyUser)

  // Return empty sidebar while loading
  if (currentUser === undefined) {
    return <DashboardSidebar items={[]} defaultCollapsed={defaultCollapsed} />
  }

  // Return empty sidebar if no user found
  if (!currentUser) {
    return <DashboardSidebar items={[]} defaultCollapsed={defaultCollapsed} />
  }

  // Select navigation items based on user role
  let navItems: typeof physiotherapistNavItems = []
  switch (currentUser.role) {
    case 'physiotherapist':
      navItems = physiotherapistNavItems
      break
    case 'patient':
      navItems = patientNavItems
      break
    case 'clinic_owner':
      navItems = clinicOwnerNavItems
      break
    case 'admin':
      // Admin uses its own sidebar layout (AdminLayout), so return empty here
      navItems = []
      break
    default:
      navItems = []
  }

  return <DashboardSidebar items={navItems} defaultCollapsed={defaultCollapsed} />
} 