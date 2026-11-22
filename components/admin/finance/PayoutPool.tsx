'use client'

/**
 * Money routing › the payout pool and Rehabify's fees (full admins only). With routing on, the
 * Paystack balance holds clinicians' money (payouts) and some of Rehabify's own money (its fee on
 * clinic and independent-physio invoices). Two things keep the pool whole:
 *   - refunds of split payments come out of the balance: what the pool can't cover is owed by
 *     Rehabify, paid by a top-up from Rehabify's bank (recorded here);
 *   - Rehabify's fees waiting in the balance can be moved to Rehabify's bank (one Paystack transfer,
 *     confirmed by an admin), never more than the balance leaves after the clinicians' money.
 * Backend: convex/paystackRouting.ts; figures: convex/helpers/paystackRouting.ts (poolPosition).
 */

import { useCallback, useEffect, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { toast } from 'sonner'
import { AlertTriangle, Banknote, KeyRound, Loader2, Plus, RefreshCw, Search } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { formatLagos } from '@/convex/helpers/lagosTime'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog, Panel, StatusBadge, inputClass, primaryButtonClass, softButtonClass, tableWrapClass } from '@/components/admin/ui'
import { errorText, formatKobo } from '@/components/admin/finance/format'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type SweepStatus = 'sending' | 'pending' | 'otp_required' | 'success' | 'failed' | 'reversed'
type LedgerRow = {
  _id: Id<'paystackPoolLedger'>
  amountKobo: number
  createdAt: number
  paymentReference: string | null
  note: string | null
  status: SweepStatus | null
  transferReference: string | null
  failureReason: string | null
  completedAt: number | null
  byName: string | null
}
type PoolLedger = {
  mode: 'test' | 'live'
  routingOnSince: number | null
  feesEarnedKobo: number
  sweptKobo: number
  shortfallKobo: number
  topupKobo: number
  partnerPaidKobo: number
  owedKobo: number
  movableKobo: number
  unpaidPayoutsKobo: number
  upcomingKeptKobo: number
  transfersReady: boolean
  shortfalls: LedgerRow[]
  topups: LedgerRow[]
  sweeps: LedgerRow[]
  fees: LedgerRow[]
}
type BalanceResult = { ok: true; balanceKobo: number; mode: 'test' | 'live'; checkedAt: number } | { ok: false; message: string }
type MoveResult = { state: Exclude<SweepStatus, 'sending'>; message: string }

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const refs = {
  ledger: makeFunctionReference<'query', Record<string, never>, PoolLedger>('paystackRouting:adminPoolLedger'),
  topUp: makeFunctionReference<'mutation', { amountKobo: number; note?: string }, { ok: true }>('paystackRouting:adminRecordTopUp'),
  setupTransfers: makeFunctionReference<'action', { accountNumber: string }, { ok: true }>('paystackRouting:adminSetupFeeTransfers'),
  move: makeFunctionReference<'action', { amountKobo: number }, MoveResult>('paystackRouting:adminMoveFeesToBank'),
  check: makeFunctionReference<'action', { ledgerId: Id<'paystackPoolLedger'> }, MoveResult>('paystackRouting:adminCheckFeeSweep'),
  finalize: makeFunctionReference<'action', { ledgerId: Id<'paystackPoolLedger'>; otp: string }, { state: SweepStatus }>(
    'paystackRouting:adminFinalizeFeeSweep'
  ),
  balance: makeFunctionReference<'action', Record<string, never>, BalanceResult>('payouts:adminPaystackBalance'),
}

const muted = 'text-neutral-500 dark:text-neutral-400'
const strong = 'text-rh-ink dark:text-white'
const day = (ms: number) => formatLagos(ms, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB')

const SWEEP_BADGE: Record<SweepStatus, { tone: 'neutral' | 'green' | 'amber' | 'red'; label: string }> = {
  sending: { tone: 'neutral', label: 'Sending' },
  pending: { tone: 'neutral', label: 'Waiting for the bank' },
  otp_required: { tone: 'amber', label: 'Needs OTP' },
  success: { tone: 'green', label: 'Moved' },
  failed: { tone: 'red', label: 'Failed' },
  reversed: { tone: 'red', label: 'Reversed' },
}

/** Paystack's fee for one Naira transfer (₦10 / ₦25 / ₦50), kept aside like the server does. */
function transferFeeKobo(amountKobo: number) {
  if (amountKobo <= 500_000) return 1_000
  if (amountKobo <= 5_000_000) return 2_500
  return 5_000
}

/** Naira typed by an admin → kobo (null when it isn't a positive amount). */
function nairaToKobo(text: string): number | null {
  const value = Number(text.replace(/[,₦\s]/g, ''))
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null
}

export function PayoutPoolSection() {
  const ledger = useQuery(refs.ledger, {})
  if (ledger === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    )
  }
  return (
    <>
      <PoolPanel ledger={ledger} />
      <FeesPanel ledger={ledger} />
    </>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* What Rehabify owes the payout pool                                                             */
/* ---------------------------------------------------------------------------------------------- */

function PoolPanel({ ledger }: { ledger: PoolLedger }) {
  const topUp = useMutation(refs.topUp)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const record = async () => {
    const kobo = nairaToKobo(amount)
    if (!kobo) {
      toast.error('Enter the amount you topped up, in naira')
      throw new Error('amount required')
    }
    try {
      await topUp({ amountKobo: kobo, note: note.trim() || undefined })
      playSound('success')
      toast.success(`Top-up of ${formatKobo(kobo)} recorded`)
      setAmount('')
      setNote('')
    } catch (err) {
      toast.error('That didn’t work', { description: errorText(err) })
      throw err
    }
  }

  return (
    <Panel
      title="The payout pool"
      description="Clinicians’ money in the Paystack balance. Refunds of split payments come out of it; Rehabify tops it back up."
      actions={
        ledger.owedKobo > 0 ? <StatusBadge tone="amber">Owes {formatKobo(ledger.owedKobo)}</StatusBadge> : <StatusBadge tone="green">Whole</StatusBadge>
      }
    >
      <div className="space-y-4 px-5 pb-5 pt-2 text-sm">
        {ledger.owedKobo > 0 ? (
          <p className="flex items-start gap-2 rounded-xl bg-rh-peach px-3 py-2 text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Rehabify owes the payout pool {formatKobo(ledger.owedKobo)} for refunds{ledger.partnerPaidKobo > 0 ? ' and partner payouts' : ''}. Top up the
              Paystack balance by {formatKobo(ledger.owedKobo)} from Rehabify’s bank (Paystack › Balance › Top up), then record it here.
            </span>
          </p>
        ) : (
          <p className={muted}>Rehabify owes the pool nothing right now.</p>
        )}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Refunds taken from it', ledger.shortfallKobo],
            ['Partner payouts since on', ledger.partnerPaidKobo],
            ['Top-ups recorded', ledger.topupKobo],
            ['Rehabify’s fees covering it', Math.max(0, Math.min(ledger.feesEarnedKobo - ledger.sweptKobo, ledger.shortfallKobo + ledger.partnerPaidKobo - ledger.topupKobo))],
          ].map(([label, kobo]) => (
            <div key={label as string} className="rounded-xl bg-rh-canvas px-3.5 py-3 dark:bg-white/[0.04]">
              <dt className={cn('text-xs', muted)}>{label}</dt>
              <dd className={cn('mt-0.5 text-base font-semibold tabular-nums', strong)}>{formatKobo(kobo as number)}</dd>
            </div>
          ))}
        </dl>
        <p className={cn('text-xs', muted)}>
          A refund counts only the part the payment didn’t leave in the balance: e.g. ₦6,000 refunded on a booking that kept ₦4,200 for the physio
          (who then isn’t paid) owes ₦1,800. Rehabify’s fees still in the balance cover what’s owed first. Payments made before the switch went on
          aren’t counted.
        </p>
        <Button size="sm" className={softButtonClass} onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Record top-up
        </Button>

        <LedgerTable
          title="Refunds taken from the pool"
          rows={ledger.shortfalls}
          empty="No refunds have come out of the pool."
          detail={(r) => [r.paymentReference, r.note].filter(Boolean).join(' · ')}
        />
        <LedgerTable
          title="Top-ups"
          rows={ledger.topups}
          empty="No top-ups recorded yet."
          detail={(r) => [r.byName, r.note].filter(Boolean).join(' · ')}
        />
      </div>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Record a top-up"
        description="Only record money you’ve already moved from Rehabify’s bank into the Paystack balance (Paystack › Balance › Top up). It reduces what Rehabify owes the pool."
        confirmLabel="Record"
        onConfirm={record}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pool-topup-amount">Amount (₦)</Label>
            <Input id="pool-topup-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 1800" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pool-topup-note">Note (optional)</Label>
            <Input id="pool-topup-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Covers the refund for RH-P-0042" className={inputClass} />
          </div>
        </div>
      </ConfirmDialog>
    </Panel>
  )
}

function LedgerTable({ title, rows, empty, detail }: { title: string; rows: LedgerRow[]; empty: string; detail: (row: LedgerRow) => string }) {
  return (
    <div className="space-y-1.5">
      <p className={cn('text-xs font-semibold uppercase tracking-wide', muted)}>{title}</p>
      {rows.length === 0 ? (
        <p className={cn('text-sm', muted)}>{empty}</p>
      ) : (
        <div className={cn(tableWrapClass, 'rounded-xl border border-black/[0.05] dark:border-white/[0.06]')}>
          <Table>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r._id}>
                  <TableCell className={cn('whitespace-nowrap text-xs', muted)}>{day(r.createdAt)}</TableCell>
                  <TableCell className={cn('min-w-[200px] text-xs', muted)}>{detail(r) || '–'}</TableCell>
                  <TableCell className={cn('text-right text-sm font-semibold tabular-nums', strong)}>{formatKobo(r.amountKobo)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Move Rehabify's fees to the bank                                                               */
/* ---------------------------------------------------------------------------------------------- */

type BalanceState = { status: 'loading' } | { status: 'ok'; balanceKobo: number } | { status: 'unknown'; message: string }

function FeesPanel({ ledger }: { ledger: PoolLedger }) {
  const checkBalance = useAction(refs.balance)
  const move = useAction(refs.move)
  const check = useAction(refs.check)
  const finalize = useAction(refs.finalize)
  const [balance, setBalance] = useState<BalanceState>({ status: 'loading' })
  const [moveOpen, setMoveOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [otpFor, setOtpFor] = useState<Id<'paystackPoolLedger'> | null>(null)
  const [otp, setOtp] = useState('')

  const refreshBalance = useCallback(async () => {
    setBalance({ status: 'loading' })
    try {
      const result = await checkBalance({})
      setBalance(result.ok ? { status: 'ok', balanceKobo: result.balanceKobo } : { status: 'unknown', message: result.message })
    } catch (err) {
      setBalance({ status: 'unknown', message: errorText(err) })
    }
  }, [checkBalance])
  useEffect(() => {
    void refreshBalance()
  }, [refreshBalance])

  // What may leave now: Rehabify's fees by the ledger, and what the live balance leaves after the
  // clinicians' money and the transfer fee (the server checks all of this again)
  const cliniciansKobo = ledger.unpaidPayoutsKobo + ledger.upcomingKeptKobo
  const balanceRoom = balance.status === 'ok' ? balance.balanceKobo - cliniciansKobo - transferFeeKobo(ledger.movableKobo) : 0
  const canMoveKobo = Math.max(0, Math.floor(Math.min(ledger.movableKobo, balanceRoom) / 100) * 100)
  const openSweep = ledger.sweeps.some((s) => s.status === 'sending' || s.status === 'pending' || s.status === 'otp_required')

  const withBusy = async (key: string, work: () => Promise<void>) => {
    setBusy(key)
    try {
      await work()
    } catch (err) {
      playSound('error')
      toast.error('That didn’t work', { description: errorText(err) })
    } finally {
      setBusy(null)
    }
  }

  const doMove = async () => {
    const kobo = nairaToKobo(amount)
    if (!kobo || kobo > canMoveKobo) {
      toast.error(`Enter an amount up to ${formatKobo(canMoveKobo)}`)
      throw new Error('amount')
    }
    try {
      const result = await move({ amountKobo: kobo })
      playSound(result.state === 'failed' ? 'error' : 'paid')
      if (result.state === 'failed') toast.error('The move didn’t go through', { description: result.message })
      else toast.success(result.message)
      void refreshBalance()
    } catch (err) {
      toast.error('Nothing was moved', { description: errorText(err) })
      throw err
    }
  }

  const doOtp = async () => {
    if (!otpFor || !otp.trim()) {
      toast.error('Enter the OTP Paystack sent')
      throw new Error('otp')
    }
    try {
      const result = await finalize({ ledgerId: otpFor, otp: otp.trim() })
      toast.success(result.state === 'success' ? 'Authorised and moved' : 'Authorised. Waiting for the bank.')
    } catch (err) {
      toast.error('That didn’t work', { description: errorText(err) })
      throw err
    }
  }

  return (
    <Panel
      title="Move Rehabify’s fees to the bank"
      description="Rehabify’s fee on clinic and independent-physio invoices stays in the Paystack balance. Move it to Rehabify’s bank account here."
    >
      <div className="space-y-4 px-5 pb-5 pt-2 text-sm">
        {!ledger.routingOnSince && (
          <p className={muted}>Nothing is counted until the switch above has been turned on. From then on, fees are added here as invoices are paid.</p>
        )}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Fees earned since on', ledger.feesEarnedKobo],
            ['Already moved', ledger.sweptKobo],
            ['Covering the pool', Math.max(0, ledger.feesEarnedKobo - ledger.sweptKobo - ledger.movableKobo)],
            ['Rehabify’s, by the books', ledger.movableKobo],
          ].map(([label, kobo]) => (
            <div key={label as string} className="rounded-xl bg-rh-canvas px-3.5 py-3 dark:bg-white/[0.04]">
              <dt className={cn('text-xs', muted)}>{label}</dt>
              <dd className={cn('mt-0.5 text-base font-semibold tabular-nums', strong)}>{formatKobo(kobo as number)}</dd>
            </div>
          ))}
        </dl>
        <p className={cn('text-xs', muted)}>
          Fees are net of Paystack’s fee on each payment (the worst case when Paystack didn’t report it). Partner commissions paid since the switch
          went on ({formatKobo(ledger.partnerPaidKobo)}) and refunds Rehabify owes the pool are taken off first, so the pool is never short.
        </p>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn('font-medium', strong)}>
            {balance.status === 'ok'
              ? `Paystack balance ${formatKobo(balance.balanceKobo)}`
              : balance.status === 'loading'
                ? 'Paystack balance: checking…'
                : `Paystack balance: couldn’t check (${balance.message})`}
          </span>
          <span className={muted}>· clinicians’ money it must keep {formatKobo(cliniciansKobo)}</span>
          <button
            type="button"
            onClick={() => void refreshBalance()}
            disabled={balance.status === 'loading'}
            className={cn('inline-flex items-center gap-1 text-xs font-medium hover:underline disabled:opacity-50', muted)}
          >
            <RefreshCw className={cn('h-3 w-3', balance.status === 'loading' && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {!ledger.transfersReady ? (
          <SetupTransfers />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              className={primaryButtonClass}
              disabled={canMoveKobo < 100_000 || openSweep || busy !== null}
              onClick={() => {
                setAmount(String(canMoveKobo / 100))
                setMoveOpen(true)
              }}
            >
              <Banknote className="mr-2 h-4 w-4" />
              Move {formatKobo(canMoveKobo)} to Rehabify’s bank
            </Button>
            <span className={cn('text-xs', muted)}>
              {openSweep
                ? 'A move is on its way: check it below first.'
                : canMoveKobo < 100_000
                  ? 'Nothing to move yet (₦1,000 or more, once the balance keeps the clinicians’ money).'
                  : 'Never automatic: nothing leaves until you confirm.'}
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <p className={cn('text-xs font-semibold uppercase tracking-wide', muted)}>Moves to the bank</p>
          {ledger.sweeps.length === 0 ? (
            <p className={cn('text-sm', muted)}>No fees moved yet.</p>
          ) : (
            <div className={cn(tableWrapClass, 'rounded-xl border border-black/[0.05] dark:border-white/[0.06]')}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.sweeps.map((s) => {
                    const status = s.status ?? 'sending'
                    return (
                      <TableRow key={s._id}>
                        <TableCell className={cn('whitespace-nowrap text-xs', muted)}>
                          {day(s.createdAt)}
                          {s.byName ? ` · ${s.byName}` : ''}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={SWEEP_BADGE[status].tone}>{SWEEP_BADGE[status].label}</StatusBadge>
                          {s.failureReason && status !== 'success' && (
                            <p className="mt-1 max-w-xs text-xs text-rose-600 dark:text-rose-300">{s.failureReason}</p>
                          )}
                        </TableCell>
                        <TableCell className={cn('font-mono text-xs', muted)}>{s.transferReference ?? '–'}</TableCell>
                        <TableCell className={cn('text-right text-sm font-semibold tabular-nums', strong)}>{formatKobo(s.amountKobo)}</TableCell>
                        <TableCell className="text-right">
                          {(status === 'sending' || status === 'pending') && (
                            <Button
                              size="sm"
                              className={softButtonClass}
                              disabled={busy !== null}
                              onClick={() =>
                                withBusy(`check-${s._id}`, async () => {
                                  const result = await check({ ledgerId: s._id })
                                  toast.info(result.message)
                                })
                              }
                            >
                              {busy === `check-${s._id}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
                              Check on Paystack
                            </Button>
                          )}
                          {status === 'otp_required' && (
                            <Button
                              size="sm"
                              className={softButtonClass}
                              onClick={() => {
                                setOtp('')
                                setOtpFor(s._id)
                              }}
                            >
                              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                              Enter OTP
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <LedgerTable
          title="Fees earned (latest)"
          rows={ledger.fees}
          empty="No fees counted yet."
          detail={(r) => [r.paymentReference, r.note].filter(Boolean).join(' · ')}
        />
      </div>

      <ConfirmDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        title="Move Rehabify’s fees to its bank account?"
        description={`One Paystack transfer from the balance to Rehabify’s bank account. Up to ${formatKobo(canMoveKobo)} can move now; the clinicians’ money (${formatKobo(cliniciansKobo)}) stays in the balance.`}
        confirmLabel="Move"
        onConfirm={doMove}
      >
        <div className="space-y-1.5">
          <Label htmlFor="fee-move-amount">Amount (₦)</Label>
          <Input id="fee-move-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={otpFor !== null}
        onOpenChange={(open) => !open && setOtpFor(null)}
        title="Authorise the move"
        description="Paystack sent an OTP to the business phone or email."
        confirmLabel="Authorise"
        onConfirm={doOtp}
      >
        <div className="space-y-1.5">
          <Label htmlFor="fee-move-otp">OTP</Label>
          <Input id="fee-move-otp" value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" className={inputClass} />
        </div>
      </ConfirmDialog>
    </Panel>
  )
}

/** For an account saved before fee moves existed: type its number again to set up transfers. */
function SetupTransfers() {
  const setup = useAction(refs.setupTransfers)
  const [accountNumber, setAccountNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      await setup({ accountNumber })
      playSound('approve')
      toast.success('Transfers to Rehabify’s account are set up')
      setAccountNumber('')
    } catch (err) {
      toast.error('That didn’t work', { description: errorText(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2 rounded-xl border border-black/[0.06] p-3 dark:border-white/10">
      <p className={strong}>Set up transfers to Rehabify’s account</p>
      <p className={cn('text-xs', muted)}>
        Only the last 4 digits of the account are stored, so type the full account number once more. It must be the account saved above.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="fee-transfer-account">Account number</Label>
          <Input
            id="fee-transfer-account"
            inputMode="numeric"
            maxLength={10}
            placeholder="10 digits"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
            className={cn(inputClass, 'w-44')}
          />
        </div>
        <Button size="sm" className={softButtonClass} onClick={run} disabled={accountNumber.length !== 10 || busy}>
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Set up transfers
        </Button>
      </div>
    </div>
  )
}
