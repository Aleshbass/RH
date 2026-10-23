'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { DashboardSidebar } from './DashboardSidebar'
import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  MessageSquare,
  CreditCard,
  Settings,
  Activity,
  TrendingUp,
  Shield,
  UserCheck,
  Video,
  Search,
  Stethoscope,
  Receipt,
  UserPlus,
  Dumbbell
} from '@/components/icons'

// Navigation configuration for physiotherapists
const physiotherapistNavItems = [
  { title: 'Dashboard', href: '/dashboard/physiotherapist', icon: LayoutDashboard, roles: ['physiotherapist'] },
  { title: 'Appointments', href: '/dashboard/physiotherapist/appointments', icon: Calendar, roles: ['physiotherapist'] },
  { title: 'Patients', href: '/dashboard/physiotherapist/patients', icon: Users, roles: ['physiotherapist'] },
  { title: 'Messages', href: '/dashboard/physiotherapist/messages', icon: MessageSquare, roles: ['physiotherapist'] },
  { title: 'Billing', href: '/dashboard/physiotherapist/billing', icon: Receipt, roles: ['physiotherapist'] },
  { title: 'Insights', href: '/dashboard/physiotherapist/insights', icon: TrendingUp, roles: ['physiotherapist'] },
  { title: 'Settings', href: '/dashboard/physiotherapist/settings', icon: Settings, roles: ['physiotherapist'] },
]

// Navigation configuration for patients
const patientNavItems = [
  { title: 'Dashboard', href: '/dashboard/patient', icon: LayoutDashboard, roles: ['patient'] },
  { title: 'Find a Physio', href: '/find-a-physio', icon: Search, roles: ['patient'] },
  { title: 'Appointments', href: '/dashboard/patient/appointments', icon: Calendar, roles: ['patient'] },
  { title: 'My Physiotherapist', href: '/dashboard/patient/my-physiotherapist', icon: Stethoscope, roles: ['patient'] },
  { title: 'Messages', href: '/dashboard/patient/messages', icon: MessageSquare, roles: ['patient'] },
  { title: 'My Exercises', href: '/dashboard/patient/exercises', icon: Dumbbell, roles: ['patient'] },
  { title: 'Insights', href: '/dashboard/patient/insights', icon: TrendingUp, roles: ['patient'] },
  { title: 'Invoices', href: '/dashboard/patient/invoices', icon: Receipt, roles: ['patient'] },
  { title: 'Settings', href: '/dashboard/patient/settings', icon: Settings, roles: ['patient'] },
]

// Navigation configuration for clinic owners
// Focus: Business management, staff oversight, analytics, and compliance
const clinicOwnerNavItems = [
  {
    title: 'Dashboard',
    href: '/dashboard/clinic',
    icon: LayoutDashboard,
    roles: ['clinic_owner']
  },
  {
    title: 'Staff Management',
    href: '/dashboard/clinic/staff',
    icon: Users,
    roles: ['clinic_owner']
  },
  {
    title: 'Patients',
    href: '/dashboard/clinic/patients',
    icon: UserCheck,
    roles: ['clinic_owner']
  },
  {
    title: 'Analytics',
    href: '/dashboard/clinic/analytics',
    icon: TrendingUp,
    roles: ['clinic_owner']
  },
  {
    title: 'Settings',
    href: '/dashboard/clinic/settings',
    icon: Settings,
    roles: ['clinic_owner']
  },
]

// Referring doctors work in the Partner Portal (referrals, referral link, commissions, payouts)
const doctorNavItems = [
  {
    title: 'Referral portal',
    href: '/partners/portal',
    icon: UserPlus,
    roles: ['doctor']
  },
]

interface DashboardSidebarWrapperProps {
  defaultCollapsed?: boolean
}

export function DashboardSidebarWrapper({ defaultCollapsed = false }: DashboardSidebarWrapperProps) {
  // Get current user to determine which sidebar to show
  const currentUser = useQuery(api.users.getMyUser)
  // Unread messages for the patient's Messages link (chat.getUnreadCount needs a signed-in user)
  const unreadMessages = useQuery(api.chat.getUnreadCount, currentUser?.role === 'patient' ? {} : 'skip') as number | undefined

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
      navItems = patientNavItems.map((item) =>
        item.href === '/dashboard/patient/messages' && unreadMessages ? { ...item, badge: unreadMessages } : item
      )
      break
    case 'clinic_owner':
      navItems = clinicOwnerNavItems
      break
    case 'doctor':
      navItems = doctorNavItems
      break
    case 'admin':
      // Admin uses its own sidebar layout (AdminLayout), so return null to avoid double sidebar spacing
      return null
    default:
      navItems = []
  }

  return <DashboardSidebar items={navItems} defaultCollapsed={defaultCollapsed} />
} 