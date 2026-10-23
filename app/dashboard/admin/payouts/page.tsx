'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  Download,
  MoreHorizontal,
  RotateCcw,
  Search,
  Send,
  XCircle,
} from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { useMutationUntyped, useQueryUntyped } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
  Stagger,
  StaggerItem,
  downloadCsv,
  inputClass,
  primaryButtonClass,
  softButtonClass,
  tableWrapClass,
  tabsListClass,
} from '@/components/admin/ui'
import { dateStamp, errorText, formatKobo, koboToNairaNumber } from '@/components/admin/finance/format'
import { PatientRef } from '@/components/admin/finance/PatientRef'

const payoutsApi = api.payouts

type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed'

/** One row from payouts.adminListPayouts. Amounts are in kobo. */
type PayoutRow = {
  _id: Id<'payouts'>
  type: 'physiotherapist_earning' | 'clinic_earning' | 'platform_fee'
  status: PayoutStatus
  amountKobo: number
  createdAt: number
  processedAt: number | null
  completedAt: number | null
  failureReason: string | null
  transferReference: string | null
  adminNote: string | null
  recipient: { _id: Id<'users'>; name: string; email: string; role: string } | null
  bank: { bankName: string; accountName: string; accountNumber: string; isVerified: boolean } | null
  invoice: { _id: Id<'invoices'>; invoiceNumber: string; totalAmountKobo: number } | null
  patientUserId: Id<'users'> | null
  patientNumber: string | null
}

type Bucket = { count: number; amountKobo: number }
type PayoutStats = {
  pending: Bucket
  processing: Bucket
  failed: Bucket
  paidThisMonth: Bucket
  recipientsOwed: number
  monthStart: number
  capped: boolean
}

type Tab = 'open' | 'history'
type OpenFilter = 'all' | 'pending' | 'processing' | 'failed'
type HistoryFilter = 'all' | 'month'

const LIST_LIMIT = 200

const statusBadge: Record<PayoutStatus, { tone: 'neutral' | 'teal' | 'green' | 'amber' | 'red'; label: string }> = {
  pending: { tone: 'amber', label: 'To pay' },
  processing: { tone: 'teal', label: 'In progress' },
  completed: { tone: 'green', label: 'Paid' },
  failed: { tone: 'red', label: 'Failed' },
}

type Action =
  | { kind: 'paid'; rows: PayoutRow[] }
  | { kind: 'processing'; row: PayoutRow }
  | { kind: 'failed'; row: PayoutRow }
  | { kind: 'retry'; row: PayoutRow }

export default function AdminPayoutsPage() {
  const [tab, setTab] = useState<Tab>('open')
  const [openFilter, setOpenFilter] = useState<OpenFilter>('all')
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [action, setAction] = useState<Action | null>(null)
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')

  const stats = useQueryUntyped(payoutsApi.adminGetPayoutStats, {}) as PayoutStats | undefined
  const openRows = useQueryUntyped(payoutsApi.adminListPayouts, { tab: 'open', limit: LIST_LIMIT }) as PayoutRow[] | undefined
  const historyRows = useQueryUntyped(
    payoutsApi.adminListPayouts,
    tab === 'history' ? { tab: 'history', limit: LIST_LIMIT } : 'skip'
  ) as PayoutRow[] | undefined

  const markPaid = useMutationUntyped(payoutsApi.adminMarkPayoutsPaid)
  const markFailed = useMutationUntyped(payoutsApi.adminMarkPayoutFailed)
  const markProcessing = useMutationUntyped(payoutsApi.adminMarkPayoutProcessing)
  const retry = useMutationUntyped(payoutsApi.adminRetryPayout)

  const rows = tab === 'open' ? openRows : historyRows

  const openCounts = useMemo(() => {
    const list = openRows ?? []
    return {
      all: list.length,
      pending: list.filter((r) => r.status === 'pending').length,
      processing: list.filter((r) => r.status === 'processing').length,
      failed: list.filter((r) => r.status === 'failed').length,
    }
  }, [openRows])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (rows ?? []).filter((r) => {
      if (tab === 'open' && openFilter !== 'all' && r.status !== openFilter) return false
      if (tab === 'history' && historyFilter === 'month' && stats && (r.completedAt ?? 0) < stats.monthStart) return false
      if (!term) return true
      return [r.recipient?.name, r.recipient?.email, r.patientNumber, r.invoice?.invoiceNumber, r.transferReference, r.bank?.accountNumber]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [rows, tab, openFilter, historyFilter, search, stats])

  const selectedRows = useMemo(() => (openRows ?? []).filter((r) => selected.has(r._id)), [openRows, selected])
  const selectedTotal = selectedRows.reduce((sum, r) => sum + r.amountKobo, 0)
  const visibleSelectable = tab === 'open' ? visible : []
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((r) => selected.has(r._id))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visibleSelectable.forEach((r) => next.delete(r._id))
      else visibleSelectable.forEach((r) => next.add(r._id))
      return next
    })

  const startAction = (next: Action) => {
    setReference('')
    setNote('')
    setReason('')
    setAction(next)
  }

  const exportCsv = () => {
    if (visible.length === 0) {
      toast.info('Nothing to export with these filters')
      return
    }
    downloadCsv(
      `rehabify-payouts-${tab === 'open' ? 'to-pay' : 'history'}-${dateStamp()}`,
      visible.map((r) => ({
        'Payout ID': r._id,
        Status: statusBadge[r.status].label,
        Recipient: r.recipient?.name ?? '',
        Email: r.recipient?.email ?? '',
        Bank: r.bank?.bankName ?? '',
        'Account number': r.bank?.accountNumber ?? '',
        'Account name': r.bank?.accountName ?? '',
        'Amount (NGN)': koboToNairaNumber(r.amountKobo),
        Invoice: r.invoice?.invoiceNumber ?? '',
        'Patient ID': r.patientNumber ?? '',
        Created: format(r.createdAt, 'yyyy-MM-dd HH:mm'),
        'Paid at': r.completedAt ? format(r.completedAt, 'yyyy-MM-dd HH:mm') : '',
        'Transfer reference': r.transferReference ?? '',
        'Failure reason': r.failureReason ?? '',
        Note: r.adminNote ?? '',
      }))
    )
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  const runAction = async () => {
    if (!action) return
    try {
      if (action.kind === 'paid') {
        const result = (await markPaid({
          payoutIds: action.rows.map((r) => r._id),
          transferReference: reference.trim() || undefined,
          note: note.trim() || undefined,
        })) as { updated: number; totalKobo: number }
        playSound('paid')
        toast.success(
          result.updated === 1 ? `Payout of ${formatKobo(result.totalKobo)} marked paid` : `${result.updated} payouts marked paid`,
          { description: result.updated === 1 ? 'The physiotherapist has been notified.' : `${formatKobo(result.totalKobo)} in total. Recipients have been notified.` }
        )
        setSelected((prev) => {
          const next = new Set(prev)
          action.rows.forEach((r) => next.delete(r._id))
          return next
        })
      } else if (action.kind === 'processing') {
        await markProcessing({ payoutId: action.row._id, transferReference: reference.trim() || undefined })
        playSound('success')
        toast.success('Payout marked in progress', { description: 'Mark it paid once the bank confirms the transfer.' })
      } else if (action.kind === 'failed') {
        if (!reason.trim()) {
          toast.error('Add a reason so the physiotherapist knows what to fix')
          throw new Error('reason required')
        }
        await markFailed({ payoutId: action.row._id, reason: reason.trim() })
        playSound('reject')
        toast.success('Payout marked failed', { description: 'The physiotherapist has been told why.' })
      } else {
        await retry({ payoutId: action.row._id })
        playSound('success')
        toast.success('Payout is back in the queue')
      }
    } catch (error) {
      if (!(error instanceof Error && error.message === 'reason required')) {
        toast.error('That didn’t work', { description: errorText(error) })
      }
      throw error
    }
  }

  const dialog = (() => {
    if (!action) return null
    if (action.kind === 'paid') {
      const total = action.rows.reduce((s, r) => s + r.amountKobo, 0)
      const names = [...new Set(action.rows.map((r) => r.recipient?.name ?? 'Unknown'))]
      return {
        title: action.rows.length === 1 ? `Mark ${formatKobo(total)} as paid?` : `Mark ${action.rows.length} payouts as paid?`,
        description:
          action.rows.length === 1
            ? `Only do this once the money has left Rehabify’s account for ${names[0]}. They’ll get a notification.`
            : `${formatKobo(total)} to ${names.length === 1 ? names[0] : `${names.length} people`}. Only do this once the transfers have gone out. Everyone is notified.`,
        confirmLabel: 'Mark paid',
        destructive: false,
        body: (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="payout-ref">Transfer reference (optional)</Label>
              <Input id="payout-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. bank session ID" className={inputClass} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payout-note">Note (optional)</Label>
              <Textarea id="payout-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputClass} maxLength={500} />
            </div>
          </div>
        ),
      }
    }
    if (action.kind === 'processing') {
      return {
        title: 'Mark payout in progress?',
        description: `Use this when you’ve sent ${formatKobo(action.row.amountKobo)} to ${action.row.recipient?.name ?? 'the recipient'} and are waiting for the bank.`,
        confirmLabel: 'Mark in progress',
        destructive: false,
        body: (
          <div className="space-y-1.5">
            <Label htmlFor="payout-ref-processing">Transfer reference (optional)</Label>
            <Input id="payout-ref-processing" value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} maxLength={120} />
          </div>
        ),
      }
    }
    if (action.kind === 'failed') {
      return {
        title: 'Mark payout failed?',
        description: `${action.row.recipient?.name ?? 'The recipient'} will be told it didn’t go through and why. You can retry it later.`,
        confirmLabel: 'Mark failed',
        destructive: true,
        body: (
          <div className="space-y-1.5">
            <Label htmlFor="payout-reason">What went wrong?</Label>
            <Textarea
              id="payout-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. The bank rejected the account number. Please update your payout account."
              className={inputClass}
              maxLength={500}
            />
          </div>
        ),
      }
    }
    return {
      title: 'Retry this payout?',
      description: `${formatKobo(action.row.amountKobo)} for ${action.row.recipient?.name ?? 'the recipient'} goes back into the “To pay” queue.`,
      confirmLabel: 'Retry',
      destructive: false,
      body: action.row.failureReason ? (
        <p className="rounded-xl bg-rh-blush px-3 py-2 text-sm text-[#be123c] dark:bg-rose-400/10 dark:text-rose-300">
          Last failure: {action.row.failureReason}
        </p>
      ) : null,
    }
  })()

  // ── Render ─────────────────────────────────────────────────────────────────

  const money = (bucket?: Bucket) => (stats ? formatKobo(bucket?.amountKobo) : '–')

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Rehabify physios"
        title="Payouts"
        description="What Rehabify owes physiotherapists for completed, paid sessions. Each payout is the physio’s share of one invoice."
        actions={
          <Button onClick={exportCsv} className={softButtonClass}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatTile
            label="To pay"
            value={money(stats?.pending)}
            hint={stats ? `${stats.pending.count} payouts · ${stats.recipientsOwed} ${stats.recipientsOwed === 1 ? 'person' : 'people'} owed` : undefined}
            icon={Clock}
            tone={stats && stats.pending.count > 0 ? 'attention' : 'teal'}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="In progress" value={money(stats?.processing)} hint={stats ? `${stats.processing.count} sent, waiting for the bank` : undefined} icon={Send} />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Paid this month" value={money(stats?.paidThisMonth)} hint={stats ? `${stats.paidThisMonth.count} payouts` : undefined} icon={CheckCircle2} tone="mint" />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Failed"
            value={stats ? stats.failed.count : '–'}
            hint={stats ? `${formatKobo(stats.failed.amountKobo)} needs a retry` : undefined}
            icon={AlertTriangle}
            tone={stats && stats.failed.count > 0 ? 'rose' : 'neutral'}
          />
        </StaggerItem>
      </Stagger>
      {stats?.capped && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Totals cover the most recent 1,000 payouts in each status.</p>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab)
          setSearch('')
        }}
      >
        <TabsList className={tabsListClass}>
          <TabsTrigger value="open">To pay{openRows ? ` · ${openRows.length}` : ''}</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
      </Tabs>

      <Panel bodyClassName="pb-1">
        <div className="flex flex-col gap-3 border-b border-black/[0.05] p-4 dark:border-white/[0.06] sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          {tab === 'open' ? (
            <FilterChips
              value={openFilter}
              onChange={setOpenFilter}
              options={[
                { value: 'all', label: 'All', count: openCounts.all },
                { value: 'pending', label: 'To pay', count: openCounts.pending },
                { value: 'processing', label: 'In progress', count: openCounts.processing },
                { value: 'failed', label: 'Failed', count: openCounts.failed },
              ]}
            />
          ) : (
            <FilterChips
              value={historyFilter}
              onChange={setHistoryFilter}
              options={[
                { value: 'all', label: 'All paid' },
                { value: 'month', label: 'This month' },
              ]}
            />
          )}
          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search physio, patient, invoice, reference"
              aria-label="Search payouts"
              className={cn(inputClass, 'pl-9')}
            />
          </div>
        </div>

        {tab === 'open' && selectedRows.length > 0 && (
          <div className="flex flex-col gap-2 border-b border-black/[0.05] bg-rh-mist/60 px-4 py-3 dark:border-white/[0.06] dark:bg-rh-aqua/[0.06] sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-sm text-rh-night dark:text-white">
              <span className="font-semibold">{selectedRows.length}</span> selected ·{' '}
              <span className="font-semibold tabular-nums">{formatKobo(selectedTotal)}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="rounded-xl dark:text-neutral-300">
                Clear
              </Button>
              <Button size="sm" className={primaryButtonClass} onClick={() => startAction({ kind: 'paid', rows: selectedRows })}>
                <Banknote className="mr-2 h-4 w-4" />
                Mark {selectedRows.length} paid
              </Button>
            </div>
          </div>
        )}

        {rows === undefined ? (
          <div className="space-y-3 p-4 sm:px-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Banknote />}
            title={rows.length === 0 ? (tab === 'open' ? 'Nothing to pay right now' : 'No payouts paid yet') : 'No payouts match'}
            description={
              rows.length === 0
                ? tab === 'open'
                  ? 'Payouts appear here when a physiotherapist completes a session that the patient has paid for.'
                  : 'Paid payouts will be listed here.'
                : 'Try a different filter or search.'
            }
          />
        ) : (
          <div className={tableWrapClass}>
            <Table>
              <TableHeader>
                <TableRow>
                  {tab === 'open' && (
                    <TableHead className="w-10 pl-5">
                      <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} aria-label="Select all shown payouts" />
                    </TableHead>
                  )}
                  <TableHead className={tab === 'open' ? '' : 'pl-5'}>Recipient</TableHead>
                  <TableHead>Pay to</TableHead>
                  <TableHead>For</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>{tab === 'open' ? 'Owed since' : 'Paid'}</TableHead>
                  <TableHead className="w-12 pr-5">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r._id} data-state={selected.has(r._id) ? 'selected' : undefined}>
                    {tab === 'open' && (
                      <TableCell className="pl-5">
                        <Checkbox checked={selected.has(r._id)} onCheckedChange={() => toggle(r._id)} aria-label={`Select payout for ${r.recipient?.name ?? 'recipient'}`} />
                      </TableCell>
                    )}
                    <TableCell className={cn('min-w-[180px]', tab === 'open' ? '' : 'pl-5')}>
                      {r.recipient ? (
                        <Link href={`/dashboard/admin/users/${r.recipient._id}`} className="block hover:underline">
                          <span className="block text-sm font-medium text-rh-night dark:text-white">{r.recipient.name}</span>
                          <span className="block text-xs text-neutral-500 dark:text-neutral-400">{r.recipient.email}</span>
                        </Link>
                      ) : (
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">Unknown user</span>
                      )}
                      {r.type === 'clinic_earning' && <StatusBadge className="mt-1">Clinic</StatusBadge>}
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      {r.bank ? (
                        <div className="text-sm">
                          <span className="block text-rh-night dark:text-white">
                            {r.bank.bankName} · <span className="tabular-nums">{r.bank.accountNumber}</span>
                          </span>
                          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                            {r.bank.accountName}
                            {!r.bank.isVerified && ' · not verified'}
                          </span>
                        </div>
                      ) : (
                        <StatusBadge tone="amber">No payout account</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[150px] text-sm">
                      <span className="block text-rh-night dark:text-white">{r.invoice ? `#${r.invoice.invoiceNumber}` : 'Invoice missing'}</span>
                      {r.patientUserId && (
                        <span className="block">
                          <PatientRef userId={r.patientUserId} patientNumber={r.patientNumber} />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums text-rh-night dark:text-white">{formatKobo(r.amountKobo)}</TableCell>
                    <TableCell className="min-w-[120px]">
                      <StatusBadge tone={statusBadge[r.status].tone}>{statusBadge[r.status].label}</StatusBadge>
                      {r.status === 'failed' && r.failureReason && (
                        <span className="mt-1 block max-w-[220px] truncate text-xs text-rose-600 dark:text-rose-300" title={r.failureReason}>
                          {r.failureReason}
                        </span>
                      )}
                      {r.transferReference && (
                        <span className="mt-1 block max-w-[200px] truncate text-xs text-neutral-500 dark:text-neutral-400" title={r.transferReference}>
                          Ref {r.transferReference}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                      {tab === 'open' ? (
                        <span title={format(r.createdAt, 'd MMM yyyy, HH:mm')}>{formatDistanceToNowStrict(r.createdAt, { addSuffix: true })}</span>
                      ) : r.completedAt ? (
                        format(r.completedAt, 'd MMM yyyy')
                      ) : (
                        '–'
                      )}
                    </TableCell>
                    <TableCell className="pr-5">
                      <RowActions row={r} onAction={startAction} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {rows && rows.length >= LIST_LIMIT && (
          <p className="px-5 py-3 text-xs text-neutral-500 dark:text-neutral-400">
            Showing the most recent {LIST_LIMIT} payouts per status. Export or narrow your search to find older ones.
          </p>
        )}
      </Panel>

      {dialog && (
        <ConfirmDialog
          open={Boolean(action)}
          onOpenChange={(open) => !open && setAction(null)}
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          destructive={dialog.destructive}
          onConfirm={runAction}
        >
          {dialog.body}
        </ConfirmDialog>
      )}
    </AdminPage>
  )
}

function RowActions({ row, onAction }: { row: PayoutRow; onAction: (action: Action) => void }) {
  if (row.status === 'completed') {
    return row.adminNote ? (
      <span className="text-xs text-neutral-500 dark:text-neutral-400" title={row.adminNote}>
        Note
      </span>
    ) : null
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg dark:text-neutral-300 dark:hover:bg-white/[0.06]" aria-label="Payout actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-xl dark:border-white/10 dark:bg-rh-ink-2">
        <DropdownMenuItem onSelect={() => onAction({ kind: 'paid', rows: [row] })}>
          <Banknote className="mr-2 h-4 w-4" />
          Mark paid
        </DropdownMenuItem>
        {row.status === 'pending' && (
          <DropdownMenuItem onSelect={() => onAction({ kind: 'processing', row })}>
            <Send className="mr-2 h-4 w-4" />
            Mark in progress
          </DropdownMenuItem>
        )}
        {row.status === 'failed' && (
          <DropdownMenuItem onSelect={() => onAction({ kind: 'retry', row })}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Retry
          </DropdownMenuItem>
        )}
        {(row.status === 'pending' || row.status === 'processing') && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAction({ kind: 'failed', row })} className="text-rose-600 focus:text-rose-700 dark:text-rose-300">
              <XCircle className="mr-2 h-4 w-4" />
              Mark failed
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
