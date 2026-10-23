'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Loader2, ShieldAlert } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { dangerButtonClass, softButtonClass } from '@/components/admin/ui'
import { playSound } from '@/lib/sounds'
import { dialogClass, dialogTitleClass, errorMessage, labelClass, textareaClass } from './shared'

export type PartnerApplication = FunctionReturnType<typeof api.adminPartnerships.getPartnerApplications>[number]

type ProductionAction = 'approve' | 'reject' | 'suspend' | 'reinstate'

const PRODUCTION_MESSAGES: Record<ProductionAction, string> = {
  approve: 'Production access approved. The partner can now create live keys, webhooks and links.',
  reinstate: 'Production access reinstated.',
  reject: 'Go-live request declined. The partner has been emailed the reason.',
  suspend: 'Production access suspended. Live API keys stop working immediately.',
}

/**
 * Application and go-live review actions with toasts and sounds. Each returns true on
 * success so dialogs know whether to close.
 */
export function usePartnerReview() {
  const reviewApplication = useMutation(api.adminPartnerships.reviewPartnerApplication)
  const reviewProductionAccess = useMutation(api.adminPartnerships.reviewProductionAccess)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reviewPartner = async (partner: PartnerApplication, action: 'approve' | 'reject', reason?: string) => {
    setBusyId(partner._id)
    try {
      await reviewApplication({ partnerId: partner._id, action, reason })
      if (action === 'approve') {
        playSound('approve')
        toast.success(
          partner.type === 'doctor'
            ? `${partner.name} is approved and live. They can refer patients now.`
            : 'Partner approved. Sandbox access is active; live access needs a separate go-live approval.'
        )
      } else {
        playSound('reject')
        toast.info('Partner access declined. The partner has been emailed the reason.')
      }
      return true
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Failed to update partner application'))
      return false
    } finally {
      setBusyId(null)
    }
  }

  const reviewProduction = async (partner: PartnerApplication, action: ProductionAction, reason?: string) => {
    setBusyId(partner._id)
    try {
      await reviewProductionAccess({ partnerId: partner._id, action, reason })
      playSound(action === 'approve' || action === 'reinstate' ? 'approve' : 'reject')
      toast.success(PRODUCTION_MESSAGES[action])
      return true
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Failed to update production access'))
      return false
    } finally {
      setBusyId(null)
    }
  }

  return { busyId, reviewPartner, reviewProduction }
}

export type PartnerReview = ReturnType<typeof usePartnerReview>

/** What the reason dialog is for. Declines, revocations and suspensions always carry a reason the partner sees. */
export type ReasonRequest =
  | { kind: 'application'; partner: PartnerApplication }
  | { kind: 'production'; action: 'reject' | 'suspend'; partner: PartnerApplication }

function reasonTitle(request: ReasonRequest) {
  if (request.kind === 'application') {
    return request.partner.approvalStatus === 'approved' ? 'Revoke partner access' : 'Decline application'
  }
  return request.action === 'suspend' ? 'Suspend production access' : 'Decline go-live request'
}

export function ReasonDialog({
  request,
  onClose,
  review,
}: {
  request: ReasonRequest | null
  onClose: () => void
  review: PartnerReview
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const trimmed = reason.trim()

  const close = () => {
    if (submitting) return
    setReason('')
    onClose()
  }

  const submit = async () => {
    if (!request) return
    if (trimmed.length < 5) {
      toast.error('Give a short reason (at least 5 characters). The partner will see it.')
      return
    }
    setSubmitting(true)
    const ok =
      request.kind === 'application'
        ? await review.reviewPartner(request.partner, 'reject', trimmed)
        : await review.reviewProduction(request.partner, request.action, trimmed)
    setSubmitting(false)
    if (ok) {
      setReason('')
      onClose()
    }
  }

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && close()}>
      <DialogContent className={`${dialogClass} sm:max-w-[460px]`}>
        {request && (
          <>
            <DialogHeader>
              <DialogTitle className={dialogTitleClass}>
                <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-300" />
                {reasonTitle(request)}
              </DialogTitle>
              <DialogDescription>
                <strong className="text-rh-night dark:text-white">{request.partner.name}</strong> will see this reason in their email and in the
                Partner Portal.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label htmlFor="partner-review-reason" className={labelClass}>
                Reason
              </label>
              <textarea
                id="partner-review-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                maxLength={500}
                className={textareaClass}
                placeholder={
                  request.partner.type === 'doctor'
                    ? "e.g. We couldn't find this folio number on the MDCN register."
                    : 'e.g. Webhook endpoint is still failing signature verification in sandbox.'
                }
              />
              {request.kind === 'production' && request.action === 'suspend' && (
                <p className="text-[11px] text-rose-700 dark:text-rose-300">
                  Live API keys stop working immediately (403 production_access_required). Sandbox access is not affected.
                </p>
              )}
              {request.kind === 'application' && request.partner.approvalStatus === 'approved' && (
                <p className="text-[11px] text-rose-700 dark:text-rose-300">This revokes portal and API access in both sandbox and live.</p>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={close} disabled={submitting} className={softButtonClass}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={submitting || trimmed.length < 5} className={dangerButtonClass}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
