'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/admin/ui'

export const CLINICS_BASE = '/dashboard/admin/clinics'
export const userHref = (userId: string) => `/dashboard/admin/users/${userId}`

// Initial tiles cycle through the brand's soft colours, like the physio patient list
const TINTS = [
  'bg-rh-mint text-rh-teal dark:bg-emerald-400/10 dark:text-emerald-300',
  'bg-rh-peach text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300',
  'bg-rh-blush text-[#be3a5f] dark:bg-rose-400/10 dark:text-rose-300',
  'bg-rh-mist text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua',
]
export const tintFor = (id: string) => TINTS[id.charCodeAt(id.length - 1) % TINTS.length]

export const initialsOf = (name: string | null | undefined, fallback = '?') =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || fallback

/** The clinic's logo, or its initials on a brand tint. */
export function ClinicAvatar({
  id,
  name,
  logoUrl,
  size = 'md',
}: {
  id: string
  name: string
  logoUrl?: string | null
  size?: 'md' | 'lg'
}) {
  const box = size === 'lg' ? 'h-14 w-14 rounded-2xl text-lg' : 'h-10 w-10 rounded-xl text-sm'
  const px = size === 'lg' ? 56 : 40
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt=""
        width={px}
        height={px}
        unoptimized
        className={cn(box, 'shrink-0 bg-white object-cover ring-1 ring-black/[0.04] dark:bg-rh-ink-3 dark:ring-white/10')}
      />
    )
  }
  return (
    <span className={cn(box, 'flex shrink-0 items-center justify-center font-semibold', tintFor(id))}>
      {initialsOf(name, 'C')}
    </span>
  )
}

export function ClinicStatusBadge({ status }: { status: 'active' | 'suspended' }) {
  return status === 'suspended' ? <StatusBadge tone="red">Suspended</StatusBadge> : <StatusBadge tone="green">Active</StatusBadge>
}

const APPROVAL: Record<string, { label: string; tone: 'neutral' | 'teal' | 'green' | 'amber' | 'red' }> = {
  approved: { label: 'Approved', tone: 'green' },
  pending_review: { label: 'Awaiting review', tone: 'amber' },
  declined: { label: 'Declined', tone: 'red' },
  not_submitted: { label: 'Not submitted', tone: 'neutral' },
}

/** Rehabify's review of the clinic owner's registration. */
export function ApprovalBadge({ status, hideApproved = false }: { status: string | null; hideApproved?: boolean }) {
  if (!status || (hideApproved && status === 'approved')) return null
  const entry = APPROVAL[status] ?? { label: status, tone: 'neutral' as const }
  return <StatusBadge tone={entry.tone}>{entry.label}</StatusBadge>
}

/** "received" → "Received", "treatment_active" → "Treatment active" */
export const humanize = (value: string) => {
  const s = value.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** A count that stopped at its cap reads "150+". */
export const countLabel = (count: number, capped?: boolean) => `${count.toLocaleString('en-NG')}${capped ? '+' : ''}`
