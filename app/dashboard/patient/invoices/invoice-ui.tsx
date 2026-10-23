'use client'

import { format } from 'date-fns'
import type { Id } from '@/convex/_generated/dataModel'
import { InfoTip, StatusBadge, type Tone } from '@/components/patient/ui'

/** api.billing.getPatientInvoices / getInvoiceForPatient. Amounts are in kobo. */
export interface PatientInvoice {
  _id: Id<'invoices'>
  invoiceNumber: string
  clinicName?: string
  items: Array<{ description: string; quantity: number; unitPrice: number; totalPrice: number }>
  subtotalAmount: number
  discountAmount?: number
  platformFeeAmount: number
  totalAmount: number
  status: string
  issueDate: number
  dueDate: number
  notes?: string
  isOverdue: boolean
  canPay: boolean
  currency: string
  paymentMethod?: string
  paymentDate?: number
  /** What checkout charges (kobo), worked out on the server */
  payableAmount?: number
  patientFees?: { label: string; amount: number }[]
  lastPaymentStatus?: string
  paymentReference?: string
}

export const payableOf = (invoice: PatientInvoice) => invoice.payableAmount ?? invoice.totalAmount

/** Kobo to a naira amount, e.g. ₦12,500.00 */
export function money(kobo: number, currency = 'NGN') {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency || 'NGN' }).format((kobo || 0) / 100)
}

export function safeDate(value: number | undefined, pattern: string) {
  return typeof value === 'number' && Number.isFinite(value) ? format(new Date(value), pattern) : '—'
}

export type InvoiceState = 'paid' | 'void' | 'overdue' | 'to_pay' | 'other'

export function invoiceState(invoice: Pick<PatientInvoice, 'status' | 'isOverdue' | 'canPay'>): InvoiceState {
  if (invoice.status === 'paid') return 'paid'
  if (invoice.status === 'void') return 'void'
  if (invoice.isOverdue) return 'overdue'
  if (invoice.canPay || invoice.status === 'pending' || invoice.status === 'sent') return 'to_pay'
  return 'other'
}

export const STATE_META: Record<InvoiceState, { label: string; tone: Tone; explain: string }> = {
  paid: { label: 'Paid', tone: 'green', explain: 'Paid in full. Your receipt is ready to view or print.' },
  void: { label: 'Cancelled', tone: 'neutral', explain: 'This invoice was cancelled, so there’s nothing to pay.' },
  overdue: { label: 'Overdue', tone: 'rose', explain: 'The due date has passed. You can still pay it now.' },
  to_pay: { label: 'To pay', tone: 'amber', explain: 'Waiting for payment. Pay any time before the due date.' },
  other: { label: 'Open', tone: 'neutral', explain: 'Questions about this invoice? Message your physio or clinic.' },
}

function statusLabel(invoice: PatientInvoice, state: InvoiceState) {
  if (state !== 'other' || !invoice.status) return STATE_META[state].label
  const words = invoice.status.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function InvoiceStatus({ invoice, withInfo = false }: { invoice: PatientInvoice; withInfo?: boolean }) {
  const state = invoiceState(invoice)
  const meta = STATE_META[state]
  return (
    <span className="inline-flex items-center gap-1">
      <StatusBadge tone={meta.tone} dot>
        {statusLabel(invoice, state)}
      </StatusBadge>
      {withInfo && <InfoTip label="What this status means">{meta.explain}</InfoTip>}
    </span>
  )
}

export function lastAttemptFailed(invoice: PatientInvoice) {
  return invoice.canPay && (invoice.lastPaymentStatus === 'failed' || invoice.lastPaymentStatus === 'cancelled')
}

export function paymentProcessing(invoice: PatientInvoice) {
  return invoice.canPay && (invoice.lastPaymentStatus === 'pending' || invoice.lastPaymentStatus === 'processing')
}

/** Line items, discount, fees and the total, as a calm list that fits a phone. */
export function InvoiceBreakdown({ invoice }: { invoice: PatientInvoice }) {
  const fees = invoice.patientFees ?? []
  return (
    <div>
      <ul className="divide-y divide-pt-line">
        {invoice.items.map((item, index) => (
          <li key={index} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-pt-ink">{item.description}</p>
              <p className="text-xs text-pt-muted">
                {item.quantity} × {money(item.unitPrice, invoice.currency)}
              </p>
            </div>
            <p className="shrink-0 text-sm font-medium tabular-nums text-pt-ink">{money(item.totalPrice, invoice.currency)}</p>
          </li>
        ))}
      </ul>

      <div className="mt-2 space-y-2 border-t border-pt-line pt-3 text-sm">
        <div className="flex justify-between text-pt-muted">
          <span>Subtotal</span>
          <span className="tabular-nums">{money(invoice.subtotalAmount, invoice.currency)}</span>
        </div>
        {invoice.discountAmount && invoice.discountAmount > 0 ? (
          <div className="flex justify-between text-pt-green-fg">
            <span>Discount</span>
            <span className="tabular-nums">−{money(invoice.discountAmount, invoice.currency)}</span>
          </div>
        ) : null}
        {fees.map((fee, index) => (
          <div key={`${fee.label}-${index}`} className="flex justify-between text-pt-muted">
            <span className="flex items-center gap-1">
              {fee.label}
              {index === 0 && <InfoTip>Extra charges added at checkout. They’re always shown here before you pay.</InfoTip>}
            </span>
            <span className="tabular-nums">{money(fee.amount, invoice.currency)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-1 text-base font-semibold text-pt-ink">
          <span>{invoice.status === 'paid' ? 'Total paid' : 'Total to pay'}</span>
          <span className="tabular-nums">{money(payableOf(invoice), invoice.currency)}</span>
        </div>
      </div>
    </div>
  )
}
