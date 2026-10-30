import {
  Activity,
  Award,
  BarChart3,
  Banknote,
  BellRing,
  BookOpen,
  Box,
  Briefcase,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  Code2,
  FileSignature,
  Flag,
  Globe,
  GraduationCap,
  HandHeart,
  Handshake,
  HeartPulse,
  Home,
  Inbox,
  Landmark,
  RotateCcw,
  Layers,
  LineChart,
  Mail,
  MapPinned,
  Megaphone,
  MessageCircle,
  Percent,
  Quote,
  PlayCircle,
  ReceiptText,
  Settings,
  ShieldCheck,
  Stethoscope,
  Store,
  Tags,
  UserCheck,
  UserRound,
  UserX,
  Users,
  WalletCards,
  type IconComponent,
} from '@/components/icons'

export const ADMIN_HOME = '/dashboard/admin'

/** Live counts shown next to nav items. Resolved in AdminSidebar. */
export type AdminBadgeKey = 'approvals' | 'partnerApplications' | 'openReports' | 'bankTransfers' | 'accessApplications' | 'agreements' | 'refunds' | 'inquiries'

export type AdminNavItem = {
  title: string
  href: string
  icon: IconComponent
  badgeKey?: AdminBadgeKey
  /** Extra words the command palette matches on. */
  keywords?: string[]
}

export type AdminNavSection = {
  id: string
  label: string
  icon: IconComponent
  items: AdminNavItem[]
  /** Only shown in development or when NEXT_PUBLIC_ADMIN_DEV_TOOLS=true. */
  devOnly?: boolean
}

const a = (path: string) => `${ADMIN_HOME}${path}`

/**
 * The admin console, grouped by who or what is being managed. This list drives the sidebar,
 * the breadcrumbs and the command palette, so a page only needs adding here once.
 */
export const ADMIN_NAV: AdminNavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: Home,
    items: [
      { title: 'Home', href: ADMIN_HOME, icon: Home, keywords: ['dashboard', 'start'] },
      { title: 'Analytics', href: a('/analytics'), icon: BarChart3, keywords: ['stats', 'growth', 'revenue'] },
    ],
  },
  {
    id: 'physios',
    label: 'Rehabify Physios',
    icon: Stethoscope,
    items: [
      { title: 'All physiotherapists', href: a('/physiotherapists'), icon: Stethoscope, keywords: ['physio', 'clinicians'] },
      { title: 'Approvals', href: a('/approvals'), icon: UserCheck, badgeKey: 'approvals', keywords: ['pending', 'review', 'verify'] },
      { title: 'Declined', href: a('/declined-physios'), icon: UserX, keywords: ['rejected'] },
      { title: 'Marketplace listing', href: a('/marketplace-listing'), icon: Store, keywords: ['find a physio', 'live', 'hidden', 'setup'] },
      { title: 'Public registry', href: a('/physio-registry'), icon: ShieldCheck, keywords: ['directory', 'listing'] },
      { title: 'Community', href: a('/community'), icon: MessageCircle, keywords: ['case of the week', 'forum', 'questions', 'reports', 'moderation', 'case lead', 'templates'] },
      { title: 'Rewards & points', href: a('/rewards'), icon: Award, keywords: ['points', 'tiers', 'masterclass', 'featured', 'boost', 'cpd', 'gamification'] },
      { title: 'Physio handbook', href: a('/handbook'), icon: BookOpen, keywords: ['sop', 'standard of practice', 'manual', 'clinical', 'pdf'] },
      { title: 'Payouts', href: a('/payouts'), icon: Banknote, keywords: ['earnings', 'paystack', 'transfers'] },
    ],
  },
  {
    id: 'patients',
    label: 'Patients & Care',
    icon: HeartPulse,
    items: [
      { title: 'All patients', href: a('/users?role=patient'), icon: UserRound, keywords: ['clients'] },
      { title: 'Inbound referrals', href: a('/referrals'), icon: Inbox, keywords: ['intake', 'routing'] },
      { title: 'Patient feedback', href: a('/patient-feedback'), icon: Quote, keywords: ['testimonials', 'reviews', 'feedback cards', 'home page', 'consent'] },
      { title: 'Care follow-ups', href: a('/care-follow-ups'), icon: HeartPulse, keywords: ['check-ins', 'discharge'] },
      { title: 'Family & caregivers', href: a('/caregivers'), icon: Users, keywords: ['care circle', 'family', 'carer', 'relative', 'guardian'] },
      { title: 'Patient plans', href: a('/patient-plans'), icon: Layers, keywords: ['flex', 'flex max', 'basic', 'launch', 'recovery', 'subscription', 'free activation'] },
      { title: 'MediLoan', href: a('/loans'), icon: WalletCards, keywords: ['myitura', 'finance', 'credit'] },
    ],
  },
  {
    id: 'clinics',
    label: 'Clinics',
    icon: Building2,
    items: [
      { title: 'All clinics', href: a('/clinics'), icon: Building2, keywords: ['practices', 'clinic owners', 'staff', 'subscriptions', 'clinic plans', 'past due'] },
      { title: 'Clinic fees', href: a('/clinic-fees'), icon: Percent, keywords: ['split', 'commission', 'stamp duty'] },
    ],
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    icon: Store,
    items: [
      { title: 'Bookings', href: a('/marketplace-bookings'), icon: CalendarCheck, keywords: ['appointments', 'joy', 'reassign'] },
      { title: 'Pricing & payouts', href: a('/service-tariffs'), icon: Tags, keywords: ['tariffs', 'prices', 'services', 'network terms', 'margin'] },
      { title: 'Travel zones', href: a('/travel-zones'), icon: MapPinned, keywords: ['home visits', 'areas', 'surcharge', 'travel charge'] },
      { title: 'Rehabify Access', href: a('/rehabify-access'), icon: HandHeart, badgeKey: 'accessApplications', keywords: ['assisted care', 'reduced fee', 'applications', 'subsidy'] },
      { title: 'Reports', href: a('/marketplace-reports'), icon: Flag, badgeKey: 'openReports', keywords: ['moderation', 'complaints'] },
    ],
  },
  {
    id: 'partners',
    label: 'Partners',
    icon: Handshake,
    items: [
      { title: 'Partners & applications', href: a('/partnerships'), icon: Handshake, badgeKey: 'partnerApplications', keywords: ['go-live', 'inquiries', 'api'] },
      { title: 'Demo requests & inquiries', href: a('/partnerships?tab=inquiries'), icon: Inbox, badgeKey: 'inquiries', keywords: ['demo', 'book a demo', 'clinic demo', 'contact', 'leads'] },
      { title: 'Contracts', href: a('/partner-contracts'), icon: FileSignature, keywords: ['commercial terms', 'pricing'] },
      { title: 'Partner payouts', href: a('/partnerships?tab=bulk_payouts'), icon: Banknote, keywords: ['settlements', 'monthly'] },
      { title: 'AwaDoc', href: a('/awadoc'), icon: Globe, keywords: ['integration', 'webhooks'] },
    ],
  },
  {
    // Every money screen lives here except payouts (Rehabify Physios, Partners) and clinic fees (Clinics).
    // Finance identifies patients by Rehabify ID, not by name.
    id: 'finance',
    label: 'Finance',
    icon: ReceiptText,
    items: [
      { title: 'Transactions', href: a('/transactions'), icon: ReceiptText, keywords: ['payments', 'invoices', 'patient id'] },
      { title: 'Bank transfers', href: a('/bank-transfers'), icon: Landmark, badgeKey: 'bankTransfers', keywords: ['confirm', 'manual payment'] },
      { title: 'Refunds', href: a('/refunds'), icon: RotateCcw, badgeKey: 'refunds', keywords: ['refund', 'cancellation', 'paystack', 'money back'] },
      { title: 'Marketplace revenue', href: a('/marketplace-analytics'), icon: LineChart, keywords: ['earnings', 'packages', 'analytics'] },
      { title: 'Revenue settings', href: a('/partnerships?tab=revenue'), icon: Percent, keywords: ['split', 'commission'] },
    ],
  },
  {
    id: 'library',
    label: 'Exercise Library',
    icon: BookOpen,
    items: [
      { title: 'Exercises', href: a('/exercises'), icon: BookOpen, keywords: ['programmes', 'videos'] },
      { title: '3D library & licences', href: a('/exercise-library'), icon: Box, keywords: ['animations', 'sign-off', 'licence'] },
    ],
  },
  {
    id: 'learn',
    label: 'Rehabify Learn',
    icon: GraduationCap,
    items: [
      { title: 'MSK Specialist Program', href: a('/learn'), icon: GraduationCap, keywords: ['cohort', 'course', 'training', 'certificate', 'registrations', 'cpd'] },
      { title: 'Video courses', href: a('/learn/courses'), icon: PlayCircle, keywords: ['upload', 'lessons', 'videos', 'imagekit', 'on demand'] },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    icon: Settings,
    items: [
      { title: 'Users & roles', href: a('/users'), icon: Users, keywords: ['accounts', 'permissions', 'admins'] },
      { title: 'Agreements', href: a('/agreements'), icon: FileSignature, badgeKey: 'agreements', keywords: ['contracts', 'sign', 'countersign', 'contractor', 'clinic saas', 'independent', 'e-signature'] },
      { title: 'Announcements', href: a('/announcements'), icon: Megaphone, keywords: ['broadcast', 'notify'] },
      { title: 'Email campaigns', href: a('/emails'), icon: Mail, keywords: ['marketing', 'newsletter', 'broadcast', 'resend', 'contacts'] },
      { title: 'Push notifications', href: a('/push'), icon: BellRing, keywords: ['app', 'pwa', 'phone', 'notify', 'broadcast', 'alerts'] },
      { title: 'Careers', href: a('/careers'), icon: Briefcase, keywords: ['jobs', 'hiring', 'roles', 'applications', 'cv'] },
      { title: 'Activity & audit log', href: a('/activity'), icon: Activity, keywords: ['security', 'events', 'logs'] },
      { title: 'Settings', href: a('/system'), icon: Settings, keywords: ['maintenance', 'registrations'] },
    ],
  },
  {
    id: 'developer',
    label: 'Developer',
    icon: Code2,
    devOnly: true,
    items: [
      { title: 'Reminder tests', href: a('/test-reminders'), icon: ClipboardCheck },
      { title: 'AwaDoc webhook test', href: a('/awadoc/test'), icon: Globe },
      { title: 'Approvals debug', href: a('/approvals/debug'), icon: UserCheck },
      { title: 'Marketplace migration', href: a('/marketplace-migration'), icon: Store },
    ],
  },
]

export function devToolsEnabled() {
  return process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ADMIN_DEV_TOOLS === 'true'
}

export function visibleAdminNav(): AdminNavSection[] {
  const showDev = devToolsEnabled()
  return ADMIN_NAV.filter((section) => !section.devOnly || showDev)
}

/** How well a nav href matches the current URL: higher is better, 0 means no match. */
export function matchScore(href: string, pathname: string, search: URLSearchParams): number {
  const [path, query] = href.split('?')
  if (path === ADMIN_HOME) return pathname === ADMIN_HOME ? 1 : 0
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return 0
  if (!query) return path.length
  // Items that pin a query (e.g. ?role=patient) only win when every pinned value matches
  const wanted = new URLSearchParams(query)
  for (const [key, value] of wanted) {
    if (search.get(key) !== value) return 0
  }
  return path.length + 1
}

/** The single nav item that best represents the current page. */
export function findActiveItem(pathname: string, search: URLSearchParams) {
  let best: { section: AdminNavSection; item: AdminNavItem; score: number } | null = null
  for (const section of ADMIN_NAV) {
    for (const item of section.items) {
      const score = matchScore(item.href, pathname, search)
      if (score > 0 && (!best || score > best.score)) best = { section, item, score }
    }
  }
  return best
}

const EXTRA_LABELS: Record<string, string> = {
  new: 'New',
  edit: 'Edit',
  test: 'Test',
  debug: 'Debug',
}

/** Breadcrumbs: section › page › detail. */
export function adminBreadcrumbs(pathname: string, search: URLSearchParams) {
  const crumbs: { label: string; href?: string }[] = [{ label: 'Admin', href: ADMIN_HOME }]
  if (pathname === ADMIN_HOME) return [{ label: 'Admin' }, { label: 'Home' }]
  const active = findActiveItem(pathname, search)
  if (!active) return crumbs
  crumbs.push({ label: active.section.label })
  const itemPath = active.item.href.split('?')[0]
  const rest = pathname.slice(itemPath.length).split('/').filter(Boolean)
  crumbs.push({ label: active.item.title, href: rest.length ? active.item.href : undefined })
  const last = rest[rest.length - 1]
  if (last) crumbs.push({ label: EXTRA_LABELS[last] ?? 'Details' })
  return crumbs
}
