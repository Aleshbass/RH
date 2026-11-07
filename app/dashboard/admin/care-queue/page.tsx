'use client'

/**
 * Patients looking for care: paid patients waiting on a physio, unpaid checkouts, patients Joy has
 * triaged or couldn't match, new sign-ups nobody is linked to, and signed-in patients browsing
 * Find a Physio. Each row shows what we know about the patient; opening it shows everything,
 * lets the team fill the gaps after a call, and suggests physios to pair them with
 * (convex/careQueue.ts, convex/adminPatients.ts).
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { BellRing, CheckCircle2, Clock, HeartPulse, UserRound } from '@/components/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminPage, EmptyState, FilterChips, PageHeader, Panel, StatTile, StatusBadge, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { ContactButtons, FactsLine, SourceTags } from '@/components/admin/patients/PatientBits'
import { PatientSheet } from '@/components/admin/patients/PatientSheet'
import type { PatientFactsRow } from '@/components/admin/patients/patientApi'
import { PhysioSheet } from '@/components/admin/physios/PhysioSheet'
import { cn } from '@/lib/utils'

type Kind = 'awaiting_physio' | 'unpaid_checkout' | 'joy_matching' | 'browsing' | 'no_physio'
type Row = {
  id: string
  kind: Kind
  status: 'open' | 'handled'
  detail: string
  createdAt: number
  lastSeenAt: number
  dueAt: number | null
  patient: { userId: string | null; name: string | null; rehabifyId: string | null; phone: string | null; email: string | null }
  facts: PatientFactsRow | null
  fromJoy: boolean
  physio: { userId: string; name: string; phone: string | null } | null
  booking: { id: string; line: string; paid: boolean; awaitingPhysio: boolean; nudges: number } | null
  nudgedAt: number | null
  handledAt: number | null
  handledNote: string | null
  handledBy: string | null
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const listRef = makeFunctionReference<'query', Record<string, never>, Row[]>('careQueue:adminList')
const handledRef = makeFunctionReference<'mutation', { signalId: string; note?: string }, { ok: boolean }>('careQueue:adminMarkHandled')
const nudgeRef = makeFunctionReference<'mutation', { signalId: string }, { ok: boolean }>('careQueue:adminNudgePhysio')

const KIND: Record<Kind, { label: string; tone: 'red' | 'amber' | 'teal' | 'neutral' }> = {
  awaiting_physio: { label: 'Paid · waiting on physio', tone: 'red' },
  joy_matching: { label: 'Joy · needs a physio', tone: 'amber' },
  no_physio: { label: 'No physio yet', tone: 'amber' },
  unpaid_checkout: { label: 'Started · not paid', tone: 'teal' },
  browsing: { label: 'Browsing', tone: 'neutral' },
}

type Filter = 'open' | 'joy' | Exclude<Kind, 'joy_matching'> | 'handled'

const time = (t: number) => new Date(t).toLocaleString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' })

function errorText(error: unknown) {
  return error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Something went wrong. Please try again.'
}

export default function CareQueuePage() {
  const rows = useQuery(listRef, {})
  const markHandled = useMutation(handledRef)
  const nudge = useMutation(nudgeRef)
  const [filter, setFilter] = useState<Filter>('open')
  const [busy, setBusy] = useState<string | null>(null)
  const [patientId, setPatientId] = useState<string | null>(null)
  const [physioId, setPhysioId] = useState<string | null>(null)
  // Waiting times tick without a refresh
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const groups = useMemo(() => {
    const all = rows ?? []
    const open = all.filter((r) => r.status === 'open')
    return {
      open,
      handled: all.filter((r) => r.status === 'handled'),
      awaiting_physio: open.filter((r) => r.kind === 'awaiting_physio'),
      // Everyone who came through Joy, whatever stage they're stuck at
      joy: open.filter((r) => r.fromJoy),
      no_physio: open.filter((r) => r.kind === 'no_physio'),
      unpaid_checkout: open.filter((r) => r.kind === 'unpaid_checkout'),
      browsing: open.filter((r) => r.kind === 'browsing'),
    }
  }, [rows])
  const visible = groups[filter]

  const act = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key)
    try {
      await action()
      toast.success(done)
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <AdminPage>
      <PageHeader
        title="Patients looking for care"
        description="Everyone who wants a physio right now. Open a patient to see everything we know, add what's missing after a call, and pair them with a physio."
      />

      {rows === undefined ? (
        <div className="grid gap-3 sm:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile
              label="Paid, waiting on physio"
              value={groups.awaiting_physio.length}
              hint="Physios are nudged automatically"
              tone={groups.awaiting_physio.length ? 'attention' : 'default'}
            />
            <StatTile label="From Joy" value={groups.joy.length} hint="Any stage: triaged, matched, booking" />
            <StatTile label="No physio yet" value={groups.no_physio.length} hint="Signed up, nobody linked" />
            <StatTile label="Started, not paid" value={groups.unpaid_checkout.length} hint="20 minutes or more" />
            <StatTile label="Browsing" value={groups.browsing.length} hint="Signed in, no recent booking" />
          </div>

          <Panel>
            <div className="px-5 pb-3 pt-4">
              <FilterChips
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'open', label: 'All open', count: groups.open.length },
                  { value: 'awaiting_physio', label: 'Waiting on physio', count: groups.awaiting_physio.length },
                  { value: 'joy', label: 'Joy', count: groups.joy.length },
                  { value: 'no_physio', label: 'No physio yet', count: groups.no_physio.length },
                  { value: 'unpaid_checkout', label: 'Not paid', count: groups.unpaid_checkout.length },
                  { value: 'browsing', label: 'Browsing', count: groups.browsing.length },
                  { value: 'handled', label: 'Handled today', count: groups.handled.length },
                ]}
              />
            </div>
            {visible.length === 0 ? (
              <EmptyState
                icon={<HeartPulse />}
                title={filter === 'handled' ? 'Nothing handled in the last day' : 'No one waiting right now'}
                description={filter === 'handled' ? undefined : 'New patients appear here the moment they need help.'}
              />
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {visible.map((row) => {
                  const dueSoon = row.dueAt !== null && row.dueAt - now < 30 * 60_000
                  const who = row.patient.name || 'Guest'
                  const open = () => row.patient.userId && setPatientId(row.patient.userId)
                  return (
                    <li key={row.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:gap-6">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={KIND[row.kind].tone}>{KIND[row.kind].label}</StatusBadge>
                          {row.facts ? <SourceTags sources={row.facts.sources} /> : row.fromJoy ? <SourceTags sources={['joy']} /> : null}
                          <span className="inline-flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                            <Clock className="h-3 w-3" /> {formatDistanceToNowStrict(row.createdAt, { addSuffix: true })}
                          </span>
                          {row.status === 'open' && row.kind === 'awaiting_physio' && row.dueAt !== null && (
                            <StatusBadge tone={dueSoon ? 'red' : 'amber'}>
                              {row.dueAt > now ? `Physio must answer by ${time(row.dueAt)}` : 'Physio time is up'}
                            </StatusBadge>
                          )}
                        </div>
                        <p className="mt-1.5 text-base font-semibold text-rh-ink dark:text-white">
                          {row.patient.userId ? (
                            <button type="button" onClick={open} className="text-left underline-offset-2 hover:underline">
                              {who}
                            </button>
                          ) : (
                            who
                          )}
                          {row.patient.rehabifyId && <span className="ml-2 font-mono text-xs font-normal text-neutral-500">{row.patient.rehabifyId}</span>}
                        </p>
                        {row.facts && <FactsLine facts={row.facts} className="mt-1" />}
                        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">{row.detail}</p>
                        {(row.booking || row.physio || (row.facts && row.facts.physios.length > 0)) && (
                          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                            {row.booking?.line}
                            {row.physio && (
                              <>
                                {row.booking ? ' · ' : ''}Physio:{' '}
                                <button type="button" onClick={() => setPhysioId(row.physio!.userId)} className="font-medium text-rh-ink underline-offset-2 hover:underline dark:text-white">
                                  {row.physio.name}
                                </button>
                              </>
                            )}
                            {!row.physio && row.facts && row.facts.physios.length > 0 && (
                              <>
                                {row.booking ? ' · ' : ''}With{' '}
                                {row.facts.physios.map((p, i) => (
                                  <span key={p.physioId}>
                                    {i > 0 ? ', ' : ''}
                                    <button type="button" onClick={() => setPhysioId(p.physioId)} className="font-medium text-rh-ink underline-offset-2 hover:underline dark:text-white">
                                      {p.name}
                                    </button>
                                  </span>
                                ))}
                              </>
                            )}
                            {row.booking && row.booking.nudges > 0 ? ` · nudged ${row.booking.nudges}×` : ''}
                          </p>
                        )}
                        {row.status === 'handled' && (
                          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                            <CheckCircle2 className="mr-1 inline h-3 w-3" />
                            {row.handledNote}
                            {row.handledBy ? ` (${row.handledBy})` : ''}
                            {row.handledAt ? ` · ${time(row.handledAt)}` : ''}
                          </p>
                        )}
                        {/* Reach the patient */}
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          <ContactButtons phone={row.patient.phone} email={row.patient.email} />
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 lg:w-44 lg:flex-col lg:items-stretch">
                        {row.patient.userId && (
                          <button type="button" onClick={open} className={cn(row.status === 'open' ? primaryButtonClass : softButtonClass, 'h-10')}>
                            <UserRound className="mr-1.5 h-4 w-4" /> {row.status === 'open' ? 'Details & pair' : 'Details'}
                          </button>
                        )}
                        {row.status === 'open' && row.booking?.awaitingPhysio && (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void act(`nudge-${row.id}`, () => nudge({ signalId: row.id }), 'Physio nudged by app, phone and email.')}
                            className={cn(softButtonClass, 'h-10')}
                          >
                            <BellRing className="mr-1.5 h-4 w-4" /> Nudge physio
                          </button>
                        )}
                        {row.status === 'open' && (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void act(`done-${row.id}`, () => markHandled({ signalId: row.id }), 'Marked handled.')}
                            className={cn(softButtonClass, 'h-10')}
                          >
                            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark handled
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </>
      )}

      <PatientSheet patientId={patientId} onClose={() => setPatientId(null)} />
      <PhysioSheet physioId={physioId} preview={null} onClose={() => setPhysioId(null)} />
    </AdminPage>
  )
}

