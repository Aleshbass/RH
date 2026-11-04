'use client'

/**
 * Admin › AwaDoc: bookings that come in from the AwaDoc app, who is on them, what we offer AwaDoc,
 * callbacks waiting to reach AwaDoc and the webhook log. Backend: convex/awadoc.ts.
 */

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Activity, AlertTriangle, Banknote, CalendarClock, Clock, ExternalLink, RefreshCw, UserCheck } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AdminPage, EmptyState, FilterChips, inputClass, PageHeader, Panel, softButtonClass, StatTile, StatusBadge } from '@/components/admin/ui'
import { formatKobo, linkClass } from '@/components/admin/partners/shared'
import { lagosDateTime } from '@/convex/helpers/lagosTime'
import { publicAppUrl } from '@/lib/public-app-url'
import { useMutationUntyped, useQueryUntyped } from '@/lib/convexUntyped'
import { cn } from '@/lib/utils'

type Mode = 'virtual' | 'home_visit' | 'office_visit'
type BookingStatus =
  | 'declined'
  | 'reschedule_proposed'
  | 'quoted'
  | 'needs_physio'
  | 'active'
  | 'followup_pending'
  | 'completed'
  | 'plan_completed'
  | 'cancelled'

interface Visit {
  id: string
  visitNumber: number
  status: 'needs_time' | 'scheduled' | 'started' | 'completed' | 'cancelled'
  scheduledStart?: number
  physioId?: string
  physioName?: string
  payoutKobo: number
  payoutStatus: 'not_due' | 'owed' | 'paid'
  summary?: string
}

interface Booking {
  id: string
  therapyId: string
  requestId: string
  env: 'production' | 'test'
  status: BookingStatus
  declineReason?: string
  mode: Mode
  patientName: string
  complaint?: string
  requestedTime?: number
  scheduledStart: number
  priceKobo: number
  paidAt?: number
  sessionsRemaining?: number
  createdAt: number
  visits: Visit[]
}

interface Overview {
  settings: { enabled: boolean; modes: Mode[]; serviceId: string; minLeadMinutes: number }
  offer: { serviceId: string; serviceName: string; priceKobo: number; payoutKobo: number; durationMinutes: number }
  physioCount: Array<{ mode: Mode; count: number }>
  services: Array<{ id: string; name: string }>
  modes: Array<{ mode: Mode; label: string }>
  bookings: Booking[]
  owedKobo: number
  owedCount: number
  outbox: Array<{ id: string; therapyId: string; eventType: string; env: string; status: 'pending' | 'failed'; attempts: number; lastError?: string; lastHttpStatus?: number; nextAttemptAt: number }>
  events: Array<{ id: string; eventId: string; eventType: string; direction: 'inbound' | 'outbound'; status: 'success' | 'error'; errorMessage?: string; processedAt: number; payload?: unknown; responsePayload?: unknown }>
}

const MODE_LABEL: Record<Mode, string> = { virtual: 'Video call', home_visit: 'Home visit', office_visit: 'Office visit' }

const STATUS: Record<BookingStatus, { label: string; tone: 'neutral' | 'teal' | 'green' | 'amber' | 'red' }> = {
  quoted: { label: 'Waiting for payment', tone: 'neutral' },
  reschedule_proposed: { label: 'Offered another time', tone: 'neutral' },
  declined: { label: 'Declined', tone: 'neutral' },
  needs_physio: { label: 'Needs a physio', tone: 'red' },
  active: { label: 'Active', tone: 'green' },
  followup_pending: { label: 'Follow-up requested', tone: 'teal' },
  completed: { label: 'Completed', tone: 'teal' },
  plan_completed: { label: 'Plan completed', tone: 'teal' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

const VISIT_STATUS: Record<Visit['status'], string> = {
  needs_time: 'Time not set',
  scheduled: 'Booked',
  started: 'In progress',
  completed: 'Done',
  cancelled: 'Cancelled',
}

type Filter = 'all' | 'attention' | 'active' | 'waiting' | 'done' | 'declined'
const FILTERS: Record<Filter, (b: Booking) => boolean> = {
  all: () => true,
  attention: (b) => b.status === 'needs_physio',
  active: (b) => b.status === 'active' || b.status === 'followup_pending',
  waiting: (b) => b.status === 'quoted' || b.status === 'reschedule_proposed',
  done: (b) => b.status === 'completed' || b.status === 'plan_completed',
  declined: (b) => b.status === 'declined' || b.status === 'cancelled',
}

const errorText = (err: unknown) => {
  const data = (err as { data?: unknown })?.data
  if (typeof data === 'string') return data
  return err instanceof Error ? err.message.replace(/^.*Uncaught ConvexError: /, '').split('\n')[0] : 'Something went wrong'
}

export default function AwadocAdminPage() {
  const data = useQueryUntyped((api as any).awadoc.adminOverview) as Overview | undefined
  const [filter, setFilter] = useState<Filter>('all')
  const [assigning, setAssigning] = useState<{ booking: Booking; visit: Visit } | null>(null)
  const markPaid = useMutationUntyped((api as any).awadoc.adminMarkPayoutPaid)
  const retry = useMutationUntyped((api as any).awadoc.adminRetryOutbox)

  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>
    for (const key of Object.keys(FILTERS) as Filter[]) out[key] = data?.bookings.filter(FILTERS[key]).length ?? 0
    return out
  }, [data])

  const header = (
    <PageHeader
      eyebrow="Partners"
      title="AwaDoc"
      description="Patients who book Rehabify through the AwaDoc app. AwaDoc takes the payment and messages the patient; we assign a physio automatically and keep AwaDoc updated."
    />
  )

  if (data === undefined) {
    return (
      <AdminPage>
        {header}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </AdminPage>
    )
  }

  const bookings = data.bookings.filter(FILTERS[filter])

  return (
    <AdminPage>
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Needs a physio" value={counts.attention} hint="Paid, nobody free yet" icon={AlertTriangle} tone={counts.attention ? 'attention' : 'default'} />
        <StatTile label="Active" value={counts.active} hint="Physio assigned" icon={Activity} tone="mint" />
        <StatTile label="Waiting for payment" value={counts.waiting} hint="Confirmed to AwaDoc" icon={Clock} />
        <StatTile label="Owed to physios" value={formatKobo(data.owedKobo)} hint={`${data.owedCount} completed ${data.owedCount === 1 ? 'visit' : 'visits'}`} icon={Banknote} />
      </div>

      <SettingsPanel data={data} />

      <Panel title="Bookings" description="Latest 80 requests from AwaDoc" bodyClassName="space-y-3 px-4 pb-4 pt-2">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'attention', label: 'Needs a physio', count: counts.attention },
            { value: 'active', label: 'Active', count: counts.active },
            { value: 'waiting', label: 'Waiting for payment', count: counts.waiting },
            { value: 'done', label: 'Done', count: counts.done },
            { value: 'declined', label: 'Declined', count: counts.declined },
          ]}
        />
        {bookings.length === 0 ? (
          <EmptyState icon={<CalendarClock />} title="No bookings here" description="Requests appear when an AwaDoc patient picks Rehabify." />
        ) : (
          <div className="space-y-2">
            {bookings.map((booking) => (
              <div key={booking.id} className="rounded-xl border border-black/[0.06] p-3 dark:border-white/[0.07]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-rh-ink dark:text-white">
                      {booking.patientName}
                      <span className="ml-2 font-mono text-xs font-normal text-neutral-500">{booking.therapyId}</span>
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {MODE_LABEL[booking.mode]} · {lagosDateTime(booking.scheduledStart)} · {formatKobo(booking.priceKobo)} · received {lagosDateTime(booking.createdAt)}
                    </p>
                    {booking.complaint && <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-300">“{booking.complaint}”</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {booking.env === 'test' && <StatusBadge tone="amber">Test</StatusBadge>}
                    <StatusBadge tone={STATUS[booking.status].tone}>{STATUS[booking.status].label}</StatusBadge>
                  </div>
                </div>
                {booking.declineReason && <p className="mt-1 text-xs text-neutral-500">Reason: {booking.declineReason.replace(/_/g, ' ')}</p>}
                {booking.visits.length > 0 && (
                  <div className="mt-2 divide-y divide-black/[0.05] rounded-lg bg-rh-canvas px-3 dark:divide-white/[0.06] dark:bg-white/[0.03]">
                    {booking.visits.map((visit) => {
                      const canAssign = visit.status === 'needs_time' || visit.status === 'scheduled'
                      return (
                        <div key={visit.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                          <span className="text-neutral-600 dark:text-neutral-300">
                            Session {visit.visitNumber} · {visit.scheduledStart ? lagosDateTime(visit.scheduledStart) : 'time not set'} · {VISIT_STATUS[visit.status]}
                            {' · '}
                            <span className={cn('font-medium', visit.physioName ? 'text-rh-ink dark:text-white' : 'text-rose-600 dark:text-rose-300')}>
                              {visit.physioName ?? 'No physio'}
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            {visit.payoutStatus === 'owed' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className={cn(softButtonClass, 'h-7 text-xs')}
                                onClick={() =>
                                  markPaid({ visitId: visit.id }).then(
                                    () => toast.success('Marked as paid'),
                                    (err: unknown) => toast.error(errorText(err))
                                  )
                                }
                              >
                                Owed {formatKobo(visit.payoutKobo)} · mark paid
                              </Button>
                            )}
                            {visit.payoutStatus === 'paid' && <StatusBadge tone="green">Payout paid</StatusBadge>}
                            {canAssign && (
                              <Button size="sm" variant="ghost" className={cn(softButtonClass, 'h-7 text-xs')} onClick={() => setAssigning({ booking, visit })}>
                                <UserCheck className="mr-1 h-3.5 w-3.5" /> {visit.physioId ? 'Change physio' : 'Assign physio'}
                              </Button>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Updates to AwaDoc"
        description="Callbacks waiting to reach AwaDoc. They retry on their own; failed ones need a retry here."
        actions={
          data.outbox.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              className={softButtonClass}
              onClick={() =>
                retry({}).then(
                  (n: number) => toast.success(`Retrying ${n} ${n === 1 ? 'update' : 'updates'}`),
                  (err: unknown) => toast.error(errorText(err))
                )
              }
            >
              <RefreshCw className="mr-1.5 h-4 w-4" /> Retry now
            </Button>
          ) : undefined
        }
        bodyClassName="px-4 pb-4 pt-2"
      >
        {data.outbox.length === 0 ? (
          <p className="px-1 py-2 text-sm text-neutral-500 dark:text-neutral-400">All caught up.</p>
        ) : (
          <div className="space-y-1.5">
            {data.outbox.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rh-canvas px-3 py-2 text-xs dark:bg-white/[0.03]">
                <span className="font-mono text-rh-ink dark:text-neutral-200">
                  {row.eventType} · {row.therapyId}
                  {row.env === 'test' && ' · test'}
                </span>
                <span className="flex items-center gap-2 text-neutral-500">
                  {row.lastError && <span className="text-rose-600 dark:text-rose-300">{row.lastError}</span>}
                  <span>{row.attempts} tries</span>
                  <StatusBadge tone={row.status === 'failed' ? 'red' : 'amber'}>{row.status === 'failed' ? 'Failed' : 'Pending'}</StatusBadge>
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <EventLog events={data.events} />

      <Panel title="Integration details" bodyClassName="grid gap-4 px-5 pb-5 pt-3 md:grid-cols-2">
        <Detail label="Webhook URL (set by AwaDoc's team)">
          <code className="block break-all rounded-lg bg-rh-canvas p-2 text-xs dark:bg-white/[0.04]">{publicAppUrl()}/api/awadoc/webhook</code>
        </Detail>
        <Detail label="Keys (Vercel)">
          <span className="text-xs">
            <code>AWADOC_PARTNER_ID</code>, <code>AWADOC_SECRET_KEY</code> (production) and optionally <code>AWADOC_TEST_SECRET_KEY</code>. Events signed with the test key show a Test badge and their updates go to AwaDoc&apos;s sandbox.
          </span>
        </Detail>
        <Detail label="Where updates go">
          <span className="text-xs">
            <code>https://partners-api.awadoc.com/api/partners/&lt;AWADOC_PARTNER_ID&gt;/callback</code>. The guide&apos;s partners-prod-001 host doesn&apos;t exist; override with <code>AWADOC_BASE_URL</code> only if AwaDoc gives you a new one.
          </span>
        </Detail>
        <Detail label="AwaDoc guide">
          <a href="https://partners.awadoc.com/api-documentation/therapy-provider-guide" target="_blank" rel="noopener noreferrer" className={cn(linkClass, 'inline-flex items-center gap-1 text-sm')}>
            Therapy Provider Guide <ExternalLink className="h-3 w-3" />
          </a>
        </Detail>
        <Detail label="Support">
          <span className="text-xs">integration@awadoc.com (include partner id and trace id) · settlements@awadoc.com for payouts</span>
        </Detail>
      </Panel>

      <AssignDialog target={assigning} onClose={() => setAssigning(null)} />
    </AdminPage>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 text-rh-ink dark:text-neutral-200">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      {children}
    </div>
  )
}

function SettingsPanel({ data }: { data: Overview }) {
  const save = useMutationUntyped((api as any).awadoc.adminSaveSettings)
  const [enabled, setEnabled] = useState(data.settings.enabled)
  const [modes, setModes] = useState<Mode[]>(data.settings.modes)
  const [serviceId, setServiceId] = useState(data.settings.serviceId)
  const [lead, setLead] = useState(String(data.settings.minLeadMinutes))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEnabled(data.settings.enabled)
    setModes(data.settings.modes)
    setServiceId(data.settings.serviceId)
    setLead(String(data.settings.minLeadMinutes))
  }, [data.settings])

  const dirty =
    enabled !== data.settings.enabled ||
    serviceId !== data.settings.serviceId ||
    Number(lead) !== data.settings.minLeadMinutes ||
    modes.slice().sort().join() !== data.settings.modes.slice().sort().join()

  const submit = async () => {
    setSaving(true)
    try {
      await save({ enabled, modes, serviceId, minLeadMinutes: Number(lead) })
      toast.success('AwaDoc settings saved')
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel
      title="What we offer on AwaDoc"
      description={`Price sent to AwaDoc: ${formatKobo(data.offer.priceKobo)} · physio payout ${formatKobo(data.offer.payoutKobo)} per session · ${data.offer.durationMinutes} min (from ${data.offer.serviceName} in Admin › Pricing)`}
      bodyClassName="grid gap-5 px-5 pb-5 pt-3 md:grid-cols-2"
    >
      <div className="space-y-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            <span className="font-medium text-rh-ink dark:text-white">Take AwaDoc bookings</span>
            <span className="block text-xs text-neutral-500">Off: we show as unavailable and decline requests.</span>
          </span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </label>
        <div className="space-y-2">
          <p className="text-sm font-medium text-rh-ink dark:text-white">Visit types</p>
          {data.modes.map(({ mode, label }) => {
            const count = data.physioCount.find((p) => p.mode === mode)?.count
            return (
              <label key={mode} className="flex items-center gap-2 text-sm text-rh-ink dark:text-neutral-200">
                <Checkbox
                  checked={modes.includes(mode)}
                  onCheckedChange={(checked) => setModes((prev) => (checked === true ? [...new Set([...prev, mode])] : prev.filter((m) => m !== mode)))}
                />
                {label}
                {count !== undefined && <span className="text-xs text-neutral-500">· {count} physios available</span>}
              </label>
            )
          })}
        </div>
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="awadoc-service" className="text-sm font-medium text-rh-ink dark:text-white">
            Priced as
          </label>
          <select id="awadoc-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={cn(inputClass, 'h-9 w-full border px-3 text-sm')}>
            {data.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="awadoc-lead" className="text-sm font-medium text-rh-ink dark:text-white">
            Minimum notice (minutes)
          </label>
          <Input id="awadoc-lead" type="number" min={0} value={lead} onChange={(e) => setLead(e.target.value)} className={cn(inputClass, 'h-9')} />
          <p className="text-xs text-neutral-500">Requests sooner than this get the next free time offered instead.</p>
        </div>
        <Button onClick={submit} disabled={!dirty || saving || modes.length === 0}>
          Save
        </Button>
      </div>
    </Panel>
  )
}

function AssignDialog({ target, onClose }: { target: { booking: Booking; visit: Visit } | null; onClose: () => void }) {
  const candidates = useQueryUntyped((api as any).awadoc.adminCandidates, target ? { visitId: target.visit.id } : 'skip') as
    | Array<{ userId: string; name: string; location?: string; free: boolean; current: boolean }>
    | undefined
  const assign = useMutationUntyped((api as any).awadoc.adminAssign)
  const [busy, setBusy] = useState<string | null>(null)

  const pick = async (userId: string) => {
    if (!target) return
    setBusy(userId)
    try {
      await assign({ visitId: target.visit.id, physiotherapistId: userId })
      toast.success('Physio assigned. AwaDoc will be told.')
      onClose()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign a physio</DialogTitle>
          <DialogDescription>
            {target ? `${target.booking.patientName} · session ${target.visit.visitNumber} · ${target.visit.scheduledStart ? lagosDateTime(target.visit.scheduledStart) : 'time not set'}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {candidates === undefined ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : candidates.length === 0 ? (
            <p className="text-sm text-neutral-500">No approved network physio offers this visit type.</p>
          ) : (
            candidates.map((c) => (
              <button
                key={c.userId}
                type="button"
                disabled={c.current || busy !== null}
                onClick={() => pick(c.userId)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-rh-canvas disabled:opacity-60 dark:hover:bg-white/[0.04]"
              >
                <span>
                  <span className="font-medium text-rh-ink dark:text-white">{c.name}</span>
                  {c.location && <span className="ml-2 text-xs text-neutral-500">{c.location}</span>}
                </span>
                {c.current ? <StatusBadge>Current</StatusBadge> : <StatusBadge tone={c.free ? 'green' : 'amber'}>{c.free ? 'Free then' : 'Busy then'}</StatusBadge>}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EventLog({ events }: { events: Overview['events'] }) {
  return (
    <Panel title="Webhook log" description="Latest 30 events in and out (kept 90 days)" bodyClassName="px-3 pb-3 pt-2">
      {events.length === 0 ? (
        <EmptyState icon={<Clock />} title="No events yet" description="Events appear once AwaDoc calls the webhook." />
      ) : (
        <div className="space-y-1.5">
          {events.map((event) => (
            <details key={event.id} className="rounded-xl border border-black/[0.05] dark:border-white/[0.06]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', event.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500')} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{event.eventType}</span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                      {lagosDateTime(event.processedAt)}
                      {event.errorMessage && <span className="text-rose-600 dark:text-rose-300"> · {event.errorMessage}</span>}
                    </span>
                  </span>
                </span>
                <StatusBadge tone={event.direction === 'inbound' ? 'teal' : 'neutral'}>{event.direction === 'inbound' ? '← In' : '→ Out'}</StatusBadge>
              </summary>
              <div className="grid gap-2 px-3 pb-3 md:grid-cols-2">
                <JsonBlock label="Payload" value={event.payload} />
                <JsonBlock label="Response" value={event.responsePayload} />
              </div>
            </details>
          ))}
        </div>
      )}
    </Panel>
  )
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-neutral-500">{label}</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-rh-canvas p-2 font-mono text-[11px] text-rh-ink dark:bg-white/[0.04] dark:text-neutral-200">
        {value === undefined ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}
