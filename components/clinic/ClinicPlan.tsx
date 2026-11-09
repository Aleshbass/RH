'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAction, useConvex, useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Download, Loader2, ReceiptText } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, Panel, StatusBadge, primaryButtonClass } from '@/components/clinic/ui'
import {
  SUBSCRIPTION_STATUS_LABEL,
  downloadRowsAsCsv,
  formatKobo,
  type ClinicSubscriptionInvoiceView,
  type MyClinicPlan,
} from '@/lib/clinicSubscriptions'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'

const planRef = makeFunctionReference<'query', Record<string, never>, MyClinicPlan>('clinicBilling:getMyClinicPlan')
const payRef = makeFunctionReference<'action', { invoiceId: string }, { authorizationUrl: string }>(
  'clinicBilling:payClinicSubscriptionInvoice'
)
const verifyRef = makeFunctionReference<'action', { reference: string }, { status: string }>(
  'clinicBilling:verifyClinicSubscriptionPayment'
)
const upgradeRef = makeFunctionReference<'mutation', { plan: 'growth' | 'enterprise' }, { alreadyRequested: boolean }>(
  'clinicBilling:requestClinicPlanUpgrade'
)
type ExportKind = 'patients' | 'appointments' | 'invoices'
const exportRef = makeFunctionReference<'query', { kind: ExportKind }, { rows: Record<string, string>[]; capped: boolean }>(
  'clinicTools:exportClinicData'
)

const errorText = (err: unknown, fallback: string) =>
  err instanceof ConvexError && typeof err.data === 'string' ? err.data : fallback

const day = (ms: number | null | undefined) => (typeof ms === 'number' ? format(new Date(ms), 'd MMM yyyy') : '—')

const NEXT_PLAN: Record<string, { plan: 'growth' | 'enterprise'; name: string } | undefined> = {
  starter: { plan: 'growth', name: 'Growth' },
  growth: { plan: 'enterprise', name: 'Enterprise' },
}

function Meter({ label, used, limit, hint }: { label: string; used: number; limit: number; hint?: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : used > 0 ? 100 : 0
  const full = limit > 0 ? used >= limit : used > 0
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-pt-ink">{label}</p>
        <p className="text-sm tabular-nums text-pt-muted">
          <span className="font-semibold text-pt-ink">{used.toLocaleString('en-NG')}</span> of{' '}
          {limit.toLocaleString('en-NG')}
        </p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-pt-sunken"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <div className={cn('h-full rounded-full', full ? 'bg-pt-primary' : 'bg-pt-accent')} style={{ width: `${pct}%` }} />
      </div>
      {hint && <p className="mt-1.5 text-xs text-pt-muted">{hint}</p>}
    </div>
  )
}

function InvoiceStatus({ inv }: { inv: ClinicSubscriptionInvoiceView }) {
  if (inv.status === 'paid') return <StatusBadge tone="green">Paid</StatusBadge>
  if (inv.status === 'void') return <StatusBadge tone="neutral">Cancelled</StatusBadge>
  return inv.overdue ? <StatusBadge tone="red">Overdue</StatusBadge> : <StatusBadge tone="amber">Unpaid</StatusBadge>
}

/** Paystack sends the payer back here with ?reference=CLINICSUB_…; check it once, then tidy the URL. */
function usePaymentReturn() {
  const verify = useAction(verifyRef)
  const router = useRouter()
  const pathname = usePathname()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const reference = params.get('reference') || params.get('trxref')
    if (!reference || !reference.startsWith('CLINICSUB_')) return
    done.current = true
    verify({ reference })
      .then(({ status }) => {
        if (status === 'paid') playSound('paid')
        if (status === 'paid') toast.success('Thanks, your payment went through. Your receipt is on its way.')
        else if (status === 'pending') toast.message('Your payment is still processing. This page updates when it clears.')
        else if (status === 'failed') toast.error("That payment didn't go through. You can try again.")
        else if (status === 'needs_review') toast.error("We received a payment we couldn't match. We'll sort it out and email you.")
      })
      .catch(() => toast.message('We’re checking your payment. This page updates when it clears.'))
      .finally(() => router.replace(pathname))
  }, [verify, router, pathname])
}

export function ClinicDataExport() {
  const convex = useConvex()
  const [busy, setBusy] = useState<ExportKind | null>(null)
  const run = async (kind: ExportKind) => {
    setBusy(kind)
    try {
      const { rows, capped } = await convex.query(exportRef, { kind })
      if (rows.length === 0) {
        toast.message(`No ${kind} to export yet.`)
        return
      }
      downloadRowsAsCsv(`clinic-${kind}-${format(new Date(), 'yyyy-MM-dd')}`, rows)
      playSound('success')
      toast.success(capped ? `Exported the latest ${rows.length.toLocaleString('en-NG')} ${kind}` : `Exported ${rows.length.toLocaleString('en-NG')} ${kind}`)
    } catch (err) {
      toast.error(errorText(err, 'Could not export. Please try again.'))
    } finally {
      setBusy(null)
    }
  }
  return (
    <Panel title="Export your data" description="Download your records as CSV files. Included in every plan, and always available.">
      <div className="flex flex-wrap gap-2 px-5 py-4 sm:px-6">
        {(['patients', 'appointments', 'invoices'] as const).map((kind) => (
          <Button key={kind} variant="outline" size="sm" disabled={busy !== null} onClick={() => run(kind)} className="capitalize">
            {busy === kind ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            {kind}
          </Button>
        ))}
      </div>
    </Panel>
  )
}

export default function ClinicPlan() {
  const data = useQuery(planRef, {})
  const pay = useAction(payRef)
  const requestUpgrade = useMutation(upgradeRef)
  const [paying, setPaying] = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  usePaymentReturn()

  if (data === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }
  if (data === null) {
    return (
      <Panel>
        <EmptyState title="Your plan isn't available" description="Ask the clinic owner if you need to see the clinic's plan and invoices." />
      </Panel>
    )
  }

  const payInvoice = async (invoiceId: string) => {
    setPaying(invoiceId)
    try {
      const { authorizationUrl } = await pay({ invoiceId })
      window.location.href = authorizationUrl
    } catch (err) {
      toast.error(errorText(err, 'Could not start the payment. Please try again.'))
      setPaying(null)
    }
  }

  const sub = data.subscription
  const usage = data.usage
  const next = sub ? NEXT_PLAN[sub.plan] : undefined
  const billingOn = sub && (sub.status === 'active' || sub.status === 'past_due' || sub.status === 'read_only')
  const openInvoices = data.invoices.filter((inv) => inv.status === 'open')

  const askUpgrade = async () => {
    if (!next) return
    setUpgrading(true)
    try {
      await requestUpgrade({ plan: next.plan })
      playSound('success')
      toast.success(`Thanks. We'll be in touch about moving to ${next.name}.`)
    } catch (err) {
      toast.error(errorText(err, 'Could not send your request. Please try again.'))
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <div className="space-y-6">
      {!sub ? (
        <Panel title="Your plan">
          <p className="px-5 py-4 text-sm text-pt-muted sm:px-6">
            Your clinic isn&apos;t billed for Rehabify yet. We&apos;ll email you before that changes.
          </p>
        </Panel>
      ) : (
        <Panel
          title="Your plan"
          actions={<StatusBadge tone={sub.status === 'active' ? 'green' : sub.status === 'cancelled' ? 'neutral' : sub.status === 'read_only' ? 'red' : 'amber'}>{SUBSCRIPTION_STATUS_LABEL[sub.status]}</StatusBadge>}
        >
          <div className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="min-w-0 space-y-3">
              <div>
                <p className="text-lg font-semibold tracking-tight text-pt-ink">{sub.planName}</p>
                <p className="text-sm text-pt-muted">
                  <span className="font-semibold tabular-nums text-pt-ink">{formatKobo(sub.monthlyFeeKobo)}</span> a
                  month, excluding VAT
                </p>
              </div>
              {sub.launchWeekFree && (
                <p className="rounded-xl bg-pt-accent-soft px-3 py-2 text-sm text-pt-ink">
                  <span className="font-semibold">Free for launch week.</span> Your plan costs nothing from {sub.launchWeekLabel}. Billing
                  starts on {day(sub.billingStartsAt)}.
                </p>
              )}
              <dl className="space-y-1.5 text-sm">
                {sub.currentPeriodLabel && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-pt-muted">This period</dt>
                    <dd className="text-right text-pt-ink">{sub.currentPeriodLabel}</dd>
                  </div>
                )}
                {billingOn && sub.nextInvoiceAt && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-pt-muted">{sub.currentPeriodStart ? 'Next invoice' : 'First invoice'}</dt>
                    <dd className="text-right text-pt-ink">{day(sub.nextInvoiceAt)}</dd>
                  </div>
                )}
                {data.owedKobo > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-pt-muted">To pay</dt>
                    <dd className="text-right font-semibold tabular-nums text-pt-ink">{formatKobo(data.owedKobo)}</dd>
                  </div>
                )}
              </dl>
              {billingOn && next && (
                <div className="pt-1">
                  {sub.upgradeRequestedPlan ? (
                    <p className="text-xs text-pt-muted">
                      You asked to move to a bigger plan{sub.upgradeRequestedAt ? ` on ${day(sub.upgradeRequestedAt)}` : ''}. We&apos;ll be in
                      touch.
                    </p>
                  ) : (
                    <Button size="sm" variant="outline" onClick={askUpgrade} disabled={upgrading}>
                      {upgrading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                      Ask to upgrade to {next.name}
                    </Button>
                  )}
                </div>
              )}
              {sub.status === 'cancelled' && (
                <p className="text-xs text-pt-muted">Billing has stopped. No new invoices will be issued.</p>
              )}
            </div>

            {usage && (
              <div className="min-w-0 space-y-5 lg:border-l lg:border-pt-line lg:pl-6">
                <Meter
                  label="Clinician seats"
                  used={usage.seatsUsed}
                  limit={sub.seatLimit}
                  hint={
                    usage.seatsPending > 0
                      ? `${usage.seatsPending} more held by invitation${usage.seatsPending === 1 ? '' : 's'} still waiting. Admin and reception users are free.`
                      : 'One seat per named physiotherapist. Admin and reception users are free.'
                  }
                />
                <Meter
                  label="Active patient programmes"
                  used={usage.activeProgrammes}
                  limit={sub.programmeAllowance}
                  hint={`Patients whose programme was created, changed or used in the last 30 days. Each one over ${sub.programmeAllowance.toLocaleString('en-NG')} is ${formatKobo(data.overageUnitKobo)} a month, billed the month after.`}
                />
              </div>
            )}
          </div>
        </Panel>
      )}

      {data.invoices.length > 0 && (
        <Panel
          title="Invoices from Rehabify"
          description={openInvoices.length > 0 ? 'Each invoice is payable within 7 days.' : 'All paid. Thank you.'}
        >
          <ul className="divide-y divide-pt-line">
            {data.invoices.map((inv) => (
              <li key={inv._id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:px-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-medium text-pt-ink">{inv.periodLabel}</p>
                    <InvoiceStatus inv={inv} />
                  </div>
                  <p className="text-xs text-pt-muted">
                    {inv.number} ·{' '}
                    {inv.status === 'paid'
                      ? `Paid ${day(inv.paidAt)}${inv.paymentMethod === 'bank_transfer' ? ' by bank transfer' : ''}`
                      : inv.status === 'void'
                        ? `Issued ${day(inv.issuedAt)}`
                        : `Issued ${day(inv.issuedAt)} · due ${day(inv.dueAt)}`}
                  </p>
                  {inv.lines.map((line, i) => (
                    <p key={i} className="text-xs text-pt-muted">
                      {line.kind === 'overage' ? `${line.quantity} extra programme${line.quantity === 1 ? '' : 's'} × ${formatKobo(line.unitKobo)}` : line.label}
                      {inv.lines.length > 1 ? ` · ${formatKobo(line.amountKobo)}` : ''}
                    </p>
                  ))}
                  {inv.status === 'open' && inv.readOnlyFrom && (
                    <p className="text-xs text-pt-amber-fg">Your account becomes read-only on {day(inv.readOnlyFrom)} if this is unpaid.</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                  <p className="text-sm font-semibold tabular-nums text-pt-ink">{formatKobo(inv.amountKobo)}</p>
                  {inv.status === 'open' ? (
                    <Button size="sm" className={primaryButtonClass} disabled={paying !== null} onClick={() => payInvoice(inv._id)}>
                      {paying === inv._id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                      Pay
                    </Button>
                  ) : inv.receiptUrl ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={inv.receiptUrl} target="_blank" rel="noreferrer">
                        <ReceiptText className="mr-1.5 h-4 w-4" />
                        Receipt
                      </a>
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {openInvoices.length > 0 && (
            <p className="border-t border-pt-line px-5 py-3 text-xs text-pt-muted sm:px-6">
              Pay by card, bank transfer or USSD through Paystack. Paying by direct bank transfer instead? Email{' '}
              <a href="mailto:hello@myrehabifyhealth.com" className="font-medium underline underline-offset-2">
                hello@myrehabifyhealth.com
              </a>{' '}
              with the invoice number.
            </p>
          )}
        </Panel>
      )}

      {data.canExport && <ClinicDataExport />}
    </div>
  )
}
