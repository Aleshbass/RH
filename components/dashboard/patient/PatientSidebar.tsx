'use client'

import { DashboardSidebar } from '@/components/dashboard/shared/DashboardSidebar'
import { LayoutDashboard, Calendar, Video, MessageSquare, CreditCard, Settings, Activity } from 'lucide-react'

// Navigation configuration for patients
const navItems = [
  { title: 'Dashboard', href: '/dashboard/patient', icon: LayoutDashboard, roles: ['patient'] },
  { title: 'Appointments', href: '/dashboard/patient/appointments', icon: Calendar, roles: ['patient'] },
  { title: 'Treatment Plans', href: '/dashboard/patient/treatment-plans', icon: Activity, roles: ['patient'] },
  { title: 'Messages', href: '/dashboard/patient/messages', icon: MessageSquare, roles: ['patient'] },
  { title: 'Invoices', href: '/dashboard/patient/invoices', icon: CreditCard, roles: ['patient'] },
  { title: 'Video Calls', href: '/dashboard/patient/video-calls', icon: Video, roles: ['patient'] },
  { title: 'Settings', href: '/dashboard/patient/settings', icon: Settings, roles: ['patient'] },
]

interface PatientSidebarProps {
  defaultCollapsed?: boolean
}

export default function PatientSidebar({ defaultCollapsed = false }: PatientSidebarProps) {
  return <DashboardSidebar items={navItems} defaultCollapsed={defaultCollapsed} />
}
