import type { Id } from '@/convex/_generated/dataModel'

export type CohortStatus = 'draft' | 'live' | 'closed'
export type ClosedReason = 'draft' | 'closed' | 'ended' | 'deadline' | 'full'
export type RegistrationStatus = 'pending' | 'paid' | 'cancelled' | 'refunded'
export type Track = 'rehabify' | 'external'

/** Shape of api.learn.adminOverview rows (the generated api type is `any` here). */
export type AdminCohort = {
  id: Id<'learnCohorts'>
  cohortLabel: string
  startDate: string
  endDate: string
  dateRange: string
  liveSessions: string
  duration: string
  format: string
  registrationDeadline: string
  rehabifyPrice: number
  externalPrice: number
  capacity: number | null
  status: CohortStatus
  showOnLanding: boolean
  showBanner: boolean
  bannerText: string
  communityLink: string
  welcomeNote: string
  imageStorageId: Id<'_storage'> | null
  imageUrl: string | null
  imageAlt: string
  publishedAt: number | null
  updatedAt: number
  isOpen: boolean
  closedReason: ClosedReason | null
  stats: { paid: number; pending: number; rehabify: number; external: number; revenue: number; needsReview: number }
}

export type AdminOverview = { cohorts: AdminCohort[]; interestCount: number; programUrl: string }

export type AdminRegistration = {
  id: Id<'learnRegistrations'>
  track: Track
  firstName: string
  lastName: string
  email: string
  phone: string
  licenseNumber: string
  workplace: string
  city: string
  yearsOfPractice: string
  status: RegistrationStatus
  price: number
  amountPaid: number | null
  paidAt: number | null
  paidReference: string
  paymentReference: string
  paymentChannel: string
  paymentAttempts: number
  lastAttemptAt: number | null
  extraPayments: { reference: string; amount: number; at: number }[]
  confirmationEmailSentAt: number | null
  adminNotes: string
  contactedAt: number | null
  hasAccount: boolean
  createdAt: number
}

/**
 * WhatsApp wants the international number without "+": "0803 000 0000" and "803…" become
 * "234803…"; numbers already in international form keep their country code.
 */
export function whatsAppNumber(phone: string): string | null {
  const plus = phone.trim().startsWith('+')
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (plus || digits.startsWith('234')) return digits.length >= 10 ? digits : null
  if (digits.length === 11 && digits.startsWith('0')) return `234${digits.slice(1)}`
  if (digits.length === 10 && /^[789]/.test(digits)) return `234${digits}`
  return digits.length >= 10 ? digits : null
}

export type InterestRow = { id: string; email: string; name: string; createdAt: number }

/** The editable form; numbers stay strings while typing. */
export type CohortDraft = {
  cohortLabel: string
  startDate: string
  endDate: string
  registrationDeadline: string
  liveSessions: string
  duration: string
  format: string
  rehabifyPrice: string
  externalPrice: string
  capacity: string
  showOnLanding: boolean
  showBanner: boolean
  bannerText: string
  communityLink: string
  welcomeNote: string
  /** Optional photo; null means none. */
  imageStorageId: Id<'_storage'> | null
  imageAlt: string
}

/** The program as first announced; used for the very first cohort. */
export const FIRST_COHORT: CohortDraft = {
  cohortLabel: 'November 2026 cohort',
  startDate: '2026-11-02',
  endDate: '2026-11-30',
  registrationDeadline: '',
  liveSessions: 'Sundays, 5:00–7:00 PM',
  duration: '5 weeks',
  format: 'Online + live clinical demonstrations',
  rehabifyPrice: '5000',
  externalPrice: '10000',
  capacity: '',
  showOnLanding: true,
  showBanner: true,
  bannerText: '',
  communityLink: '',
  welcomeNote: '',
  imageStorageId: null,
  imageAlt: '',
}

export function draftFromCohort(cohort: AdminCohort): CohortDraft {
  return {
    cohortLabel: cohort.cohortLabel,
    startDate: cohort.startDate,
    endDate: cohort.endDate,
    registrationDeadline: cohort.registrationDeadline,
    liveSessions: cohort.liveSessions,
    duration: cohort.duration,
    format: cohort.format,
    rehabifyPrice: String(cohort.rehabifyPrice),
    externalPrice: String(cohort.externalPrice),
    capacity: cohort.capacity === null ? '' : String(cohort.capacity),
    showOnLanding: cohort.showOnLanding,
    showBanner: cohort.showBanner,
    bannerText: cohort.bannerText,
    communityLink: cohort.communityLink,
    welcomeNote: cohort.welcomeNote,
    imageStorageId: cohort.imageStorageId,
    imageAlt: cohort.imageAlt,
  }
}

/** A new cohort starts from the latest one's schedule, prices and image, with fresh dates. */
export function draftForNextCohort(latest: AdminCohort | undefined): CohortDraft {
  if (!latest) return FIRST_COHORT
  return {
    ...draftFromCohort(latest),
    cohortLabel: '',
    startDate: '',
    endDate: '',
    registrationDeadline: '',
    bannerText: '',
    communityLink: '',
    welcomeNote: '',
  }
}

export const COHORT_STATUS: Record<CohortStatus, { label: string; tone: 'neutral' | 'green' | 'amber' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  live: { label: 'Live', tone: 'green' },
  closed: { label: 'Closed', tone: 'amber' },
}

export const REGISTRATION_STATUS: Record<RegistrationStatus, { label: string; tone: 'neutral' | 'green' | 'amber' | 'red' }> = {
  paid: { label: 'Paid', tone: 'green' },
  pending: { label: 'Awaiting payment', tone: 'amber' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  refunded: { label: 'Refunded', tone: 'red' },
}

export const TRACK_LABEL: Record<Track, string> = {
  rehabify: 'Rehabify PT',
  external: 'Other PT',
}

/** Why a live cohort isn't taking registrations. */
export const AUTO_CLOSED: Partial<Record<ClosedReason, string>> = {
  ended: 'The cohort has finished, so registration is closed and it is hidden from the landing page and banner.',
  deadline: 'The registration deadline has passed, so registration is closed and it is hidden from the landing page and banner.',
  full: 'Every seat is taken, so registration is closed and it is hidden from the landing page and banner.',
}
