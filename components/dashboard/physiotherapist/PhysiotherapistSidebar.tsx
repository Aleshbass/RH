'use client'

import { DashboardSidebar } from '@/components/dashboard/shared/DashboardSidebar'
import { LayoutDashboard, Calendar, Users, FileText, Video, MessageSquare, CreditCard, Settings, Dumbbell, Activity } from 'lucide-react'

// Navigation configuration for physiotherapists
const navItems = [
  { title: 'Dashboard', href: '/dashboard/physiotherapist', icon: LayoutDashboard, roles: ['physiotherapist'] },
  { title: 'Appointments', href: '/dashboard/physiotherapist/appointments', icon: Calendar, roles: ['physiotherapist'] },
  { title: 'Patients', href: '/dashboard/physiotherapist/patients', icon: Users, roles: ['physiotherapist'] },
  { title: 'Exercise Library', href: '/dashboard/physiotherapist/exercise-library', icon: Dumbbell, roles: ['physiotherapist'] },
  { title: 'Assessments', href: '/dashboard/physiotherapist/assessments', icon: Activity, roles: ['physiotherapist'] },
  { title: 'Reports', href: '/dashboard/physiotherapist/reports', icon: FileText, roles: ['physiotherapist'] },
  {
    title: "Treatment Templates",
    href: "/dashboard/physiotherapist/treatment-templates",
    icon: FileText,
    roles: ["physiotherapist"],
  },
  { title: 'Messages', href: '/dashboard/physiotherapist/messages', icon: MessageSquare, roles: ['physiotherapist'] },
  { title: 'Billing', href: '/dashboard/physiotherapist/billing', icon: CreditCard, roles: ['physiotherapist'] },
  { title: 'Video Calls', href: '/dashboard/physiotherapist/video-calls', icon: Video, roles: ['physiotherapist'] },
  { title: 'Settings', href: '/dashboard/physiotherapist/settings', icon: Settings, roles: ['physiotherapist'] },
]

interface PhysiotherapistSidebarProps {
  defaultCollapsed?: boolean
}

export default function PhysiotherapistSidebar({ defaultCollapsed = false }: PhysiotherapistSidebarProps) {
  return <DashboardSidebar items={navItems} defaultCollapsed={defaultCollapsed} />
} 