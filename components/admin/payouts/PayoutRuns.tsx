'use client'

/**
 * The weekly payout run for admins (convex/payouts.ts). Every Friday the system prepares a draft
 * of each physio's Available payouts; an admin reviews it here and presses Pay all, which sends
 * one Paystack transfer per physio. Also: payouts still waiting (note, 48 hours, on hold) and
 * past runs. Patients appear by Rehabify ID only, as on every finance screen.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAction, useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Banknote,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Flag,
  KeyRound,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { formatLagos } from '@/convex/helpers/lagosTime'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ConfirmDialog,
  EmptyState,
  FilterChips,
  Panel,
  StatusBadge,
  inputClass,
  primaryButtonClass,
  softButtonClass,
  tableWrapClass,
} from '@/components/admin/ui'
import { errorText, formatKobo } from '@/components/admin/finance/format'
import { PatientRef } from '@/components/admin/finance/PatientRef'

type RunStatus = 'draft' | 'paying' | 'paid' | 'partially_failed'
type TransferStatus = 'sending' | 'otp_required' | 'pending' | 'success' | 'failed' | 'reversed'
type Stage = 'awaiting_note' | 'pending' | 'available' | 'on_hold' | 'paying' | 'paid' | 'failed'

type RunLine = {
  _id: Id<'payouts'>
  amountKobo: number
  status: string
  reason: string
  service: string
  sessionAt: number | null
  patientUserId: string | null
  patientNumber: string | null
}

type RunGroup = {
  userId: string
  name: string
  email: string
  totalKobo: number
  bank: { bankName: string; accountName: string; last4: string } | null
  lines: RunLine[]
  transfer: {
    _id: Id<'payoutRunTransfers'>
    status: TransferStatus
    reference: string
    failureReason: string | null
    attempts: number
    sentAt: number | null
    completedAt: number | null
    statementEmailedAt: number | null
  } | null
}

type RunDoc = {
  _id: Id<'payoutRuns'>
  weekOf: string
  status: RunStatus
  totalKobo: number
  physioCount: number
  lineCount: number
  paidKobo?: number
  failedKobo?: number
  preparedAt: number
  payStartedAt?: number
  paidAt?: number
  paidByName: string | null
}

type RunData = { run: RunDoc | null; groups: RunGroup[]; nextFriday: string }

type RunSummary = {
  _id: Id<'payoutRuns'>
  weekOf: string
  status: RunStatus
  totalKobo: number
  paidKobo: number
  failedKobo: number
  physioCount: number
  lineCount: number
  payStartedAt: number | null
  paidAt: number | null
}

type WaitingRow = {
  _id: Id<'payouts'>
  stage: Stage
  amountKobo: number
  reason: string
  service: string
  sessionAt: number | null
  createdAt: number
  noteDueAt: number | null
  noteOverdue: boolean
  availableAt: number | null
  heldReason: string | null
  heldSource: 'admin' | 'patient_concern' | null
  heldAt: number | null
  concern: { message: string; createdAt: number } | null
  takenOutOfRun: boolean
  physio: { userId: string; name: string; email: string }
  patientUserId: string | null
  patientNumber: string | null
}

type WaitingData = { rows: WaitingRow[]; draftRunId: Id<'payoutRuns'> | null; nextFriday: string }
type PayResult = { sent: number; pending: number; otp: number; failed: number; skipped: { name: string; reason: string }[]; message: string }

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const refs = {
  getRun: makeFunctionReference<'query', { runId?: Id<'payoutRuns'> }, RunData>('payouts:adminGetRun'),
  listRuns: makeFunctionReference<'query', Record<string, never>, RunSummary[]>('payouts:adminListRuns'),
  listWaiting: makeFunctionReference<'query', Record<string, never>, WaitingData>('payouts:adminListWaiting'),
  prepare: makeFunctionReference<'mutation', Record<string, never>, { lineCount: number; totalKobo: number; physioCount: number }>(
    'payouts:adminPrepareRun'
  ),
  removeFromRun: makeFunctionReference<'mutation', { payoutId: Id<'payouts'> }, unknown>('payouts:adminRemoveFromRun'),
  addToRun: makeFunctionReference<'mutation', { payoutId: Id<'payouts'> }, unknown>('payouts:adminAddToRun'),
  hold: makeFunctionReference<'mutation', { payoutId: Id<'payouts'>; reason: string }, unknown>('payouts:adminHoldPayout'),
  release: makeFunctionReference<'mutation', { payoutId: Id<'payouts'>; note?: string }, { joinedRun: boolean }>(
    'payouts:adminReleasePayout'
  ),
  pay: makeFunctionReference<'action', { runId: Id<'payoutRuns'> }, PayResult>('payouts:adminPayRun'),
  retry: makeFunctionReference<'action', { transferId: Id<'payoutRunTransfers'> }, PayResult>('payouts:adminRetryRunTransfer'),
  check: makeFunctionReference<'action', { transferId: Id<'payoutRunTransfers'> }, { state: TransferStatus; message: string }>(
    'payouts:adminCheckRunTransfer'
  ),
  finalize: makeFunctionReference<'action', { transferId: Id<'payoutRunTransfers'>; otp: string }, { state: TransferStatus }>(
    'payouts:adminFinalizeRunTransfer'
  ),
}

const fridayLong = (key: string) => formatLagos(Date.parse(`${key}T11:00:00Z`), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, 'en-GB')
const fridayShort = (key: string) => formatLagos(Date.parse(`${key}T11:00:00Z`), { weekday: 'short', day: 'numeric', month: 'short' }, 'en-GB')
const day = (ms: number) => formatLagos(ms, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB')
const dayTime = (ms: number) => formatLagos(ms, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }, 'en-GB')

const muted = 'text-neutral-500 dark:text-neutral-400'
const strong = 'text-rh-ink dark:text-white'

const RUN_BADGE: Record<RunStatus, { tone: 'neutral' | 'green' | 'amber' | 'red'; label: string }> = {
  draft: { tone: 'amber', label: 'Ready to pay' },
  paying: { tone: 'neutral', label: 'Sending' },
  paid: { tone: 'green', label: 'Paid' },
  partially_failed: { tone: 'red', label: 'Some failed' },
}

const TRANSFER_BADGE: Record<TransferStatus, { tone: 'neutral' | 'green' | 'amber' | 'red'; label: string }> = {
  sending: { tone: 'neutral', label: 'Sending' },
  pending: { tone: 'neutral', label: 'Waiting for the bank' },
  otp_required: { tone: 'amber', label: 'Needs OTP' },
  success: { tone: 'green', label: 'Paid' },
  failed: { tone: 'red', label: 'Failed' },
  reversed: { tone: 'red', label: 'Reversed' },
}

const STAGE_BADGE: Record<Stage, { tone: 'neutral' | 'green' | 'amber' | 'red'; label: string }> = {
  awaiting_note: { tone: 'amber', label: 'Waiting for note' },
  pending: { tone: 'neutral', label: 'Pending 48h' },
  available: { tone: 'green', label: 'Available' },
  on_hold: { tone: 'red', label: 'On hold' },
  paying: { tone: 'neutral', label: 'Sending' },
  paid: { tone: 'green', label: 'Paid' },
  failed: { tone: 'red', label: 'Failed' },
}

/** Holds, releases and OTPs: each a small form inside the confirm dialog. */
type Dialog =
  | { kind: 'pay' }
  | { kind: 'hold'; payoutId: Id<'payouts'>; label: string }
  | { kind: 'release'; payoutId: Id<'payouts'>; label: string; concern: string | null }
  | { kind: 'otp'; transferId: Id<'payoutRunTransfers'>; name: string }

function useLineActions() {
  const hold = useMutation(refs.hold)
  const release = useMutation(refs.release)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [text, setText] = useState('')
  const open = (next: Dialog) => {
    setText('')
    setDialog(next)
  }
  const runHoldOrRelease = async () => {
    if (!dialog) return
    try {
      if (dialog.kind === 'hold') {
        if (!text.trim()) {
          toast.error('Say why it’s on hold. The physio sees this.')
          throw new Error('reason required')
        }
        await hold({ payoutId: dialog.payoutId, reason: text.trim() })
        playSound('reject')
        toast.success('Payout on hold', { description: 'The physio has been told why.' })
      } else if (dialog.kind === 'release') {
        const result = await release({ payoutId: dialog.payoutId, note: text.trim() || undefined })
        playSound('success')
        toast.success('Payout released', { description: result.joinedRun ? 'It’s in this week’s run.' : 'It goes into a Friday run once it’s Available.' })
      }
    } catch (error) {
      if (!(error instanceof Error && error.message === 'reason required')) toast.error('That didn’t work', { description: errorText(error) })
      throw error
    }
  }
  return { dialog, setDialog, open, text, setText, runHoldOrRelease }
}

function HoldReleaseDialog({ actions }: { actions: ReturnType<typeof useLineActions> }) {
  const { dialog, setDialog, text, setText, runHoldOrRelease } = actions
  if (!dialog || (dialog.kind !== 'hold' && dialog.kind !== 'release')) return null
  const isHold = dialog.kind === 'hold'
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && setDialog(null)}
      title={isHold ? 'Put this payout on hold?' : 'Release this payout?'}
      description={
        isHold
          ? `${dialog.label}. It leaves the run until you release it. The physio sees your reason.`
          : `${dialog.label}. It's paid in a Friday run once it's Available.`
      }
      confirmLabel={isHold ? 'Hold payout' : 'Release'}
      destructive={isHold}
      onConfirm={runHoldOrRelease}
    >
      {dialog.kind === 'release' && dialog.concern && (
        <p className="rounded-xl bg-rh-blush px-3 py-2 text-sm text-[#be123c] dark:bg-rose-400/10 dark:text-rose-300">
          Patient’s concern: “{dialog.concern}”
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="payout-hold-text">{isHold ? 'Reason (the physio sees this)' : 'Note (optional, for the record)'}</Label>
        <Textarea
          id="payout-hold-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={isHold ? 300 : 500}
          placeholder={isHold ? 'e.g. We’re checking the session details with the patient.' : 'e.g. Spoke to the patient; resolved.'}
          className={inputClass}
        />
      </div>
    </ConfirmDialog>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* This week's run (or any run)                                                                   */
/* ---------------------------------------------------------------------------------------------- */

export function PayoutRunView({ runId, onBack }: { runId?: Id<'payoutRuns'>; onBack?: () => void }) {
  const data = useQuery(refs.getRun, runId ? { runId } : {})
  const prepare = useMutation(refs.prepare)
  const removeFromRun = useMutation(refs.removeFromRun)
  const pay = useAction(refs.pay)
  const retry = useAction(refs.retry)
  const check = useAction(refs.check)
  const finalize = useAction(refs.finalize)
  const actions = useLineActions()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [otp, setOtp] = useState('')

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const withBusy = async (key: string, work: () => Promise<void>) => {
    setBusy(key)
    try {
      await work()
    } catch (error) {
      playSound('error')
      toast.error('That didn’t work', { description: errorText(error) })
    } finally {
      setBusy(null)
    }
  }

  const doPrepare = () =>
    withBusy('prepare', async () => {
      const result = await prepare({})
      toast.success(result.lineCount ? `Run ready: ${formatKobo(result.totalKobo)} to ${result.physioCount} physios` : 'Nothing is Available to pay yet')
    })

  if (data === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
      </div>
    )
  }

  const { run, groups } = data
  if (!run) {
    return (
      <Panel>
        <EmptyState
          icon={<CalendarCheck />}
          title="No run yet"
          description={`The first run is prepared on ${fridayLong(data.nextFriday)} at 7am. You can prepare one now to see what's Available.`}
          action={
            <Button className={primaryButtonClass} onClick={doPrepare} disabled={busy === 'prepare'}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Prepare now
            </Button>
          }
        />
      </Panel>
    )
  }

  const isDraft = run.status === 'draft'
  const payable = groups.filter((g) => g.bank)
  const payableTotal = payable.reduce((s, g) => s + g.totalKobo, 0)
  const noBank = groups.filter((g) => !g.bank)

  const description = isDraft
    ? `Prepared ${dayTime(run.preparedAt)}. Check each physio, take out or hold anything that shouldn't be paid, then press Pay all. Nothing is sent until you do.`
    : run.status === 'paying'
      ? 'Sending. Each payout is marked paid when Paystack confirms its transfer.'
      : run.status === 'paid'
        ? `Paid${run.paidAt ? ` ${day(run.paidAt)}` : ''}${run.paidByName ? `, started by ${run.paidByName}` : ''}. Statements were emailed to each physio.`
        : 'Some transfers didn’t go through. Retry them below once the cause is fixed, or move the payouts back to the queue from All payouts.'

  const doPay = async () => {
    try {
      const result = await pay({ runId: run._id })
      playSound(result.failed ? 'error' : 'paid')
      toast.success(`Pay all: ${result.message}`, {
        description: result.skipped.length ? `Skipped: ${result.skipped.map((s) => s.name).join(', ')}. They stay Available for the next run.` : undefined,
        duration: 10000,
      })
    } catch (error) {
      playSound('error')
      toast.error('Pay all didn’t start', { description: errorText(error) })
      throw error
    }
  }

  const doOtp = async () => {
    if (actions.dialog?.kind !== 'otp') return
    if (!otp.trim()) {
      toast.error('Enter the OTP Paystack sent')
      throw new Error('otp required')
    }
    try {
      const result = await finalize({ transferId: actions.dialog.transferId, otp: otp.trim() })
      toast.success(result.state === 'success' ? 'Transfer authorised and paid' : 'Transfer authorised. Waiting for the bank.')
    } catch (error) {
      toast.error('That didn’t work', { description: errorText(error) })
      throw error
    }
  }

  return (
    <div className="space-y-4">
      {onBack && (
        <button type="button" onClick={onBack} className={cn('inline-flex items-center gap-1.5 text-sm font-medium hover:underline', muted)}>
          <ArrowLeft className="h-3.5 w-3.5" />
          All runs
        </button>
      )}

      <Panel
        title={
          <span className="flex flex-wrap items-center gap-2">
            Run for {fridayLong(run.weekOf)}
            <StatusBadge tone={RUN_BADGE[run.status].tone}>{RUN_BADGE[run.status].label}</StatusBadge>
          </span>
        }
        description={description}
        actions={
          isDraft ? (
            <>
              <Button className={softButtonClass} onClick={doPrepare} disabled={busy !== null}>
                <RefreshCw className={cn('mr-2 h-4 w-4', busy === 'prepare' && 'animate-spin')} />
                Refresh
              </Button>
              <Button className={primaryButtonClass} onClick={() => setPayOpen(true)} disabled={busy !== null || payable.length === 0}>
                <Banknote className="mr-2 h-4 w-4" />
                Pay all {formatKobo(payableTotal)}
              </Button>
            </>
          ) : undefined
        }
      >
        <dl className="grid grid-cols-2 gap-3 px-5 pb-5 pt-3 sm:grid-cols-4 sm:px-6">
          {[
            ['Physios', String(isDraft ? groups.length : run.physioCount)],
            ['Sessions', String(isDraft ? groups.reduce((s, g) => s + g.lines.length, 0) : run.lineCount)],
            ['Total', formatKobo(isDraft ? groups.reduce((s, g) => s + g.totalKobo, 0) : run.totalKobo)],
            isDraft ? ['No payout account', String(noBank.length)] : ['Paid so far', formatKobo(run.paidKobo ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-rh-canvas px-3.5 py-3 dark:bg-white/[0.04]">
              <dt className={cn('text-xs', muted)}>{label}</dt>
              <dd className={cn('mt-0.5 text-lg font-semibold tabular-nums', strong)}>{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      {groups.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Banknote />}
            title="Nothing in this run"
            description="Payouts join the run when they’re Available: 48 hours after the session note, unless they’re on hold."
          />
        </Panel>
      ) : (
        <Panel bodyClassName="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {groups.map((group) => {
            const open = expanded.has(group.userId)
            const t = group.transfer
            return (
              <div key={group.userId}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <button
                    type="button"
                    onClick={() => toggle(group.userId)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {open ? <ChevronDown className={cn('h-4 w-4 shrink-0', muted)} /> : <ChevronRight className={cn('h-4 w-4 shrink-0', muted)} />}
                    <span className="min-w-0">
                      <span className={cn('block truncate text-sm font-semibold', strong)}>{group.name}</span>
                      <span className={cn('block truncate text-xs', muted)}>
                        {group.bank ? `${group.bank.bankName} ending ${group.bank.last4} · ${group.bank.accountName}` : 'No verified payout account'}
                        {' · '}
                        {group.lines.length} {group.lines.length === 1 ? 'session' : 'sessions'}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {!group.bank && isDraft && <StatusBadge tone="amber">Skipped when paying</StatusBadge>}
                    {t && <StatusBadge tone={TRANSFER_BADGE[t.status].tone}>{TRANSFER_BADGE[t.status].label}</StatusBadge>}
                    <span className={cn('text-sm font-semibold tabular-nums', strong)}>{formatKobo(group.totalKobo)}</span>
                    {t && (t.status === 'failed' || t.status === 'reversed') && (
                      <Button
                        size="sm"
                        className={softButtonClass}
                        disabled={busy !== null}
                        onClick={() =>
                          withBusy(`retry-${t._id}`, async () => {
                            const result = await retry({ transferId: t._id })
                            toast.success(`Retry: ${result.message}`)
                          })
                        }
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Retry
                      </Button>
                    )}
                    {t && (t.status === 'pending' || t.status === 'sending') && (
                      <Button
                        size="sm"
                        className={softButtonClass}
                        disabled={busy !== null}
                        onClick={() =>
                          withBusy(`check-${t._id}`, async () => {
                            const result = await check({ transferId: t._id })
                            toast.info(result.message)
                          })
                        }
                      >
                        <Search className="mr-1.5 h-3.5 w-3.5" />
                        Check on Paystack
                      </Button>
                    )}
                    {t && t.status === 'otp_required' && (
                      <Button
                        size="sm"
                        className={softButtonClass}
                        onClick={() => {
                          setOtp('')
                          actions.setDialog({ kind: 'otp', transferId: t._id, name: group.name })
                        }}
                      >
                        <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                        Enter OTP
                      </Button>
                    )}
                  </div>
                </div>
                {t?.failureReason && t.status !== 'success' && (
                  <p className="px-4 pb-3 text-xs text-rose-600 dark:text-rose-300 sm:px-12">
                    {t.failureReason}
                    {t.attempts > 1 ? ` (attempt ${t.attempts})` : ''}
                  </p>
                )}
                {open && (
                  <div className={cn(tableWrapClass, 'border-t border-black/[0.05] dark:border-white/[0.06]')}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-5 sm:pl-12">Patient</TableHead>
                          <TableHead>For</TableHead>
                          <TableHead>Session</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          {isDraft && (
                            <TableHead className="w-44 pr-5">
                              <span className="sr-only">Actions</span>
                            </TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.lines.map((line) => (
                          <TableRow key={line._id}>
                            <TableCell className="pl-5 sm:pl-12">
                              <PatientRef userId={line.patientUserId} patientNumber={line.patientNumber} />
                            </TableCell>
                            <TableCell className={cn('min-w-[200px] text-sm', strong)}>{line.service}</TableCell>
                            <TableCell className={cn('whitespace-nowrap text-xs', muted)}>{line.sessionAt ? day(line.sessionAt) : '–'}</TableCell>
                            <TableCell className={cn('text-right text-sm font-semibold tabular-nums', strong)}>{formatKobo(line.amountKobo)}</TableCell>
                            {isDraft && (
                              <TableCell className="pr-5">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 rounded-lg px-2 text-xs dark:text-neutral-300 dark:hover:bg-white/[0.06]"
                                    disabled={busy !== null}
                                    onClick={() =>
                                      withBusy(`remove-${line._id}`, async () => {
                                        await removeFromRun({ payoutId: line._id })
                                        toast.success('Taken out of this run', { description: 'It stays Available for next week’s run.' })
                                      })
                                    }
                                  >
                                    <X className="mr-1 h-3.5 w-3.5" />
                                    Take out
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 rounded-lg px-2 text-xs text-rose-600 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-white/[0.06]"
                                    onClick={() =>
                                      actions.open({ kind: 'hold', payoutId: line._id, label: `${formatKobo(line.amountKobo)} for ${group.name}` })
                                    }
                                  >
                                    <Pause className="mr-1 h-3.5 w-3.5" />
                                    Hold
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )
          })}
        </Panel>
      )}

      <ConfirmDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        title={`Pay ${formatKobo(payableTotal)} to ${payable.length} ${payable.length === 1 ? 'physio' : 'physios'}?`}
        description="One Paystack transfer per physio for their total, from Rehabify’s Paystack balance. Make sure the balance covers it. Each payout is marked paid when Paystack confirms its transfer, and the physio is emailed their statement."
        confirmLabel="Pay all"
        onConfirm={doPay}
      >
        {noBank.length > 0 && (
          <p className="rounded-xl bg-rh-peach px-3 py-2 text-sm text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300">
            Skipped, no verified payout account: {noBank.map((g) => g.name).join(', ')}. Their payouts stay Available for the next run.
          </p>
        )}
      </ConfirmDialog>

      <HoldReleaseDialog actions={actions} />

      {actions.dialog?.kind === 'otp' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && actions.setDialog(null)}
          title={`Authorise the transfer to ${actions.dialog.name}`}
          description="Paystack sent an OTP to the business phone or email. To pay without OTPs, switch off OTP for transfers in the Paystack dashboard."
          confirmLabel="Authorise"
          onConfirm={doOtp}
        >
          <div className="space-y-1.5">
            <Label htmlFor="payout-otp">OTP</Label>
            <Input id="payout-otp" value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" className={inputClass} />
          </div>
        </ConfirmDialog>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Waiting: note, 48 hours, on hold, or Available but not in the run                              */
/* ---------------------------------------------------------------------------------------------- */

type WaitingFilter = 'all' | 'awaiting_note' | 'pending' | 'on_hold' | 'available'

export function PayoutWaitingView() {
  const data = useQuery(refs.listWaiting, {})
  const addToRun = useMutation(refs.addToRun)
  const actions = useLineActions()
  const [filter, setFilter] = useState<WaitingFilter>('all')
  const [busy, setBusy] = useState<string | null>(null)

  const counts = useMemo(() => {
    const rows = data?.rows ?? []
    const count = (stage: Stage) => rows.filter((r) => r.stage === stage).length
    return { all: rows.length, awaiting_note: count('awaiting_note'), pending: count('pending'), on_hold: count('on_hold'), available: count('available') }
  }, [data])

  if (data === undefined) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    )
  }

  const rows = data.rows
    .filter((r) => filter === 'all' || r.stage === filter)
    .sort((a, b) => (a.stage === 'on_hold' ? -1 : 0) - (b.stage === 'on_hold' ? -1 : 0) || (b.sessionAt ?? b.createdAt) - (a.sessionAt ?? a.createdAt))

  const detail = (r: WaitingRow) => {
    switch (r.stage) {
      case 'awaiting_note':
        return r.noteOverdue ? 'Note overdue. The physio has been reminded.' : `Note due ${r.noteDueAt ? dayTime(r.noteDueAt) : 'soon'}`
      case 'pending':
        return r.availableAt ? `Available ${dayTime(r.availableAt)}` : 'Pending'
      case 'on_hold':
        return r.concern ? `Patient’s concern: “${r.concern.message}”` : (r.heldReason ?? 'On hold')
      case 'available':
        return r.takenOutOfRun ? 'Taken out of this week’s run' : `Goes in the run on ${fridayShort(data.nextFriday)}`
      default:
        return ''
    }
  }

  return (
    <Panel bodyClassName="pb-1">
      <div className="border-b border-black/[0.05] p-4 dark:border-white/[0.06] sm:px-5">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'on_hold', label: 'On hold', count: counts.on_hold },
            { value: 'awaiting_note', label: 'Waiting for note', count: counts.awaiting_note },
            { value: 'pending', label: 'Pending 48h', count: counts.pending },
            { value: 'available', label: 'Available, not in run', count: counts.available },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<CalendarCheck />} title="Nothing waiting" description="Payouts show here between the session and the Friday run." />
      ) : (
        <div className={tableWrapClass}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Physio</TableHead>
                <TableHead>For</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="w-40 pr-5">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r._id}>
                  <TableCell className="min-w-[170px] pl-5">
                    <Link href={`/dashboard/admin/users/${r.physio.userId}`} className="block hover:underline">
                      <span className={cn('block text-sm font-medium', strong)}>{r.physio.name}</span>
                      <span className={cn('block text-xs', muted)}>{r.physio.email}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="min-w-[200px] text-sm">
                    <span className={cn('block', strong)}>{r.service}</span>
                    <span className={cn('block text-xs', muted)}>
                      <PatientRef userId={r.patientUserId} patientNumber={r.patientNumber} />
                      {r.sessionAt ? ` · ${day(r.sessionAt)}` : ''}
                    </span>
                  </TableCell>
                  <TableCell className={cn('text-right text-sm font-semibold tabular-nums', strong)}>{formatKobo(r.amountKobo)}</TableCell>
                  <TableCell className="min-w-[220px]">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge tone={STAGE_BADGE[r.stage].tone}>{STAGE_BADGE[r.stage].label}</StatusBadge>
                      {r.heldSource === 'patient_concern' && (
                        <span className={cn('inline-flex items-center gap-1 text-xs', muted)}>
                          <Flag className="h-3 w-3" />
                          Patient
                        </span>
                      )}
                    </span>
                    <span className={cn('mt-1 block max-w-[320px] text-xs', r.stage === 'on_hold' ? 'text-rose-600 dark:text-rose-300' : muted)}>{detail(r)}</span>
                  </TableCell>
                  <TableCell className="pr-5">
                    <div className="flex justify-end gap-1">
                      {r.stage === 'on_hold' ? (
                        <Button
                          size="sm"
                          className={softButtonClass}
                          onClick={() =>
                            actions.open({ kind: 'release', payoutId: r._id, label: `${formatKobo(r.amountKobo)} for ${r.physio.name}`, concern: r.concern?.message ?? null })
                          }
                        >
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                          Release
                        </Button>
                      ) : (
                        <>
                          {r.stage === 'available' && data.draftRunId && (
                            <Button
                              size="sm"
                              className={softButtonClass}
                              disabled={busy !== null}
                              onClick={async () => {
                                setBusy(r._id)
                                try {
                                  await addToRun({ payoutId: r._id })
                                  toast.success('Added to this week’s run')
                                } catch (error) {
                                  toast.error('That didn’t work', { description: errorText(error) })
                                } finally {
                                  setBusy(null)
                                }
                              }}
                            >
                              <Plus className="mr-1.5 h-3.5 w-3.5" />
                              Add to run
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 rounded-lg px-2 text-xs text-rose-600 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-white/[0.06]"
                            onClick={() => actions.open({ kind: 'hold', payoutId: r._id, label: `${formatKobo(r.amountKobo)} for ${r.physio.name}` })}
                          >
                            <Pause className="mr-1 h-3.5 w-3.5" />
                            Hold
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <HoldReleaseDialog actions={actions} />
    </Panel>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Past runs                                                                                      */
/* ---------------------------------------------------------------------------------------------- */

export function PayoutRunsList({ onOpen }: { onOpen: (runId: Id<'payoutRuns'>) => void }) {
  const runs = useQuery(refs.listRuns, {})
  if (runs === undefined) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    )
  }
  return (
    <Panel bodyClassName="pb-1">
      {runs.length === 0 ? (
        <EmptyState icon={<CalendarCheck />} title="No runs yet" description="Each Friday’s run is listed here once it’s prepared." />
      ) : (
        <div className={tableWrapClass}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Physios</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="pr-5">Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r._id} className="cursor-pointer" onClick={() => onOpen(r._id)}>
                  <TableCell className={cn('pl-5 text-sm font-medium', strong)}>
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpen(r._id)
                      }}
                    >
                      {fridayLong(r.weekOf)}
                    </button>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={RUN_BADGE[r.status].tone}>{RUN_BADGE[r.status].label}</StatusBadge>
                  </TableCell>
                  <TableCell className={cn('text-right text-sm tabular-nums', strong)}>{r.physioCount}</TableCell>
                  <TableCell className={cn('text-right text-sm tabular-nums', strong)}>{r.lineCount}</TableCell>
                  <TableCell className={cn('text-right text-sm font-semibold tabular-nums', strong)}>{formatKobo(r.totalKobo)}</TableCell>
                  <TableCell className={cn('text-right text-sm tabular-nums', r.failedKobo ? 'text-rose-600 dark:text-rose-300' : muted)}>
                    {r.failedKobo ? formatKobo(r.failedKobo) : '–'}
                  </TableCell>
                  <TableCell className={cn('whitespace-nowrap pr-5 text-xs', muted)}>{r.paidAt ? day(r.paidAt) : '–'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  )
}
