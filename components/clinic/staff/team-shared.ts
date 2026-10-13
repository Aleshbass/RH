'use client'

import { ConvexError } from 'convex/values'
import type { Id } from '@/convex/_generated/dataModel'
import { CLINIC_AREAS, CLINIC_AREA_LABELS, type ClinicArea } from '@/components/clinic/ClinicPreviewContext'
import { friendlyError } from '@/components/clinic/patients/patient-record-shared'

// Written out (rather than inferred from the api) because the clinic query types can resolve to `any`.

/** Shape returned by api.clinicTools.listClinicRoles */
export interface ClinicRole {
  _id: Id<'clinicRoles'>
  name: string
  /** Empty means full access */
  permissions: ClinicArea[]
  memberCount: number
}

/** Shape returned by api.clinicTools.getClinicFrontDeskStaff */
export interface FrontDeskMember {
  userId: Id<'users'>
  firstName: string
  lastName: string
  email: string
  status: string
  clinicRoleId: Id<'clinicRoles'> | null
  joinedAt: number
}

/** Shape of each item from api.clinics.getClinicInvitations that the Team page uses */
export interface StaffInvitation {
  _id: Id<'clinicStaffInvitations'>
  _creationTime: number
  inviteeEmail: string
  inviteeName?: string
  /** "physiotherapist" for clinicians; "receptionist" or "admin" for front desk */
  role: string
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  clinicRoleId?: Id<'clinicRoles'>
  isExpired: boolean
}

/** Select value used for "no role" (full access). */
export const FULL_ACCESS = 'full'

/** The readable reason from a Convex error (ConvexError data), or the fallback. */
export function teamError(err: unknown, fallback: string) {
  if (err instanceof ConvexError && typeof err.data === 'string' && err.data.trim()) return err.data
  return friendlyError(err, fallback)
}

/** "Appointments, Patients", or "Full access" when no pages are ticked. */
export function roleSummary(permissions: readonly string[]) {
  const pages = CLINIC_AREAS.filter((area) => permissions.includes(area))
  return pages.length === 0 ? 'Full access' : pages.map((area) => CLINIC_AREA_LABELS[area]).join(', ')
}

/** Role name for a member, falling back to full access when they have none (or it was deleted). */
export function roleLabel(roleId: string | null | undefined, roles: ClinicRole[] | undefined) {
  if (!roleId) return 'Full access'
  return roles?.find((r) => r._id === roleId)?.name ?? 'Full access'
}

export const pluralPeople = (count: number) => (count === 1 ? '1 person' : `${count} people`)

/** Suggested starting points shown before the owner has made any roles. */
export const ROLE_TEMPLATES: { name: string; permissions: ClinicArea[] }[] = [
  { name: 'Clinician', permissions: ['appointments', 'patients', 'referrals'] },
  { name: 'Lead clinician', permissions: ['appointments', 'patients', 'referrals', 'team', 'reports'] },
]

/** Teal checkbox to match the clinic accent. */
export const checkboxClass =
  'border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-950 data-[state=checked]:border-[#005b57] data-[state=checked]:bg-[#005b57] data-[state=checked]:text-white dark:data-[state=checked]:border-[#2dd4bf] dark:data-[state=checked]:bg-[#2dd4bf] dark:data-[state=checked]:text-neutral-950'
