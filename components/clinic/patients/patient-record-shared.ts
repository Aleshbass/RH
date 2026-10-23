'use client'

import { useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '@/convex/_generated/api'

/** Turns a Convex server error into the plain sentence thrown by the backend. */
export function friendlyError(err: unknown, fallback: string) {
  // ConvexError carries the readable message in `data`, also in production
  if (err instanceof ConvexError) {
    return typeof err.data === 'string' && err.data.trim() ? err.data : fallback
  }
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const match = raw.match(/Uncaught (?:Convex)?Error:\s*(.+?)(?:\n|\s+at\s|$)/)
  const message = (match?.[1] ?? raw).trim()
  if (!message || message.includes('[CONVEX') || message.includes('Request ID') || message === 'Server Error') {
    return fallback
  }
  return message
}

export const fieldClass = 'text-sm bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800'
export const labelClass = 'text-xs font-medium text-neutral-700 dark:text-neutral-300'

/** No id to send to the backend (nothing chosen yet). */
export const isMissingId = (id: string | null | undefined) => !id

export interface ClinicianOption {
  id: string
  label: string
}

/** Row shape returned by api.clinicTools.getClinicClinicianOptions */
type ClinicianRow = { id: string; name: string; isOwner: boolean; isMe: boolean }

/**
 * Everyone who can take on a patient: the owner and active clinicians, with the
 * signed-in person shown as "You" first.
 *
 * `ownerId` is the clinician the backend uses when none is passed: the signed-in person
 * if they treat patients, otherwise (front-desk staff) the clinic owner.
 */
export function useClinicianOptions() {
  const clinicians = useQuery(api.clinicTools.getClinicClinicianOptions)

  const list = (clinicians ?? []) as ClinicianRow[]
  const me = list.find((c) => c.isMe) ?? null
  const owner = list.find((c) => c.isOwner) ?? null
  const options: ClinicianOption[] = [
    ...(me ? [{ id: me.id as string, label: 'You' }] : []),
    ...list
      .filter((c) => !c.isMe)
      .map((c) => ({ id: c.id as string, label: c.isOwner ? `${c.name} (owner)` : c.name })),
  ].filter((o) => !isMissingId(o.id))

  const defaultId = me?.id ?? owner?.id ?? null
  return {
    ownerId: defaultId && !isMissingId(defaultId) ? (defaultId as string) : null,
    meId: me && !isMissingId(me.id) ? (me.id as string) : null,
    options,
    loading: clinicians === undefined,
  }
}
