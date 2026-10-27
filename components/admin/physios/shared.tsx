'use client'

import Image from 'next/image'
import { makeFunctionReference } from 'convex/server'
import { format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns'
import { StatusBadge } from '@/components/admin/ui'
import { initialsOf, tintFor } from '@/components/admin/clinics/shared'
import { PRACTICE_MODE_LABEL } from '@/lib/practiceModes'
import { cn } from '@/lib/utils'

/** Admin physiotherapist directory (convex/admin.ts adminPhysioDirectory / adminPhysioCaseload). */

export type PhysioMode = 'network' | 'independent' | 'both' | 'clinic'
export type ApprovalStatus = 'approved' | 'pending_review' | 'declined' | 'not_submitted'
export type PatientSource = 'rehabify' | 'own' | 'clinic'
export type CaseloadStatus = 'active_episode' | 'upcoming' | 'recent' | 'new'
export type SourceSplit = { total: number; rehabify: number; own: number; clinic: number }

export type DirectoryRow = {
  userId: string
  name: string
  imageUrl: string | null
  rehabifyId: string | null
  email: string | null
  phone: string | null
  mode: PhysioMode
  clinicId: string | null
  clinicName: string | null
  clinicSuspended: boolean
  approvalStatus: ApprovalStatus
  suspended: boolean
  marketplaceListed: boolean
  location: string | null
  patients: SourceSplit
  patientsCapped: boolean
  sessionsNext7Days: number
  nextSessionAt: number | null
  lastActiveAt: number | null
  joinedAt: number
}

export type DirectoryResult = {
  rows: DirectoryRow[]
  patientsHandled: number
  capped: boolean
  cap: number
  windowDays: number
  generatedAt: number
}

export type CaseloadPatient = {
  patientId: string
  name: string
  imageUrl: string | null
  rehabifyId: string | null
  source: PatientSource
  status: CaseloadStatus
  channel: string | null
  addedAt: number | null
  lastSessionAt: number | null
  nextSessionAt: number | null
  sessionsCompleted: number
  episode: { startedAt: number; plannedSessions: number | null } | null
  plan: { version: number; plannedSessions: number | null; sessionFrequency: string | null; reviewDate: number | null } | null
}

export type UpcomingSession = {
  appointmentId: string
  startTime: number
  endTime: number
  patientId: string
  patientName: string
  patientRehabifyId: string | null
  serviceType: string
  online: boolean
  status: 'scheduled' | 'confirmed'
}

export type CaseloadResult = {
  physio: {
    userId: string
    name: string
    imageUrl: string | null
    rehabifyId: string | null
    email: string | null
    phone: string | null
    mode: PhysioMode
    clinicId: string | null
    clinicName: string | null
    clinicSuspended: boolean
    approvalStatus: ApprovalStatus
    suspended: boolean
    liveOnFindAPhysio: boolean
    location: string | null
    joinedAt: number
    lastActiveAt: number | null
    specializations: string[]
    agreements: { id: string; shortTitle: string; state: 'not_signed' | 'outdated' | 'awaiting_countersign' | 'active' }[]
    yearsOfExperience: number | null
    rating: number | null
    reviewCount: number
    offersOnline: boolean
    offersInPerson: boolean
  }
  patients: CaseloadPatient[]
  counts: SourceSplit
  patientsCapped: boolean
  sessionsCapped: boolean
  otherOnRecord: number
  upcoming: UpcomingSession[]
  windowDays: number
  generatedAt: number
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
export const physioDirectoryRef = makeFunctionReference<'query', Record<string, never>, DirectoryResult>(
  'admin:adminPhysioDirectory'
)
export const physioCaseloadRef = makeFunctionReference<'query', { physiotherapistId: string }, CaseloadResult | null>(
  'admin:adminPhysioCaseload'
)

export const ADMIN_BASE = '/dashboard/admin'
export const userHref = (userId: string) => `${ADMIN_BASE}/users/${userId}`

export const MODE_LABEL: Record<PhysioMode, string> = {
  network: 'Rehabify network',
  independent: 'Independent',
  both: 'Network + own',
  clinic: 'Clinic',
}

/** Who they see, in a sentence. */
export const MODE_DESCRIPTION: Record<PhysioMode, string> = {
  network: PRACTICE_MODE_LABEL.network,
  independent: PRACTICE_MODE_LABEL.independent,
  both: PRACTICE_MODE_LABEL.both,
  clinic: 'Patients of their clinic',
}

const MODE_CHIP: Record<PhysioMode, string> = {
  network: 'bg-rh-lime text-rh-ink',
  independent: 'bg-rh-ink text-white dark:bg-white dark:text-rh-ink',
  both: 'bg-rh-honeydew text-rh-ink ring-1 ring-inset ring-rh-lime dark:bg-white/[0.06] dark:text-rh-lime dark:ring-rh-lime/50',
  clinic: 'bg-rh-peach text-[#8a4b05] dark:bg-white/[0.06] dark:text-amber-300',
}

export function ModeChip({ mode, className }: { mode: PhysioMode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4',
        MODE_CHIP[mode],
        className
      )}
    >
      {MODE_LABEL[mode]}
    </span>
  )
}

export const SOURCES: PatientSource[] = ['rehabify', 'own', 'clinic']

export const SOURCE_LABEL: Record<PatientSource, string> = {
  rehabify: 'Rehabify Care',
  own: 'Own',
  clinic: 'Clinic',
}

/** One fill per source, used by the bar and its legend. Lime, ink and amber: no teal. */
export const SOURCE_SWATCH: Record<PatientSource, string> = {
  rehabify: 'bg-rh-lime',
  own: 'bg-rh-ink dark:bg-rh-bone',
  clinic: 'bg-rh-amber',
}

export function splitLabel(split: SourceSplit) {
  return SOURCES.map((source) => `${split[source]} ${SOURCE_LABEL[source]}`).join(', ')
}

/** A thin stacked bar of where a physio's patients came from. Spans only, so it can sit in a button. */
export function SourceBar({ split, className }: { split: SourceSplit; className?: string }) {
  if (split.total === 0) {
    return <span aria-hidden className={cn('block h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08]', className)} />
  }
  const label = splitLabel(split)
  return (
    <span role="img" aria-label={label} title={label} className={cn('flex h-1.5 gap-[2px] overflow-hidden rounded-full', className)}>
      {SOURCES.filter((source) => split[source] > 0).map((source) => (
        <span key={source} className={cn('h-full', SOURCE_SWATCH[source])} style={{ flexGrow: split[source], flexBasis: 0 }} />
      ))}
    </span>
  )
}

export function SourceLegend({ split, className }: { split?: SourceSplit; className?: string }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400', className)}>
      {SOURCES.map((source) => (
        <span key={source} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn('h-2 w-2 rounded-full', SOURCE_SWATCH[source])} />
          {SOURCE_LABEL[source]}
          {split && <span className="font-semibold tabular-nums text-rh-ink dark:text-white">{split[source]}</span>}
        </span>
      ))}
    </span>
  )
}

const APPROVAL: Record<ApprovalStatus, { label: string; tone: 'green' | 'amber' | 'red' | 'neutral' }> = {
  approved: { label: 'Approved', tone: 'green' },
  pending_review: { label: 'Awaiting review', tone: 'amber' },
  declined: { label: 'Declined', tone: 'red' },
  not_submitted: { label: 'Not submitted', tone: 'neutral' },
}

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  approved: APPROVAL.approved.label,
  pending_review: APPROVAL.pending_review.label,
  declined: APPROVAL.declined.label,
  not_submitted: APPROVAL.not_submitted.label,
}

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  return <StatusBadge tone={APPROVAL[status].tone}>{APPROVAL[status].label}</StatusBadge>
}

/** Suspension first, then the review decision. */
export function AccountBadges({
  approvalStatus,
  suspended,
  clinicSuspended,
}: {
  approvalStatus: ApprovalStatus
  suspended: boolean
  clinicSuspended: boolean
}) {
  return (
    <>
      {suspended && <StatusBadge tone="red">Suspended</StatusBadge>}
      {clinicSuspended && <StatusBadge tone="red">Clinic suspended</StatusBadge>}
      <ApprovalBadge status={approvalStatus} />
    </>
  )
}

export const CASELOAD_STATUS: Record<CaseloadStatus, { label: string; tone: 'green' | 'teal' | 'neutral' | 'amber' }> = {
  active_episode: { label: 'Active care', tone: 'green' },
  upcoming: { label: 'Booked', tone: 'teal' },
  recent: { label: 'Seen recently', tone: 'neutral' },
  new: { label: 'New', tone: 'amber' },
}

const CHANNEL_LABEL: Record<string, string> = {
  marketplace: 'Website',
  joy_whatsapp: 'Joy',
  booking_link: 'Booking link',
  referred: 'Referred',
  existing_patient: 'Existing patient',
  invite: 'Invite',
  clinic_direct: 'Clinic',
  rehabify_referral: 'Rehabify referral',
  clinic: 'Clinic',
  other: 'Other',
}

/** "Rehabify Care · Joy", "Own · Invite", "Clinic". */
export function sourceText(source: PatientSource, channel: string | null) {
  const via = channel ? CHANNEL_LABEL[channel] : undefined
  return via && via !== SOURCE_LABEL[source] ? `${SOURCE_LABEL[source]} · ${via}` : SOURCE_LABEL[source]
}

export function PersonAvatar({
  id,
  name,
  imageUrl,
  size = 40,
}: {
  id: string
  name: string
  imageUrl: string | null
  size?: number
}) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="shrink-0 rounded-full bg-white object-cover ring-1 ring-black/[0.05] dark:bg-rh-ink-3 dark:ring-white/10"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', tintFor(id))}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initialsOf(name)}
    </span>
  )
}

/** "Today, 14:30", "Tomorrow, 09:00", "Thu 30 Oct, 11:00". */
export function sessionWhen(timestamp: number) {
  const date = new Date(timestamp)
  if (isToday(date)) return `Today, ${format(date, 'HH:mm')}`
  if (isTomorrow(date)) return `Tomorrow, ${format(date, 'HH:mm')}`
  return format(date, 'EEE d MMM, HH:mm')
}

export function dayLabel(timestamp: number) {
  const date = new Date(timestamp)
  if (isToday(date)) return 'Today'
  if (isTomorrow(date)) return 'Tomorrow'
  return format(date, 'EEEE d MMM')
}

export const shortDate = (timestamp: number) => format(timestamp, 'd MMM yyyy')

export const timeAgo = (timestamp: number) => formatDistanceToNowStrict(timestamp, { addSuffix: true })

/** Lower-case letters and digits only, so "rh-c 100001" finds "RH-C-100001". */
export const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
