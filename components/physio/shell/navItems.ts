import {
  CalendarDays,
  Dumbbell,
  Home,
  MessageSquare,
  Settings,
  Users,
  Wallet,
  type IconComponent,
} from '@/components/icons'

export const PHYSIO_HOME = '/dashboard/physiotherapist'

export type PhysioNavItem = {
  title: string
  href: string
  icon: IconComponent
  /** One plain sentence on what's there, shown in the phone menu. */
  hint: string
  /** Other pages that belong to this section (it stays highlighted on them). */
  also?: string[]
}

export type PhysioNavGroup = { label?: string; items: PhysioNavItem[] }

const path = (p: string) => (p ? `${PHYSIO_HOME}/${p}` : PHYSIO_HOME)

export const NAV = {
  today: { title: 'Today', href: path(''), icon: Home, hint: 'Your sessions, check-ins and what needs you' },
  schedule: {
    title: 'Schedule',
    href: path('calendar'),
    icon: CalendarDays,
    hint: 'Calendar, booking requests and video sessions',
    also: [path('appointments'), path('video-calls')],
  },
  patients: { title: 'Patients', href: path('patients'), icon: Users, hint: 'Everyone in your care and their records' },
  messages: { title: 'Messages', href: path('messages'), icon: MessageSquare, hint: 'Chat with your patients' },
  library: {
    title: 'Library',
    href: path('exercise-library'),
    icon: Dumbbell,
    hint: '3D exercises to send, and treatment templates',
    also: [path('treatment-templates')],
  },
  money: {
    title: 'Money',
    href: path('billing'),
    icon: Wallet,
    hint: 'Invoices, payments and what you’ve earned',
    also: [path('insights')],
  },
  settings: {
    title: 'Settings',
    href: path('settings/profile'),
    icon: Settings,
    hint: 'Profile, availability, services and payouts',
    also: [path('settings'), path('marketplace')],
  },
} satisfies Record<string, PhysioNavItem>

/** Sidebar order: the day's work first, then the practice. */
export const PHYSIO_NAV: PhysioNavGroup[] = [
  { items: [NAV.today, NAV.schedule, NAV.patients, NAV.messages] },
  { label: 'Practice', items: [NAV.library, NAV.money, NAV.settings] },
]

/** While an application is under review only these are open. */
export const LIMITED_NAV: PhysioNavGroup[] = [{ items: [NAV.today, NAV.settings] }]

/** Bottom bar on phones and tablets; everything else lives under "More". */
export const MOBILE_TABS: PhysioNavItem[] = [NAV.today, NAV.schedule, NAV.patients, NAV.messages]

function under(pathname: string, href: string) {
  if (href === PHYSIO_HOME) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function isActiveItem(pathname: string, item: PhysioNavItem) {
  return under(pathname, item.href) || (item.also ?? []).some((href) => under(pathname, href))
}

/**
 * Sections made of several pages get a row of tabs at the top, so the menu stays short while
 * every page is one tap away.
 */
export const SECTION_TABS: { section: PhysioNavItem; tabs: { title: string; href: string }[] }[] = [
  {
    section: NAV.schedule,
    tabs: [
      { title: 'Calendar', href: path('calendar') },
      { title: 'Requests & list', href: path('appointments') },
      { title: 'Video sessions', href: path('video-calls') },
    ],
  },
  {
    section: NAV.money,
    tabs: [
      { title: 'Invoices', href: path('billing') },
      { title: 'Earnings', href: path('insights') },
    ],
  },
  {
    section: NAV.library,
    tabs: [
      { title: '3D exercises', href: path('exercise-library') },
      { title: 'Templates', href: path('treatment-templates') },
    ],
  },
]

export function sectionTabsFor(pathname: string) {
  return SECTION_TABS.find((s) => s.tabs.some((tab) => under(pathname, tab.href))) ?? null
}

export function isActiveTab(pathname: string, href: string) {
  return under(pathname, href)
}
