'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

/** Turns a Convex server error into the plain sentence thrown by the backend. */
export function friendlyError(err: unknown, fallback: string) {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const match = raw.match(/Uncaught Error:\s*(.+?)(?:\n|\s+at\s|$)/)
  const message = (match?.[1] ?? raw).trim()
  if (!message || message.includes('[CONVEX') || message.includes('Request ID')) return fallback
  return message
}

export const fieldClass = 'text-sm bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800'
export const labelClass = 'text-xs font-medium text-neutral-700 dark:text-neutral-300'

/** Preview/sample ids are never sent to the backend. */
export const isPreviewId = (id: string | null | undefined) => !id || String(id).startsWith('prev_')

export interface ClinicianOption {
  id: string
  label: string
}

/**
 * Everyone who can take on a patient: the owner ("You") first, then active clinic staff.
 * Built the same way as the Add patient form (getClinicStaff + getMyUser).
 */
export function useClinicianOptions() {
  const me = useQuery(api.users.getMyUser)
  const clinicStaff = useQuery(api.clinics.getClinicStaff)

  const ownerId = me?._id && !isPreviewId(me._id) ? (me._id as string) : null
  const options: ClinicianOption[] = []
  if (ownerId) options.push({ id: ownerId, label: 'You' })
  for (const s of clinicStaff ?? []) {
    const id = String(s.userId || s._id)
    if (isPreviewId(id) || id === ownerId || options.some((o) => o.id === id)) continue
    if ((s.status ?? 'active') !== 'active') continue
    const name = `${s.user?.firstName || ''} ${s.user?.lastName || ''}`.trim() || s.user?.email || 'Clinician'
    options.push({ id, label: name })
  }

  return { ownerId, options, loading: me === undefined || clinicStaff === undefined }
}
