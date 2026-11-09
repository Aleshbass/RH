/**
 * Client-side shapes of the clinic subscription functions in convex/clinicBilling.ts, written out
 * by hand: the generated `api` types are too deep to infer here (TS2589). Keep them in step with
 * invoiceView / subscriptionView in that file.
 */

export type ClinicSubscriptionStatus = 'inactive' | 'active' | 'past_due' | 'read_only' | 'cancelled'
export type ClinicPlanKey = 'starter' | 'growth' | 'enterprise'

export type ClinicSubscriptionView = {
  _id: string
  plan: ClinicPlanKey
  planName: string
  status: ClinicSubscriptionStatus
  seatLimit: number
  programmeAllowance: number
  monthlyFeeKobo: number
  billingStartsAt: number
  billingStartDate: string
  currentPeriodStart: number | null
  currentPeriodEnd: number | null
  currentPeriodLabel: string | null
  nextInvoiceAt: number | null
  warnedAt80: number | null
  warnedAt100: number | null
  readOnlySince: number | null
  upgradeRequestedPlan: string | null
  upgradeRequestedAt: number | null
  /** On a plan during launch week: nothing is billed until the start date */
  launchWeekFree: boolean
  launchWeekLabel: string
}

export type ClinicSubscriptionInvoiceView = {
  _id: string
  number: string
  planName: string
  periodLabel: string
  lines: { kind: 'subscription' | 'overage' | 'proration'; label: string; quantity: number; unitKobo: number; amountKobo: number }[]
  amountKobo: number
  status: 'open' | 'paid' | 'void'
  overdue: boolean
  issuedAt: number
  dueAt: number
  paidAt: number | null
  paymentMethod: 'paystack' | 'bank_transfer' | null
  noticeSentAt: number | null
  readOnlyFrom: number | null
  receiptUrl: string | null
  receiptNumber: string | null
}

export type ClinicUsage = { seatsUsed: number; seatsPending: number; activeProgrammes: number }

/** clinicBilling:getMyClinicPlan */
export type MyClinicPlan = {
  canExport: boolean
  subscription: ClinicSubscriptionView | null
  usage: ClinicUsage | null
  invoices: ClinicSubscriptionInvoiceView[]
  owedKobo: number
  overageUnitKobo: number
} | null

/** clinicBilling:getMyClinicBillingBanner */
export type ClinicBillingBanner = {
  kind: 'read_only' | 'past_due' | 'allowance_100' | 'allowance_80'
  canPay: boolean
  owedKobo: number
  allowance: number
  readOnlyFrom: number | null
} | null

/** clinicBilling:adminGetClinicSubscription */
export type AdminClinicSubscription = {
  agreement: { plan: 'starter' | 'growth' | null; signedAt: number; countersigned: boolean } | null
  subscription: (ClinicSubscriptionView & { note: string | null }) | null
  usage: ClinicUsage
  invoices: (ClinicSubscriptionInvoiceView & { paymentNote: string | null; voidReason: string | null })[]
  today: string
  /** The date input's minimum: 16 November while launch week runs, otherwise today */
  earliestStartDate: string
  launchWeek: { label: string; billingFrom: string } | null
  suggestedStartDate: string
} | null

/** clinicBilling:adminClinicBillingAttention */
export type ClinicBillingAttentionRow = {
  clinicId: string
  clinicName: string
  clinicNumber: string | null
  status: 'past_due' | 'read_only'
  planName: string
  owedKobo: number
  openInvoices: number
  oldestDueAt: number | null
  readOnlyFrom: number | null
  readOnlySince: number | null
}

export const formatKobo = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`

export const SUBSCRIPTION_STATUS_LABEL: Record<ClinicSubscriptionStatus, string> = {
  inactive: 'Billing off',
  active: 'Active',
  past_due: 'Past due',
  read_only: 'Read-only',
  cancelled: 'Billing stopped',
}

/** Writes rows as a CSV download. Cells that look like formulas are quoted so spreadsheets don't run them. */
export function downloadRowsAsCsv(filename: string, rows: Record<string, string>[]) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const cell = (value: string | undefined) => {
    let s = value ?? ''
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(cell).join(','), ...rows.map((row) => headers.map((h) => cell(row[h])).join(','))].join('\r\n')
  // BOM so Excel reads ₦ and accents correctly
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
