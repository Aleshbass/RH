import type { RegisteredQuery } from 'convex/server'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import type { getClinic, listClinicPatients, listClinicReferrals, listClinicStaff } from '@/convex/adminClinics'

/**
 * Result types read straight from the Convex functions. The generated `api` object can lose
 * its types in this project (it is too large to instantiate), so `useQuery` results are cast
 * to these instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryResult<T> = T extends RegisteredQuery<any, any, infer R> ? Awaited<R> : never

/** adminClinics.listClinics. Written out by hand: inferring this one is too deep for TS (TS2589). */
export type ClinicsListResult = {
  rows: {
    _id: Id<'clinics'>
    name: string
    clinicNumber: string | null
    logoUrl: string | null
    city: string | null
    state: string | null
    createdAt: number
    status: 'active' | 'suspended'
    approvalStatus: Doc<'accountApprovalStatus'>['status'] | 'not_submitted'
    owner: { _id: Id<'users'>; name: string | null; email: string | null } | null
    staffCount: number
    staffCapped: boolean
    patientCount: number
    patientsCapped: boolean
    payoutConnected: boolean
  }[]
  totals: { total: number; active: number; suspended: number; pending: number }
  matched: number
  hasMore: boolean
  scanCapped: boolean
}
export type ClinicDetailResult = QueryResult<typeof getClinic>
export type ClinicStaffResult = QueryResult<typeof listClinicStaff>
export type ClinicPatientsResult = QueryResult<typeof listClinicPatients>
export type ClinicReferralsResult = QueryResult<typeof listClinicReferrals>
