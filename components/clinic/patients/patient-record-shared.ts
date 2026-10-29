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

export const fieldClass = 'rounded-xl text-sm bg-pt-surface text-pt-ink border-pt-line-strong placeholder:text-pt-faint'
export const labelClass = 'text-xs font-medium text-pt-ink'

/** No id to send to the backend (nothing chosen yet). */
export const isMissingId = (id: string | null | undefined) => !id

export interface ClinicianOption {
  id: string
  label: string
}

/** Row shape returned by api.clinicTools.getClinicClinicianOptions */
type ClinicianRow = { id: string; name: string; isOwner: boolean; isMe: boolean }

/**
 * Everyone who can take on a patient: the clinic's active clinicians. The owner's account runs
 * the clinic and doesn't treat (owner decision, 28 Oct 2026), so it's never offered.
 *
 * `ownerId` is the clinic owner's id (patients waiting for a clinician sit with them), and
 * `defaultId` the clinician to preselect when there's only one.
 */
export function useClinicianOptions() {
  const clinicians = useQuery(api.clinicTools.getClinicClinicianOptions)

  const list = (clinicians ?? []) as ClinicianRow[]
  const me = list.find((c) => c.isMe && !c.isOwner) ?? null
  const owner = list.find((c) => c.isOwner) ?? null
  const options: ClinicianOption[] = list
    .filter((c) => !c.isOwner)
    .map((c) => ({ id: c.id as string, label: c.isMe ? 'You' : c.name }))
    .filter((o) => !isMissingId(o.id))

  return {
    ownerId: owner && !isMissingId(owner.id) ? (owner.id as string) : null,
    meId: me && !isMissingId(me.id) ? (me.id as string) : null,
    defaultId: options.length === 1 ? options[0].id : null,
    options,
    loading: clinicians === undefined,
  }
}
