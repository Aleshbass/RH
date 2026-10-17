'use client'

import { useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { CheckCircle2, Landmark, Loader2, Send, ShieldCheck, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { Callout, dialogClass, dialogTitleClass, errorMessage, formatKobo, hintClass, labelClass, SummaryRow } from './shared'

export type PayoutSummary = FunctionReturnType<typeof api.monthlySettlements.getMonthlyBulkPayoutSummary>
export type PayoutPartner = PayoutSummary['partners'][number]
export type PaystackBalance = { balanceNaira: number; balanceKobo: number }

export type PayoutTarget = {
  partner: PayoutPartner
  /** Set when reopening a Paystack transfer that is waiting for its OTP. */
  resumeOtp?: { transferCode: string; transferReference: string }
}

const feesKobo = (p: PayoutPartner) => (p.estimatedOutboundFeeKobo || 0) + (p.estimatedStampDutyKobo || 0)
export const netPayoutKobo = (p: PayoutPartner) => p.estimatedNetPayoutKobo || p.totalPartnerCommission

/** Pays one partner everything payable up to the billing period, via Paystack or a recorded manual wire. */
export function PayoutDialog({
  target,
  billingPeriod,
  onClose,
  onPaid,
}: {
  target: PayoutTarget | null
  billingPeriod: string
  onClose: () => void
  onPaid: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className={`${dialogClass} sm:max-w-[500px]`}>
        {target && (
          <PayoutForm
            key={`${target.partner.partnerId}-${target.resumeOtp?.transferCode ?? 'new'}`}
            target={target}
            billingPeriod={billingPeriod}
            onClose={onClose}
            onPaid={onPaid}
            onBusyChange={setBusy}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PayoutForm({
  target,
  billingPeriod,
  onClose,
  onPaid,
  onBusyChange,
}: {
  target: PayoutTarget
  billingPeriod: string
  onClose: () => void
  onPaid: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const partner = target.partner
  const executeTransfer = useAction(api.monthlySettlements.executePartnerPayoutTransfer)
  const finalizeTransfer = useAction(api.monthlySettlements.finalizePartnerPayoutTransfer)
  const recordManualPayout = useMutation(api.monthlySettlements.processMonthlyBulkPayout)

  const [mode, setMode] = useState<'paystack' | 'manual'>('paystack')
  const [note, setNote] = useState('')
  const [pendingOtp, setPendingOtp] = useState(target.resumeOtp ?? null)
  const [otp, setOtp] = useState('')
  const [processing, setProcessingState] = useState(false)
  const setProcessing = (value: boolean) => {
    setProcessingState(value)
    onBusyChange(value)
  }

  const finish = () => {
    playSound('paid')
    onPaid()
    onClose()
  }

  const confirm = async () => {
    setProcessing(true)
    try {
      if (mode === 'paystack') {
        const res = await executeTransfer({ partnerCode: partner.partnerId, billingPeriod, note: note.trim() || undefined })
        if (res.requiresOtp) {
          setPendingOtp({ transferCode: res.transferCode, transferReference: res.transferReference })
          toast.info('Paystack needs an OTP to authorise this transfer. Enter the code below.')
          return
        }
        toast.success(res.message || 'Payout transfer submitted')
      } else {
        const res = await recordManualPayout({ partnerCode: partner.partnerId, billingPeriod, note: note.trim() || undefined })
        toast.success(res.message || 'Manual payout recorded')
      }
      finish()
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Failed to process payout'))
    } finally {
      setProcessing(false)
    }
  }

  const authorise = async () => {
    if (!pendingOtp || !otp.trim()) return
    setProcessing(true)
    try {
      const res = await finalizeTransfer({
        transferCode: pendingOtp.transferCode,
        otp: otp.trim(),
        partnerCode: partner.partnerId,
        billingPeriod,
        transferReference: pendingOtp.transferReference,
      })
      toast.success(res.message || 'Transfer authorised')
      finish()
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Failed to authorise the transfer'))
    } finally {
      setProcessing(false)
    }
  }

  const modeButton = (value: 'paystack' | 'manual', label: string, Icon: typeof Send) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      disabled={!!pendingOtp}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50',
        mode === value ? 'bg-white text-rh-teal shadow-soft dark:bg-rh-ink-3 dark:text-rh-aqua' : 'text-neutral-500 hover:text-rh-night dark:text-neutral-400 dark:hover:text-white'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )

  return (
    <>
      <DialogHeader>
        <DialogTitle className={dialogTitleClass}>
          <Wallet className="h-5 w-5 text-rh-teal dark:text-rh-aqua" />
          Pay partner commission
        </DialogTitle>
        <DialogDescription>
          Pays every approved, unpaid commission for <strong className="text-rh-night dark:text-white">{partner.partnerName}</strong> up to and
          including <strong className="text-rh-night dark:text-white">{billingPeriod}</strong>.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-rh-canvas p-1 dark:bg-white/[0.04]">
          {modeButton('paystack', 'Paystack transfer', Send)}
          {modeButton('manual', 'Manual wire', Landmark)}
        </div>

        <div className="space-y-2 rounded-xl bg-rh-mist p-3.5 dark:bg-rh-aqua/[0.08]">
          <SummaryRow label="Payable commission" value={formatKobo(partner.totalPartnerCommission)} />
          <SummaryRow label="Transfer fee + stamp duty" value={<span className="text-rose-600 dark:text-rose-300">-{formatKobo(feesKobo(partner))}</span>} />
          <div className="border-t border-rh-teal/10 pt-2 dark:border-white/10">
            <SummaryRow label="Net amount" value={formatKobo(netPayoutKobo(partner))} strong />
          </div>
        </div>

        {mode === 'paystack' ? (
          <div className="space-y-3">
            {partner.hasBankAccount ? (
              <div className="space-y-1 rounded-xl bg-rh-canvas p-3 text-xs dark:bg-white/[0.04]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Verified bank account
                  </span>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{partner.bankName}</span>
                </div>
                <p className="font-medium text-rh-night dark:text-white">{partner.bankAccountName}</p>
                <p className="font-mono text-neutral-500 dark:text-neutral-400">{partner.maskedAccountNumber}</p>
              </div>
            ) : (
              <Callout tone="warning" title="No verified bank account">
                The partner must add a verified NUBAN account in the Partner Portal before a Paystack transfer. To record an offline payment, switch
                to Manual wire.
              </Callout>
            )}
            <p className={hintClass}>
              Commissions are reserved when the transfer starts and marked paid only when Paystack confirms it. A failed or reversed transfer
              releases them for the next payout.
            </p>
            {pendingOtp ? (
              <div className="space-y-2 rounded-xl bg-rh-peach p-3.5 dark:bg-amber-400/10">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-[#8a4b08] dark:text-amber-200">
                  <ShieldCheck className="h-4 w-4" /> Paystack OTP
                </p>
                <p className="text-[11px] text-[#8a4b08]/80 dark:text-amber-200/80">
                  Paystack sent a one-time code to the account&apos;s authorised phone or email. Enter it to authorise this transfer.
                </p>
                <Input
                  placeholder="Enter OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className={cn(inputClass, 'text-center font-mono tracking-widest')}
                  maxLength={8}
                  autoFocus
                  inputMode="numeric"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label htmlFor="payout-note" className={labelClass}>
                  Transfer memo (optional)
                </label>
                <Input
                  id="payout-note"
                  placeholder="e.g. September commission settlement"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="payout-wire-ref" className={labelClass}>
              Bank transfer reference / note
            </label>
            <Input
              id="payout-wire-ref"
              placeholder="e.g. Zenith wire ref PAY-2026-09"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
            />
            <Callout tone="warning">
              Only use this after the money has left your bank. Every payable commission up to this cycle is marked paid immediately, and the reference
              shows in the partner&apos;s ledger.
            </Callout>
          </div>
        )}
      </div>

      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={onClose} disabled={processing} className={softButtonClass}>
          Cancel
        </Button>
        {pendingOtp && mode === 'paystack' ? (
          <Button onClick={authorise} disabled={processing || !otp.trim()} className={primaryButtonClass}>
            {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Authorise transfer
          </Button>
        ) : (
          <Button
            onClick={confirm}
            disabled={processing || (mode === 'paystack' && !partner.hasBankAccount)}
            className={primaryButtonClass}
          >
            {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === 'paystack' ? <Send className="mr-2 h-4 w-4" /> : null}
            {mode === 'paystack' ? `Send ${formatKobo(netPayoutKobo(partner))}` : 'Confirm wire was sent'}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}

/** One Paystack bulk transfer for every partner with a verified bank account and a positive balance. */
export function BulkPayoutDialog({
  open,
  summary,
  balance,
  billingPeriod,
  onClose,
  onPaid,
}: {
  open: boolean
  summary: PayoutSummary | undefined
  balance: PaystackBalance | null
  billingPeriod: string
  onClose: () => void
  onPaid: () => void
}) {
  const executeBulk = useAction(api.monthlySettlements.executePaystackBulkMonthlyPayout)
  const [processing, setProcessing] = useState(false)

  const partners: PayoutPartner[] = summary?.partners ?? []
  const eligible = partners.filter((p) => !p.activeTransfer && p.totalPartnerCommission > 0 && p.hasBankAccount && p.estimatedNetPayoutKobo > 0)
  const withoutBank = partners.filter((p) => !p.activeTransfer && p.totalPartnerCommission > 0 && !p.hasBankAccount)
  const totalKobo = eligible.reduce((sum: number, p: PayoutPartner) => sum + netPayoutKobo(p), 0)

  const disburse = async () => {
    setProcessing(true)
    try {
      const res = await executeBulk({ billingPeriod })
      playSound('paid')
      toast.success(res.message || 'Bulk payout submitted')
      onPaid()
      onClose()
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Failed to execute bulk payout'))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !processing && onClose()}>
      <DialogContent className={`${dialogClass} sm:max-w-[480px]`}>
        <DialogHeader>
          <DialogTitle className={dialogTitleClass}>
            <Send className="h-5 w-5 text-rh-teal dark:text-rh-aqua" />
            Pay all partners
          </DialogTitle>
          <DialogDescription>
            Sends one Paystack bulk transfer for everything payable up to <strong className="text-rh-night dark:text-white">{billingPeriod}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2 rounded-xl bg-rh-mist p-4 dark:bg-rh-aqua/[0.08]">
            <SummaryRow label="Partners included" value={`${eligible.length}`} />
            <SummaryRow label="Total net transfer" value={formatKobo(totalKobo)} strong />
            <div className="border-t border-rh-teal/10 pt-2 dark:border-white/10">
              <SummaryRow label="Paystack balance" value={balance ? formatKobo(balance.balanceKobo) : 'Checking…'} />
            </div>
          </div>
          {withoutBank.length > 0 && (
            <Callout tone="warning" title={`${withoutBank.length} partner${withoutBank.length === 1 ? '' : 's'} left out (no verified bank account)`}>
              {withoutBank.map((p) => p.partnerName).join(', ')} will be included once they add a verified bank account.
            </Callout>
          )}
          {balance && balance.balanceKobo < totalKobo && (
            <Callout tone="danger" title="Not enough Paystack balance">
              Available {formatKobo(balance.balanceKobo)}, needed {formatKobo(totalKobo)}. Top up from the Paystack dashboard first.
            </Callout>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={processing} className={softButtonClass}>
            Cancel
          </Button>
          <Button onClick={disburse} disabled={processing || eligible.length === 0} className={primaryButtonClass}>
            {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send {formatKobo(totalKobo)} to {eligible.length} partner{eligible.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
