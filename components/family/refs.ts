import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'

/**
 * convex/careCircle.ts, referenced by name: the generated api type sits at TypeScript's depth
 * limit (TS2589), so these spell out what each function takes and returns.
 */

export type CareAccess = 'view' | 'book_pay' | 'full'

export const CARE_ACCESS_OPTIONS: { value: CareAccess; title: string; description: string }[] = [
  { value: 'view', title: 'See their care', description: 'Visits, care plan, home exercises and progress' },
  { value: 'book_pay', title: 'Book and pay', description: 'Also ask for visits and pay their bills' },
  { value: 'full', title: 'Everything', description: 'Also message their physio or clinic' },
]

export const ACCESS_LABEL: Record<CareAccess, string> = { view: 'Sees their care', book_pay: 'Books and pays', full: 'Full access' }

export const RELATIONSHIPS = ['Daughter', 'Son', 'Spouse', 'Mother', 'Father', 'Sibling', 'Carer'] as const

export type CareCircle = {
  patient: { _id: Id<'users'>; firstName: string | null; lastName: string | null }
  managedBy: 'patient' | 'caregiver' | 'clinic'
  clinicName: string | null
  members: {
    grantId: Id<'familyAccessGrants'>
    userId: Id<'users'>
    name: string
    phone: string | null
    email: string | null
    imageUrl: string | null
    relationship: string
    access: CareAccess
    managed: boolean
    source: string
    since: number
    isMe: boolean
  }[]
  invites: {
    inviteId: Id<'careCircleInvites'>
    name: string
    relationship: string
    access: CareAccess
    email: string | null
    phone: string | null
    createdAt: number
    expiresAt: number
    link: string
  }[]
} | null

export type CareInvite = {
  status: 'pending' | 'accepted' | 'cancelled' | 'expired'
  name: string
  relationship: string
  access: CareAccess
  accessSentence: string
  patientFirstName: string
  patientName: string
  fromPatient: boolean
  inviterName: string
  clinic: { name: string; logoUrl: string | null } | null
  maskedEmail: string | null
  signedIn: boolean
  isThePatient: boolean
  alreadyIn: boolean
} | null

export type CaredForPerson = {
  patientId: Id<'users'>
  firstName: string
  lastName: string
  imageUrl: string | null
  relationship: string
  access: CareAccess
  managed: boolean
  nextVisitAt: number | null
}

export type Visit = {
  _id: Id<'appointments'>
  startTime: number
  endTime: number
  status: string
  statusLabel: string
  online: boolean
  service: string
  clinician: string
}

export type CaredForOverview = {
  person: {
    _id: Id<'users'>
    firstName: string
    lastName: string
    imageUrl: string | null
    phone: string | null
    patientNumber: string | null
    age: number | null
    city: string | null
    condition: string | null
    hasOwnLogin: boolean
  }
  access: { level: CareAccess; relationship: string; managed: boolean; canBook: boolean; canPay: boolean; canMessage: boolean }
  clinic: { name: string; phone: string | null; logoUrl: string | null; address: string | null } | null
  clinicians: { userId: Id<'users'>; name: string; imageUrl: string | null; clinicName: string | null }[]
  upcoming: Visit[]
  recent: Visit[]
  plan: {
    title: string
    goals: { description: string; achieved: boolean }[]
    sessionFrequency: string | null
    reviewDate: number | null
    precautions: string | null
    updatedAt: number
  } | null
  programme: { titles: string[]; exercises: number; done: number; expected: number; rate: number | null; lastLoggedAt: number | null } | null
  checkIns: { _id: string; painScore: number; mood: string | null; exercisesDone: string; createdAt: number }[]
  checkedInToday: boolean
  invoices: {
    _id: Id<'invoices'>
    invoiceNumber: string
    amountKobo: number
    service: string
    dueDate: number
    overdue: boolean
    payee: string
    payLink: string | null
  }[]
} | null

export type StaffCareCircle = {
  grantId: string
  name: string
  relationship: string
  phone: string | null
  access: CareAccess
  managed: boolean
}[] | null

const q = <Args extends Record<string, unknown>, Result>(name: string) => makeFunctionReference<'query', Args, Result>(name)
const m = <Args extends Record<string, unknown>, Result>(name: string) => makeFunctionReference<'mutation', Args, Result>(name)

export const careRefs = {
  getCareCircle: q<{ patientId?: Id<'users'> }, CareCircle>('careCircle:getCareCircle'),
  invite: m<
    { patientId?: Id<'users'>; name: string; email?: string; phone?: string; relationship: string; access: CareAccess },
    { inviteId: Id<'careCircleInvites'>; link: string; whatsappText: string }
  >('careCircle:inviteToCareCircle'),
  cancelInvite: m<{ inviteId: Id<'careCircleInvites'> }, { changed: boolean }>('careCircle:cancelCareInvite'),
  updateAccess: m<{ grantId: Id<'familyAccessGrants'>; access: CareAccess; relationship?: string }, { ok: boolean }>('careCircle:updateCareAccess'),
  remove: m<{ grantId: Id<'familyAccessGrants'> }, { changed: boolean }>('careCircle:removeFromCareCircle'),
  getInvite: q<{ code: string }, CareInvite>('careCircle:getCareInvite'),
  acceptInvite: m<{ code: string }, { patientId: Id<'users'> }>('careCircle:acceptCareInvite'),
  addPerson: m<
    {
      firstName: string
      lastName: string
      relationship: string
      dateOfBirth?: string
      gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say'
      phone?: string
      city?: string
      condition?: string
    },
    { patientId: Id<'users'> }
  >('careCircle:addPersonICareFor'),
  linkJoy: m<Record<string, never>, { moved: number }>('careCircle:linkJoyFamilyAccess'),
  ownLogin: m<{ patientId: Id<'users'>; email: string; phone?: string }, { link: string; whatsappText: string }>('careCircle:inviteToOwnLogin'),
  myCaredFor: q<Record<string, never>, { me: { firstName: string | null; role: string | null }; people: CaredForPerson[] } | null>('careCircle:getMyCaredFor'),
  overview: q<{ patientId: Id<'users'> }, CaredForOverview>('careCircle:getCaredForOverview'),
  checkInFor: m<
    {
      patientId: Id<'users'>
      painScore: number
      functionScore?: number
      mood?: 'great' | 'good' | 'okay' | 'low'
      exercisesDone: 'all' | 'some' | 'none'
      note?: string
      concern?: boolean
    },
    { checkInId: string; flagged: boolean }
  >('careCircle:submitCheckInFor'),
  requestVisit: m<
    { patientId: Id<'users'>; message?: string; preferredTimes?: string },
    { route: 'clinic' | 'physio' | 'joy'; to: string | null }
  >('careCircle:requestVisitFor'),
  forStaff: q<{ patientId: Id<'users'> }, StaffCareCircle>('careCircle:getPatientCareCircleForStaff'),
}
