'use client'

import { useMemo, useState } from 'react'
import { usePaginatedQuery } from 'convex/react'
import { format } from 'date-fns'
import { Building2, Download, Globe, Loader2, MapPin, ReceiptText, Search, Wifi } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AdminPage,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatusBadge,
  downloadCsv,
  formatNaira,
  inputClass,
  softButtonClass,
  tableWrapClass,
} from '@/components/admin/ui'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'paid' | 'sent' | 'partial_payment' | 'overdue' | 'failed' | 'void' | 'draft'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'sent', label: 'Awaiting payment' },
  { value: 'partial_payment', label: 'Part paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'failed', label: 'Failed' },
  { value: 'void', label: 'Void' },
  { value: 'draft', label: 'Draft' },
]

const STATUS_BADGE: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'neutral' | 'teal' }> = {
  paid: { label: 'Paid', tone: 'green' },
  sent: { label: 'Awaiting payment', tone: 'teal' },
  partial_payment: { label: 'Part paid', tone: 'amber' },
  overdue: { label: 'Overdue', tone: 'amber' },
  failed: { label: 'Failed', tone: 'red' },
  void: { label: 'Void', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'neutral' },
}

const PAGE_SIZE = 25

/** Invoice amounts are stored in kobo. */
function money(kobo: number, currency: string) {
  if (currency === 'NGN') return formatNaira(kobo / 100)
  return `${currency} ${(kobo / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export default function AdminTransactionsPage() {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.admin.getMarketplaceTransactions,
    status === 'all' ? {} : { status },
    { initialNumItems: PAGE_SIZE }
  )

  const term = search.trim().toLowerCase()
  const rows = useMemo(() => {
    if (!term) return results
    return results.filter((tx) =>
      [tx.patientName, tx.patientEmail, tx.patientPhone, tx.physiotherapistName, tx.physiotherapistEmail, tx.invoiceNumber, tx.paymentReference].some(
        (f) => (f ?? '').toLowerCase().includes(term)
      )
    )
  }, [results, term])

  const paidTotalKobo = rows.filter((r) => r.status === 'paid' && r.currency === 'NGN').reduce((s, r) => s + r.totalAmount, 0)
  const loading = pageStatus === 'LoadingFirstPage'

  const exportCsv = () =>
    downloadCsv(
      `rehabify-transactions-${status}-${format(new Date(), 'yyyy-MM-dd')}`,
      rows.map((tx) => ({
        issued: new Date(tx.issueDate).toISOString(),
        paid_at: tx.paymentDate ? new Date(tx.paymentDate).toISOString() : '',
        invoice: tx.invoiceNumber,
        source: tx.isMarketplace ? 'marketplace' : 'clinic/physio',
        status: tx.status,
        patient: tx.patientName,
        patient_email: tx.patientEmail,
        patient_phone: tx.patientPhone,
        guest: tx.isGuest ? 'yes' : 'no',
        physiotherapist: tx.physiotherapistName,
        physiotherapist_email: tx.physiotherapistEmail,
        currency: tx.currency,
        subtotal: (tx.subtotalAmount / 100).toFixed(2),
        platform_fee: (tx.platformFeeAmount / 100).toFixed(2),
        paystack_fee: (tx.paystackFeeAmount / 100).toFixed(2),
        total: (tx.totalAmount / 100).toFixed(2),
        physiotherapist_share: (tx.physiotherapistShare / 100).toFixed(2),
        payment_method: tx.paymentMethod,
        payment_reference: tx.paymentReference,
      }))
    )

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Finance"
        title="Transactions"
        description="Invoices from marketplace bookings and clinics, newest first."
        actions={
          <Button size="sm" className={cn(softButtonClass, 'h-9')} onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips<StatusFilter> value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, invoice or ref"
            aria-label="Search loaded transactions"
            className={cn(inputClass, 'h-9 pl-9')}
          />
        </div>
      </div>

      <Panel
        title={loading ? 'Invoices' : `${rows.length.toLocaleString()}${!term && pageStatus === 'CanLoadMore' ? '+' : ''} invoices`}
        description={
          loading
            ? 'Loading…'
            : term
              ? `Matching “${search.trim()}” among ${results.length} loaded · ${formatNaira(paidTotalKobo / 100)} paid`
              : `${formatNaira(paidTotalKobo / 100)} paid among the invoices shown`
        }
        bodyClassName="pb-1 pt-2"
      >
        {loading ? (
          <div className="space-y-2 px-5 py-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ReceiptText />}
            title={term ? 'No matching invoices' : 'No invoices here yet'}
            description={term ? 'Try another search, or load more invoices first.' : 'Payments from bookings and clinics appear here.'}
          />
        ) : (
          <div className={tableWrapClass}>
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Physiotherapist</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-5">Invoice / ref</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((tx) => {
                  const badge = STATUS_BADGE[tx.status] ?? { label: tx.status, tone: 'neutral' as const }
                  return (
                    <TableRow key={tx._id}>
                      <TableCell className="whitespace-nowrap pl-5 align-top">
                        <div className="text-sm text-rh-night dark:text-white">{format(tx.issueDate, 'd MMM yyyy')}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">{format(tx.issueDate, 'HH:mm')}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-rh-night dark:text-white">{tx.patientName}</span>
                          {tx.isGuest && (
                            <StatusBadge tone="teal">
                              <Globe className="mr-0.5 h-3 w-3" /> Guest
                            </StatusBadge>
                          )}
                        </div>
                        {tx.patientEmail && <div className="text-xs text-neutral-500 dark:text-neutral-400">{tx.patientEmail}</div>}
                        {tx.patientPhone && <div className="text-xs text-neutral-500 dark:text-neutral-400">{tx.patientPhone}</div>}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="text-sm font-medium text-rh-night dark:text-white">{tx.physiotherapistName}</div>
                        {tx.physiotherapistEmail && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">{tx.physiotherapistEmail}</div>
                        )}
                        {(tx.physioLocation || tx.physioOffersOnline || tx.physioOffersInPerson) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {tx.physioLocation && (
                              <span className="inline-flex items-center gap-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                                <MapPin className="h-3 w-3 text-rh-teal dark:text-rh-aqua" />
                                {tx.physioLocation}
                              </span>
                            )}
                            {tx.physioOffersOnline && (
                              <StatusBadge tone="neutral">
                                <Wifi className="mr-0.5 h-3 w-3" /> Online
                              </StatusBadge>
                            )}
                            {tx.physioOffersInPerson && (
                              <StatusBadge tone="neutral">
                                <Building2 className="mr-0.5 h-3 w-3" /> In person
                              </StatusBadge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right align-top tabular-nums">
                        <div className="text-sm font-semibold text-rh-night dark:text-white">{money(tx.totalAmount, tx.currency)}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">Fee {money(tx.platformFeeAmount, tx.currency)}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                        <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                          {tx.isMarketplace ? 'Marketplace' : 'Clinic / physio'}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[180px] pr-5 align-top">
                        <div className="truncate text-xs font-medium text-rh-night dark:text-white">{tx.invoiceNumber}</div>
                        {tx.paymentReference && (
                          <div className="truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400" title={tx.paymentReference}>
                            {tx.paymentReference}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {(pageStatus === 'CanLoadMore' || pageStatus === 'LoadingMore') && (
          <div className="flex justify-center border-t border-black/[0.04] px-5 py-3 dark:border-white/[0.06]">
            <Button size="sm" className={softButtonClass} onClick={() => loadMore(PAGE_SIZE)} disabled={pageStatus === 'LoadingMore'}>
              {pageStatus === 'LoadingMore' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Load {PAGE_SIZE} more
            </Button>
          </div>
        )}
      </Panel>
    </AdminPage>
  )
}
