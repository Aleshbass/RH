'use client'

/**
 * Patients looking for care: paid patients waiting on a physio, people who asked for help choosing
 * a physio on Find a Physio, unpaid checkouts, patients Joy has
 * triaged or couldn't match, new sign-ups nobody is linked to, and signed-in patients browsing
 * Find a Physio. Each row shows what we know about the patient; opening it shows everything,
 * lets the team fill the gaps after a call, and suggests physios to pair them with
 * (convex/careQueue.ts, convex/adminPatients.ts).
 *
 * Owner feedback, 24 Nov 2026: one row per person, newest first; a follow-up log and "Resolve
 * case" with how it went (lib/careOutcomes.ts), resolved cases kept for a week; search, status
 * filters, a banner for patients nobody has followed up yet, and a summary at the top.
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  HeartPulse,
  Loader2,
  NotebookPen,
  RotateCcw,
  Search,
  SearchX,
  UserRound,
  X,
} from '@/components/icons'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AdminPage,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
  fieldClass,
  primaryButtonClass,
  softButtonClass,
  textareaFieldClass,
} from '@/components/admin/ui'
import { ContactButtons, FactsLine, SourceTags } from '@/components/admin/patients/PatientBits'
import { PatientSheet } from '@/components/admin/patients/PatientSheet'
import { HELP_FORMAT_LABEL, type HelpRequest, type PatientFactsRow } from '@/components/admin/patients/patientApi'
import { PhysioSheet } from '@/components/admin/physios/PhysioSheet'
import { CARE_OUTCOMES, CARE_OUTCOME_LABEL, isCareOutcome, type CareOutcome } from '@/lib/careOutcomes'
import { cn } from '@/lib/utils'

type Kind = 'awaiting_physio' | 'unpaid_checkout' | 'joy_matching' | 'browsing' | 'no_physio' | 'help_choosing'
type FollowUp = { at: number; by: string | null; outcome: string | null; text: string }
type Row = {
  id: string
  /** Every open case of this person: resolving the row closes them all */
  openIds: string[]
  kind: Kind
  otherKinds: Kind[]
  status: 'open' | 'handled'
  detail: string
  otherDetails: string[]
  createdAt: number
  signedUpAt: number | null
  lastSeenAt: number
  dueAt: number | null
  patient: { userId: string | null; name: string | null; rehabifyId: string | null; phone: string | null; email: string | null }
  facts: PatientFactsRow | null
  request: HelpRequest | null
  viewed: { physioId: string; name: string; at: number | null }[]
  fromJoy: boolean
  physio: { userId: string; name: string; phone: string | null } | null
  booking: { id: string; line: string; paid: boolean; awaitingPhysio: boolean; nudges: number } | null
  nudgedAt: number | null
  followUps: FollowUp[]
  lastFollowUpAt: number | null
  handledAt: number | null
  handledNote: string | null
  handledBy: string | null
  resolution: string | null
  closedAutomatically: boolean
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const listRef = makeFunctionReference<'query', Record<string, never>, Row[]>('careQueue:adminList')
const resolveRef = makeFunctionReference<
  'mutation',
  { signalId: string; signalIds?: string[]; outcome?: CareOutcome; note?: string },
  { ok: boolean }
>('careQueue:adminMarkHandled')
const noteRef = makeFunctionReference<'mutation', { signalId: string; outcome?: CareOutcome; text: string }, { ok: boolean }>(
  'careQueue:adminAddNote'
)
const reopenRef = makeFunctionReference<'mutation', { signalId: string }, { ok: boolean }>('careQueue:adminReopen')
const nudgeRef = makeFunctionReference<'mutation', { signalId: string }, { ok: boolean }>('careQueue:adminNudgePhysio')

const KIND: Record<Kind, { label: string; tone: 'red' | 'amber' | 'teal' | 'neutral' }> = {
  awaiting_physio: { label: 'Paid · waiting on physio', tone: 'red' },
  help_choosing: { label: 'Asked for help choosing', tone: 'red' },
  joy_matching: { label: 'Joy · needs a physio', tone: 'amber' },
  no_physio: { label: 'Signed up · no physio yet', tone: 'amber' },
  unpaid_checkout: { label: 'Started · not paid', tone: 'teal' },
  browsing: { label: 'Browsing', tone: 'neutral' },
}

type Status = 'waiting' | 'unattended' | 'resolved' | 'all'
type KindFilter = 'any' | 'joy' | Exclude<Kind, 'joy_matching'>

const DAY = 24 * 60 * 60 * 1000
const NOTES_SHOWN = 3

const time = (t: number) => new Date(t).toLocaleString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' })
const ago = (t: number) => formatDistanceToNowStrict(t, { addSuffix: true })

function errorText(error: unknown) {
  return error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Something went wrong. Please try again.'
}

const matchesKind = (row: Row, kind: KindFilter) =>
  kind === 'any' || (kind === 'joy' ? row.fromJoy : row.kind === kind || row.otherKinds.includes(kind))

const matchesStatus = (row: Row, status: Status) =>
  status === 'all' ||
  (status === 'waiting' && row.status === 'open') ||
  (status === 'unattended' && row.status === 'open' && row.followUps.length === 0) ||
  (status === 'resolved' && row.status === 'handled')

function matchesSearch(row: Row, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  const text = [
    row.patient.name,
    row.patient.rehabifyId,
    row.patient.email,
    row.detail,
    ...row.otherDetails,
    row.facts?.complaint,
    row.facts?.area,
    row.facts?.city,
    row.request?.complaint,
    row.request?.area,
    row.physio?.name,
    ...row.followUps.map((f) => f.text),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return text.includes(q) || (digits.length >= 4 && (row.patient.phone ?? '').replace(/\D/g, '').includes(digits))
}

/** The inline follow-up form: how it went, what happened, then save a note or resolve the case. */
type Draft = { rowId: string; mode: 'note' | 'resolve'; outcome: CareOutcome | ''; text: string }

export default function CareQueuePage() {
  const rows = useQuery(listRef, {})
  const resolve = useMutation(resolveRef)
  const addNote = useMutation(noteRef)
  const reopen = useMutation(reopenRef)
  const nudge = useMutation(nudgeRef)
  const [status, setStatus] = useState<Status>('waiting')
  const [kind, setKind] = useState<KindFilter>('any')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [allNotes, setAllNotes] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [patientId, setPatientId] = useState<string | null>(null)
  const [physioId, setPhysioId] = useState<string | null>(null)
  // Waiting times tick without a refresh
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const summary = useMemo(() => {
    const all = rows ?? []
    const waiting = all.filter((r) => r.status === 'open')
    const unattended = waiting.filter((r) => r.followUps.length === 0)
    const resolved = all.filter((r) => r.status === 'handled')
    return {
      waiting: waiting.length,
      unattended: unattended.length,
      // The one waiting longest with nobody following up
      oldestUnattended: unattended.reduce<number | null>((min, r) => (min === null || r.createdAt < min ? r.createdAt : min), null),
      paidWaiting: waiting.filter((r) => r.kind === 'awaiting_physio').length,
      resolvedByTeam: resolved.filter((r) => !r.closedAutomatically).length,
      closedAutomatically: resolved.filter((r) => r.closedAutomatically).length,
      resolved: resolved.length,
      newToday: all.filter((r) => r.createdAt >= now - DAY).length,
    }
  }, [rows, now])

  // Status first, then the counts for each type within it, then the type and search
  const inStatus = useMemo(() => (rows ?? []).filter((r) => matchesStatus(r, status)), [rows, status])
  const kindCount = (k: KindFilter) => inStatus.filter((r) => matchesKind(r, k)).length
  const visible = useMemo(
    () => inStatus.filter((r) => matchesKind(r, kind) && matchesSearch(r, search)),
    [inStatus, kind, search]
  )

  const act = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key)
    try {
      await action()
      toast.success(done)
      return true
    } catch (error) {
      toast.error(errorText(error))
      return false
    } finally {
      setBusy(null)
    }
  }

  const saveDraft = async (row: Row, andResolve: boolean) => {
    if (!draft) return
    const outcome = draft.outcome || undefined
    const text = draft.text.trim()
    if (!andResolve && !text && !outcome) {
      toast.error('Write what happened, or pick how it went.')
      return
    }
    const ok = andResolve
      ? await act(
          `resolve-${row.id}`,
          () => resolve({ signalId: row.id, signalIds: row.openIds, outcome, note: text || undefined }),
          'Case resolved.'
        )
      : await act(`note-${row.id}`, () => addNote({ signalId: row.id, outcome, text }), 'Note saved.')
    if (ok) setDraft(null)
  }

  const showUnattended = () => {
    setStatus('unattended')
    setKind('any')
    setSearch('')
  }

  return (
    <AdminPage>
      <PageHeader
        title="Patients looking for care"
        description="Everyone who wants a physio, newest first and one row per person. Log each follow-up, resolve the case when it's done, and open a patient to pair them with a physio."
      />

      {rows === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Who nobody has reached yet: the first thing the team sees */}
          {(summary.unattended > 0 || summary.paidWaiting > 0) && (
            <div
              role="status"
              className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rh-blush px-4 py-3.5 text-[#be123c] sm:flex-row sm:items-center dark:border-rose-400/20 dark:bg-white/[0.04] dark:text-rose-300"
            >
              <AlertTriangle className="hidden h-5 w-5 shrink-0 sm:block" />
              <div className="min-w-0 flex-1 text-sm">
                {summary.unattended > 0 ? (
                  <p className="font-semibold">
                    {summary.unattended} {summary.unattended === 1 ? 'patient is' : 'patients are'} waiting and nobody has followed up yet.
                  </p>
                ) : (
                  <p className="font-semibold">Everyone waiting has had a follow-up.</p>
                )}
                <p className="mt-0.5 text-rh-ink/80 dark:text-white/75">
                  {summary.oldestUnattended !== null && `The longest has waited ${formatDistanceToNowStrict(summary.oldestUnattended)}. `}
                  {summary.paidWaiting > 0 &&
                    `${summary.paidWaiting} ${summary.paidWaiting === 1 ? 'has' : 'have'} paid and ${summary.paidWaiting === 1 ? 'is' : 'are'} waiting on a physio.`}
                </p>
              </div>
              {summary.unattended > 0 && (
                <button type="button" onClick={showUnattended} className={cn(primaryButtonClass, 'h-10 w-full shrink-0 sm:w-auto')}>
                  Show them
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Waiting for care" value={summary.waiting} hint="People, each counted once" />
            <StatTile
              label="Not followed up"
              value={summary.unattended}
              hint="Waiting, with no note from the team"
              tone={summary.unattended ? 'attention' : 'default'}
            />
            <StatTile
              label="Resolved, last 7 days"
              value={summary.resolvedByTeam}
              hint={summary.closedAutomatically ? `Plus ${summary.closedAutomatically} closed automatically` : 'By the team'}
            />
            <StatTile label="New, last 24 hours" value={summary.newToday} hint="Sign-ups and requests" />
          </div>

          <Panel>
            <div className="space-y-3 px-4 pb-3 pt-4 sm:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <FilterChips
                  value={status}
                  onChange={(value) => {
                    setStatus(value)
                    setKind('any')
                  }}
                  options={[
                    { value: 'waiting', label: 'Waiting for care', count: summary.waiting },
                    { value: 'unattended', label: 'Not followed up', count: summary.unattended },
                    { value: 'resolved', label: 'Resolved', count: summary.resolved },
                    { value: 'all', label: 'All', count: (rows ?? []).length },
                  ]}
                />
                <label className="relative block w-full lg:ml-auto lg:w-72">
                  <span className="sr-only">Search patients</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, phone, email, ID or complaint"
                    className={cn(fieldClass, 'pl-9 pr-9')}
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setSearch('')}
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-400 hover:text-rh-ink dark:hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </label>
              </div>
              <FilterChips
                value={kind}
                onChange={setKind}
                options={(
                  [
                    { value: 'any', label: 'Any type', count: inStatus.length },
                    { value: 'awaiting_physio', label: 'Waiting on physio', count: kindCount('awaiting_physio') },
                    { value: 'help_choosing', label: 'Asked for help', count: kindCount('help_choosing') },
                    { value: 'joy', label: 'Joy', count: kindCount('joy') },
                    { value: 'no_physio', label: 'New sign-ups', count: kindCount('no_physio') },
                    { value: 'unpaid_checkout', label: 'Not paid', count: kindCount('unpaid_checkout') },
                    { value: 'browsing', label: 'Browsing', count: kindCount('browsing') },
                  ] as { value: KindFilter; label: string; count: number }[]
                ).filter((o) => o.value === 'any' || o.value === kind || o.count > 0)}
              />
            </div>

            {visible.length === 0 ? (
              search.trim() ? (
                <EmptyState icon={<SearchX />} title="No one matches" description="Try a name, the last digits of a phone number, or a Rehabify ID." />
              ) : (
                <EmptyState
                  icon={<HeartPulse />}
                  title={
                    status === 'resolved'
                      ? 'Nothing resolved in the last 7 days'
                      : status === 'unattended'
                        ? 'Everyone waiting has had a follow-up'
                        : 'No one waiting right now'
                  }
                  description={status === 'waiting' || status === 'all' ? 'New patients appear here the moment they need help.' : undefined}
                />
              )
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {visible.map((row) => {
                  const isOpen = row.status === 'open'
                  const dueSoon = row.dueAt !== null && row.dueAt - now < 30 * 60_000
                  const who = row.patient.name || 'Guest'
                  const open = () => row.patient.userId && setPatientId(row.patient.userId)
                  const notes = allNotes.has(row.id) ? row.followUps : row.followUps.slice(0, NOTES_SHOWN)
                  const editing = draft?.rowId === row.id ? draft : null
                  return (
                    <li key={row.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:gap-6">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isOpen ? (
                            <StatusBadge tone="amber">Waiting for care</StatusBadge>
                          ) : row.closedAutomatically ? (
                            <StatusBadge tone="neutral">Closed automatically</StatusBadge>
                          ) : (
                            <StatusBadge tone="green">Case resolved</StatusBadge>
                          )}
                          {isOpen && row.followUps.length === 0 && <StatusBadge tone="red">Not followed up</StatusBadge>}
                          <StatusBadge tone={KIND[row.kind].tone}>{KIND[row.kind].label}</StatusBadge>
                          {row.otherKinds.map((k) => (
                            <StatusBadge key={k} tone="neutral">
                              {KIND[k].label}
                            </StatusBadge>
                          ))}
                          {row.facts ? <SourceTags sources={row.facts.sources} /> : row.fromJoy ? <SourceTags sources={['joy']} /> : null}
                        </div>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                          <span className="inline-flex items-center gap-1" title={format(row.createdAt, 'd MMM yyyy, h:mmaaa')}>
                            <Clock className="h-3 w-3" /> {ago(row.createdAt)}
                          </span>
                          {row.signedUpAt !== null && row.createdAt - row.signedUpAt > 60 * 60_000 && (
                            <span title={format(row.signedUpAt, 'd MMM yyyy, h:mmaaa')}>Signed up {ago(row.signedUpAt)}</span>
                          )}
                          {isOpen && row.kind === 'awaiting_physio' && row.dueAt !== null && (
                            <StatusBadge tone={dueSoon ? 'red' : 'amber'}>
                              {row.dueAt > now ? `Physio must answer by ${time(row.dueAt)}` : 'Physio time is up'}
                            </StatusBadge>
                          )}
                        </p>
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
                        {!row.facts && row.request && (
                          <p className="mt-1 text-sm text-rh-ink/85 dark:text-white/85">
                            {[row.request.complaint, HELP_FORMAT_LABEL[row.request.format], [row.request.area, row.request.state].filter(Boolean).join(', ')]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                        {!row.patient.userId && row.kind === 'help_choosing' && (
                          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                            Not signed in: contact them on WhatsApp, then book them through Joy or a physio&apos;s booking link.
                          </p>
                        )}
                        {row.viewed.length > 0 && (
                          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                            Looked at:{' '}
                            {row.viewed.map((v, i) => (
                              <span key={v.physioId}>
                                {i > 0 ? ', ' : ''}
                                <button type="button" onClick={() => setPhysioId(v.physioId)} className="font-medium text-rh-ink underline-offset-2 hover:underline dark:text-white">
                                  {v.name}
                                </button>
                              </span>
                            ))}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">{row.detail}</p>
                        {row.otherDetails.map((d) => (
                          <p key={d} className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                            Also: {d}
                          </p>
                        ))}
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
                        {!isOpen && (
                          <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-300">
                            <CheckCircle2 className="mr-1 inline h-3 w-3" />
                            {row.handledNote}
                            {row.handledBy ? ` (${row.handledBy})` : ''}
                            {row.handledAt ? ` · ${format(row.handledAt, 'd MMM')}, ${time(row.handledAt)}` : ''}
                          </p>
                        )}

                        {/* The team's follow-up log */}
                        {row.followUps.length > 0 && (
                          <div className="mt-2.5 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-white/[0.04]">
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Follow-ups</p>
                            <ul className="space-y-1">
                              {notes.map((f, i) => (
                                <li key={`${f.at}-${i}`} className="text-xs leading-relaxed text-rh-ink dark:text-white/90">
                                  {f.outcome && isCareOutcome(f.outcome) && f.text !== CARE_OUTCOME_LABEL[f.outcome] && (
                                    <span className="font-semibold">{CARE_OUTCOME_LABEL[f.outcome]}: </span>
                                  )}
                                  <span className="whitespace-pre-wrap break-words">{f.text}</span>
                                  <span className="text-neutral-500 dark:text-neutral-400">
                                    {' '}
                                    · {f.by ? `${f.by}, ` : ''}
                                    {ago(f.at)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {row.followUps.length > NOTES_SHOWN && (
                              <button
                                type="button"
                                className="mt-1 text-xs font-medium text-neutral-600 underline-offset-2 hover:underline dark:text-neutral-300"
                                onClick={() =>
                                  setAllNotes((current) => {
                                    const next = new Set(current)
                                    if (next.has(row.id)) next.delete(row.id)
                                    else next.add(row.id)
                                    return next
                                  })
                                }
                              >
                                {allNotes.has(row.id) ? 'Show fewer' : `Show all ${row.followUps.length}`}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Log a follow-up, or resolve the case */}
                        {editing && (
                          <div className="mt-2.5 space-y-2 rounded-xl border border-black/[0.08] p-3 dark:border-white/[0.1]">
                            <label className="block space-y-1 text-xs font-medium text-rh-ink dark:text-white">
                              How did it go?
                              <select
                                value={editing.outcome}
                                onChange={(e) => setDraft({ ...editing, outcome: e.target.value as CareOutcome | '' })}
                                className={fieldClass}
                              >
                                <option value="">Choose (optional)</option>
                                {CARE_OUTCOMES.map((o) => (
                                  <option key={o} value={o}>
                                    {CARE_OUTCOME_LABEL[o]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block space-y-1 text-xs font-medium text-rh-ink dark:text-white">
                              Notes
                              <textarea
                                rows={3}
                                value={editing.text}
                                onChange={(e) => setDraft({ ...editing, text: e.target.value })}
                                maxLength={1000}
                                placeholder="e.g. Called at 2pm, no answer. Sent a WhatsApp. Says they'll book after payday."
                                className={textareaFieldClass}
                              />
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {editing.mode === 'resolve' && isOpen ? (
                                <>
                                  <button type="button" disabled={busy !== null} onClick={() => void saveDraft(row, true)} className={cn(primaryButtonClass, 'h-10')}>
                                    {busy === `resolve-${row.id}` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                                    Resolve case
                                  </button>
                                  <button type="button" disabled={busy !== null} onClick={() => void saveDraft(row, false)} className={cn(softButtonClass, 'h-10')}>
                                    Save note only
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button type="button" disabled={busy !== null} onClick={() => void saveDraft(row, false)} className={cn(primaryButtonClass, 'h-10')}>
                                    {busy === `note-${row.id}` && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                                    Save note
                                  </button>
                                  {isOpen && (
                                    <button type="button" disabled={busy !== null} onClick={() => void saveDraft(row, true)} className={cn(softButtonClass, 'h-10')}>
                                      Save and resolve
                                    </button>
                                  )}
                                </>
                              )}
                              <button type="button" onClick={() => setDraft(null)} className={cn(softButtonClass, 'h-10')}>
                                Cancel
                              </button>
                            </div>
                            {isOpen && row.openIds.length > 1 && (
                              <p className="text-xs text-neutral-500 dark:text-neutral-400">Resolving closes all {row.openIds.length} of this person&apos;s open requests.</p>
                            )}
                          </div>
                        )}

                        {/* Reach the patient */}
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          <ContactButtons phone={row.patient.phone} email={row.patient.email} />
                        </div>
                      </div>

                      <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:w-44 lg:flex-col lg:items-stretch">
                        {row.patient.userId && (
                          <button type="button" onClick={open} className={cn(isOpen ? primaryButtonClass : softButtonClass, 'h-10')}>
                            <UserRound className="mr-1.5 h-4 w-4" /> {isOpen ? 'Details & pair' : 'Details'}
                          </button>
                        )}
                        {isOpen && row.booking?.awaitingPhysio && (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void act(`nudge-${row.id}`, () => nudge({ signalId: row.id }), 'Physio nudged by app, phone and email.')}
                            className={cn(softButtonClass, 'h-10')}
                          >
                            <BellRing className="mr-1.5 h-4 w-4" /> Nudge physio
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDraft({ rowId: row.id, mode: 'note', outcome: '', text: '' })}
                          className={cn(softButtonClass, 'h-10')}
                        >
                          <NotebookPen className="mr-1.5 h-4 w-4" /> Add note
                        </button>
                        {isOpen ? (
                          <button
                            type="button"
                            onClick={() => setDraft({ rowId: row.id, mode: 'resolve', outcome: '', text: '' })}
                            className={cn(softButtonClass, 'h-10')}
                          >
                            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Resolve case
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void act(`reopen-${row.id}`, () => reopen({ signalId: row.id }), 'Back in the queue.')}
                            className={cn(softButtonClass, 'h-10')}
                          >
                            {busy === `reopen-${row.id}` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
                            Reopen
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="border-t border-black/[0.05] px-4 py-3 text-xs text-neutral-500 sm:px-5 dark:border-white/[0.06] dark:text-neutral-400">
              Newest first. Resolved cases stay here for 7 days. A case nobody resolves closes itself 3 days after the patient was last seen
              looking, or when they book.
            </p>
          </Panel>
        </>
      )}

      <PatientSheet patientId={patientId} onClose={() => setPatientId(null)} />
      <PhysioSheet physioId={physioId} preview={null} onClose={() => setPhysioId(null)} />
    </AdminPage>
  )
}
