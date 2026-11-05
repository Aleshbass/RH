'use client'

/**
 * Patients looking for care: paid patients waiting on a physio, unpaid checkouts, patients Joy has
 * triaged or couldn't match, and signed-in patients browsing Find a Physio. The team reaches out,
 * nudges the physio or reassigns, then marks it handled (convex/careQueue.ts).
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { BellRing, CalendarCheck, CheckCircle2, Clock, HeartPulse, Mail, Phone, UserRound, WhatsApp } from '@/components/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminPage, EmptyState, FilterChips, PageHeader, Panel, StatTile, StatusBadge, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { cn } from '@/lib/utils'

type Kind = 'awaiting_physio' | 'unpaid_checkout' | 'joy_matching' | 'browsing'
type Row = {
  id: string
  kind: Kind
  status: 'open' | 'handled'
  detail: string
  createdAt: number
  lastSeenAt: number
  dueAt: number | null
  patient: { userId: string | null; name: string | null; rehabifyId: string | null; phone: string | null; email: string | null }
  physio: { name: string; phone: string | null } | null
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
  unpaid_checkout: { label: 'Started · not paid', tone: 'teal' },
  browsing: { label: 'Browsing', tone: 'neutral' },
}

type Filter = 'open' | Kind | 'handled'

const time = (t: number) => new Date(t).toLocaleString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' })

/** wa.me wants the international number without "+"; Nigerian local numbers start with 0. */
function whatsappDigits(phone: string | null) {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `234${digits.slice(1)}`
  return digits.length >= 10 ? digits : null
}

function errorText(error: unknown) {
  return error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Something went wrong. Please try again.'
}

export default function CareQueuePage() {
  const rows = useQuery(listRef, {})
  const markHandled = useMutation(handledRef)
  const nudge = useMutation(nudgeRef)
  const [filter, setFilter] = useState<Filter>('open')
  const [busy, setBusy] = useState<string | null>(null)
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
      joy_matching: open.filter((r) => r.kind === 'joy_matching'),
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
        description="Everyone who wants a physio right now. Reach out, nudge the physio or reassign, then mark it handled. You get a phone alert for each new one."
      />

      {rows === undefined ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Paid, waiting on physio"
              value={groups.awaiting_physio.length}
              hint="Physios are nudged automatically"
              tone={groups.awaiting_physio.length ? 'attention' : 'default'}
            />
            <StatTile label="Joy: needs a physio" value={groups.joy_matching.length} hint="Triaged, shown matches or unmatched" />
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
                  { value: 'joy_matching', label: 'Joy', count: groups.joy_matching.length },
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
                  const wa = whatsappDigits(row.patient.phone)
                  const dueSoon = row.dueAt !== null && row.dueAt - now < 30 * 60_000
                  const who = row.patient.name || 'Guest'
                  return (
                    <li key={row.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:gap-6">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={KIND[row.kind].tone}>{KIND[row.kind].label}</StatusBadge>
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
                            <Link href={`/dashboard/admin/users/${row.patient.userId}`} className="underline-offset-2 hover:underline">
                              {who}
                            </Link>
                          ) : (
                            who
                          )}
                          {row.patient.rehabifyId && <span className="ml-2 font-mono text-xs font-normal text-neutral-500">{row.patient.rehabifyId}</span>}
                        </p>
                        <p className="mt-0.5 text-sm text-rh-ink/80 dark:text-white/80">{row.detail}</p>
                        {(row.booking || row.physio) && (
                          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                            {row.booking?.line}
                            {row.physio ? `${row.booking ? ' · ' : ''}Physio: ${row.physio.name}` : ''}
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
                          {wa && (
                            <a
                              href={`https://wa.me/${wa}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-full bg-rh-canvas px-3 py-1.5 text-xs font-semibold text-rh-ink hover:bg-rh-honeydew dark:bg-white/[0.06] dark:text-white"
                            >
                              <WhatsApp className="h-3.5 w-3.5 text-[#25D366]" /> WhatsApp
                            </a>
                          )}
                          {row.patient.phone && (
                            <a href={`tel:${row.patient.phone}`} className="inline-flex items-center gap-1.5 rounded-full bg-rh-canvas px-3 py-1.5 text-xs font-semibold text-rh-ink hover:bg-rh-honeydew dark:bg-white/[0.06] dark:text-white">
                              <Phone className="h-3.5 w-3.5" /> Call
                            </a>
                          )}
                          {row.patient.email && (
                            <a href={`mailto:${row.patient.email}`} className="inline-flex items-center gap-1.5 rounded-full bg-rh-canvas px-3 py-1.5 text-xs font-semibold text-rh-ink hover:bg-rh-honeydew dark:bg-white/[0.06] dark:text-white">
                              <Mail className="h-3.5 w-3.5" /> Email
                            </a>
                          )}
                          {row.patient.userId && (
                            <Link href={`/dashboard/admin/users/${row.patient.userId}`} className="inline-flex items-center gap-1.5 rounded-full bg-rh-canvas px-3 py-1.5 text-xs font-semibold text-rh-ink hover:bg-rh-honeydew dark:bg-white/[0.06] dark:text-white">
                              <UserRound className="h-3.5 w-3.5" /> Profile
                            </Link>
                          )}
                          {row.booking && (
                            <Link href="/dashboard/admin/marketplace-bookings" className="inline-flex items-center gap-1.5 rounded-full bg-rh-canvas px-3 py-1.5 text-xs font-semibold text-rh-ink hover:bg-rh-honeydew dark:bg-white/[0.06] dark:text-white">
                              <CalendarCheck className="h-3.5 w-3.5" /> Bookings &amp; reassign
                            </Link>
                          )}
                        </div>
                      </div>
                      {row.status === 'open' && (
                        <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col lg:items-stretch">
                          {row.booking?.awaitingPhysio && (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => void act(`nudge-${row.id}`, () => nudge({ signalId: row.id }), 'Physio nudged by app, phone and email.')}
                              className={cn(primaryButtonClass, 'h-10')}
                            >
                              <BellRing className="mr-1.5 h-4 w-4" /> Nudge physio
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void act(`done-${row.id}`, () => markHandled({ signalId: row.id }), 'Marked handled.')}
                            className={cn(softButtonClass, 'h-10')}
                          >
                            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark handled
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </>
      )}
    </AdminPage>
  )
}
