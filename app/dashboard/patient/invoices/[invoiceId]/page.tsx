'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { usePaystackCheckout } from '@/components/billing/PaystackCheckout'
import { PaystackTestModeBanner } from '@/components/billing/PaystackTestModeBanner'
import { Calendar, CalendarCheck, Clock, Copy, Download, Loader2, Lock, Receipt } from '@/components/icons'
import { cn } from '@/lib/utils'
import {
  DetailRow,
  EmptyState,
  PageContainer,
  PageHeader,
  PageSkeleton,
  Panel,
  accentButtonClass,
  secondaryButtonClass,
  softButtonClass,
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
} from '../invoice-ui'
import { PayWithMediLoan, type MyLoan } from '@/components/patient/MediLoanCard'

const BACK = { href: '/dashboard/patient/invoices', label: 'Invoices' }

export default function PatientInvoiceDetailPage() {
  const params = useParams()
  const invoiceId = params.invoiceId as string
  const { initializePayment } = usePaystackCheckout()
  const generateInvoicePDF = useMutation(api.billing.generateInvoicePDF)
  const [paying, setPaying] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const invoice = useQuery(
    api.billing.getInvoiceForPatient,
    invoiceId ? { invoiceId: invoiceId as Id<'invoices'> } : 'skip'
  ) as PatientInvoice | null | undefined
  const loans = useQuery(api.mediloan.getMyLoans) as MyLoan[] | undefined

  if (invoice === undefined) return <PageSkeleton />

  if (invoice === null) {
    return (
      <PageContainer className="max-w-3xl">
        <PageHeader title="Invoice" back={BACK} />
        <Panel>
          <EmptyState
            icon={Receipt}
            title="We couldn’t find this invoice"
            description="It may have been removed, or it belongs to a different account."
            action={
              <Button asChild className={softButtonClass}>
                <Link href={BACK.href}>See all invoices</Link>
              </Button>
            }
          />
        </Panel>
      </PageContainer>
    )
  }

  const payable = payableOf(invoice)
  const failed = lastAttemptFailed(invoice)
  const state = invoiceState(invoice)
  const loan = loanForInvoice(loans, invoice._id)
  // While a MediLoan is deciding this invoice, card payment steps aside so nobody pays twice
  const canPayNow = invoice.canPay && !loanIsOpen(loan)

  const handlePayNow = async () => {
    setPaying(true)
    try {
      await initializePayment(invoice._id)
      // Paystack takes over from here
    } catch (err) {
      console.error('Payment init error:', err)
      toast.error('We couldn’t start the payment. Please try again.')
      setPaying(false)
    }
  }

  const downloadPdf = async () => {
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

  const copyShareLink = async () => {
    const shareUrl = `${window.location.origin}/invoices/shared/${invoice._id}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success('Link copied', { description: 'Anyone with this link can view the invoice.' })
    } catch {
      toast.error('Couldn’t copy the link', { description: shareUrl })
    }
  }

  return (
    <PageContainer className="max-w-5xl">
      <PaystackTestModeBanner className="rounded-2xl" />

      <PageHeader
        back={BACK}
        title={`Invoice #${invoice.invoiceNumber}`}
        description={`${invoice.clinicName || 'Rehabify'} · Issued ${safeDate(invoice.issueDate, 'd MMMM yyyy')}`}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-5">
          <Panel title="What it’s for" info="Each service on this invoice, with any discount and extra charges. Amounts are in naira.">
            <InvoiceBreakdown invoice={invoice} />
          </Panel>

          {invoice.notes && (
            <Panel title="Note from your clinic">
              <p className="text-sm leading-relaxed text-pt-ink">{invoice.notes}</p>
            </Panel>
          )}
        </div>

        <Panel className="lg:sticky lg:top-20" bodyClassName="p-5 sm:p-6">
          <div className="space-y-5">
            <div>
              <InvoiceStatus invoice={invoice} withInfo />
              <p className="mt-3 text-sm text-pt-muted">{invoice.status === 'paid' ? 'Total paid' : 'Total to pay'}</p>
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-pt-ink">{money(payable, invoice.currency)}</p>
              <p className="mt-1 text-xs text-pt-muted">{STATE_META[state].explain}</p>
            </div>

            <div className="divide-y divide-pt-line border-y border-pt-line">
              <DetailRow icon={Calendar} label="Issued">
                {safeDate(invoice.issueDate, 'd MMMM yyyy')}
              </DetailRow>
              {invoice.status !== 'paid' && invoice.status !== 'void' && (
                <DetailRow icon={Clock} label="Due">
                  <span className={cn(invoice.isOverdue && 'font-semibold text-pt-rose-fg')}>
                    {safeDate(invoice.dueDate, 'd MMMM yyyy')}
                  </span>
                </DetailRow>
              )}
              {invoice.paymentDate && (
                <DetailRow icon={CalendarCheck} label="Paid on">
                  {safeDate(invoice.paymentDate, 'd MMMM yyyy, h:mm a')}
                  {paidByMediLoan(invoice) && <span className="text-pt-muted"> · by MediLoan</span>}
                </DetailRow>
              )}
            </div>

            <InvoiceMediLoanNote invoice={invoice} loan={loan} />

            {failed && (
              <p className="rounded-2xl bg-pt-rose-bg px-4 py-3 text-sm text-pt-rose-fg">
                Your last payment didn’t go through, so nothing was charged. You can try again.
              </p>
            )}
            {paymentProcessing(invoice) && (
              <p className="rounded-2xl bg-pt-blue-bg px-4 py-3 text-sm text-pt-blue-fg">
                A payment was started and is being confirmed. If you finished it, this page updates on its own.
              </p>
            )}

            <div className="space-y-2">
              {canPayNow && (
                <Button onClick={handlePayNow} disabled={paying} className={cn(accentButtonClass, 'h-12 w-full text-base')}>
                  {paying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                  {failed ? 'Try again' : 'Pay'} {money(payable, invoice.currency)}
                </Button>
              )}
              {canPayNow && (
                <PayWithMediLoan
                  target={{ invoiceId: invoice._id }}
                  amountKobo={invoice.totalAmount}
                  what={`invoice #${invoice.invoiceNumber}`}
                  className="h-11 w-full"
                />
              )}
              {invoice.status === 'paid' ? (
                <Button asChild className={cn(secondaryButtonClass, 'h-11 w-full')}>
                  <Link href={`/dashboard/patient/invoices/${invoice._id}/receipt`}>
                    <Receipt className="mr-2 h-4 w-4" />
                    View receipt
                  </Link>
                </Button>
              ) : (
                <Button onClick={downloadPdf} disabled={downloading} className={cn(secondaryButtonClass, 'h-11 w-full')}>
                  {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Download PDF
                </Button>
              )}
              <button
                type="button"
                onClick={copyShareLink}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium text-pt-muted hover:bg-pt-hover hover:text-pt-ink"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy a link to share
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </PageContainer>
  )
}
