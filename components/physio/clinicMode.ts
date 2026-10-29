'use client'

/**
 * Clinic mode of the physio portal: a physiotherapist on a clinic's team works here with the same
 * clinical tools as everyone else, under the clinic's name and plan rules. Read from
 * clinicTools.getMyClinicAccess, which the sidebar and shell already load (one subscription).
 */

import { api } from '@/convex/_generated/api'
import { useQueryUntyped } from '@/lib/convexUntyped'
import type { ClinicArea } from '@/components/clinic/ClinicAccessContext'
import { CLINIC_PORTAL_HOME } from '@/components/clinic/clinician-routing'

const root = api as unknown as Record<string, Record<string, unknown>>

type Access =
  | {
      mode: 'owner' | 'staff'
      staffKind?: string
      clinicName?: string
      logoUrl?: string | null
      permissions?: 'all' | ClinicArea[]
      suspended?: boolean
      clinicSuspended?: boolean
      billingReadOnly?: boolean
    }
  | { mode: 'none' }

export type ClinicMode = {
  /** False until access has loaded */
  loaded: boolean
  /** A clinician on a clinic's team */
  active: boolean
  clinicName: string | null
  logoUrl: string | null
  canUse: (area: ClinicArea) => boolean
  /** Clinic pages their role adds beyond their own clinical work, first one first */
  adminHref: string | null
  /** Changes are refused: the clinic or their access is suspended, or a Rehabify invoice is overdue */
  readOnly: boolean
}

const ADMIN_PAGES: { area: ClinicArea; href: string }[] = [
  { area: 'billing', href: `${CLINIC_PORTAL_HOME}/billing` },
  { area: 'team', href: `${CLINIC_PORTAL_HOME}/staff` },
  { area: 'reports', href: `${CLINIC_PORTAL_HOME}/analytics` },
  { area: 'inventory', href: `${CLINIC_PORTAL_HOME}/inventory` },
  { area: 'settings', href: `${CLINIC_PORTAL_HOME}/settings` },
]

export function useClinicMode(): ClinicMode {
  const access = useQueryUntyped(root.clinicTools.getMyClinicAccess, {}) as Access | undefined
  const member = access && access.mode === 'staff' && access.staffKind === 'clinician' ? access : null
  const canUse = (area: ClinicArea) =>
    Boolean(member) && (member?.permissions === 'all' || (member?.permissions ?? []).includes(area))
  return {
    loaded: access !== undefined,
    active: Boolean(member),
    clinicName: member?.clinicName ?? null,
    logoUrl: member?.logoUrl ?? null,
    canUse,
    adminHref: member ? (ADMIN_PAGES.find((page) => canUse(page.area))?.href ?? null) : null,
    readOnly: Boolean(member && (member.suspended || member.clinicSuspended || member.billingReadOnly)),
  }
}
