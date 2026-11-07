import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'

export type PatientSource = 'joy' | 'doctor' | 'partner' | 'clinic' | 'physio' | 'find_a_physio' | 'website'
export type CareFormat = 'online' | 'home_visit' | 'clinic'

export type LinkedPhysio = {
  physioId: Id<'users'>
  name: string
  source: string | null
  referredBy: string | null
  clinicId: Id<'clinics'> | null
  since: number
  primary: boolean
}

/** One patient at a glance (convex/helpers/patientFacts.ts). */
export type PatientFactsRow = {
  userId: Id<'users'>
  name: string
  rehabifyId: string | null
  imageUrl: string | null
  phone: string | null
  email: string | null
  joinedAt: number
  age: number | null
  gender: string | null
  language: string | null
  state: string | null
  city: string | null
  area: string | null
  complaint: string | null
  bodyAreas: string[]
  format: CareFormat | null
  triageLevel: 'green' | 'amber' | 'red' | null
  redFlags: string[]
  sources: PatientSource[]
  fromJoy: boolean
  physios: LinkedPhysio[]
  hasPhysio: boolean
  missing: string[]
}

export type DirectoryRow = PatientFactsRow & { lookingForCare: string | null }

export type PatientRecord = Omit<PatientFactsRow, 'physios'> & {
  address: string | null
  dateOfBirth: string | null
  ageYears: number | null
  medicalHistory: string | null
  mainComplaint: string | null
  preferredFormat: CareFormat | null
  careTeamNotes: string | null
  careDetailsUpdatedAt: number | null
  careDetailsUpdatedBy: string | null
  emergencyContact: { name: string; relationship: string; phone: string } | null
  clinicName: string | null
  physios: (LinkedPhysio & { clinicName: string | null })[]
  pastPhysios: { physioId: Id<'users'>; name: string; source: string | null; endedAt: number | null }[]
  intake: {
    receivedAt: number
    triageLevel: 'green' | 'amber' | 'red' | null
    chiefComplaint: string | null
    bodyAreas: string[]
    painScore: number | null
    onset: string | null
    duration: string | null
    redFlags: { question: string; answer: string; flagged: boolean }[]
    goals: string | null
    medicalHistory: string | null
    medications: string | null
    answers: { question: string; answer: string }[]
    clinicianSummary: string | null
    preferredTimes: string | null
    language: string | null
    consentGiven: boolean | null
  } | null
  referrals: {
    id: string
    from: string
    condition: string | null
    reason: string | null
    priority: string | null
    careSetting: string | null
    recommendedSessions: number | null
    clinicalNotes: string | null
    status: string
    createdAt: number
  }[]
  bookings: {
    id: Id<'marketplaceBookings'>
    line: string
    status: string
    paid: boolean
    test: boolean
    physioId: Id<'users'> | null
    physioName: string | null
    awaitingPhysio: boolean
    dueAt: number | null
    createdAt: number
  }[]
  upcoming: { id: string; startTime: number; status: string; online: boolean; physioName: string | null }[]
  past: { id: string; startTime: number; status: string; online: boolean; physioName: string | null }[]
  journey: { stage: string; occurredAt: number; note: string | null; source: string }[]
  signals: { id: string; kind: string; status: 'open' | 'handled'; detail: string; createdAt: number; handledNote: string | null }[]
}

export type SuggestedPhysio = {
  userId: Id<'users'>
  name: string
  imageUrl: string | null
  rehabifyId: string | null
  location: string | null
  specializations: string[]
  languages: string[]
  formats: string[]
  nextSlot: number | null
  freeSlots: number
  booked7d: number
  recentReferrals: number
  acceptRate: number | null
  rating: number | null
  phone: string | null
  fits: string[]
  gaps: string[]
}

export type Suggestions = {
  patient: { state: string | null; city: string | null; area: string | null; language: string | null; zone: string | null }
  considered: number
  physios: SuggestedPhysio[]
}

export type DetailsPatch = {
  patientId: Id<'users'>
  dateOfBirth?: string
  ageYears?: number | null
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null
  preferredLanguage?: string
  state?: string
  city?: string
  area?: string
  address?: string
  mainComplaint?: string
  preferredFormat?: CareFormat | null
  careTeamNotes?: string
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
export const patientApi = {
  directory: makeFunctionReference<'query', Record<string, never>, { rows: DirectoryRow[]; capped: boolean }>('adminPatients:directory'),
  record: makeFunctionReference<'query', { patientId: string }, PatientRecord | null>('adminPatients:record'),
  updateDetails: makeFunctionReference<'mutation', DetailsPatch, { ok: boolean }>('adminPatients:updateDetails'),
  suggestPhysios: makeFunctionReference<
    'action',
    { patientId: Id<'users'>; format: CareFormat; specialty?: string; withinDays?: number },
    Suggestions
  >('adminPatients:suggestPhysios'),
  pairWithPhysio: makeFunctionReference<
    'mutation',
    { patientId: Id<'users'>; physiotherapistId: Id<'users'>; note?: string },
    { ok: boolean; physioName: string }
  >('adminPatients:pairWithPhysio'),
  // A paid booking moves with its money (convex/admin/marketplaceBookings.ts)
  reassignBooking: makeFunctionReference<
    'mutation',
    { bookingId: Id<'marketplaceBookings'>; newPhysiotherapistId: Id<'users'>; reason?: string },
    unknown
  >('admin/marketplaceBookings:adminReassignBookingPhysio'),
}

export const SOURCE_LABEL: Record<PatientSource, string> = {
  joy: 'Joy',
  doctor: 'Doctor referral',
  partner: 'Partner referral',
  clinic: 'Clinic',
  physio: 'Added by physio',
  find_a_physio: 'Find a Physio',
  website: 'Website sign-up',
}

export const FORMAT_LABEL: Record<CareFormat, string> = { online: 'Video', home_visit: 'Home visit', clinic: 'Clinic visit' }

export const MISSING_LABEL: Record<string, string> = {
  age: 'Age',
  state: 'State',
  area: 'Area',
  complaint: 'Complaint',
  format: 'Video or home visit',
  phone: 'Phone',
}

/** "Lekki, Lagos" from whatever parts we have. */
export function placeText(p: { area: string | null; city: string | null; state: string | null }) {
  const parts = [p.area, p.city, p.state].filter((part, i, all): part is string => Boolean(part) && all.findIndex((x) => x?.toLowerCase() === part?.toLowerCase()) === i)
  return parts.join(', ')
}
