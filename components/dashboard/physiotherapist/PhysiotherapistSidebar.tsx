'use client'

import { DashboardSidebar } from '@/components/dashboard/shared/DashboardSidebar'
import { LayoutDashboard, Calendar, Users, CreditCard, WalletCards, Settings } from 'lucide-react'

// Navigation configuration for physiotherapists
const navItems = [
  { title: 'Dashboard', href: '/dashboard/physiotherapist', icon: LayoutDashboard, roles: ['physiotherapist'] },
  { title: 'Appointments', href: '/dashboard/physiotherapist/appointments', icon: Calendar, roles: ['physiotherapist'] },
  { title: 'Patients', href: '/dashboard/physiotherapist/patients', icon: Users, roles: ['physiotherapist'] },
  { title: 'Billing', href: '/dashboard/physiotherapist/billing', icon: CreditCard, roles: ['physiotherapist'] },
  { title: 'MediLoan', href: '/dashboard/physiotherapist/mediloan', icon: WalletCards, roles: ['physiotherapist'] },
  { title: 'Settings', href: '/dashboard/physiotherapist/settings', icon: Settings, roles: ['physiotherapist'] },
]

interface PhysiotherapistSidebarProps {
  defaultCollapsed?: boolean
}

export default function PhysiotherapistSidebar({ defaultCollapsed = false }: PhysiotherapistSidebarProps) {
  return <DashboardSidebar items={navItems} defaultCollapsed={defaultCollapsed} />
} 