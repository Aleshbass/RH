'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { format } from 'date-fns'
import { Banknote, CheckCircle2, ChevronRight, Clock, Copy, Loader2, Mail, Phone, RefreshCw, User, WalletCards, WhatsApp, XCircle } from '@/components/icons'
import { mediLoanWhatsAppUrl } from '@/lib/myitura/share'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  inputClass,
  PageHeader,
  Panel,
  primaryButtonClass,
  softButtonClass,
  Stagger,
  StaggerItem,
  StatTile,
  StatusBadge,
  tableWrapClass,
  tabsListClass,
} from '@/components/admin/ui'
import { Callout, dialogClass, dialogTitleClass, errorMessage, formatKobo, hintClass, insetClass, labelClass, LoadingBlock } from '@/components/admin/partners/shared'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type LoanRequest = FunctionReturnType<typeof api.mediloan.getAllLoanRequests>[number]
type LoanApplication = FunctionReturnType<typeof api.mediloan.getAllLoans>[number]
type Tone = 'neutral' | 'teal' | 'green' | 'amber' | 'red'

const LOAN_STATUS: Record<string, { label: string; tone: Tone }> = {
  initiated: { label: 'SMS sent', tone: 'neutral' },
  pending: { label: 'Applied', tone: 'amber' },
  approved: { label: 'Approved', tone: 'teal' },
  offer_accepted: { label: 'Terms accepted', tone: 'teal' },
  disbursed: { label: 'Paid out', tone: 'green' },
  declined: { label: 'Declined', tone: 'red' },
  expired: { label: 'Expired', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  defaulted: { label: 'In default', tone: 'red' },
  failed: { label: 'Failed', tone: 'red' },
  repaid: { label: 'Fully repaid', tone: 'green' },
}

/** Loans an admin can still cancel at MyItura. */
const CANCELLABLE = new Set(['initiated', 'pending', 'approved', 'offer_accepted'])

type QuoteOption = { tenorMonths: number; monthlyRepaymentKobo: number; totalRepayableKobo: number }

/** Indicative monthly repayments for an amount (GET /api/myitura/quote). */
function QuoteHint({ amountKobo }: { amountKobo: number }) {
  const [state, setState] = useState<{ amount: number; options?: QuoteOption[]; error?: string } | null>(null)

  useEffect(() => {
    if (!amountKobo || amountKobo <= 0) return
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/myitura/quote?amountKobo=${amountKobo}`)
        const data = (await res.json().catch(() => ({}))) as { options?: QuoteOption[]; error?: string }
        setState({ amount: amountKobo, options: res.ok ? data.options : undefined, error: res.ok ? undefined : data.error })
      } catch {
        setState({ amount: amountKobo, error: 'Estimate unavailable' })
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [amountKobo])

  if (!amountKobo || state?.amount !== amountKobo) return null
  if (state.error) return <p className={hintClass}>Repayment estimate unavailable: {state.error}</p>
  if (!state.options?.length) return <p className={hintClass}>MyItura has no priced term for this amount.</p>
  return (
    <p className={hintClass}>
      About{' '}
      {state.options.map((o, i) => (
        <span key={o.tenorMonths}>
          {i > 0 && ' · '}
          <strong className="tabular-nums">{formatKobo(o.monthlyRepaymentKobo)}</strong>/month for {o.tenorMonths} months
        </span>
      ))}
      . Final terms are set inside MediLoan.
    </p>
  )
}

const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Awaiting action', tone: 'amber' },
  awaiting_invoice: { label: 'Waiting for invoice', tone: 'amber' },
  initiated: { label: 'Loan initiated', tone: 'green' },
  cancelled: { label: 'Dismissed', tone: 'neutral' },
}

const dateTime = (ts: number) => format(ts, 'd MMM yyyy, h:mm a')

type FinancingOption = {
  kind: 'invoice' | 'booking'
  id: string
  label: string
  detail: string
  amountKobo: number
  physioName: string
  matchesRequestPhysio: boolean
  hasOpenLoan: boolean
}
type FinancingOptions = { patientFound: boolean; physio: { id: string; name: string } | null; options: FinancingOption[] } | null

/**
 * Starts a MediLoan for a patient's request. The loan always pays for something real: one of
 * the patient's unpaid invoices or bookings (the amount is what's owed). With nothing to pay
 * yet, the admin asks the physio to invoice the patient; the request is linked automatically
 * when that MediLoan starts.
 */
function InitiateLoanDialog({ request, onClose, onInitiated }: { request: LoanRequest | null; onClose: () => void; onInitiated: (id: string) => void }) {
  const financing = useQuery(api.mediloan.getFinancingOptionsForRequest, request ? { requestId: request._id } : 'skip') as FinancingOptions | undefined
  const askPhysio = useMutation(api.mediloan.askPhysioToInvoice)
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const available = financing?.options.filter((o) => !o.hasOpenLoan) ?? []
  const choice = available.find((o) => `${o.kind}:${o.id}` === selected) ?? (available.length === 1 ? available[0] : undefined)

  const close = () => {
    if (loading) return
    setSelected(null)
    setError('')
    onClose()
  }

  const initiate = async () => {
    if (!request || !choice) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/myitura/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanRequestId: request._id,
          [choice.kind === 'invoice' ? 'invoiceId' : 'bookingId']: choice.id,
          phoneNumber: request.patientPhone,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        data?: { message?: string; whatsappUrl?: string | null }
      }
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to initiate loan.')
      playSound('success')
      const whatsappUrl = data.data?.whatsappUrl
      toast.success(data.data?.message ?? 'MediLoan started.', {
        duration: 15000,
        action: whatsappUrl ? { label: 'Send on WhatsApp', onClick: () => window.open(whatsappUrl, '_blank', 'noopener,noreferrer') } : undefined,
      })
      onInitiated(request._id)
      onClose()
    } catch (err) {
      playSound('error')
      setError(errorMessage(err, 'Failed to initiate loan. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const requestInvoice = async () => {
    if (!request) return
    setLoading(true)
    setError('')
    try {
      await askPhysio({ requestId: request._id })
      playSound('success')
      toast.success(`Asked ${financing?.physio?.name ?? 'the physiotherapist'} to send an invoice. The request is linked when MediLoan starts on it.`)
      onClose()
    } catch (err) {
      playSound('error')
      setError(errorMessage(err, 'Could not notify the physiotherapist.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && close()}>
      <DialogContent className={`${dialogClass} sm:max-w-lg`}>
        {request && (
          <>
            <DialogHeader>
              <DialogTitle className={dialogTitleClass}>
                <WalletCards className="h-5 w-5 text-rh-ink dark:text-rh-lime" />
                Initiate MediLoan
              </DialogTitle>
              <DialogDescription>
                Choose what the loan pays for. MyItura texts the patient the application link; when the loan pays out, the invoice is marked paid or
                the booking confirmed.
              </DialogDescription>
            </DialogHeader>

            <div className={cn(insetClass, 'space-y-1.5 text-sm')}>
              <p className="flex items-center gap-2 font-semibold text-rh-ink dark:text-white">
                <User className="h-4 w-4 text-neutral-400" />
                {request.patientFirstName} {request.patientLastName}
              </p>
              <p className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                <Phone className="h-4 w-4 text-neutral-400" />
                {request.patientPhone}
              </p>
              {request.patientEmail && (
                <p className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                  <Mail className="h-4 w-4 text-neutral-400" />
                  {request.patientEmail}
                </p>
              )}
              <p className="pl-6 text-xs text-neutral-500 dark:text-neutral-400">
                {request.treatment}
                {financing?.physio ? ` · chose ${financing.physio.name}` : ''}
              </p>
            </div>

            {financing === undefined ? (
              <LoadingBlock />
            ) : !financing || financing.options.length === 0 ? (
              <Callout tone="warning">
                {financing?.patientFound
                  ? 'This patient has no unpaid invoice or booking to pay with MediLoan yet.'
                  : 'No Rehabify account matches this phone number yet, so there is no invoice or booking to pay.'}{' '}
                {financing?.physio
                  ? `Ask ${financing.physio.name} to invoice them; the request is linked automatically when MediLoan starts on it.`
                  : 'Ask the patient to book a session first, then start MediLoan on that booking.'}
              </Callout>
            ) : (
              <div className="space-y-2" role="radiogroup" aria-label="What the loan pays for">
                <p className={labelClass}>Pays for</p>
                {financing.options.map((option) => {
                  const key = `${option.kind}:${option.id}`
                  const isChosen = Boolean(choice && `${choice.kind}:${choice.id}` === key)
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={isChosen}
                      disabled={option.hasOpenLoan}
                      onClick={() => setSelected(key)}
                      className={cn(
                        'flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                        isChosen
                          ? 'border-rh-lime bg-rh-honeydew dark:border-rh-lime dark:bg-white/[0.06]'
                          : 'border-black/10 hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-white/[0.04]'
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-rh-ink dark:text-white">
                          {option.kind === 'booking' ? 'Booking: ' : ''}
                          {option.label}
                        </span>
                        <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                          {option.physioName} · {option.detail}
                          {option.matchesRequestPhysio ? ' · the physio they chose' : ''}
                          {option.hasOpenLoan ? ' · MediLoan already started' : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-rh-ink dark:text-white">{formatKobo(option.amountKobo)}</span>
                    </button>
                  )
                })}
                {choice && <QuoteHint amountKobo={choice.amountKobo} />}
              </div>
            )}

            {error && <Callout tone="danger">{error}</Callout>}

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={close} disabled={loading} className={softButtonClass}>
                Cancel
              </Button>
              {financing && financing.options.length === 0 && financing.physio ? (
                <Button onClick={requestInvoice} disabled={loading || request.status === 'awaiting_invoice'} className={primaryButtonClass}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {request.status === 'awaiting_invoice' ? 'Invoice already requested' : `Ask ${financing.physio.name} to invoice`}
                </Button>
              ) : (
                <Button onClick={initiate} disabled={loading || !choice} className={primaryButtonClass}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Initiate loan{choice ? ` · ${formatKobo(choice.amountKobo)}` : ''}
                  {!loading && <ChevronRight className="ml-1 h-4 w-4" />}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function AdminLoansPage() {
  const [tab, setTab] = useState<'requests' | 'applications'>('requests')
  const [initiating, setInitiating] = useState<LoanRequest | null>(null)
  const [dismissing, setDismissing] = useState<LoanRequest | null>(null)
  const [justInitiated, setJustInitiated] = useState<string | null>(null)

  const cancelLoanRequest = useMutation(api.mediloan.cancelLoanRequest)
  const requests = useQuery(api.mediloan.getAllLoanRequests, {})
  const loans = useQuery(api.mediloan.getAllLoans)

  const [busyLoan, setBusyLoan] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<LoanApplication | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const isLoading = requests === undefined || loans === undefined
  const pendingCount = requests?.filter((r: LoanRequest) => r.status === 'pending' || r.status === 'awaiting_invoice').length ?? 0
  const totalLoans = loans?.length ?? 0
  const approvedLoans =
    loans?.filter((l: LoanApplication) => ['approved', 'offer_accepted', 'disbursed', 'repaid', 'defaulted'].includes(l.status)).length ?? 0
  const disbursedValue =
    loans
      ?.filter((l: LoanApplication) => ['disbursed', 'repaid', 'defaulted'].includes(l.status))
      .reduce((s: number, l: LoanApplication) => s + (l.amountApproved ?? l.amount), 0) ?? 0

  /** Refresh (ask MyItura) or cancel one loan through /api/myitura/loans/{id}. */
  const loanAction = async (loan: LoanApplication, action: 'refresh' | 'cancel', reason?: string) => {
    setBusyLoan(loan._id)
    try {
      const res = await fetch(`/api/myitura/loans/${loan._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; result?: string; status?: string }
      if (!res.ok) throw new Error(data.error || 'MyItura request failed')
      if (action === 'cancel') {
        playSound('reject')
        toast.success('Loan cancelled')
      } else {
        playSound('success')
        const label = data.status ? LOAN_STATUS[data.status]?.label ?? data.status : null
        toast.success(data.result === 'updated' ? `Updated: ${label}` : `No change${label ? `: ${label}` : ''}`)
      }
      return true
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'MyItura request failed'))
      return false
    } finally {
      setBusyLoan(null)
    }
  }

  const dismiss = async () => {
    if (!dismissing) return
    try {
      await cancelLoanRequest({ requestId: dismissing._id, adminNotes: 'Dismissed by admin' })
      playSound('reject')
      toast.success('Loan request dismissed')
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Could not dismiss the request'))
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Patients & Care"
        title="MediLoan"
        description="Review patient loan requests and initiate loans with MyItura on their behalf."
      />

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatTile label="Pending requests" value={isLoading ? '…' : pendingCount} hint="Waiting for your action" icon={Clock} tone={pendingCount > 0 ? 'attention' : 'teal'} />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Loans initiated" value={isLoading ? '…' : totalLoans} icon={WalletCards} />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Approved / disbursed" value={isLoading ? '…' : approvedLoans} icon={CheckCircle2} tone="mint" />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Disbursed value" value={isLoading ? '…' : formatKobo(disbursedValue)} icon={Banknote} tone="mint" />
        </StaggerItem>
      </Stagger>

      <Tabs value={tab} onValueChange={(v) => setTab(v === 'applications' ? 'applications' : 'requests')} className="space-y-4">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="requests">
            Loan requests
            {pendingCount > 0 && <span className="ml-1.5 rounded-full bg-rh-amber px-1.5 text-[10px] font-semibold tabular-nums text-rh-ink">{pendingCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="applications">Initiated loans</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-0">
          <Panel
            title="Patient loan requests"
            description="Patients who submitted a MediLoan interest form. Initiate a loan to have MyItura text the patient an application link."
          >
            {requests === undefined ? (
              <LoadingBlock />
            ) : requests.length === 0 ? (
              <EmptyState
                icon={<Clock />}
                title="No loan requests yet"
                description="When a patient submits a MediLoan request on a booking page, it appears here."
              />
            ) : (
              <div className={cn(tableWrapClass, 'px-2 pb-2')}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Treatment</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((req: LoanRequest) => {
                      const status = justInitiated === req._id && req.status === 'pending' ? REQUEST_STATUS.initiated : REQUEST_STATUS[req.status] ?? REQUEST_STATUS.pending
                      return (
                        <TableRow key={req._id}>
                          <TableCell>
                            <div className="font-medium text-rh-ink dark:text-white">
                              {req.patientFirstName} {req.patientLastName}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">{req.patientPhone}</div>
                            {req.patientEmail && <div className="text-xs text-neutral-500 dark:text-neutral-400">{req.patientEmail}</div>}
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate text-sm text-neutral-600 dark:text-neutral-300">{req.treatment}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">{dateTime(req.createdAt)}</TableCell>
                          <TableCell>
                            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                          </TableCell>
                          <TableCell className="text-right">
                            {(req.status === 'pending' || req.status === 'awaiting_invoice') && justInitiated !== req._id ? (
                              <div className="flex items-center justify-end gap-2">
                                <Button size="sm" onClick={() => setInitiating(req)} className={cn(primaryButtonClass, 'h-8 text-xs')}>
                                  <Banknote className="mr-1.5 h-3.5 w-3.5" /> Initiate loan
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDismissing(req)}
                                  className="h-8 rounded-xl text-xs text-neutral-500 hover:bg-rh-blush hover:text-rose-700 dark:text-neutral-400 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                                >
                                  <XCircle className="mr-1 h-3.5 w-3.5" /> Dismiss
                                </Button>
                              </div>
                            ) : req.status === 'initiated' || justInitiated === req._id ? (
                              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">SMS sent to patient</span>
                            ) : (
                              <span className="text-xs text-neutral-400">Dismissed</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="applications" className="mt-0">
          <Panel
            title="Initiated loan applications"
            description="Loans submitted to MyItura. Updates arrive by webhook; use Refresh if one looks stuck. A paid-out loan marks its invoice paid."
          >
            {loans === undefined ? (
              <LoadingBlock />
            ) : loans.length === 0 ? (
              <EmptyState icon={<Banknote />} title="No loans initiated yet" description="Initiate a loan from the Loan requests tab." />
            ) : (
              <div className={cn(tableWrapClass, 'px-2 pb-2')}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Treatment</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>References</TableHead>
                      <TableHead>Initiated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans.map((loan: LoanApplication) => {
                      const status = LOAN_STATUS[loan.status] ?? { label: loan.status, tone: 'neutral' as Tone }
                      return (
                        <TableRow key={loan._id}>
                          <TableCell>
                            <div className="font-medium text-rh-ink dark:text-white">
                              {loan.patientFirstName} {loan.patientLastName}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">{loan.patientPhone}</div>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate text-sm text-neutral-600 dark:text-neutral-300">{loan.treatment}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-rh-ink dark:text-white">
                            {formatKobo(loan.amount)}
                            {loan.amountApproved !== undefined && loan.amountApproved !== loan.amount && (
                              <div className="text-xs font-normal text-neutral-500 dark:text-neutral-400">Approved {formatKobo(loan.amountApproved)}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                            {loan.repaymentStatus && <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Repayment: {loan.repaymentStatus}</div>}
                            {loan.attentionReason && (
                              <div className="mt-1 max-w-[260px] rounded-lg bg-rh-peach px-2 py-1 text-[11px] font-medium leading-snug text-[#94560a] dark:bg-amber-400/10 dark:text-amber-300">
                                {loan.attentionReason}
                              </div>
                            )}
                            {loan.lastEventAt && (
                              <div className="mt-0.5 text-[11px] text-neutral-400">Last update {format(loan.lastEventAt, 'd MMM, h:mm a')}</div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                            <div>{loan.myituraSdkRef || '—'}</div>
                            {loan.invoiceReference && (
                              <div className="font-sans">{loan.bookingId ? 'Booking' : loan.invoiceId ? 'Invoice' : 'Ref'} {loan.invoiceReference}</div>
                            )}
                            {!loan.invoiceId && !loan.bookingId && <div className="font-sans text-amber-700 dark:text-amber-300">Not linked</div>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                            {loan.createdAt ? format(loan.createdAt, 'd MMM yyyy') : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {loan.applicationUrl && (loan.status === 'initiated' || loan.status === 'pending') && (
                                <>
                                  {mediLoanWhatsAppUrl(loan.patientPhone, loan.patientFirstName, loan.applicationUrl) && (
                                    <Button asChild size="sm" className={cn(primaryButtonClass, 'h-8 text-xs')}>
                                      <a
                                        href={mediLoanWhatsAppUrl(loan.patientPhone, loan.patientFirstName, loan.applicationUrl)!}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Send the application link on WhatsApp"
                                      >
                                        <WhatsApp className="mr-1 h-3.5 w-3.5" /> WhatsApp
                                      </a>
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      navigator.clipboard
                                        .writeText(loan.applicationUrl!)
                                        .then(() => toast.success('Application link copied'))
                                        .catch(() => toast.error('Could not copy the link'))
                                    }}
                                    className={cn(softButtonClass, 'h-8 text-xs')}
                                  >
                                    <Copy className="mr-1 h-3.5 w-3.5" /> Copy link
                                  </Button>
                                </>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busyLoan === loan._id}
                                onClick={() => loanAction(loan, 'refresh')}
                                className={cn(softButtonClass, 'h-8 text-xs')}
                              >
                                {busyLoan === loan._id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                                Refresh
                              </Button>
                              {CANCELLABLE.has(loan.status) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busyLoan === loan._id}
                                  onClick={() => {
                                    setCancelReason('')
                                    setCancelling(loan)
                                  }}
                                  className="h-8 rounded-xl text-xs text-neutral-500 hover:bg-rh-blush hover:text-rose-700 dark:text-neutral-400 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                                >
                                  <XCircle className="mr-1 h-3.5 w-3.5" /> Cancel
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <InitiateLoanDialog key={initiating?._id ?? 'none'} request={initiating} onClose={() => setInitiating(null)} onInitiated={setJustInitiated} />
      <ConfirmDialog
        open={!!dismissing}
        onOpenChange={(open) => !open && setDismissing(null)}
        title="Dismiss this loan request?"
        description={
          dismissing
            ? `${dismissing.patientFirstName} ${dismissing.patientLastName}'s request for "${dismissing.treatment}" will be marked as dismissed. No loan is started.`
            : undefined
        }
        confirmLabel="Dismiss request"
        destructive
        onConfirm={dismiss}
      />
      <Dialog open={!!cancelling} onOpenChange={(open) => !open && busyLoan === null && setCancelling(null)}>
        <DialogContent className={`${dialogClass} sm:max-w-md`}>
          {cancelling && (
            <>
              <DialogHeader>
                <DialogTitle className={dialogTitleClass}>
                  <XCircle className="h-5 w-5 text-rose-600" />
                  Cancel this MediLoan?
                </DialogTitle>
                <DialogDescription>
                  {cancelling.patientFirstName} {cancelling.patientLastName}&apos;s application for {formatKobo(cancelling.amount)} is cancelled at MyItura. This
                  only works before the loan pays out.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <label htmlFor="cancel-reason" className={labelClass}>
                  Reason <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Patient paid another way"
                  className={inputClass}
                  autoFocus
                />
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setCancelling(null)} disabled={busyLoan !== null} className={softButtonClass}>
                  Keep it
                </Button>
                <Button
                  disabled={busyLoan !== null || cancelReason.trim().length < 3}
                  onClick={async () => {
                    if (await loanAction(cancelling, 'cancel', cancelReason.trim())) setCancelling(null)
                  }}
                  className="rounded-xl bg-rose-600 text-white hover:bg-rose-700"
                >
                  {busyLoan !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cancel loan
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
