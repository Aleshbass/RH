import {
  Calendar,
  ClipboardList,
  Dumbbell,
  FolderOpen,
  Home,
  MessageSquare,
  Receipt,
  Search,
  Settings,
  Stethoscope,
  TrendingUp,
  Video,
  type IconComponent,
} from '@/components/icons'

export const PATIENT_HOME = '/dashboard/patient'

export type PatientNavItem = {
  title: string
  href: string
  icon: IconComponent
  /** One plain sentence on what's there, shown in the mobile menu. */
  hint: string
}

export type PatientNavGroup = { label?: string; items: PatientNavItem[] }

const item = (title: string, path: string, icon: IconComponent, hint: string): PatientNavItem => ({
  title,
  href: path ? `${PATIENT_HOME}/${path}` : PATIENT_HOME,
  icon,
  hint,
})

export const NAV = {
  home: item('Home', '', Home, 'Your next visit, check-in and what needs doing'),
  appointments: item('Appointments', 'appointments', Calendar, 'Book, reschedule or cancel visits'),
  messages: item('Messages', 'messages', MessageSquare, 'Chat with your physiotherapist'),
  physio: item('My physiotherapist', 'my-physiotherapist', Stethoscope, 'Who is treating you and how to reach them'),
  videoCalls: item('Video calls', 'video-calls', Video, 'Join online sessions'),
  plan: item('Treatment plan', 'treatment-plans', ClipboardList, 'Your goals and what your physio prescribed'),
  exercises: item('Exercises', 'exercises', Dumbbell, 'Your home exercise programme'),
  progress: item('Progress', 'insights', TrendingUp, 'How your recovery is going'),
  records: item('Records', 'records', FolderOpen, 'Scans, reports and letters'),
  invoices: item('Invoices', 'invoices', Receipt, 'Bills, payments and receipts'),
  settings: item('Settings', 'settings', Settings, 'Profile, reminders, privacy and display'),
} as const

/** Sidebar order: everyday things first, then care, then paperwork. */
export const PATIENT_NAV: PatientNavGroup[] = [
  { items: [NAV.home, NAV.appointments, NAV.messages] },
  { label: 'My care', items: [NAV.physio, NAV.videoCalls, NAV.plan, NAV.exercises, NAV.progress] },
  { label: 'Records & payments', items: [NAV.records, NAV.invoices] },
]

/** Bottom bar on phones and tablets; everything else lives under "More". */
export const MOBILE_TABS: PatientNavItem[] = [NAV.home, NAV.appointments, NAV.messages, NAV.exercises]

export const FIND_A_PHYSIO = { title: 'Find a physio', href: '/find-a-physio', icon: Search }

export function isActivePath(pathname: string, href: string) {
  if (href === PATIENT_HOME) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
