'use client'

import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { format } from 'date-fns'
import { CheckCircle2, Clock, Download, Eye, Printer, Receipt, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { downloadCsv, primaryButtonClass, softButtonClass, StatusBadge, tableWrapClass } from '@/components/admin/ui'
import { cn } from '@/lib/utils'
import type { PayoutPartner } from './PayoutDialogs'
import { dialogClass, dialogTitleClass, formatKobo, LoadingBlock } from './shared'

type SplitPercents = { physiotherapistPercent: number; rehabifyPercent: number }
type Commission = PayoutPartner['commissions'][number]
type InvoiceLine = FunctionReturnType<typeof api.monthlySettlements.generatePartnerInvoice>['lineItems'][number]

/** Itemised commission entries a partner earned in the cycle. */
export function PartnerLedgerDialog({
  partner,
  billingPeriod,
  split,
  onClose,
}: {
  partner: PayoutPartner | null
  billingPeriod: string
  split?: SplitPercents
  onClose: () => void
}) {
  const physioLabel = split ? `Physio (${split.physiotherapistPercent}%)` : 'Physio'
  const rehabifyLabel = split ? `Rehabify (${split.rehabifyPercent}%)` : 'Rehabify'
  return (
    <Dialog open={!!partner} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`${dialogClass} max-h-[85vh] max-w-4xl overflow-y-auto`}>
        {partner && (
          <>
            <DialogHeader>
              <DialogTitle className={dialogTitleClass}>
                <Eye className="h-5 w-5 text-rh-teal dark:text-rh-aqua" />
                Ledger: {partner.partnerName}
              </DialogTitle>
              <DialogDescription>
                Live commission entries (payments, bonuses and refund adjustments) earned in{' '}
                <strong className="text-rh-night dark:text-white">{billingPeriod}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 rounded-xl bg-rh-canvas p-3 text-xs dark:bg-white/[0.04] sm:grid-cols-4">
              {[
                { label: 'Referred patients', value: partner.totalReferredPatients },
                { label: 'Total charged', value: formatKobo(partner.totalGrossCharged) },
                { label: physioLabel, value: formatKobo(partner.totalPhysiotherapistShare) },
                { label: 'Partner earnings (cycle)', value: formatKobo(partner.periodEarningsKobo ?? 0) },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-neutral-500 dark:text-neutral-400">{item.label}</p>
                  <p className="text-sm font-semibold tabular-nums text-rh-night dark:text-white">{item.value}</p>
                </div>
              ))}
            </div>

            <div className={cn(tableWrapClass, 'rounded-xl border border-black/[0.05] dark:border-white/[0.06]')}>
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Care mode</TableHead>
                    <TableHead className="text-right">Charged</TableHead>
                    <TableHead className="text-right">{physioLabel}</TableHead>
                    <TableHead className="text-right">{rehabifyLabel}</TableHead>
                    <TableHead className="text-right">Partner (net)</TableHead>
                    <TableHead className="text-center">Channel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partner.commissions.length > 0 ? (
                    partner.commissions.map((c: Commission) => (
                      <TableRow key={c._id}>
                        <TableCell className="whitespace-nowrap text-neutral-500 dark:text-neutral-400">{format(c.earnedAt, 'd MMM yyyy')}</TableCell>
                        <TableCell className="font-medium text-rh-night dark:text-white">
                          {c.patientName || c.trackingCode || 'Referred patient'}
                          {c.eventType === 'refund_adjustment' && (
                            <StatusBadge tone="red" className="ml-1.5">
                              Refund
                            </StatusBadge>
                          )}
                          {c.eventType === 'activation_bonus' && (
                            <StatusBadge tone="teal" className="ml-1.5">
                              Bonus
                            </StatusBadge>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone="neutral">{c.careMode === 'in_person' ? 'In-person' : c.careMode === 'virtual' ? 'Virtual' : '—'}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatKobo(c.grossTransactionAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatKobo(c.physiotherapistAmount ?? 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatKobo(c.rehabifyAmount ?? 0)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-rh-teal dark:text-rh-aqua">{formatKobo(c.netPayable)}</TableCell>
                        <TableCell className="text-center">
                          <StatusBadge tone={c.paymentMethod === 'bank_transfer' ? 'amber' : 'teal'}>
                            {c.paymentMethod === 'bank_transfer' ? 'Bank transfer' : 'Paystack'}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="py-6 text-center text-neutral-400">
                        No itemised sessions for this partner in this cycle.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <Button onClick={onClose} className={softButtonClass} variant="ghost">
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Settlement statement for a partner and cycle. Rendered on white so it prints like paper. */
export function PartnerInvoiceDialog({
  partnerCode,
  billingPeriod,
  onClose,
}: {
  partnerCode: string | null
  billingPeriod: string
  onClose: () => void
}) {
  const invoice = useQuery(api.monthlySettlements.generatePartnerInvoice, partnerCode ? { partnerCode, billingPeriod } : 'skip')

  const exportCsv = () => {
    if (!invoice || invoice.lineItems.length === 0) {
      toast.info('No line items to export for this cycle')
      return
    }
    const naira = (kobo: number) => (kobo / 100).toFixed(2)
    downloadCsv(
      invoice.invoiceNumber,
      invoice.lineItems.map((l: InvoiceLine) => ({
        'S/N': l.sn,
        Date: l.date,
        'Tracking code': l.trackingCode,
        Patient: l.patientName,
        Physiotherapist: l.physiotherapistName,
        'Care mode': l.careMode,
        'Gross amount (NGN)': naira(l.grossAmountKobo),
        'Physio share (NGN)': naira(l.physioShareKobo),
        'Rehabify share (NGN)': naira(l.rehabifyShareKobo),
        'Partner share (NGN)': naira(l.partnerShareKobo),
        'Withholding tax (NGN)': naira(l.withholdingTaxKobo),
        'Net partner payable (NGN)': naira(l.netPartnerAmountKobo),
        'Payment channel': l.paymentMethod,
        Reference: l.paymentReference,
      }))
    )
    toast.success('Invoice exported to CSV')
  }

  return (
    <Dialog open={!!partnerCode} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`${dialogClass} max-h-[90vh] max-w-4xl overflow-y-auto`}>
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <DialogTitle className={dialogTitleClass}>
              <Receipt className="h-5 w-5 text-rh-teal dark:text-rh-aqua" />
              Settlement invoice
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={exportCsv} disabled={!invoice} className={softButtonClass}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
              </Button>
              <Button size="sm" onClick={() => window.print()} disabled={!invoice} className={primaryButtonClass}>
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / PDF
              </Button>
            </div>
          </div>
          <DialogDescription>
            Statement of live commissions earned in this cycle, with withholding tax, transfer fee and stamp duty.
          </DialogDescription>
        </DialogHeader>

        {!invoice ? (
          <LoadingBlock className="h-64" />
        ) : (
          <div id="printable-partner-invoice" className="space-y-5 rounded-2xl bg-white p-4 text-gray-900 sm:p-6">
            <div className="flex flex-col justify-between gap-6 rounded-xl bg-gray-50 p-5 md:flex-row">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rh-teal text-sm font-bold text-white">RH</div>
                  <div>
                    <h2 className="text-base font-bold leading-tight">{invoice.issuer.name}</h2>
                    <p className="text-xs text-gray-500">{invoice.issuer.address}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-0.5 text-xs text-gray-600">
                  <p>
                    Email: <span className="font-medium text-gray-900">{invoice.issuer.email}</span>
                  </p>
                  <p>
                    Web: <span className="font-medium text-gray-900">{invoice.issuer.website}</span>
                  </p>
                </div>
              </div>
              <div className="space-y-1 text-xs md:text-right">
                <span className="inline-block rounded bg-rh-mist px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-rh-teal">
                  Settlement invoice
                </span>
                <p className="pt-1 font-mono text-sm font-bold">{invoice.invoiceNumber}</p>
                <p className="text-gray-600">
                  Issue date: <strong>{invoice.invoiceDate}</strong>
                </p>
                <p className="text-gray-600">
                  Cycle: <strong>{invoice.billingPeriodLabel}</strong>
                </p>
                {invoice.payoutStatus === 'paid' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Settled / paid
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                    <Clock className="h-3.5 w-3.5" /> Pending month-end payout
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-gray-200 p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Billed to</span>
                <h3 className="text-sm font-bold">{invoice.recipient.name}</h3>
                <div className="space-y-1 text-xs text-gray-600">
                  <p>
                    Partner code: <span className="font-mono font-semibold text-rh-teal">{invoice.recipient.code}</span>
                  </p>
                  <p>
                    Type: <span className="capitalize">{invoice.recipient.type}</span>
                  </p>
                  {invoice.recipient.contactEmail && <p>Email: {invoice.recipient.contactEmail}</p>}
                  {invoice.recipient.contactPhone && <p>Phone: {invoice.recipient.contactPhone}</p>}
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-gray-200 p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Remittance bank account</span>
                {invoice.bankDetails ? (
                  <div className="space-y-1.5 text-xs">
                    <p className="flex items-center gap-1.5 font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> Verified Paystack recipient
                    </p>
                    <p className="text-gray-700">
                      Bank: <strong className="text-gray-900">{invoice.bankDetails.bankName}</strong>
                    </p>
                    <p className="text-gray-700">
                      Account number: <strong className="font-mono text-gray-900">{invoice.bankDetails.accountNumber}</strong>
                    </p>
                    <p className="text-gray-700">
                      Account name: <strong className="text-gray-900">{invoice.bankDetails.accountName}</strong>
                    </p>
                  </div>
                ) : (
                  <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                    No verified bank account on file. The partner must add bank details in the Partner Portal before the month-end transfer.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col justify-between gap-2 rounded-xl bg-rh-mist/70 p-3 text-xs text-rh-night sm:flex-row sm:items-center">
              <div>
                <span className="font-bold">Platform split:</span> {invoice.splitConfig.physiotherapistPercent}% clinician ·{' '}
                {invoice.splitConfig.rehabifyPercent}% platform · {invoice.splitConfig.partnerPercent}% referring partner
                <span className="text-rh-teal"> (a signed partner contract overrides the default)</span>
              </div>
              <div className="font-medium text-rh-teal">Paid by end-of-month consolidated transfer</div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200">
              <div className="border-b border-gray-200 bg-gray-50 p-3 text-xs font-bold text-gray-800">
                Itemised sessions ({invoice.lineItems.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-gray-200 bg-gray-50 font-semibold text-gray-600">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Patient</th>
                      <th className="px-3 py-2.5">Physiotherapist</th>
                      <th className="px-3 py-2.5">Care mode</th>
                      <th className="px-3 py-2.5 text-right">Gross</th>
                      <th className="px-3 py-2.5 text-right">Physio</th>
                      <th className="px-3 py-2.5 text-right">Rehabify</th>
                      <th className="px-3 py-2.5 text-right">Partner share</th>
                      <th className="px-3 py-2.5 text-center">Channel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoice.lineItems.map((item: InvoiceLine) => (
                      <tr key={item.sn}>
                        <td className="px-3 py-2 font-mono text-[11px] text-gray-400">{item.sn}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-[11px] text-gray-600">{item.date}</td>
                        <td className="px-3 py-2 font-medium">{item.patientName}</td>
                        <td className="px-3 py-2 text-gray-600">{item.physiotherapistName}</td>
                        <td className="px-3 py-2">{item.careMode}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatKobo(item.grossAmountKobo)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatKobo(item.physioShareKobo)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatKobo(item.rehabifyShareKobo)}</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-rh-teal">{formatKobo(item.partnerShareKobo)}</td>
                        <td className="px-3 py-2 text-center text-[10px] text-gray-500">{item.paymentMethod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col items-start justify-between gap-6 sm:flex-row">
              <div className="w-full space-y-3 sm:max-w-md">
                <div className="space-y-1.5 rounded-xl bg-amber-50 p-4 text-xs">
                  <span className="flex items-center gap-1.5 font-bold text-amber-950">
                    <ShieldCheck className="h-4 w-4 text-amber-700" /> Stamp duty note
                  </span>
                  <p className="text-[11px] leading-relaxed text-amber-900">
                    Under the Finance Act and Electronic Money Transfer Levy (EMTL) regulations, electronic transfers of ₦10,000 and above attract a ₦50
                    stamp duty, shown as its own deduction below.
                  </p>
                </div>
                <div className="space-y-1 text-[11px] text-gray-500">
                  <p>
                    Questions about this invoice:{' '}
                    <a href="mailto:finance@physioaroundme.com" className="font-medium text-rh-teal">
                      finance@physioaroundme.com
                    </a>
                  </p>
                  <p>Rehabify Health Technologies Ltd · Reconciliation ledger</p>
                </div>
              </div>
              <div className="w-full space-y-2.5 rounded-xl bg-gray-50 p-4 text-xs sm:w-80">
                <div className="flex justify-between text-gray-600">
                  <span>Consultations</span>
                  <span className="font-semibold text-gray-900">{invoice.summary.totalSessions}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Gross care value</span>
                  <span className="font-semibold text-gray-900">{formatKobo(invoice.summary.totalGrossKobo)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 text-sm font-bold text-rh-teal">
                  <span>Gross partner commission</span>
                  <span>{formatKobo(invoice.summary.totalPartnerShareKobo)}</span>
                </div>
                <div className="space-y-1.5 border-t border-gray-200 pt-2 text-[11px] text-rose-700">
                  <div className="flex justify-between">
                    <span>Less: withholding tax</span>
                    <span>- {formatKobo(invoice.summary.totalWithholdingTaxKobo)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Less: transfer fee</span>
                    <span>- {formatKobo(invoice.summary.totalPaystackTransferFeesKobo)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Less: stamp duty (EMTL)</span>
                    <span>- {formatKobo(invoice.summary.totalStampDutyKobo)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t-2 border-rh-teal pt-2 text-sm font-bold text-rh-teal">
                  <span>Net amount payable</span>
                  <span className="text-base">{formatKobo(invoice.summary.totalNetPayableKobo)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className={softButtonClass}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
