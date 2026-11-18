'use client'

/**
 * Admin › Clinic plans: every clinic with a plan, which plan it chose (itself or set up by an
 * admin), its card, what it has paid and what it owes, and when it's charged next
 * (clinicBilling.adminListClinicPlans).
 */
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Panel, StatusBadge, tableWrapClass } from '@/components/admin/ui'

type Row = {
  clinicId: string
  clinicName: string
  clinicNumber: string | null
  planName: string
  monthlyFeeKobo: number
  status: 'inactive' | 'active' | 'past_due' | 'read_only' | 'cancelled'
  cancelling: boolean
  chosenAt: number | null
  chosenByName: string | null
  selfServe: boolean
  card: { brand: string | null; last4: string | null } | null
  billingStartsAt: number
  nextChargeAt: number | null
  paidKobo: number
  paidCount: number
  lastPaidAt: number | null
  owedKobo: number
  createdAt: number
}

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const listRef = makeFunctionReference<'query', Record<string, never>, Row[]>('clinicBilling:adminListClinicPlans')

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`
const day = (ms: number) => format(ms, 'd MMM yyyy')

function statusOf(row: Row): { label: string; tone: 'green' | 'amber' | 'red' | 'neutral' } {
  if (row.status === 'cancelled') return { label: 'Ended', tone: 'neutral' }
  if (row.status === 'read_only') return { label: 'Read-only', tone: 'red' }
  if (row.status === 'past_due') return { label: 'Past due', tone: 'red' }
  if (row.cancelling) return { label: 'Cancelling', tone: 'amber' }
  if (row.status === 'inactive') return { label: 'Billing off', tone: 'neutral' }
  if (row.paidCount === 0) return { label: 'Not paid yet', tone: 'amber' }
  return { label: 'Paid', tone: 'green' }
}

export function ClinicPlansList() {
  const rows = useQuery(listRef, {})
  const live = rows?.filter((r) => r.status !== 'cancelled') ?? []
  const paying = live.filter((r) => r.paidCount > 0).length
  const monthly = live.filter((r) => r.status !== 'inactive' && !r.cancelling).reduce((sum, r) => sum + r.monthlyFeeKobo, 0)

  return (
    <Panel
      title="Clinics on a plan"
      description={
        rows && rows.length > 0
          ? `${live.length} on a plan, ${paying} paid at least once, ${naira(monthly)} a month in plan fees.`
          : 'Which plan each clinic chose, its card, what it has paid and when it’s charged next.'
      }
    >
      {rows === undefined ? (
        <Skeleton className="m-5 h-40 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState title="No clinic has a plan yet" description="When a clinic chooses a plan from its dashboard, it shows here." />
      ) : (
        <div className={tableWrapClass}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Clinic</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Chosen</TableHead>
                <TableHead>Card</TableHead>
                <TableHead className="text-right">Paid so far</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5">Next charge</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const status = statusOf(r)
                return (
                  <TableRow key={r.clinicId}>
                    <TableCell className="pl-5">
                      <Link href={`/dashboard/admin/clinics/${r.clinicId}`} className="font-medium text-rh-ink hover:underline dark:text-white">
                        {r.clinicName}
                      </Link>
                      {r.clinicNumber && <p className="text-xs text-neutral-500">{r.clinicNumber}</p>}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{r.planName}</p>
                      <p className="text-xs text-neutral-500">{naira(r.monthlyFeeKobo)} a month</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.chosenAt ? (
                        <>
                          <p>{day(r.chosenAt)}</p>
                          <p className="text-xs text-neutral-500">{r.chosenByName ? `By ${r.chosenByName}` : 'By the clinic'}</p>
                        </>
                      ) : (
                        <p className="text-xs text-neutral-500">Set up by an admin</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.card ? (
                        <span className="capitalize">
                          {r.card.brand ?? 'Card'}
                          {r.card.last4 ? ` •• ${r.card.last4}` : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-500">No card</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <p className="font-medium">{naira(r.paidKobo)}</p>
                      <p className="text-xs text-neutral-500">
                        {r.lastPaidAt ? `Last ${day(r.lastPaidAt)}` : 'Nothing yet'}
                        {r.owedKobo > 0 ? ` · ${naira(r.owedKobo)} owed` : ''}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="pr-5 text-sm">
                      {r.nextChargeAt ? (
                        <>
                          <p>{day(r.nextChargeAt)}</p>
                          <p className="text-xs text-neutral-500">{r.card ? 'Card charged automatically' : 'Invoice to pay'}</p>
                        </>
                      ) : (
                        <span className="text-xs text-neutral-500">None</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  )
}
