'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { ArrowLeft, Printer, Receipt } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { EmptyState, PageContainer, PageSkeleton, Panel, primaryButtonClass, softButtonClass } from '@/components/patient/ui'
import { money, payableOf, type PatientInvoice } from '../../invoice-ui'

const METHOD_LABELS: Record<string, string> = {
  paystack: 'Card or bank (Paystack)',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  transfer: 'Bank transfer',
  pos: 'POS',
}

/*
 * Printing shows only the receipt sheet, not the dashboard around it. The sheet uses fixed
 * light colours (not theme tokens) so it reads the same on screen in dark mode and on paper.
 */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #rh-receipt, #rh-receipt * { visibility: visible !important; }
  #rh-receipt { position: absolute; inset: 0 auto auto 0; width: 100%; margin: 0; border: 0; border-radius: 0; box-shadow: none; }
  @page { margin: 16mm; }
}
`

/** A receipt for a paid invoice, ready to print or save as PDF from the browser. */
export default function InvoiceReceiptPage() {
  const params = useParams()
  const invoiceId = params.invoiceId as Id<'invoices'>
  const invoice = useQuery(api.billing.getInvoiceForPatient, invoiceId ? { invoiceId } : 'skip') as
    | PatientInvoice
    | null
    | undefined

  if (invoice === undefined) return <PageSkeleton />

  if (!invoice || invoice.status !== 'paid') {
    return (
      <PageContainer className="max-w-2xl">
        <Panel>
          <EmptyState
            icon={Receipt}
            title="No receipt yet"
            description="A receipt is ready as soon as the invoice is paid."
            action={
              <Button asChild className={softButtonClass}>
                <Link href={invoice ? `/dashboard/patient/invoices/${invoice._id}` : '/dashboard/patient/invoices'}>
                  {invoice ? 'Back to the invoice' : 'See all invoices'}
                </Link>
              </Button>
            }
          />
        </Panel>
      </PageContainer>
    )
  }

  const paid = payableOf(invoice)

  return (
    <PageContainer className="max-w-2xl space-y-4">
      <style>{PRINT_CSS}</style>

      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`/dashboard/patient/invoices/${invoice._id}`}
          className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-pt-muted transition-colors hover:text-pt-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Invoice
        </Link>
        <Button onClick={() => window.print()} className={`${primaryButtonClass} h-10 px-4`}>
          <Printer className="mr-2 h-4 w-4" />
          Print or save as PDF
        </Button>
      </div>

      <div
        id="rh-receipt"
        style={{ colorScheme: 'light' }}
        className="rounded-3xl border border-[#e7e4dd] bg-[#ffffff] p-6 text-[#16181c] sm:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Image src="/logos/Black%20MainRehabify.svg" alt="Rehabify" width={120} height={30} className="h-7 w-auto" />
            <p className="mt-3 text-sm text-[#5f636b]">{invoice.clinicName ?? 'Rehabify Health'}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xl font-semibold tracking-tight text-[#16181c]">Payment receipt</p>
            <p className="text-sm text-[#5f636b]">Invoice #{invoice.invoiceNumber}</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#e6f9e3] px-2.5 py-0.5 text-[11px] font-semibold text-[#12701d]">
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
              Paid
            </span>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-2xl bg-[#f5f3ee] p-4 text-sm">
          <dt className="text-[#5f636b]">Paid on</dt>
          <dd className="text-right text-[#16181c]">
            {invoice.paymentDate ? format(new Date(invoice.paymentDate), 'd MMMM yyyy, HH:mm') : '—'}
          </dd>
          <dt className="text-[#5f636b]">Payment method</dt>
          <dd className="text-right text-[#16181c]">
            {invoice.paymentMethod ? METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod : '—'}
          </dd>
          {invoice.paymentReference && (
            <>
              <dt className="text-[#5f636b]">Reference</dt>
              <dd className="break-all text-right font-mono text-xs text-[#16181c]">{invoice.paymentReference}</dd>
            </>
          )}
        </dl>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-[#e7e4dd] text-left text-xs uppercase tracking-wider text-[#8e9199]">
              <th className="py-2 font-medium">Service</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, i) => (
              <tr key={i} className="border-b border-[#f0eee9]">
                <td className="py-2.5 pr-4 text-[#16181c]">
                  {item.description}
                  {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                </td>
                <td className="py-2.5 text-right tabular-nums text-[#16181c]">{money(item.totalPrice, invoice.currency)}</td>
              </tr>
            ))}
            {invoice.discountAmount && invoice.discountAmount > 0 ? (
              <tr className="border-b border-[#f0eee9]">
                <td className="py-2.5 text-[#5f636b]">Discount</td>
                <td className="py-2.5 text-right tabular-nums text-[#5f636b]">−{money(invoice.discountAmount, invoice.currency)}</td>
              </tr>
            ) : null}
            {(invoice.patientFees ?? []).map((fee, i) => (
              <tr key={`${fee.label}-${i}`} className="border-b border-[#f0eee9]">
                <td className="py-2.5 text-[#5f636b]">{fee.label}</td>
                <td className="py-2.5 text-right tabular-nums text-[#5f636b]">{money(fee.amount, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 font-semibold text-[#16181c]">Total paid</td>
              <td className="pt-4 text-right text-lg font-semibold tabular-nums text-[#16181c]">{money(paid, invoice.currency)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-8 text-xs leading-relaxed text-[#8e9199]">
          Thank you. Keep this receipt for your records. Questions about this payment: hello@myrehabifyhealth.com
        </p>
      </div>
    </PageContainer>
  )
}
