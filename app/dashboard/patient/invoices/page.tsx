'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertTriangle, CheckCircle2, ChevronRight, Copy, Download, ExternalLink, Loader2, Lock, Receipt, Wallet } from '@/components/icons'
import { usePaystackCheckout } from '@/components/billing/PaystackCheckout'
import { PaystackTestModeBanner } from '@/components/billing/PaystackTestModeBanner'
import { cn } from '@/lib/utils'
import {
  EmptyState,
  IconChip,
  LoadingBlocks,
  PageContainer,
  PageHeader,
  Panel,
  PatientDrawer,
  StatTile,
  accentButtonClass,
  secondaryButtonClass,
  tabsListClass,
  tabsTriggerClass,
} from '@/components/patient/ui'
import {
  InvoiceBreakdown,
  InvoiceMediLoanNote,
  InvoiceStatus,
  STATE_META,
  invoiceState,
  lastAttemptFailed,
  loanForInvoice,
  loanIsOpen,
  money,
  paidByMediLoan,
  payableOf,
  paymentProcessing,
  safeDate,
  type PatientInvoice,
} from './invoice-ui'
import { MediLoanStatusBadge, PayWithMediLoan, type MyLoan } from '@/components/patient/MediLoanCard'

type Filter = 'all' | 'to_pay' | 'paid'

export default function PatientInvoicesPage() {
  const invoices = useQuery(api.billing.getPatientInvoices, { limit: 50 }) as PatientInvoice[] | undefined
  const loans = useQuery(api.mediloan.getMyLoans) as MyLoan[] | undefined
  const generateInvoicePDF = useMutation(api.billing.generateInvoicePDF)
  const { initializePayment } = usePaystackCheckout()

  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const year = new Date().getFullYear()
  const stats = useMemo(() => {
    const list = invoices ?? []
    const toPay = list.filter((inv) => inv.canPay)
    const paidThisYear = list.filter(
      (inv) => inv.status === 'paid' && new Date(inv.paymentDate ?? inv.issueDate).getFullYear() === year
    )
    return {
      toPayCount: toPay.length,
      toPayTotal: toPay.reduce((sum, inv) => sum + payableOf(inv), 0),
      overdueCount: toPay.filter((inv) => inv.isOverdue).length,
      paidCount: list.filter((inv) => inv.status === 'paid').length,
      paidThisYear: paidThisYear.reduce((sum, inv) => sum + payableOf(inv), 0),
    }
  }, [invoices, year])

  const visible = useMemo(() => {
    const list = invoices ?? []
    if (filter === 'to_pay') return list.filter((inv) => inv.canPay)
    if (filter === 'paid') return list.filter((inv) => inv.status === 'paid')
    return list
  }, [invoices, filter])

  const openInvoice = (invoices ?? []).find((inv) => inv._id === openId) ?? null
  const openLoan = openInvoice ? loanForInvoice(loans, openInvoice._id) : null

  const handlePayNow = async (invoice: PatientInvoice) => {
    setPayingId(invoice._id)
    try {
      await initializePayment(invoice._id)
      // Paystack takes over from here
    } catch (error) {
      toast.error('We couldn’t start the payment. Please try again.')
      console.error('Payment error:', error)
      setPayingId(null)
    }
  }

  const copyShareLink = async (invoice: PatientInvoice) => {
    const shareUrl = `${window.location.origin}/invoices/shared/${invoice._id}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success('Link copied', { description: 'Anyone with this link can view the invoice.' })
    } catch {
      toast.error('Couldn’t copy the link', { description: shareUrl })
    }
  }

  const downloadPdf = async (invoice: PatientInvoice) => {
    setDownloading(true)
    try {
      const result = await generateInvoicePDF({ invoiceId: invoice._id })
      if (result.pdfUrl) window.open(result.pdfUrl, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('We couldn’t create the PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <PageContainer>
      <PaystackTestModeBanner className="rounded-2xl" />

      <PageHeader
        title="Invoices"
        description="Your bills, payments and receipts."
        info="Every visit or service you book gets an invoice. Amounts are in naira. Paid invoices have a receipt you can print or save."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          label="To pay"
          value={invoices ? money(stats.toPayTotal) : '—'}
          hint={stats.toPayCount === 0 ? 'Nothing outstanding' : `${stats.toPayCount} invoice${stats.toPayCount === 1 ? '' : 's'}`}
          icon={Wallet}
          tone={stats.toPayCount > 0 ? 'amber' : 'neutral'}
          info="The total of invoices you haven’t paid yet (outstanding), including any that are overdue."
        />
        <StatTile
          label={`Paid in ${year}`}
          value={invoices ? money(stats.paidThisYear) : '—'}
          hint={`${stats.paidCount} paid invoice${stats.paidCount === 1 ? '' : 's'} in total`}
          icon={CheckCircle2}
          tone="green"
          info={`Everything you’ve paid since 1 January ${year}.`}
        />
        <div className="col-span-2 lg:col-span-1">
          <StatTile
            label="Overdue"
            value={invoices ? stats.overdueCount : '—'}
            hint={stats.overdueCount > 0 ? 'Past the due date' : 'All on time'}
            icon={AlertTriangle}
            tone={stats.overdueCount > 0 ? 'rose' : 'neutral'}
            info="Invoices whose due date has passed. You can still pay them."
          />
        </div>
      </div>

      <Panel
        title="Your invoices"
        actions={
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList className={tabsListClass}>
              <TabsTrigger value="all" className={tabsTriggerClass}>
                All
              </TabsTrigger>
              <TabsTrigger value="to_pay" className={tabsTriggerClass}>
                To pay{stats.toPayCount > 0 ? ` (${stats.toPayCount})` : ''}
              </TabsTrigger>
              <TabsTrigger value="paid" className={tabsTriggerClass}>
                Paid
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        {invoices === undefined ? (
          <LoadingBlocks rows={3} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={filter === 'paid' ? Receipt : Wallet}
            title={
              invoices.length === 0 ? 'No invoices yet' : filter === 'to_pay' ? 'Nothing to pay' : 'No paid invoices yet'
            }
            description={
              invoices.length === 0
                ? 'When you book a visit or service, its invoice shows up here.'
                : filter === 'to_pay'
                  ? 'You’re all paid up.'
                  : 'Invoices you pay will show up here with their receipts.'
            }
          />
        ) : (
          <ul className="-mx-2 divide-y divide-pt-line">
            {visible.map((invoice) => {
              const state = invoiceState(invoice)
              const paying = payingId === invoice._id
              const loan = loanForInvoice(loans, invoice._id)
              const loanOpen = loanIsOpen(loan)
              return (
                <li key={invoice._id} className="flex flex-col gap-2 py-1 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => setOpenId(invoice._id)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-pt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50"
                  >
                    <IconChip icon={Receipt} tone={STATE_META[state].tone} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-pt-ink">#{invoice.invoiceNumber}</span>
                        <InvoiceStatus invoice={invoice} />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-pt-muted">
                        {invoice.clinicName || 'Rehabify'} · Issued {safeDate(invoice.issueDate, 'd MMM yyyy')}
                        {invoice.canPay && invoice.dueDate ? ` · Due ${safeDate(invoice.dueDate, 'd MMM')}` : ''}
                      </span>
                      {lastAttemptFailed(invoice) && (
                        <span className="mt-0.5 block text-xs font-medium text-pt-rose-fg">Last payment didn’t go through</span>
                      )}
                      {paidByMediLoan(invoice) && <span className="mt-0.5 block text-xs text-pt-green-fg">Paid by MediLoan</span>}
                      {loanOpen && loan && (
                        <span className="mt-1 block">
                          <MediLoanStatusBadge status={loan.status} />
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-pt-ink">
                      {money(payableOf(invoice), invoice.currency)}
                    </span>
                    <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-pt-faint sm:block" />
                  </button>
                  {invoice.canPay && !loanOpen && (
                    <div className="px-2 pb-2 sm:pb-0">
                      <Button
                        size="sm"
                        onClick={() => handlePayNow(invoice)}
                        disabled={payingId !== null}
                        className={cn(accentButtonClass, 'h-9 w-full px-4 sm:w-auto')}
                      >
                        {paying ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Lock className="mr-1.5 h-3.5 w-3.5" />}
                        Pay
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <PatientDrawer
        open={!!openInvoice}
        onOpenChange={(open) => !open && setOpenId(null)}
        title={openInvoice ? `Invoice #${openInvoice.invoiceNumber}` : 'Invoice'}
        description={
          openInvoice
            ? `${openInvoice.clinicName || 'Rehabify'} · Issued ${safeDate(openInvoice.issueDate, 'd MMMM yyyy')}`
            : undefined
        }
        footer={
          openInvoice ? (
            <div className="space-y-2">
              {openInvoice.canPay && !loanIsOpen(openLoan) && (
                <Button
                  onClick={() => handlePayNow(openInvoice)}
                  disabled={payingId !== null}
                  className={cn(accentButtonClass, 'h-12 w-full text-base')}
                >
                  {payingId === openInvoice._id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="mr-2 h-4 w-4" />
                  )}
                  {lastAttemptFailed(openInvoice) ? 'Try again' : 'Pay'} {money(payableOf(openInvoice), openInvoice.currency)}
                </Button>
              )}
              {openInvoice.canPay && !loanIsOpen(openLoan) && (
                <PayWithMediLoan
                  target={{ invoiceId: openInvoice._id }}
                  // MediLoan covers what's owed; card fees don't apply
                  amountKobo={openInvoice.totalAmount}
                  what={`invoice #${openInvoice.invoiceNumber}`}
                  className="h-11 w-full"
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button asChild className={cn(secondaryButtonClass, 'h-11')}>
                  <Link href={`/dashboard/patient/invoices/${openInvoice._id}`}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Full invoice
                  </Link>
                </Button>
                {openInvoice.status === 'paid' ? (
                  <Button asChild className={cn(secondaryButtonClass, 'h-11')}>
                    <Link href={`/dashboard/patient/invoices/${openInvoice._id}/receipt`}>
                      <Receipt className="mr-2 h-4 w-4" />
                      Receipt
                    </Link>
                  </Button>
                ) : (
                  <Button
                    onClick={() => downloadPdf(openInvoice)}
                    disabled={downloading}
                    className={cn(secondaryButtonClass, 'h-11')}
                  >
                    {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    PDF
                  </Button>
                )}
              </div>
              <button
                type="button"
                onClick={() => copyShareLink(openInvoice)}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium text-pt-muted hover:bg-pt-hover hover:text-pt-ink"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy a link to share
              </button>
            </div>
          ) : undefined
        }
      >
        {openInvoice && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-pt-sunken p-5 text-center">
              <p className="text-sm text-pt-muted">{openInvoice.status === 'paid' ? 'Total paid' : 'Total to pay'}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-pt-ink">
                {money(payableOf(openInvoice), openInvoice.currency)}
              </p>
              <div className="mt-2 flex justify-center">
                <InvoiceStatus invoice={openInvoice} withInfo />
              </div>
              <p className="mt-2 text-xs text-pt-muted">
                {openInvoice.status === 'paid'
                  ? `Paid on ${safeDate(openInvoice.paymentDate, 'd MMMM yyyy')}`
                  : openInvoice.canPay && openInvoice.dueDate
                    ? `Due ${safeDate(openInvoice.dueDate, 'd MMMM yyyy')}`
                    : null}
              </p>
            </div>

            <InvoiceMediLoanNote invoice={openInvoice} loan={openLoan} />
            {lastAttemptFailed(openInvoice) && (
              <p className="rounded-2xl bg-pt-rose-bg px-4 py-3 text-sm text-pt-rose-fg">
                Your last payment didn’t go through, so nothing was charged. You can try again.
              </p>
            )}
            {paymentProcessing(openInvoice) && (
              <p className="rounded-2xl bg-pt-blue-bg px-4 py-3 text-sm text-pt-blue-fg">
                A payment was started and is being confirmed. If you finished it, this updates on its own.
              </p>
            )}

            <div>
              <p className="mb-1 text-sm font-semibold text-pt-ink">What it’s for</p>
              <InvoiceBreakdown invoice={openInvoice} />
            </div>

            {openInvoice.notes && (
              <div className="rounded-2xl bg-pt-sunken p-4">
                <p className="text-xs font-medium text-pt-faint">Note from your clinic</p>
                <p className="mt-1 text-sm text-pt-ink">{openInvoice.notes}</p>
              </div>
            )}
          </div>
        )}
      </PatientDrawer>
    </PageContainer>
  )
}
