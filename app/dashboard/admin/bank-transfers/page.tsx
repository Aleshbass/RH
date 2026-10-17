'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation } from 'convex/react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { CalendarClock, CheckCircle2, Clock, Download, Landmark, Mail, Phone, Search, Wifi, MapPin } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { useQueryUntyped } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
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

const transfersApi = api.adminBankTransfers

/** One booking from adminBankTransfers. Amounts are in kobo. */
type TransferRow = {
  _id: Id<'marketplaceBookings'>
  bookingCode: string | null
  createdAt: number
  sessionDate: number | null
  sessionType: string
  sessionDuration: number
  packageSessions: number | null
  mode: string
  bookingStatus: string
  paymentStatus: string
  paymentMethod: 'paystack' | 'bank_transfer' | null
  sourceSystem: string | null
  serviceAmountKobo: number
  totalAmountKobo: number
  paidAmountKobo: number | null
  paidAt: number | null
  paymentReference: string | null
  holdExpired: boolean
  patient: { _id: Id<'users'>; name: string; email: string | null; phone: string | null; isGuest: boolean }
  physiotherapist: { _id: Id<'users'>; name: string; email: string | null } | null
  bankTransferDetails: {
    senderName?: string
    bankName?: string
    confirmedBy?: string
    confirmedAt?: number
  } | null
}

type Tab = 'awaiting' | 'confirmed'

const COMMON_BANKS = [
  'Access Bank',
  'Ecobank',
  'Fidelity Bank',
  'First Bank',
  'FCMB',
  'GTBank',
  'Kuda',
  'Moniepoint',
  'Opay',
  'PalmPay',
  'Polaris Bank',
  'Stanbic IBTC',
  'Sterling Bank',
  'UBA',
  'Union Bank',
  'Wema Bank',
  'Zenith Bank',
]

const sessionLabel = (row: TransferRow) => {
  const type = row.sessionType.replace(/_/g, ' ')
  const pkg = row.packageSessions && row.packageSessions > 1 ? ` · ${row.packageSessions} sessions` : ''
  return `${type.charAt(0).toUpperCase()}${type.slice(1)}${pkg} · ${row.sessionDuration} min`
}

export default function AdminBankTransfersPage() {
  const [tab, setTab] = useState<Tab>('awaiting')
  const [search, setSearch] = useState('')
  const [target, setTarget] = useState<TransferRow | null>(null)
  const [senderName, setSenderName] = useState('')
  const [bankName, setBankName] = useState('')
  const [referenceNote, setReferenceNote] = useState('')
  const [checked, setChecked] = useState(false)

  const awaiting = useQueryUntyped(transfersApi.listAwaitingPayment, { limit: 100 }) as
    | { rows: TransferRow[]; capped: boolean }
    | undefined
  const confirmed = useQueryUntyped(transfersApi.listRecentlyConfirmed, { limit: 50 }) as TransferRow[] | undefined
  const confirmTransfer = useMutation(api.monthlySettlements.confirmBankTransferBooking)

  const rows = tab === 'awaiting' ? awaiting?.rows : confirmed

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows ?? []
    return (rows ?? []).filter((r) =>
      [r.patient.name, r.patient.email, r.patient.phone, r.physiotherapist?.name, r.bookingCode, r.bankTransferDetails?.senderName, r.paymentReference]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    )
  }, [rows, search])

  const stats = useMemo(() => {
    const list = awaiting?.rows ?? []
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    return {
      waitingCount: list.length,
      waitingKobo: list.reduce((s, r) => s + r.serviceAmountKobo, 0),
      oldest: list.length ? Math.min(...list.map((r) => r.createdAt)) : null,
      confirmedThisWeek: (confirmed ?? []).filter((r) => (r.bankTransferDetails?.confirmedAt ?? r.paidAt ?? 0) >= weekAgo),
    }
  }, [awaiting, confirmed])

  const openConfirm = (row: TransferRow) => {
    setSenderName(row.patient.isGuest || row.patient.name === 'Patient' ? '' : row.patient.name)
    setBankName('')
    setReferenceNote('')
    setChecked(false)
    setTarget(row)
  }

  const runConfirm = async () => {
    if (!target) return
    const sender = senderName.trim()
    const bank = bankName.trim()
    if (!sender || !bank) {
      toast.error('Add the sender’s name and their bank')
      throw new Error('validation')
    }
    if (!checked) {
      toast.error('Tick the box once you’ve seen the money in Rehabify’s account')
      throw new Error('validation')
    }
    try {
      const result = (await confirmTransfer({
        bookingId: target._id,
        senderName: sender,
        bankName: bank,
        referenceNote: referenceNote.trim() || undefined,
      })) as { success: boolean; transferRef?: string; reason?: string }
      if (!result.success) {
        playSound('error')
        toast.error('The booking couldn’t be completed', {
          description: result.reason === 'amount_mismatch' ? 'The amount doesn’t match the booking.' : 'Please check the booking and try again.',
        })
        return
      }
      playSound('paid')
      toast.success(`Payment confirmed for ${target.patient.name}`, {
        description: `${formatKobo(target.serviceAmountKobo)} · ref ${result.transferRef ?? ''}. The session is booked and the physiotherapist has been told.`,
      })
    } catch (error) {
      if (!(error instanceof Error && error.message === 'validation')) {
        toast.error('Couldn’t confirm this payment', { description: errorText(error) })
      }
      throw error
    }
  }

  const exportCsv = () => {
    if (visible.length === 0) {
      toast.info('Nothing to export')
      return
    }
    downloadCsv(
      `rehabify-bank-transfers-${tab}-${dateStamp()}`,
      visible.map((r) => ({
        'Booking code': r.bookingCode ?? '',
        'Booking ID': r._id,
        Patient: r.patient.name,
        'Patient email': r.patient.email ?? '',
        'Patient phone': r.patient.phone ?? '',
        Physiotherapist: r.physiotherapist?.name ?? '',
        Session: sessionLabel(r),
        'Session date': r.sessionDate ? format(r.sessionDate, 'yyyy-MM-dd HH:mm') : '',
        'Amount due (NGN)': koboToNairaNumber(r.serviceAmountKobo),
        'Checkout total (NGN)': koboToNairaNumber(r.totalAmountKobo),
        'Paid (NGN)': r.paidAmountKobo !== null ? koboToNairaNumber(r.paidAmountKobo) : '',
        Sender: r.bankTransferDetails?.senderName ?? '',
        'Sender bank': r.bankTransferDetails?.bankName ?? '',
        'Confirmed by': r.bankTransferDetails?.confirmedBy ?? '',
        'Confirmed at': r.bankTransferDetails?.confirmedAt ? format(r.bankTransferDetails.confirmedAt, 'yyyy-MM-dd HH:mm') : '',
        Reference: r.paymentReference ?? '',
        'Booked at': format(r.createdAt, 'yyyy-MM-dd HH:mm'),
      }))
    )
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Marketplace"
        title="Bank transfers"
        description="Bookings still waiting for payment. When a patient pays by bank transfer, check the money is in Rehabify’s account, then confirm it here to book the session."
        actions={
          <Button onClick={exportCsv} className={softButtonClass}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StaggerItem>
          <StatTile
            label="Waiting for payment"
            value={awaiting ? stats.waitingCount : '–'}
            hint={awaiting ? `${formatKobo(stats.waitingKobo)} in session fees` : undefined}
            icon={Clock}
            tone={stats.waitingCount > 0 ? 'attention' : 'teal'}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Oldest waiting"
            value={stats.oldest ? formatDistanceToNowStrict(stats.oldest) : '–'}
            hint={stats.oldest ? `Booked ${format(stats.oldest, 'd MMM, HH:mm')}` : 'Nothing waiting'}
            icon={CalendarClock}
            tone="peach"
          />
        </StaggerItem>
        <StaggerItem className="col-span-2 lg:col-span-1">
          <StatTile
            label="Confirmed in the last 7 days"
            value={confirmed ? stats.confirmedThisWeek.length : '–'}
            hint={confirmed ? formatKobo(stats.confirmedThisWeek.reduce((s, r) => s + (r.paidAmountKobo ?? r.serviceAmountKobo), 0)) : undefined}
            icon={CheckCircle2}
            tone="mint"
          />
        </StaggerItem>
      </Stagger>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab)
          setSearch('')
        }}
      >
        <TabsList className={tabsListClass}>
          <TabsTrigger value="awaiting">Waiting{awaiting ? ` · ${awaiting.rows.length}` : ''}</TabsTrigger>
          <TabsTrigger value="confirmed">Recently confirmed</TabsTrigger>
        </TabsList>
      </Tabs>

      <Panel>
        <div className="border-b border-black/[0.05] p-4 dark:border-white/[0.06] sm:px-5">
          <div className="relative sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient, physio, booking code, phone"
              aria-label="Search bookings"
              className={cn(inputClass, 'pl-9')}
            />
          </div>
        </div>

        {rows === undefined ? (
          <div className="space-y-3 p-4 sm:px-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Landmark />}
            title={rows.length === 0 ? (tab === 'awaiting' ? 'No bookings waiting for payment' : 'No bank transfers confirmed yet') : 'No bookings match'}
            description={
              rows.length === 0
                ? tab === 'awaiting'
                  ? 'Bookings with a physiotherapist assigned and no payment yet show up here.'
                  : 'Transfers you confirm will be listed here.'
                : 'Try a different search.'
            }
          />
        ) : tab === 'awaiting' ? (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {visible.map((r) => (
              <li key={r._id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-sm font-semibold text-rh-night dark:text-white">{r.patient.name}</p>
                    {r.bookingCode && <StatusBadge tone="teal">{r.bookingCode}</StatusBadge>}
                    {r.patient.isGuest && <StatusBadge>Guest</StatusBadge>}
                    {r.sourceSystem === 'joy_ai' && <StatusBadge>Joy</StatusBadge>}
                    {r.paymentMethod === 'paystack' && <StatusBadge tone="neutral">Card checkout started</StatusBadge>}
                    {r.holdExpired && <StatusBadge tone="amber">Slot hold expired</StatusBadge>}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {r.patient.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {r.patient.phone}
                      </span>
                    )}
                    {r.patient.email && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{r.patient.email}</span>
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-neutral-600 dark:text-neutral-300">
                    with{' '}
                    {r.physiotherapist ? (
                      <Link href={`/dashboard/admin/users/${r.physiotherapist._id}`} className="font-medium text-rh-teal hover:underline dark:text-rh-aqua">
                        {r.physiotherapist.name}
                      </Link>
                    ) : (
                      'no physiotherapist'
                    )}{' '}
                    · {sessionLabel(r)} ·{' '}
                    <span className="inline-flex items-center gap-1">
                      {r.mode === 'online' ? <Wifi className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                      {r.mode.replace(/_/g, ' ')}
                    </span>
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {r.sessionDate ? `Session ${format(r.sessionDate, 'EEE d MMM, HH:mm')}` : 'No session time yet'} · booked{' '}
                    {formatDistanceToNowStrict(r.createdAt, { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 lg:justify-end">
                  <div className="text-left lg:text-right">
                    <p className="text-base font-semibold tabular-nums text-rh-night dark:text-white">{formatKobo(r.serviceAmountKobo)}</p>
                    {r.totalAmountKobo !== r.serviceAmountKobo && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">Card total {formatKobo(r.totalAmountKobo)}</p>
                    )}
                  </div>
                  <Button className={primaryButtonClass} onClick={() => openConfirm(r)}>
                    <Landmark className="mr-2 h-4 w-4" />
                    Confirm payment
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className={tableWrapClass}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Confirmed</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Physiotherapist</TableHead>
                  <TableHead>Sent by</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="pr-5">Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => {
                  const confirmedAt = r.bankTransferDetails?.confirmedAt ?? r.paidAt
                  return (
                    <TableRow key={r._id}>
                      <TableCell className="whitespace-nowrap pl-5 text-sm">
                        <span className="block text-rh-night dark:text-white">{confirmedAt ? format(confirmedAt, 'd MMM yyyy, HH:mm') : '–'}</span>
                        {r.bankTransferDetails?.confirmedBy && (
                          <span className="block text-xs text-neutral-500 dark:text-neutral-400">by {r.bankTransferDetails.confirmedBy}</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[160px] text-sm">
                        <span className="block text-rh-night dark:text-white">{r.patient.name}</span>
                        {r.bookingCode && <span className="block text-xs text-neutral-500 dark:text-neutral-400">{r.bookingCode}</span>}
                      </TableCell>
                      <TableCell className="min-w-[150px] text-sm">
                        {r.physiotherapist ? (
                          <Link href={`/dashboard/admin/users/${r.physiotherapist._id}`} className="text-rh-teal hover:underline dark:text-rh-aqua">
                            {r.physiotherapist.name}
                          </Link>
                        ) : (
                          '–'
                        )}
                      </TableCell>
                      <TableCell className="min-w-[150px] text-sm">
                        <span className="block text-rh-night dark:text-white">{r.bankTransferDetails?.senderName ?? '–'}</span>
                        {r.bankTransferDetails?.bankName && (
                          <span className="block text-xs text-neutral-500 dark:text-neutral-400">{r.bankTransferDetails.bankName}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums text-rh-night dark:text-white">
                        {formatKobo(r.paidAmountKobo ?? r.serviceAmountKobo)}
                      </TableCell>
                      <TableCell className="pr-5 font-mono text-xs text-neutral-500 dark:text-neutral-400">{r.paymentReference ?? '–'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {tab === 'awaiting' && awaiting?.capped && (
          <p className="px-5 py-3 text-xs text-neutral-500 dark:text-neutral-400">Showing the newest 100 bookings waiting for payment.</p>
        )}
      </Panel>

      {target && (
        <ConfirmDialog
          open={Boolean(target)}
          onOpenChange={(open) => !open && setTarget(null)}
          title={`Confirm ${formatKobo(target.serviceAmountKobo)} from ${target.patient.name}?`}
          description="This marks the booking paid, books the session, tells the physiotherapist and credits any referring partner. It can’t be undone here."
          confirmLabel="Confirm payment"
          onConfirm={runConfirm}
        >
          <div className="space-y-3">
            <div className="rounded-xl bg-rh-canvas px-3 py-2 text-sm dark:bg-white/[0.04]">
              <p className="text-rh-night dark:text-white">
                {target.bookingCode ? `${target.bookingCode} · ` : ''}
                {sessionLabel(target)}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                with {target.physiotherapist?.name ?? 'no physiotherapist'}
                {target.sessionDate ? ` · ${format(target.sessionDate, 'EEE d MMM, HH:mm')}` : ''}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bt-sender">Sender’s name</Label>
                <Input id="bt-sender" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="As shown on the transfer" className={inputClass} maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bt-bank">Sender’s bank</Label>
                <Input id="bt-bank" list="bt-bank-list" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. GTBank" className={inputClass} maxLength={80} />
                <datalist id="bt-bank-list">
                  {COMMON_BANKS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bt-ref">Transfer reference or narration (optional)</Label>
              <Input id="bt-ref" value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} className={inputClass} maxLength={160} />
            </div>
            <label className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <Checkbox checked={checked} onCheckedChange={(value) => setChecked(value === true)} className="mt-0.5" />
              <span>I’ve seen {formatKobo(target.serviceAmountKobo)} arrive in Rehabify’s bank account.</span>
            </label>
          </div>
        </ConfirmDialog>
      )}
    </AdminPage>
  )
}
