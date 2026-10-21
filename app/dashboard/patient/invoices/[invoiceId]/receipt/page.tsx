'use client'

import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'

type ReceiptInvoice = {
  _id: Id<'invoices'>
  invoiceNumber: string
  clinicName?: string
  items: { description: string; quantity: number; unitPrice: number; totalPrice: number }[]
  discountAmount?: number
  totalAmount: number
  status: string
  currency: string
  paymentMethod?: string
  paymentDate?: number
  payableAmount?: number
  patientFees?: { label: string; amount: number }[]
  paymentReference?: string
}

const money = (kobo: number, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format((kobo || 0) / 100)

const METHOD_LABELS: Record<string, string> = {
  paystack: 'Card or bank (Paystack)',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  transfer: 'Bank transfer',
  pos: 'POS',
}

/** A receipt for a paid invoice, ready to print or save as PDF from the browser. */
export default function InvoiceReceiptPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.invoiceId as Id<'invoices'>
  const invoice = useQuery(api.billing.getInvoiceForPatient, invoiceId ? { invoiceId } : 'skip') as
    | ReceiptInvoice
    | null
    | undefined

  if (invoice === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!invoice || invoice.status !== 'paid') {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <Button variant="outline" onClick={() => router.push('/dashboard/patient/invoices')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to invoices
        </Button>
        <p className="text-gray-700">A receipt is available once the invoice has been paid.</p>
      </div>
    )
  }

  const paid = invoice.payableAmount ?? invoice.totalAmount

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="outline" onClick={() => router.push(`/dashboard/patient/invoices/${invoice._id}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={() => window.print()} className="bg-[#005b57] text-white hover:bg-[#004843]">
          <Printer className="mr-2 h-4 w-4" />
          Print or save as PDF
        </Button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 print:rounded-none print:border-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Image src="/logos/MainRehabify.svg" alt="Rehabify" width={120} height={34} />
            <p className="mt-3 text-sm text-gray-500">{invoice.clinicName ?? 'Rehabify Health'}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-gray-900">Payment receipt</p>
            <p className="text-sm text-gray-500">Invoice #{invoice.invoiceNumber}</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="text-gray-500">Paid on</dt>
          <dd className="text-right text-gray-900">
            {invoice.paymentDate ? format(new Date(invoice.paymentDate), 'd MMMM yyyy, HH:mm') : '—'}
          </dd>
          <dt className="text-gray-500">Payment method</dt>
          <dd className="text-right text-gray-900">
            {invoice.paymentMethod ? METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod : '—'}
          </dd>
          {invoice.paymentReference && (
            <>
              <dt className="text-gray-500">Reference</dt>
              <dd className="break-all text-right font-mono text-xs text-gray-900">{invoice.paymentReference}</dd>
            </>
          )}
        </dl>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
              <th className="py-2 font-medium">Service</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2 text-gray-900">
                  {item.description}
                  {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                </td>
                <td className="py-2 text-right text-gray-900">{money(item.totalPrice, invoice.currency)}</td>
              </tr>
            ))}
            {invoice.discountAmount && invoice.discountAmount > 0 ? (
              <tr className="border-b border-gray-100">
                <td className="py-2 text-gray-600">Discount</td>
                <td className="py-2 text-right text-gray-600">−{money(invoice.discountAmount, invoice.currency)}</td>
              </tr>
            ) : null}
            {(invoice.patientFees ?? []).map((fee) => (
              <tr key={fee.label} className="border-b border-gray-100">
                <td className="py-2 text-gray-600">{fee.label}</td>
                <td className="py-2 text-right text-gray-600">{money(fee.amount, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 font-semibold text-gray-900">Total paid</td>
              <td className="pt-3 text-right text-lg font-bold text-gray-900">{money(paid, invoice.currency)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-8 text-xs text-gray-500">
          Thank you. Keep this receipt for your records. Questions about this payment: hello@myrehabifyhealth.com
        </p>
      </div>
    </div>
  )
}
