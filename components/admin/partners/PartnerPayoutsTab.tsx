'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAction } from 'convex/react'
import { format } from 'date-fns'
import { AlertCircle, Building2, Check, CheckCircle2, Eye, Loader2, Receipt, RefreshCw, Send, Wallet } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cardClass, EmptyState, inputClass, Panel, primaryButtonClass, softButtonClass, StatusBadge, tableWrapClass } from '@/components/admin/ui'
import { cn } from '@/lib/utils'
import { PartnerInvoiceDialog, PartnerLedgerDialog } from './PartnerStatements'
import {
  BulkPayoutDialog,
  netPayoutKobo,
  PayoutDialog,
  type PaystackBalance,
  type PayoutPartner,
  type PayoutSummary,
  type PayoutTarget,
} from './PayoutDialogs'
import { Callout, formatKobo, LoadingBlock, selectContentClass } from './shared'

/** The current month and the five before it, as YYYY-MM. */
export function billingPeriodOptions() {
  const now = new Date()
  return [0, 1, 2, 3, 4, 5].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    return { value: format(d, 'yyyy-MM'), label: offset === 0 ? `${format(d, 'MMMM yyyy')} (current)` : format(d, 'MMMM yyyy') }
  })
}

function PayoutStatus({ partner }: { partner: PayoutPartner }) {
  if (partner.activeTransfer) {
    return (
      <span title={`Transfer ${partner.activeTransfer.reference}: commissions are marked paid when Paystack confirms it`}>
        <StatusBadge tone="teal" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {partner.activeTransfer.status === 'otp_required' ? 'Awaiting OTP' : 'In progress'}
        </StatusBadge>
      </span>
    )
  }
  if (partner.payoutStatus === 'paid') return <StatusBadge tone="green">Settled</StatusBadge>
  if (partner.payoutStatus === 'accruing_for_month_end') return <StatusBadge tone="amber">Payable</StatusBadge>
  return <StatusBadge tone="neutral">Nothing due</StatusBadge>
}

export function PartnerPayoutsTab({
  summary,
  billingPeriod,
  onBillingPeriodChange,
}: {
  summary: PayoutSummary | undefined
  billingPeriod: string
  onBillingPeriodChange: (period: string) => void
}) {
  const getPaystackBalance = useAction(api.monthlySettlements.getPaystackBalance)
  const [balance, setBalance] = useState<PaystackBalance | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [payoutTarget, setPayoutTarget] = useState<PayoutTarget | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [ledgerPartner, setLedgerPartner] = useState<PayoutPartner | null>(null)
  const [invoicePartnerCode, setInvoicePartnerCode] = useState<string | null>(null)

  const refreshBalance = useCallback(async () => {
    setLoadingBalance(true)
    try {
      const res = await getPaystackBalance({})
      if (res.success) {
        setBalance({ balanceNaira: res.balanceNaira, balanceKobo: res.balanceKobo })
        setBalanceError(null)
      } else {
        setBalanceError('message' in res && res.message ? res.message : 'Could not load the Paystack balance')
      }
    } catch {
      setBalanceError('Could not load the Paystack balance')
    } finally {
      setLoadingBalance(false)
    }
  }, [getPaystackBalance])

  useEffect(() => {
    void refreshBalance()
  }, [refreshBalance])

  const split = summary?.platformSettings
  const canBulkPay = !!summary?.partners.some((p: PayoutPartner) => !p.activeTransfer && p.totalPartnerCommission > 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-xs text-neutral-500 dark:text-neutral-400">
          Sessions from patients referred by partner clinics, hospitals and doctors are grouped into monthly cycles. Commissions are paid at month
          end to each partner&apos;s verified bank account.
        </p>
        <Select value={billingPeriod} onValueChange={onBillingPeriodChange}>
          <SelectTrigger className={cn(inputClass, 'w-full sm:w-[230px]')} aria-label="Billing cycle">
            <SelectValue placeholder="Billing cycle" />
          </SelectTrigger>
          <SelectContent className={selectContentClass}>
            {billingPeriodOptions().map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cycle totals */}
      {summary === undefined ? (
        <LoadingBlock />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Referred patients', value: summary.totals.totalReferredPatients, hint: `${summary.totals.totalPartners} partner institution${summary.totals.totalPartners === 1 ? '' : 's'}` },
            { label: 'Gross care value', value: formatKobo(summary.totals.totalGrossCharged), hint: `Paystack ${formatKobo(summary.totals.paystackTotal)} · Bank ${formatKobo(summary.totals.bankTransferTotal)}` },
            { label: `Physiotherapists (${split?.physiotherapistPercent ?? 80}%)`, value: formatKobo(summary.totals.totalPhysiotherapistShare), hint: 'Clinician earnings' },
            { label: `Rehabify (${split?.rehabifyPercent ?? 10}%)`, value: formatKobo(summary.totals.totalRehabifyShare), hint: 'Platform revenue' },
          ].map((item) => (
            <div key={item.label} className={cn(cardClass, 'p-4')}>
              <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">{item.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-rh-night dark:text-white">{item.value}</p>
              <p className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">{item.hint}</p>
            </div>
          ))}
        </div>
      )}

      {/* Paystack treasury */}
      <div className="flex flex-col gap-3 rounded-2xl bg-rh-teal p-4 text-white shadow-soft dark:bg-rh-night sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <Wallet className="h-5 w-5 text-rh-aqua" />
          </span>
          <div>
            <p className="text-sm font-semibold">Paystack balance</p>
            <p className="text-[11px] text-white/70">
              {balanceError ? balanceError : 'Funds available for automated partner payouts (NGN, live).'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <div className="text-right">
            <span className="block text-[10px] uppercase tracking-wider text-white/60">Available</span>
            <span className="text-lg font-semibold tabular-nums">{loadingBalance && !balance ? 'Checking…' : balance ? formatKobo(balance.balanceKobo) : '—'}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refreshBalance()}
            disabled={loadingBalance}
            className="h-9 w-9 rounded-xl bg-white/10 p-0 text-white hover:bg-white/20 hover:text-white"
            aria-label="Refresh Paystack balance"
          >
            <RefreshCw className={cn('h-4 w-4', loadingBalance && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <Panel
        title="Partner settlements"
        description={summary ? `${summary.billingPeriodLabel} · ${summary.partners.length} referring institution${summary.partners.length === 1 ? '' : 's'}` : undefined}
        actions={
          canBulkPay ? (
            <Button size="sm" onClick={() => setBulkOpen(true)} className={primaryButtonClass}>
              <Send className="mr-1.5 h-3.5 w-3.5" /> Pay all by bulk transfer
            </Button>
          ) : undefined
        }
      >
        {summary === undefined ? (
          <LoadingBlock />
        ) : summary.partners.length === 0 ? (
          <EmptyState
            icon={<Building2 />}
            title="No partner referrals in this cycle"
            description="When referred patients complete paid bookings, partner settlements appear here."
          />
        ) : (
          <div className={cn(tableWrapClass, 'px-2 pb-2')}>
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead className="text-center">Patients</TableHead>
                  <TableHead className="text-right">Charged</TableHead>
                  <TableHead className="text-right">Payable now</TableHead>
                  <TableHead className="text-right">Fees & duty</TableHead>
                  <TableHead className="text-right">Net payout</TableHead>
                  <TableHead>Bank account</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.partners.map((p: PayoutPartner) => {
                  const fee = p.estimatedOutboundFeeKobo || 0
                  const duty = p.estimatedStampDutyKobo || 0
                  return (
                    <TableRow key={p.partnerId}>
                      <TableCell>
                        <div className="font-medium text-rh-night dark:text-white">{p.partnerName}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-400">
                          <span className="uppercase">{p.partnerType}</span>
                          <span className="font-mono">{p.partnerId}</span>
                          {p.paystackCount > 0 && <span title="Paystack bookings">{p.paystackCount} Paystack</span>}
                          {p.bankTransferCount > 0 && <span title="Bank transfer bookings">{p.bankTransferCount} bank</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-semibold tabular-nums">{p.totalReferredPatients}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div>{formatKobo(p.totalGrossCharged)}</div>
                        <div className="text-[10px] text-neutral-400">
                          Physio {formatKobo(p.totalPhysiotherapistShare)} · Rehabify {formatKobo(p.totalRehabifyShare)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-rh-night dark:text-white">{formatKobo(p.totalPartnerCommission)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div>-{formatKobo(fee + duty)}</div>
                        <div className="text-[10px] text-neutral-400">
                          {formatKobo(fee)} fee + {formatKobo(duty)} duty
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-rh-teal dark:text-rh-aqua">{formatKobo(netPayoutKobo(p))}</TableCell>
                      <TableCell>
                        {p.hasBankAccount ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                            <div className="leading-tight">
                              <span className="block text-[11px] font-medium text-rh-night dark:text-white">{p.bankName}</span>
                              <span className="font-mono text-[10px] text-neutral-400">{p.maskedAccountNumber}</span>
                            </div>
                          </div>
                        ) : (
                          <StatusBadge tone="amber" className="gap-1">
                            <AlertCircle className="h-3 w-3" /> No bank details
                          </StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <PayoutStatus partner={p} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="ghost" size="sm" onClick={() => setInvoicePartnerCode(p.partnerId)} className={cn(softButtonClass, 'h-8 px-2.5 text-xs')} title="Settlement invoice">
                            <Receipt className="mr-1 h-3.5 w-3.5" /> Invoice
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setLedgerPartner(p)} className={cn(softButtonClass, 'h-8 px-2.5 text-xs')} title="Itemised ledger">
                            <Eye className="mr-1 h-3.5 w-3.5" /> Ledger
                          </Button>
                          {p.activeTransfer?.status === 'otp_required' && p.activeTransfer.transferCode ? (
                            <Button
                              size="sm"
                              onClick={() =>
                                setPayoutTarget({
                                  partner: p,
                                  resumeOtp: { transferCode: p.activeTransfer!.transferCode!, transferReference: p.activeTransfer!.reference },
                                })
                              }
                              className={cn(primaryButtonClass, 'h-8 px-2.5 text-xs')}
                            >
                              Enter OTP
                            </Button>
                          ) : p.activeTransfer ? (
                            <span className="px-2 text-[11px] text-neutral-400">Processing</span>
                          ) : p.payoutStatus === 'accruing_for_month_end' && p.totalPartnerCommission > 0 ? (
                            <Button size="sm" onClick={() => setPayoutTarget({ partner: p })} className={cn(primaryButtonClass, 'h-8 px-3 text-xs')}>
                              Pay
                            </Button>
                          ) : p.payoutStatus === 'paid' ? (
                            <span className="inline-flex items-center gap-1 px-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                              <Check className="h-3.5 w-3.5" /> Paid
                            </span>
                          ) : (
                            <span className="px-2 text-[11px] text-neutral-400">—</span>
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

      <Callout tone="info">
        Paystack and direct bank transfer payments are recorded and split the same way, so no transaction is lost. &ldquo;Payable now&rdquo; includes
        approved, unpaid commissions from earlier cycles and refund adjustments.
      </Callout>

      <PayoutDialog target={payoutTarget} billingPeriod={billingPeriod} onClose={() => setPayoutTarget(null)} onPaid={() => void refreshBalance()} />
      <BulkPayoutDialog
        open={bulkOpen}
        summary={summary}
        balance={balance}
        billingPeriod={billingPeriod}
        onClose={() => setBulkOpen(false)}
        onPaid={() => void refreshBalance()}
      />
      <PartnerLedgerDialog partner={ledgerPartner} billingPeriod={billingPeriod} split={split} onClose={() => setLedgerPartner(null)} />
      <PartnerInvoiceDialog partnerCode={invoicePartnerCode} billingPeriod={billingPeriod} onClose={() => setInvoicePartnerCode(null)} />
    </div>
  )
}
