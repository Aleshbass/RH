'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { ExternalLink, RotateCcw } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminPage, ConfirmDialog, EmptyState, FilterChips, PageHeader, Panel, StatTile, StatusBadge, inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'

type RefundRow = {
  id: string
  status: 'pending' | 'processing' | 'refunded' | 'declined' | 'failed'
  amountKobo: number
  reason: string
  reasonText: string
  requestedBy: string
  relatedType: string
  relatedId: string
  reference: string
  payerName: string
  payerEmail: string | null
  payerReference: string | null
  createdAt: number
  decidedAt: number | null
  decidedByName: string | null
  decisionNote: string | null
  error: string | null
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const listRef = makeFunctionReference<'query', Record<string, never>, RefundRow[]>('payments:adminRefundRequests')
const decideRef = makeFunctionReference<'mutation', { requestId: string; approve: boolean; note?: string }, { status: string }>('payments:adminDecideRefund')

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
const when = (t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })
const businessDaysSince = (t: number) => {
  let days = 0
  for (let d = new Date(t); d < new Date(); d.setDate(d.getDate() + 1)) if (d.getDay() !== 0 && d.getDay() !== 6) days++
  return Math.max(0, days - 1)
}

const STATUS: Record<RefundRow['status'], { label: string; tone: 'neutral' | 'green' | 'amber' | 'red' | 'teal' }> = {
  pending: { label: 'Waiting for you', tone: 'amber' },
  processing: { label: 'Sent to Paystack', tone: 'teal' },
  refunded: { label: 'Refunded', tone: 'green' },
  declined: { label: 'Declined', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'red' },
}

const RELATED_LABEL: Record<string, string> = {
  marketplace_booking: 'Rehabify Care booking',
  flex: 'Flex plan',
  clinic_subscription: 'Clinic subscription',
}

type Filter = 'action' | 'processing' | 'done' | 'all'

/** Every refund waits here for an admin (owner's rule). Approving sends it through Paystack. */
export default function AdminRefundsPage() {
  const rows = useQuery(listRef, {})
  const decide = useMutation(decideRef)
  const [filter, setFilter] = useState<Filter>('action')
  const [declining, setDeclining] = useState<RefundRow | null>(null)
  const [approving, setApproving] = useState<RefundRow | null>(null)
  const [note, setNote] = useState('')

  const groups = useMemo(() => {
    const all = rows ?? []
    return {
      action: all.filter((r) => r.status === 'pending' || r.status === 'failed'),
      processing: all.filter((r) => r.status === 'processing'),
      done: all.filter((r) => r.status === 'refunded' || r.status === 'declined'),
      all,
    }
  }, [rows])
  const visible = groups[filter]
  const owed = groups.action.reduce((sum, r) => sum + r.amountKobo, 0)
  const overdue = groups.action.filter((r) => r.status === 'pending' && businessDaysSince(r.createdAt) >= 3).length

  const run = async (row: RefundRow, approve: boolean) => {
    try {
      await decide({ requestId: row.id, approve, ...(note.trim() ? { note: note.trim() } : {}) })
      toast.success(approve ? `Refund of ${naira(row.amountKobo)} sent to Paystack` : 'Declined. The patient has been told why.')
      setNote('')
    } catch (error) {
      toast.error(error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Something went wrong. Please try again.')
      throw error
    }
  }

  return (
    <AdminPage>
      <PageHeader title="Refunds" description="Every refund waits for an admin. Approving sends it to the patient’s original payment method through Paystack." />

      {rows === undefined ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Waiting for a decision" value={groups.action.length} hint={owed ? `${naira(owed)} in total` : undefined} tone={groups.action.length ? 'attention' : 'default'} />
            <StatTile label="Over 3 business days" value={overdue} hint="The Payment Policy promises a decision within 3" tone={overdue ? 'attention' : 'default'} />
            <StatTile label="With Paystack" value={groups.processing.length} hint="Settles when Paystack confirms" />
          </div>

          <Panel>
            <div className="px-5 pb-3 pt-4">
              <FilterChips
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'action', label: 'Needs a decision', count: groups.action.length },
                  { value: 'processing', label: 'With Paystack', count: groups.processing.length },
                  { value: 'done', label: 'Done', count: groups.done.length },
                  { value: 'all', label: 'All', count: groups.all.length },
                ]}
              />
            </div>
            {visible.length === 0 ? (
              <EmptyState icon={<RotateCcw />} title={filter === 'action' ? 'No refunds waiting' : 'Nothing here'} />
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {visible.map((row) => (
                  <li key={row.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:gap-6">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold tabular-nums text-rh-ink dark:text-white">{naira(row.amountKobo)}</span>
                        <StatusBadge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</StatusBadge>
                        {row.status === 'pending' && businessDaysSince(row.createdAt) >= 3 && <StatusBadge tone="red">Overdue</StatusBadge>}
                      </div>
                      <p className="mt-1 text-sm text-rh-ink dark:text-white">{row.reasonText}</p>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        {row.payerName}
                        {row.payerReference ? ` · ${row.payerReference}` : ''}
                        {row.payerEmail ? ` · ${row.payerEmail}` : ''} · {RELATED_LABEL[row.relatedType] ?? row.relatedType} · requested {when(row.createdAt)} by {row.requestedBy}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-neutral-400">{row.reference}</p>
                      {row.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Paystack: {row.error}</p>}
                      {row.decidedAt && (
                        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                          {row.status === 'declined' ? 'Declined' : 'Approved'} by {row.decidedByName} on {when(row.decidedAt)}
                          {row.decisionNote ? `: “${row.decisionNote}”` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {row.relatedType === 'marketplace_booking' && (
                        <Link href={`/dashboard/admin/marketplace-bookings?q=${row.relatedId}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-rh-ink hover:bg-rh-canvas dark:text-white dark:hover:bg-white/[0.06]">
                          Booking <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      )}
                      {(row.status === 'pending' || row.status === 'failed') && (
                        <>
                          <button type="button" onClick={() => setApproving(row)} className={`${primaryButtonClass} h-9 px-4 text-sm font-semibold`}>
                            {row.status === 'failed' ? 'Try again' : 'Approve'}
                          </button>
                          <button type="button" onClick={() => setDeclining(row)} className={`${softButtonClass} h-9 px-4 text-sm font-semibold`}>
                            Decline
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}

      <ConfirmDialog
        open={approving !== null}
        onOpenChange={(open) => !open && setApproving(null)}
        title={approving ? `Refund ${naira(approving.amountKobo)} to ${approving.payerName}?` : ''}
        description="It goes back to the card or account they paid with. Paystack usually takes 5 to 10 business days. They get a refund receipt when it’s done."
        confirmLabel="Approve refund"
        onConfirm={() => (approving ? run(approving, true) : undefined)}
      />
      <ConfirmDialog
        open={declining !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeclining(null)
            setNote('')
          }
        }}
        title="Decline this refund?"
        description="The patient gets an email with your reason, so keep it clear and kind."
        confirmLabel="Decline"
        destructive
        onConfirm={() => (declining ? run(declining, false) : undefined)}
      >
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it can’t be refunded" className={inputClass} />
      </ConfirmDialog>
    </AdminPage>
  )
}
