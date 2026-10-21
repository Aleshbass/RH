'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAction, useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Copy, CreditCard, Landmark, Loader2, MoreHorizontal, Plus, Send } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useClinicAccess } from '@/components/clinic/ClinicPreviewContext'
import { FeeBreakdown, HowPayoutsWork } from '@/components/clinic/FeeBreakdown'
import {
  EmptyState,
  PageShell,
  Panel,
  StatTile,
  StatusBadge,
  formatNaira,
  primaryButtonClass,
} from '@/components/clinic/ui'
import { cn } from '@/lib/utils'
import { PaystackTestModeBanner } from '@/components/billing/PaystackTestModeBanner'

type Filter = 'unpaid' | 'paid' | 'all'
type SourceFilter = 'all' | 'clinic_direct' | 'rehabify_referral'

/** A date that can't throw: an invoice saved without a valid date shows a dash instead of crashing */
function safeFormat(value: number | null | undefined, pattern: string) {
  return typeof value === 'number' && Number.isFinite(value) ? format(new Date(value), pattern) : '—'
}
type OfflineMethod = 'cash' | 'bank_transfer' | 'pos'

const CUSTOM_SERVICE = '__custom__'

const statusBadge: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'neutral' }> = {
  paid: { label: 'Paid', tone: 'green' },
  sent: { label: 'Unpaid', tone: 'amber' },
  partial_payment: { label: 'Part paid', tone: 'amber' },
  overdue: { label: 'Overdue', tone: 'red' },
  void: { label: 'Cancelled', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'neutral' },
  failed: { label: 'Payment failed', tone: 'red' },
}

const methodLabel: Record<string, string> = {
  paystack: 'Paystack',
  cash: 'cash',
  bank_transfer: 'bank transfer',
  pos: 'POS',
}

const payoutLabel: Record<string, { label: string; attention?: boolean }> = {
  collected: { label: 'Collected in person' },
  sent_to_bank: { label: 'Paid out to your bank by Paystack' },
  held_by_rehabify: { label: 'Held by Rehabify — we’ll transfer it', attention: true },
}

/** Convex only passes ConvexError messages through to the browser in production */
function errorText(err: unknown, fallback: string) {
  return err instanceof ConvexError ? String(err.data) : fallback
}

/**
 * "Paystack ₦A · Rehabify 20% ₦B · Stamp duty on payout ₦C · You get ₦D" in the order the money
 * moves, leaving out parts that are zero. Uses the amounts fixed on the invoice when it was created.
 */
function feeLine(inv: {
  paystackFeeNaira?: number
  stampDutyNaira?: number
  rehabifyFeeNaira: number
  rehabifySharePercent?: number | null
  clinicNetNaira: number
}) {
  const rehabifyLabel = typeof inv.rehabifySharePercent === 'number' ? `Rehabify ${inv.rehabifySharePercent}%` : 'Rehabify'
  return [
    inv.paystackFeeNaira ? `Paystack ${formatNaira(inv.paystackFeeNaira)}` : null,
    inv.rehabifyFeeNaira ? `${rehabifyLabel} ${formatNaira(inv.rehabifyFeeNaira)}` : null,
    inv.stampDutyNaira ? `Stamp duty on payout ${formatNaira(inv.stampDutyNaira)}` : null,
    `You get ${formatNaira(inv.clinicNetNaira)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Hint under "Your share this month": what came off, leaving out parts that are zero */
function shareHint(rehabifyNaira: number, processingNaira: number) {
  const parts = [
    rehabifyNaira > 0 ? `${formatNaira(rehabifyNaira)} Rehabify fees` : null,
    processingNaira > 0 ? `${formatNaira(processingNaira)} payment processing` : null,
  ].filter(Boolean)
  return parts.length ? `After ${parts.join(' and ')}` : 'No fees this month'
}

/** wa.me needs international digits; Nigerian numbers are often stored as 080… */
function whatsappNumber(phone: string | null | undefined) {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 11) digits = `234${digits.slice(1)}`
  return digits.length >= 10 ? digits : null
}

function whatsappLink(phone: string | null, message: string) {
  const number = whatsappNumber(phone)
  const text = encodeURIComponent(message)
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`
}

function paymentMessage(patientName: string, service: string, amountNaira: number, link: string) {
  const first = patientName.split(' ')[0] || 'there'
  return `Hello ${first}, here is your payment link for ${service} (${formatNaira(amountNaira)}): ${link}`
}

export default function ClinicBillingPage() {
  const { requireFullAccess, isOwner } = useClinicAccess()
  const billing = useQuery(api.clinicTools.getClinicBillingSummary)
  const createPaymentLink = useAction(api.clinicBilling.createPaymentLink)
  const markInvoicePaid = useMutation(api.clinicBilling.markInvoicePaid)
  const voidInvoice = useMutation(api.clinicBilling.voidInvoice)

  const [filter, setFilter] = useState<Filter>('unpaid')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [requestOpen, setRequestOpen] = useState(false)
  const [busyInvoice, setBusyInvoice] = useState<string | null>(null)
  const [markPaidFor, setMarkPaidFor] = useState<{ id: string; label: string } | null>(null)
  const [offlineMethod, setOfflineMethod] = useState<OfflineMethod>('cash')
  const [cancelFor, setCancelFor] = useState<{ id: string; label: string } | null>(null)

  const invoices = useMemo(() => {
    if (!billing) return []
    const bySource =
      sourceFilter === 'all'
        ? billing.invoices
        : billing.invoices.filter((inv: any) => (inv.patientSource ?? 'clinic_direct') === sourceFilter)
    if (filter === 'all') return bySource
    if (filter === 'paid') return bySource.filter((inv: any) => inv.status === 'paid')
    return bySource.filter((inv: any) => ['sent', 'overdue', 'partial_payment'].includes(inv.status))
  }, [billing, filter, sourceFilter])

  if (billing === undefined) {
    return (
      <PageShell title="Billing">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </PageShell>
    )
  }

  const unpaidCount = billing.invoices.filter((inv: any) => ['sent', 'overdue', 'partial_payment'].includes(inv.status)).length

  const getLink = async (invoiceId: string) => {
    const { paymentLink } = await createPaymentLink({ invoiceId: invoiceId as Id<'invoices'> })
    return paymentLink
  }

  // Sample invoices (ids starting "prev_") must never reach a mutation
  const isSample = (id: string) => billing.isPreview || id.startsWith('prev_')

  const handleCopyLink = async (inv: (typeof billing.invoices)[number]) => {
    if (!requireFullAccess('Copy payment link') || isSample(inv._id)) return
    setBusyInvoice(inv._id)
    try {
      const link = inv.paymentLink ?? (await getLink(inv._id))
      await navigator.clipboard.writeText(link)
      toast.success('Payment link copied')
    } catch (err) {
      toast.error(errorText(err, 'Could not create a payment link'))
    } finally {
      setBusyInvoice(null)
    }
  }

  const handleWhatsApp = async (inv: (typeof billing.invoices)[number]) => {
    if (!requireFullAccess('Send payment link') || isSample(inv._id)) return
    // Open the window synchronously so mobile browsers don't block it as a popup
    const win = window.open('', '_blank')
    setBusyInvoice(inv._id)
    try {
      const link = inv.paymentLink ?? (await getLink(inv._id))
      const url = whatsappLink(inv.patientPhone, paymentMessage(inv.patientName, inv.serviceName, inv.totalAmountNaira, link))
      if (win) win.location.href = url
      else window.location.href = url
    } catch (err) {
      win?.close()
      toast.error(errorText(err, 'Could not create a payment link'))
    } finally {
      setBusyInvoice(null)
    }
  }

  const confirmMarkPaid = async () => {
    if (!markPaidFor || isSample(markPaidFor.id)) return
    setBusyInvoice(markPaidFor.id)
    try {
      await markInvoicePaid({ invoiceId: markPaidFor.id as Id<'invoices'>, method: offlineMethod })
      toast.success('Invoice marked as paid')
      setMarkPaidFor(null)
    } catch (err) {
      toast.error(errorText(err, 'Could not update the invoice'))
    } finally {
      setBusyInvoice(null)
    }
  }

  const confirmCancel = async () => {
    if (!cancelFor || isSample(cancelFor.id)) return
    setBusyInvoice(cancelFor.id)
    try {
      await voidInvoice({ invoiceId: cancelFor.id as Id<'invoices'> })
      toast.success('Invoice cancelled')
      setCancelFor(null)
    } catch (err) {
      toast.error(errorText(err, 'Could not cancel the invoice'))
    } finally {
      setBusyInvoice(null)
    }
  }

  return (
    <PageShell
      title="Billing"
      description="Request payments, share Paystack links and track what you're owed."
      actions={
        <Button
          size="sm"
          className={primaryButtonClass}
          onClick={() => requireFullAccess('Request payment', () => setRequestOpen(true))}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Request payment
        </Button>
      }
    >
      <PaystackTestModeBanner />

      {!billing.isPreview && !billing.payoutAccount && (
        <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:items-center">
          <Landmark className="h-5 w-5 shrink-0 text-neutral-400 dark:text-neutral-500" />
          <p className="min-w-0 flex-1 text-sm text-neutral-600 dark:text-neutral-300">
            {isOwner
              ? 'Connect your bank account so Paystack pays your share straight to you. Until then, online payments settle to Rehabify and we transfer your share manually.'
              : 'No bank account is connected yet, so online payments settle to Rehabify and are transferred to the clinic manually. The clinic owner can connect one in Clinic settings.'}
          </p>
          {isOwner && (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/clinic/settings#payouts">Connect bank account</Link>
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Owed to you"
          value={formatNaira(billing.unpaidNaira)}
          hint={`${billing.unpaidCount} unpaid invoice${billing.unpaidCount === 1 ? '' : 's'}`}
          tone={billing.unpaidCount > 0 ? 'attention' : 'default'}
        />
        <StatTile
          label="Collected this month"
          value={formatNaira(billing.paidThisMonthNaira)}
          hint="Total paid by patients"
        />
        <StatTile
          label="Your share this month"
          value={formatNaira(billing.netThisMonthNaira)}
          hint={shareHint(billing.feesThisMonthNaira, billing.processingFeesThisMonthNaira)}
        />
      </div>

      <Panel
        title="Invoices"
        actions={
          <div className="flex flex-wrap items-center gap-2">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            aria-label="Which patients"
            className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
          >
            <option value="all">All patients</option>
            <option value="clinic_direct">Clinic&apos;s own patients</option>
            <option value="rehabify_referral">Referred by Rehabify</option>
          </select>
          <div className="flex rounded-lg border border-neutral-200 p-0.5 text-sm dark:border-neutral-800">
            {(['unpaid', 'paid', 'all'] as Filter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={cn(
                  'rounded-md px-2.5 py-1 capitalize',
                  filter === option
                    ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                )}
              >
                {option}
                {option === 'unpaid' && unpaidCount > 0 ? ` (${unpaidCount})` : ''}
              </button>
            ))}
          </div>
          </div>
        }
      >
        {invoices.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="h-8 w-8" />}
            title={filter === 'unpaid' ? 'Nothing owed right now' : 'No invoices yet'}
            description="Request a payment and send the patient a Paystack link they can pay from their phone."
          />
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {invoices.map((inv: any) => {
              const badge = statusBadge[inv.status] ?? { label: inv.status, tone: 'neutral' as const }
              const unpaid = ['sent', 'overdue', 'partial_payment'].includes(inv.status)
              const busy = busyInvoice === inv._id
              const showFee = unpaid || (inv.status === 'paid' && inv.paymentMethod === 'paystack')
              const payout = inv.status === 'paid' && inv.payoutStatus ? payoutLabel[inv.payoutStatus] : undefined
              return (
                <li key={inv._id} className="flex items-start gap-3 px-4 py-3 sm:items-center sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{inv.patientName}</p>
                      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                      {inv.patientSource === 'rehabify_referral' && <StatusBadge tone="neutral">Referred by Rehabify</StatusBadge>}
                    </div>
                    <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {inv.serviceName} · {inv.invoiceNumber}
                    </p>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">
                      {inv.status === 'paid' && inv.paidAt
                        ? `Paid ${safeFormat(inv.paidAt, 'd MMM yyyy')}${inv.paymentMethod ? ` by ${methodLabel[inv.paymentMethod] ?? inv.paymentMethod}` : ''}`
                        : `Issued ${safeFormat(inv.createdAt, 'd MMM yyyy')} · due ${safeFormat(inv.dueDate, 'd MMM')}`}
                    </p>
                    {showFee && (
                      <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                        {unpaid ? `If paid online: ${feeLine(inv)}` : feeLine(inv)}
                      </p>
                    )}
                    {payout && (
                      <p
                        className={cn(
                          'text-xs',
                          payout.attention
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-neutral-500 dark:text-neutral-400'
                        )}
                      >
                        {payout.label}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">
                      {formatNaira(inv.totalAmountNaira)}
                    </p>
                  </div>

                  {unpaid ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="hidden sm:inline-flex"
                        disabled={busy}
                        onClick={() => handleWhatsApp(inv)}
                      >
                        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                        WhatsApp link
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Invoice actions" disabled={busy}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="sm:hidden" onClick={() => handleWhatsApp(inv)}>
                            <Send className="mr-2 h-4 w-4" /> Send link on WhatsApp
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCopyLink(inv)}>
                            <Copy className="mr-2 h-4 w-4" /> Copy payment link
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              requireFullAccess('Mark as paid', () =>
                                setMarkPaidFor({ id: inv._id, label: `${inv.patientName} · ${formatNaira(inv.totalAmountNaira)}` })
                              )
                            }
                          >
                            Mark as paid (cash, POS, transfer)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                            onClick={() =>
                              requireFullAccess('Cancel invoice', () =>
                                setCancelFor({ id: inv._id, label: `${inv.patientName} · ${formatNaira(inv.totalAmountNaira)}` })
                              )
                            }
                          >
                            Cancel invoice
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <div className="w-8 shrink-0 sm:hidden" />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <HowPayoutsWork account={billing.isPreview ? undefined : billing.payoutAccount} />

      <RequestPaymentDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        priceList={billing.priceList}
      />

      <Dialog open={markPaidFor !== null} onOpenChange={(open) => !open && setMarkPaidFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as paid</DialogTitle>
            <DialogDescription>{markPaidFor?.label}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>How did they pay?</Label>
            <Select value={offlineMethod} onValueChange={(value) => setOfflineMethod(value as OfflineMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="pos">POS</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              No fees on payments you collect yourself. You keep the full amount.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMarkPaidFor(null)}>
              Back
            </Button>
            <Button className={primaryButtonClass} onClick={confirmMarkPaid} disabled={busyInvoice !== null}>
              Mark as paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelFor !== null} onOpenChange={(open) => !open && setCancelFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel this invoice?</DialogTitle>
            <DialogDescription>
              {cancelFor?.label}. Any payment link already sent will stop being tracked.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelFor(null)}>
              Keep invoice
            </Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={busyInvoice !== null}>
              Cancel invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

function RequestPaymentDialog({
  open,
  onOpenChange,
  priceList,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  priceList: { name: string; priceNaira: number }[]
}) {
  const patients = useQuery(api.clinics.getClinicPatients, open ? {} : 'skip')
  const createRequest = useMutation(api.clinicTools.createClinicPaymentRequest)
  const createPaymentLink = useAction(api.clinicBilling.createPaymentLink)

  const [patientId, setPatientId] = useState('')
  const [service, setService] = useState(priceList[0]?.name ?? CUSTOM_SERVICE)
  const [customService, setCustomService] = useState('')
  const [amount, setAmount] = useState(priceList[0] ? String(priceList[0].priceNaira) : '')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ link: string | null; error?: string; patientName: string; phone: string | null; service: string; amount: number } | null>(null)

  const reset = () => {
    setPatientId('')
    setService(priceList[0]?.name ?? CUSTOM_SERVICE)
    setCustomService('')
    setAmount(priceList[0] ? String(priceList[0].priceNaira) : '')
    setNote('')
    setResult(null)
  }

  const close = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const chooseService = (value: string) => {
    setService(value)
    const item = priceList.find((p) => p.name === value)
    if (item) setAmount(String(item.priceNaira))
  }

  const serviceName = service === CUSTOM_SERVICE ? customService.trim() : service
  const amountNaira = Number(amount)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) return toast.error('Choose a patient')
    if (!serviceName) return toast.error('Describe what the payment is for')
    if (!(amountNaira > 0)) return toast.error('Enter an amount')

    const patient = patients?.find((p: any) => p._id === patientId)
    const patientName = patient ? `${patient.firstName} ${patient.lastName}`.trim() : 'Patient'
    setSaving(true)
    try {
      const { invoiceId } = await createRequest({
        patientId: patientId as Id<'users'>,
        serviceName,
        amountNaira,
        notes: note.trim() || undefined,
      })
      try {
        const { paymentLink } = await createPaymentLink({ invoiceId })
        setResult({ link: paymentLink, patientName, phone: patient?.phoneNumber ?? null, service: serviceName, amount: amountNaira })
      } catch (err) {
        setResult({
          link: null,
          error: errorText(err, 'The invoice was saved, but a Paystack link could not be created.'),
          patientName,
          phone: patient?.phoneNumber ?? null,
          service: serviceName,
          amount: amountNaira,
        })
      }
    } catch (err) {
      toast.error(errorText(err, 'Could not create the payment request'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>{result.link ? 'Payment link ready' : 'Invoice saved'}</DialogTitle>
              <DialogDescription>
                {result.patientName} · {result.service} · {formatNaira(result.amount)}
              </DialogDescription>
            </DialogHeader>
            {result.link ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
                  <p className="min-w-0 flex-1 truncate text-sm text-neutral-700 dark:text-neutral-300">{result.link}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2"
                    onClick={async () => {
                      await navigator.clipboard.writeText(result.link!)
                      toast.success('Payment link copied')
                    }}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
                <Button asChild className={cn('w-full', primaryButtonClass)}>
                  <a
                    href={whatsappLink(result.phone, paymentMessage(result.patientName, result.service, result.amount, result.link))}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Send className="mr-1.5 h-4 w-4" /> Send on WhatsApp
                  </a>
                </Button>
                <p className="text-xs text-neutral-500">
                  The invoice is marked paid automatically once the patient pays.
                </p>
              </div>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400">{result.error}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Request payment</DialogTitle>
              <DialogDescription>We&apos;ll create a Paystack link you can send to the patient.</DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label>Patient</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger>
                  <SelectValue placeholder={patients === undefined ? 'Loading patients…' : 'Choose a patient'} />
                </SelectTrigger>
                <SelectContent>
                  {(patients ?? []).map((p: any) => (
                    <SelectItem key={p._id} value={p._id}>
                      {`${p.firstName} ${p.lastName}`.trim() || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {patients?.length === 0 && (
                <p className="text-xs text-neutral-500">
                  Add a patient first on the <Link href="/dashboard/clinic/patients" className="underline">Patients</Link> page.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>For</Label>
              <Select value={service} onValueChange={chooseService}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priceList.map((item) => (
                    <SelectItem key={item.name} value={item.name}>
                      {item.name} · {formatNaira(item.priceNaira)}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_SERVICE}>Something else…</SelectItem>
                </SelectContent>
              </Select>
              {service === CUSTOM_SERVICE && (
                <Input
                  placeholder="e.g. Home visit"
                  value={customService}
                  onChange={(e) => setCustomService(e.target.value)}
                />
              )}
              {priceList.length === 0 && (
                <p className="text-xs text-neutral-500">
                  Save your services in <Link href="/dashboard/clinic/settings#prices" className="underline">Clinic settings</Link> to pick them here.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (₦)</Label>
              <Input
                id="amount"
                inputMode="numeric"
                placeholder="15000"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
              />
              {amountNaira > 0 && (
                <div className="pt-1">
                  <FeeBreakdown amountNaira={amountNaira} className="sm:max-w-xs" />
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Paystack fee and stamp duty are estimates. Cash, POS and transfer payments have no fees.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" className={primaryButtonClass} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Create payment link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
