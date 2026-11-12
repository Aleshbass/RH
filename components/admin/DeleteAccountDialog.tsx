'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { toast } from 'sonner'
import type { Id } from '@/convex/_generated/dataModel'
import { ConfirmDialog } from '@/components/admin/ui'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/components/partners/portal/shared'
import { playSound } from '@/lib/sounds'

type ClosurePreview = {
  name: string
  role: string | null
  closable: boolean
  isMe: boolean
  alreadyClosed: boolean
  upcomingVisits: number
  activePatients: number
  clinics: { id: string; name: string; suspended: boolean; teamCount: number }[]
  memberOf: { id: string; name: string } | null
} | null

// makeFunctionReference keeps the admin pages clear of the generated api types (TS2589)
const previewRef = makeFunctionReference<'query', { userId: Id<'users'> }, ClosurePreview>('users:adminAccountClosurePreview')
const closeRef = makeFunctionReference<
  'mutation',
  { userId: Id<'users'>; confirm: 'DELETE'; reason?: string },
  { success: boolean; clinicsSuspended: string[] }
>('users:adminCloseAccount')

const ROLE_WORD: Record<string, string> = {
  physiotherapist: 'clinician',
  clinic_owner: 'clinic owner',
  clinic_staff: 'clinic staff member',
}

/**
 * Delete a clinician's, clinic owner's or clinic staff member's account (convex/users.ts
 * adminCloseAccount). Their sign-in and personal details go; patients' visits, notes, invoices and
 * payments stay. Refused while they have upcoming visits; the admin types DELETE to confirm.
 */
export function DeleteAccountDialog({
  userId,
  open,
  onOpenChange,
  onDeleted,
}: {
  userId: Id<'users'>
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const preview = useQuery(previewRef, open ? { userId } : 'skip')
  const close = useMutation(closeRef)
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!open) {
      setTyped('')
      setReason('')
    }
  }, [open])

  const role = preview?.role ? (ROLE_WORD[preview.role] ?? preview.role) : 'account'
  const blocker = !preview
    ? null
    : preview.isMe
      ? "You can't delete your own account."
      : preview.alreadyClosed
        ? 'This account has already been deleted.'
        : !preview.closable
          ? 'Only clinicians, clinic owners and clinic staff can be deleted here.'
          : preview.upcomingVisits > 0
            ? `${preview.name} has ${preview.upcomingVisits} upcoming visit${preview.upcomingVisits === 1 ? '' : 's'}. Cancel or reassign ${preview.upcomingVisits === 1 ? 'it' : 'them'} first, then come back to delete the account.`
            : null

  const confirm = async () => {
    try {
      const result = await close({ userId, confirm: 'DELETE', reason: reason.trim() || undefined })
      playSound('reject')
      toast.success(`${preview?.name ?? 'The account'} was deleted`, {
        description: result.clinicsSuspended.length ? `${result.clinicsSuspended.join(', ')} ${result.clinicsSuspended.length === 1 ? 'is' : 'are'} now suspended.` : undefined,
      })
      onDeleted?.()
    } catch (error) {
      toast.error('Could not delete this account', { description: errorMessage(error, 'Please try again.') })
      throw error
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={preview ? `Delete ${preview.name}'s ${role} account?` : 'Delete this account?'}
      description="This can't be undone."
      confirmLabel="Delete account"
      destructive
      confirmDisabled={!preview || Boolean(blocker) || typed !== 'DELETE'}
      onConfirm={confirm}
    >
      {preview === undefined ? (
        <p className="text-sm text-neutral-500">Checking what this would affect…</p>
      ) : preview === null ? (
        <p className="text-sm text-neutral-500">This account no longer exists.</p>
      ) : blocker ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{blocker}</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-semibold text-rh-ink dark:text-white">What happens</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-neutral-600 dark:text-white/70">
              <li>Their sign-in is deleted, so they can no longer sign in.</li>
              <li>Their name, contact details and profile are erased, and they leave the marketplace.</li>
              {preview.activePatients > 0 && (
                <li>
                  {preview.activePatients} patient{preview.activePatients === 1 ? ' is' : 's are'} no longer linked to them.
                </li>
              )}
              {preview.clinics.map((clinic) => (
                <li key={clinic.id}>
                  {clinic.name} is {clinic.suspended ? 'already suspended and stays so' : 'suspended'}
                  {clinic.teamCount > 0 ? `; its ${clinic.teamCount} team member${clinic.teamCount === 1 ? '' : 's'} keep read-only access` : ''}.
                </li>
              ))}
              {preview.memberOf && <li>They leave {preview.memberOf.name}&apos;s team.</li>}
            </ul>
          </div>
          <p className="text-neutral-600 dark:text-white/70">
            <span className="font-semibold text-rh-ink dark:text-white">What stays:</span> patients&apos; past visits, clinical notes, invoices and
            payments, shown under &ldquo;Deleted user&rdquo;.
          </p>
          <label className="block">
            <span className="text-xs font-semibold text-neutral-500 dark:text-white/60">Reason (for the audit log, optional)</span>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} className="mt-1 rounded-xl" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-neutral-500 dark:text-white/60">Type DELETE to confirm</span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="mt-1 rounded-xl" placeholder="DELETE" />
          </label>
        </div>
      )}
    </ConfirmDialog>
  )
}
