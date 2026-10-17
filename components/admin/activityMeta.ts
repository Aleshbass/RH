import {
  Activity,
  AlertTriangle,
  Banknote,
  Bell,
  CalendarCheck,
  Settings,
  ShieldAlert,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { Tone } from '@/components/admin/ui'

/** Categories returned by api.admin.getUserActivityLogs (see ACTIVITY_CATEGORIES in convex/admin.ts). */
export type ActivityCategory =
  | 'security'
  | 'admin'
  | 'account'
  | 'appointments'
  | 'payments'
  | 'notifications'
  | 'errors'
  | 'other'

/** Row shape of api.admin.getUserActivityLogs (kept explicit so pages type-check even if `api` degrades). */
export type ActivityLogItem = {
  _id: string
  type: string
  category: string
  activity: string
  summary: string
  status: string | null
  userId: string | null
  userName: string
  userRole: string
  userEmail: string | null
  timestamp: number
}

export type ActivityLogsResult = { items: ActivityLogItem[]; hasMore: boolean; limit: number }

/** Row shape of api.admin.getSecurityEvents. */
export type SecuritySummaryItem = { key: string; label: string; count: number; capped: boolean; tracked: boolean }

export type CountedValue = { count: number; capped: boolean }

/** Shape of api.admin.getUserRoleCounts. */
export type RoleCountsResult = { byRole: Record<string, CountedValue>; total: CountedValue; cap: number }

export const ACTIVITY_META: Record<ActivityCategory, { label: string; icon: LucideIcon; tone: Tone }> = {
  security: { label: 'Security', icon: ShieldAlert, tone: 'rose' },
  admin: { label: 'Admin', icon: Settings, tone: 'teal' },
  account: { label: 'Accounts', icon: UserRound, tone: 'mint' },
  appointments: { label: 'Appointments', icon: CalendarCheck, tone: 'mint' },
  payments: { label: 'Payments', icon: Banknote, tone: 'peach' },
  notifications: { label: 'Notifications', icon: Bell, tone: 'neutral' },
  errors: { label: 'Errors', icon: AlertTriangle, tone: 'rose' },
  other: { label: 'Other', icon: Activity, tone: 'neutral' },
}

export function activityMeta(category: string) {
  return ACTIVITY_META[(category in ACTIVITY_META ? category : 'other') as ActivityCategory]
}

const ROLE_LABELS: Record<string, string> = {
  patient: 'Patient',
  physiotherapist: 'Physiotherapist',
  clinic_owner: 'Clinic owner',
  clinic_staff: 'Clinic staff',
  doctor: 'Doctor',
  partner: 'Partner',
  family_member: 'Family member',
  admin: 'Admin',
  system: 'System',
  unassigned: 'No role yet',
}

export function roleLabel(role: string | null | undefined) {
  if (!role) return 'Unknown'
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ')
}

/** "1,234" or "1,000+" for a capped count from the admin API. */
export function formatCount(value: { count: number; capped: boolean } | undefined) {
  if (!value) return '—'
  return `${value.count.toLocaleString()}${value.capped ? '+' : ''}`
}
