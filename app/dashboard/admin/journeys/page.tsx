'use client'

/**
 * Admin › Patient journeys (Mary, 17 Nov 2026): each physio's patient from booked to treatment
 * started to finished, and the money on both sides (patient paid, physio paid). Filters for stage
 * and "needs attention", search, and one tap to call, WhatsApp or email either person.
 */

import { useDeferredValue, useState } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { Check, Search, TriangleAlert } from '@/components/icons'
import { AdminPage, PageHeader, Panel, StatTile, fieldClass, tabsListClass } from '@/components/admin/ui'
import { ContactLinks } from '@/components/admin/contactLinks'
import { naira } from '@/lib/physioPlans'
import { cn } from '@/lib/utils'

type Stage = 'booked' | 'in_treatment' | 'finished' | 'cancelled'
type Person = { id: string; name: string; rehabifyId: string | null; phone: string | null; email: string | null }
type Row = {
  key: string
  stage: Stage
  bookedAt: number
  sessions: { total: number; completed: number; upcoming: number; overdue: number; cancelled: number; noShow: number }
  nextSessionAt: number | null
  lastSessionAt: number | null
  finishedAt: number | null
  billedKobo: number
  paidKobo: number
  owedKobo: number
  patientPaid: 'paid' | 'part' | 'unpaid' | 'none'
  physioPaid: 'paid' | 'pending' | 'failed' | 'held' | 'none'
  physioPaidKobo: number
  physioPendingKobo: number
  attention: string[]
  lastActivityAt: number
  patient: Person
  physio: Person
  clinicName: string | null
}
type Data = {
  counts: Record<Stage, number>
  total: number
  attention: number
  unpaid: number
  physioUnpaid: number
  sessions: { completed: number; upcoming: number; overdue: number; cancelled: number; noShow: number; total: number }
  rows: Row[]
  capped: boolean
}

// By name: the generated api type is at TypeScript's depth limit (TS2589)
const listRef = makeFunctionReference<'query', { stage?: Stage; attentionOnly?: boolean; search?: string }, Data>('adminJourneys:list')

const STAGES: { key: Stage | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'booked', label: 'Booked' },
  { key: 'in_treatment', label: 'In treatment' },
  { key: 'finished', label: 'Finished' },
  { key: 'cancelled', label: 'Cancelled' },
]

type StepState = 'done' | 'part' | 'todo' | 'warn' | 'na'

function Step({ label, state, detail }: { label: string; state: StepState; detail?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold',
          state === 'done' && 'bg-rh-lime text-rh-ink',
          state === 'part' && 'bg-rh-peach text-[#b4690e] dark:bg-amber-400/20 dark:text-amber-300',
          state === 'warn' && 'bg-rh-blush text-[#be123c] dark:bg-rose-400/15 dark:text-rose-300',
          state === 'todo' && 'border border-dashed border-neutral-300 text-neutral-400 dark:border-white/20',
          state === 'na' && 'bg-neutral-100 text-neutral-400 dark:bg-white/[0.06]'
        )}
      >
        {state === 'done' ? <Check className="h-3 w-3" /> : state === 'warn' ? '!' : state === 'na' ? '–' : ''}
      </span>
      <span className="text-[11px] font-medium leading-tight text-rh-ink dark:text-neutral-200">{label}</span>
      {detail && <span className="truncate text-[10px] leading-tight text-neutral-500">{detail}</span>}
    </div>
  )
}

function Journey({ row }: { row: Row }) {
  const s = row.sessions
  const started: StepState = s.completed > 0 ? 'done' : s.overdue > 0 ? 'warn' : 'todo'
  const finished: StepState = row.stage === 'finished' ? 'done' : row.stage === 'cancelled' ? 'na' : 'todo'
  const patientPaid: StepState =
    row.patientPaid === 'paid' ? 'done' : row.patientPaid === 'part' ? 'part' : row.patientPaid === 'unpaid' ? 'warn' : 'na'
  const physioPaid: StepState =
    row.physioPaid === 'paid' ? 'done' : row.physioPaid === 'pending' ? 'part' : row.physioPaid === 'failed' || row.physioPaid === 'held' ? 'warn' : 'na'
  return (
    <div className="flex items-start gap-1">
      <Step label="Booked" state="done" detail={format(row.bookedAt, 'd MMM')} />
      <Step label="Started" state={started} detail={s.completed ? `${s.completed} done` : s.overdue ? 'not marked' : undefined} />
      <Step label="Finished" state={finished} detail={row.finishedAt ? format(row.finishedAt, 'd MMM') : undefined} />
      <Step
        label="Patient paid"
        state={patientPaid}
        detail={row.patientPaid === 'none' ? 'nothing billed' : row.owedKobo ? `${naira(row.owedKobo)} owed` : naira(row.paidKobo)}
      />
      <Step
        label="Physio paid"
        state={physioPaid}
        detail={
          row.physioPaid === 'none'
            ? undefined
            : row.physioPaid === 'paid'
              ? row.physioPaidKobo
                ? naira(row.physioPaidKobo)
                : 'at payment'
              : row.physioPaid === 'pending'
                ? `${naira(row.physioPendingKobo)} waiting`
                : row.physioPaid
        }
      />
    </div>
  )
}

export default function JourneysPage() {
  const [stage, setStage] = useState<Stage | 'all'>('all')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [search, setSearch] = useState('')
  const deferred = useDeferredValue(search.trim())
  const data = useQuery(listRef, {
    ...(stage === 'all' ? {} : { stage }),
    ...(attentionOnly ? { attentionOnly: true } : {}),
    ...(deferred.length >= 2 ? { search: deferred } : {}),
  })

  return (
    <AdminPage>
      <PageHeader
        title="Patient journeys"
        description="Every physio's patient: booked, treatment started, finished, and whether the patient paid and the physio was paid."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="In treatment" value={data?.counts.in_treatment ?? '—'} hint={data ? `${data.counts.booked} booked, not started` : undefined} />
        <StatTile label="Finished" value={data?.counts.finished ?? '—'} />
        <StatTile label="Sessions done" value={data?.sessions.completed ?? '—'} hint={data ? `${data.sessions.upcoming} coming up` : undefined} />
        <StatTile label="Not marked" value={data?.sessions.overdue ?? '—'} hint="Past sessions still open" />
        <StatTile label="Needs attention" value={data?.attention ?? '—'} hint={data ? `${data.unpaid} unpaid · ${data.physioUnpaid} physio unpaid` : undefined} />
      </div>

      <Panel>
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className={cn(tabsListClass, 'lg:w-auto')}>
            {STAGES.map((s) => (
              <button
                key={s.key}
                type="button"
                data-state={stage === s.key ? 'active' : 'inactive'}
                onClick={() => setStage(s.key)}
                className="text-sm font-medium text-neutral-600 dark:text-neutral-300"
              >
                {s.label}
                {data && s.key !== 'all' && <span className="ml-1.5 text-xs opacity-70">{data.counts[s.key]}</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAttentionOnly((v) => !v)}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors',
                attentionOnly ? 'bg-rh-blush text-[#be123c] dark:bg-rose-400/15 dark:text-rose-300' : 'bg-rh-canvas text-rh-ink hover:bg-rh-honeydew dark:bg-white/[0.06] dark:text-white'
              )}
            >
              <TriangleAlert className="h-3.5 w-3.5" /> Needs attention
            </button>
            <div className="relative w-full sm:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Patient, physio or Rehabify ID"
                aria-label="Search"
                className={cn(fieldClass, 'w-full pl-9 sm:w-72')}
              />
            </div>
          </div>
        </div>
      </Panel>

      <div className="space-y-3">
        {data === undefined &&
          [0, 1, 2].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-white dark:bg-rh-ink-2" />)}
        {data && data.rows.length === 0 && (
          <Panel>
            <p className="p-8 text-center text-sm text-neutral-500">No patients match.</p>
          </Panel>
        )}
        {data?.rows.map((row) => (
          <Panel key={row.key}>
            <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,15rem)] lg:items-center">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/dashboard/admin/users/${row.patient.id}`} className="min-w-0 hover:underline">
                    <span className="block truncate text-sm font-semibold text-rh-ink dark:text-white">{row.patient.name}</span>
                    <span className="block text-xs text-neutral-500">Patient{row.patient.rehabifyId ? ` · ${row.patient.rehabifyId}` : ''}</span>
                  </Link>
                  <ContactLinks phone={row.patient.phone} email={row.patient.email} name={row.patient.name} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/dashboard/admin/users/${row.physio.id}`} className="min-w-0 hover:underline">
                    <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{row.physio.name}</span>
                    <span className="block truncate text-xs text-neutral-500">{row.clinicName ? `Physio · ${row.clinicName}` : 'Physio'}</span>
                  </Link>
                  <ContactLinks phone={row.physio.phone} email={row.physio.email} name={row.physio.name} />
                </div>
              </div>

              <Journey row={row} />

              <div className="space-y-1.5 text-xs text-neutral-500 lg:text-right">
                <p>
                  <span className="font-semibold text-rh-ink dark:text-white">{row.sessions.completed}</span> done ·{' '}
                  <span className="font-semibold text-rh-ink dark:text-white">{row.sessions.upcoming}</span> coming up
                  {row.sessions.overdue > 0 && <span className="text-[#be123c] dark:text-rose-300"> · {row.sessions.overdue} not marked</span>}
                </p>
                <p>
                  {row.nextSessionAt
                    ? `Next: ${format(row.nextSessionAt, 'EEE d MMM, HH:mm')}`
                    : row.lastSessionAt
                      ? `Last session ${formatDistanceToNowStrict(row.lastSessionAt, { addSuffix: true })}`
                      : `Booked ${formatDistanceToNowStrict(row.bookedAt, { addSuffix: true })}`}
                </p>
                {row.billedKobo > 0 && (
                  <p>
                    Billed {naira(row.billedKobo)}
                    {row.owedKobo > 0 && <span className="text-[#b4690e] dark:text-amber-300"> · {naira(row.owedKobo)} owed</span>}
                  </p>
                )}
                {row.attention.length > 0 && (
                  <div className="flex flex-wrap gap-1 lg:justify-end">
                    {row.attention.map((a) => (
                      <span key={a} className="rounded-full bg-rh-blush px-2 py-0.5 text-[11px] font-medium text-[#be123c] dark:bg-rose-400/15 dark:text-rose-300">
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Panel>
        ))}
        {data?.capped && <p className="text-center text-xs text-neutral-500">Showing the 200 most recent. Search or filter to find others.</p>}
      </div>
    </AdminPage>
  )
}
