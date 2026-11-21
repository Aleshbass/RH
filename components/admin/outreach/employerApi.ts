/**
 * Admin › Employer outreach: the Convex functions (convex/employerOutreach.ts) by name, and the
 * shapes they return. Plain references: the generated `api` type is at TypeScript's depth limit.
 */
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import type { EmployerStage, RoleGroup } from '@/lib/employerOutreach'

export type Source = 'google_places' | 'web_search'
export type SeqStatus = 'draft' | 'active' | 'paused'
export type EnrollStatus = 'active' | 'finished' | 'replied' | 'bounced' | 'unsubscribed' | 'stopped'
export type Step = { subject: string; body: string; waitDays: number }

export type CompanyRow = {
  _id: string
  name: string
  city: string
  sector: string | null
  staffSize: string | null
  website: string | null
  email: string | null
  phone: string | null
  extraPhones: number
  linkedinUrl: string | null
  status: string
  stage: EmployerStage
  nextFollowUpAt: number | null
  ownerId: string | null
  dealValueNaira: number | null
  crawlStatus: 'pending' | 'done' | 'failed' | null
  peopleSearchedAt: number | null
  peopleRunning: boolean
  peopleSearchError: string | null
  people: { count: number; withEmail: number; groups: RoleGroup[] }
  source: string
  createdAt: number
  updatedAt: number
}

export type CompaniesData = {
  companies: CompanyRow[]
  total: number
  capped: boolean
  counts: Partial<Record<EmployerStage, number>>
  pipelineValue: number
  cities: { name: string; count: number }[]
  owners: { _id: string; name: string }[]
  finders: { googlePlaces: boolean; aiSearch: boolean }
  searches: { city: string; sector: string | null; source: string; found: number; added: number; error: string | null; at: number }[]
  crawling: number
}

export type PersonRow = {
  _id: string
  name: string
  role: string | null
  roleGroup: RoleGroup
  email: string | null
  emailStatus: 'published' | 'admin' | 'pilot_form' | null
  phone: string | null
  linkedinUrl: string | null
  source: 'web_search' | 'website' | 'admin' | 'pilot_form'
  sourceUrl: string | null
  notes: string | null
  doNotContact: boolean
  bounced: boolean
}

export type CompanyDetail = {
  _id: string
  name: string
  city: string
  country: string | null
  address: string | null
  sector: string | null
  staffSize: string | null
  website: string | null
  email: string | null
  otherEmails: string[]
  phone: string | null
  otherPhones: string[]
  linkedinUrl: string | null
  mapsUrl: string | null
  sourceUrl: string | null
  source: string
  status: string
  crawlStatus: 'pending' | 'done' | 'failed' | null
  crawlError: string | null
  stage: EmployerStage
  stageChangedAt: number | null
  nextFollowUpAt: number | null
  ownerId: string | null
  dealStaffCount: number | null
  dealValueNaira: number | null
  fromPilotRequest: boolean
  peopleSearchedAt: number | null
  peopleRunning: boolean
  peopleSearchError: string | null
  people: PersonRow[]
  activities: { _id: string; kind: 'stage' | 'note' | 'email_sent' | 'reply' | 'contact_added'; text: string; by: string | null; at: number }[]
  enrollments: {
    _id: string
    sequenceName: string
    email: string
    personName: string | null
    status: EnrollStatus
    sentSteps: number
    nextSendAt: number | null
    lastSentAt: number | null
    stoppedReason: string | null
  }[]
  inbox: {
    _id: string
    kind: 'reply' | 'bounce' | 'auto_reply'
    intent: 'stop' | 'not_interested' | null
    fromEmail: string | null
    subject: string
    snippet: string
    receivedAt: number
  }[]
}

type Stats = Record<EnrollStatus, number> & { total: number; sent: number; contacted: number; people: number }
export type SequencesData = {
  sender: {
    configured: boolean
    address: string | null
    sendingOn: boolean
    fromName: string
    sentToday: number
    quota: number
    windowOpen: boolean
    weekday: boolean
    day: string
    lastInboxCheckAt: number | null
    lastSendError: string | null
  }
  employerSentToday: number
  sequences: { _id: string; name: string; status: SeqStatus; steps: Step[]; updatedAt: number; stats: Stats }[]
  replies: {
    _id: string
    leadId: string
    company: string
    kind: string
    intent: string | null
    fromEmail: string | null
    subject: string
    snippet: string
    receivedAt: number
  }[]
}

export type CompanyPatch = {
  leadId: string
  stage?: EmployerStage
  nextFollowUpAt?: number | null
  ownerId?: string | null
  dealStaffCount?: number | null
  dealValueNaira?: number | null
  name?: string
  city?: string
  sector?: string
  staffSize?: string
  email?: string
  phone?: string
  website?: string
  linkedinUrl?: string
}

export const employerApi = {
  companies: makeFunctionReference<'query', Record<string, never>, CompaniesData>('employerOutreach:adminCompanies'),
  company: makeFunctionReference<'query', { leadId: string }, CompanyDetail | null>('employerOutreach:adminCompany'),
  find: makeFunctionReference<
    'action',
    { city: string; country?: string; sectors: string[]; otherQuery?: string; sources: Source[] },
    { found: number; added: number; updated: number; skipped: number; errors: string[] }
  >('employerOutreach:adminFindCompanies'),
  findPeople: makeFunctionReference<'mutation', { leadIds: string[]; force?: boolean }, { queued: number; skipped: number }>(
    'employerOutreach:adminFindPeople'
  ),
  update: makeFunctionReference<'mutation', CompanyPatch, null>('employerOutreach:adminUpdateCompany'),
  setStage: makeFunctionReference<'mutation', { leadIds: string[]; stage: EmployerStage }, { changed: number }>('employerOutreach:adminSetStage'),
  addNote: makeFunctionReference<'mutation', { leadId: string; text: string }, null>('employerOutreach:adminAddNote'),
  recrawl: makeFunctionReference<'mutation', { leadId: string }, null>('employerOutreach:adminRecrawl'),
  saveContact: makeFunctionReference<
    'mutation',
    {
      leadId: string
      contactId?: string
      name: string
      role?: string
      roleGroup?: RoleGroup
      email?: string
      phone?: string
      linkedinUrl?: string
      notes?: string
      doNotContact?: boolean
    },
    string
  >('employerOutreach:adminSaveContact'),
  deleteContact: makeFunctionReference<'mutation', { contactId: string }, null>('employerOutreach:adminDeleteContact'),
  sequences: makeFunctionReference<'query', Record<string, never>, SequencesData>('employerOutreach:adminSequences'),
  saveSequence: makeFunctionReference<'mutation', { sequenceId?: string; name: string; steps: Step[]; status: SeqStatus }, string>(
    'employerOutreach:adminSaveSequence'
  ),
  enroll: makeFunctionReference<
    'mutation',
    { sequenceId: string; leadIds: string[]; companyEmail: boolean; people: boolean; roleGroups?: RoleGroup[] },
    { added: number; companies: number; skipped: number }
  >('employerOutreach:adminEnroll'),
  stopEnrollment: makeFunctionReference<'mutation', { enrollmentId: string }, null>('employerOutreach:adminStopEnrollment'),
  exportRows: makeFunctionReference<'query', { leadIds?: string[] }, { rows: Record<string, string>[] }>('employerOutreach:adminExport'),
  sendTest: makeFunctionReference<'action', { sequenceId: string; to: string }, { sent: number }>('actions/employerOutreachMail:adminSendTest'),
}

export const errorText = (err: unknown, fallback = 'Something went wrong. Please try again.') =>
  err instanceof ConvexError && typeof err.data === 'string'
    ? err.data
    : err instanceof Error
      ? err.message.replace(/^.*ConvexError: /, '').split('\n')[0]
      : fallback

/** "2026-11-24" for a follow-up stored as a time (Lagos is UTC+1 all year). */
export const lagosDay = (ms: number) => new Date(ms + 3_600_000).toISOString().slice(0, 10)
/** A date picked in the page ("2026-11-24") as 9:00 that morning in Lagos. */
export const fromLagosDay = (day: string) => Date.parse(`${day}T08:00:00Z`)

export const STAGE_TONE: Record<EmployerStage, 'green' | 'teal' | 'amber' | 'red' | 'neutral'> = {
  found: 'neutral',
  contacts_found: 'neutral',
  contacted: 'teal',
  replied: 'amber',
  meeting_booked: 'amber',
  pilot_proposed: 'amber',
  pilot_live: 'green',
  paying: 'green',
  lost: 'neutral',
  do_not_contact: 'red',
}
