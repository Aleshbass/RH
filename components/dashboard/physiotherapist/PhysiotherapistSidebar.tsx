'use client'

import { DashboardSidebar } from '@/components/dashboard/shared/DashboardSidebar'
import { LayoutDashboard, Calendar, Users, FileText, Video, MessageSquare, CreditCard, Settings, Dumbbell, Activity } from 'lucide-react'

// Navigation configuration for physiotherapists
const navItems = [
  { title: 'Dashboard', href: '/dashboard/physiotherapist', icon: LayoutDashboard, roles: ['physiotherapist'] },
  { title: 'Appointments', href: '/dashboard/physiotherapist/appointments', icon: Calendar, roles: ['physiotherapist'] },
  { title: 'Patients', href: '/dashboard/physiotherapist/patients', icon: Users, roles: ['physiotherapist'] },
  { title: 'Settings', href: '/dashboard/physiotherapist/settings', icon: Settings, roles: ['physiotherapist'] },
]

interface PhysiotherapistSidebarProps {
  defaultCollapsed?: boolean
}

export default function PhysiotherapistSidebar({ defaultCollapsed = false }: PhysiotherapistSidebarProps) {
  return <DashboardSidebar items={navItems} defaultCollapsed={defaultCollapsed} />
} 