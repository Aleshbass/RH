'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { format } from 'date-fns'
import { CheckCircle2, Clock, Loader2, ShieldAlert, Stethoscope, XCircle } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dangerButtonClass, EmptyState, Panel, primaryButtonClass, softButtonClass, tableWrapClass } from '@/components/admin/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { commissionSourceLabel, dialogClass, dialogTitleClass, errorMessage, formatKobo, labelClass, LoadingBlock, PartnerTypeBadge, textareaClass } from './shared'

/** api.commercialTerms.adminListPendingCommissions */
export type PendingCommission = {
  _id: Id<'partnerCommissions'>
  patientName: string | null
  trackingCode: string | null
  grossTransactionAmount: number
  commissionAmount: number
  netPayable: number
  source: string | null
  paymentMethod: string | null
  physiotherapistName: string | null
  earnedAt: number
  notes: string | null
  partnerCode: string
  partnerName: string
  partnerType: string | null
  invoiceNumber: string | null
  invoicePaymentMethod: string | null
  clinicName: string | null
}

const PAID_BY: Record<string, string> = {
  cash: 'Cash',
  pos: 'POS',
  bank_transfer: 'Transfer to the clinic',
  transfer: 'Transfer to the clinic',
  card: 'Card',
}

/**
 * Commissions on invoice payments a clinic or physio recorded by hand. Rehabify didn't see that
 * money arrive, so each one waits here until an admin approves (payable from the next payout)
 * or cancels it.
 */
export function PendingCommissionsPanel({ rows }: { rows: PendingCommission[] | undefined }) {
  const review = useMutation(api.commercialTerms.adminReviewCommission)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<PendingCommission | null>(null)
  const [reason, setReason] = useState('')

  const approve = async (row: PendingCommission) => {
    setBusyId(row._id)
    try {
      await review({ commissionId: row._id, action: 'approve' })
      playSound('approve')
      toast.success(`Approved. ${formatKobo(row.netPayable)} is payable to ${row.partnerName} in the next payout.`)
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Could not approve this commission'))
    } finally {
      setBusyId(null)
    }
  }

  const cancel = async () => {
    if (!cancelling) return
    const trimmed = reason.trim()
    if (trimmed.length < 5) {
      toast.error('Give a short reason (at least 5 characters).')
      return
    }
    setBusyId(cancelling._id)
    try {
      await review({ commissionId: cancelling._id, action: 'cancel', reason: trimmed })
      playSound('reject')
      toast.info('Commission cancelled. It won’t be paid out.')
      setCancelling(null)
      setReason('')
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Could not cancel this commission'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Commissions awaiting approval
          {rows && rows.length > 0 && (
            <span className="rounded-full bg-rh-amber px-1.5 text-[11px] font-semibold tabular-nums text-rh-ink">{rows.length}</span>
          )}
        </span>
      }
      description="Payments a clinic or physio recorded by hand (cash, POS, transfer). Rehabify didn't see this money arrive, so check with the clinic before approving."
    >
      {rows === undefined ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 />}
          title="Nothing waiting"
          description="Commissions from payments a clinic records by hand appear here for you to approve."
        />
      ) : (
        <div className={cn(tableWrapClass, 'px-2 pb-2')}>
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Referred by</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Net payable</TableHead>
                <TableHead>Earned</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const busy = busyId === row._id
                return (
                  <TableRow key={row._id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-medium text-rh-ink dark:text-white">
                        {row.partnerType === 'doctor' && <Stethoscope className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />}
                        {row.partnerName}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {row.partnerType && <PartnerTypeBadge type={row.partnerType} />}
                        <span className="font-mono text-[10px] text-neutral-400">{row.partnerCode}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-rh-ink dark:text-white">{row.patientName || 'Referred patient'}</div>
                      {row.trackingCode && <div className="font-mono text-[10px] text-neutral-400">{row.trackingCode}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="text-rh-ink dark:text-white">{row.clinicName || row.physiotherapistName || 'Provider'}</div>
                      <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                        {[row.invoiceNumber, row.invoicePaymentMethod ? PAID_BY[row.invoicePaymentMethod] ?? row.invoicePaymentMethod : null]
                          .filter(Boolean)
                          .join(' · ') || commissionSourceLabel(row.source, row.paymentMethod)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatKobo(row.grossTransactionAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatKobo(row.commissionAmount)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-rh-ink dark:text-white">{formatKobo(row.netPayable)}</TableCell>
                    <TableCell className="whitespace-nowrap text-neutral-500 dark:text-neutral-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(row.earnedAt, 'd MMM yyyy')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" disabled={busy} onClick={() => approve(row)} className={cn(primaryButtonClass, 'h-8 px-3 text-xs')}>
                          {busy && !cancelling ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            setReason('')
                            setCancelling(row)
                          }}
                          className={cn(softButtonClass, 'h-8 px-2.5 text-xs')}
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" /> Cancel
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!cancelling} onOpenChange={(open) => !open && busyId === null && setCancelling(null)}>
        <DialogContent className={`${dialogClass} sm:max-w-[460px]`}>
          {cancelling && (
            <>
              <DialogHeader>
                <DialogTitle className={dialogTitleClass}>
                  <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-300" />
                  Cancel this commission?
                </DialogTitle>
                <DialogDescription>
                  {formatKobo(cancelling.netPayable)} for <strong className="text-rh-ink dark:text-white">{cancelling.partnerName}</strong> won&apos;t be
                  paid out. The reason is kept on the referral&apos;s record.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <label htmlFor="cancel-commission-reason" className={labelClass}>
                  Reason
                </label>
                <textarea
                  id="cancel-commission-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={300}
                  className={textareaClass}
                  placeholder="e.g. The clinic says this invoice was never paid."
                />
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setCancelling(null)} disabled={busyId !== null} className={softButtonClass}>
                  Keep it
                </Button>
                <Button onClick={cancel} disabled={busyId !== null || reason.trim().length < 5} className={dangerButtonClass}>
                  {busyId !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cancel commission
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  )
}
