'use client'

import { DashboardSidebar } from '@/components/dashboard/shared/DashboardSidebar'
import { LayoutDashboard, Calendar, Settings, Search, Stethoscope } from '@/components/icons'

// Navigation configuration for patients
const navItems = [
  { title: 'Dashboard', href: '/dashboard/patient', icon: LayoutDashboard, roles: ['patient'] },
  { title: 'Find a Physio', href: '/find-a-physio', icon: Search, roles: ['patient'] },
  { title: 'Appointments', href: '/dashboard/patient/appointments', icon: Calendar, roles: ['patient'] },
  { title: 'My Physiotherapist', href: '/dashboard/patient/my-physiotherapist', icon: Stethoscope, roles: ['patient'] },
  { title: 'Settings', href: '/dashboard/patient/settings', icon: Settings, roles: ['patient'] },
]

interface PatientSidebarProps {
  defaultCollapsed?: boolean
}

export default function PatientSidebar({ defaultCollapsed = false }: PatientSidebarProps) {
  return <DashboardSidebar items={navItems} defaultCollapsed={defaultCollapsed} />
}
