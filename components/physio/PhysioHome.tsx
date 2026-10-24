'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Copy,
  HeartPulse,
  MessageCircle,
  Plus,
  Receipt,
  Search,
  UserPlus,
  Users,
  Video,
} from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import AddPatientModal from '@/components/dashboard/physiotherapist/AddPatientModal'
import { accentButtonClass, EmptyState, IconChip, InfoTip, PageContainer, Panel, StatTile, StatusBadge, type Tone } from '@/components/physio/ui'
import { useBooking } from '@/components/physio/schedule/BookingDrawer'
import { AppointmentDrawer } from '@/components/physio/schedule/AppointmentDrawer'
import { joinLink, useNow, visitStatus, type PhysioAppointment } from '@/components/physio/schedule/shared'
import { SetupChecklistCard, type SetupStatus } from '@/components/physio/SetupChecklist'
import { PHYSIO_HOME } from '@/components/physio/PhysioSidebar'
import { PainPill } from '@/components/physio/workspace/shared'
import { RehabifyId } from '@/components/shared/RehabifyId'
import { matchesRehabifyId } from '@/convex/helpers/rehabifyIdFormat'
import { publicAppUrl } from '@/lib/public-app-url'
import { useMutationUntyped, useQueryUntyped } from '@/lib/convexUntyped'
import { cn } from '@/lib/utils'

type Appointment = {
  _id: string
  startTime: number
  endTime?: number
  serviceType?: string
  status: string
  appointmentType?: 'in-person' | 'telehealth'
  isOnline?: boolean
  patientId: string
  patient?: { _id: string; firstName?: string; lastName?: string; imageUrl?: string } | null
}

type PatientRow = {
  _id: string
  firstName?: string
  lastName?: string
  imageUrl?: string
  email?: string
  patientNumber?: string
  stats?: { appointmentCount?: number; lastSessionDate?: number }
}

type Stats = { totalPatients?: number; todaysAppointments?: number; completedSessionsThisWeek?: number; pendingInvitations?: number }

type AttentionItem = {
  key: string
  kind: 'check_in' | 'exercise_pain' | 'plan_review' | 'no_booking' | 'unconfirmed' | 'overdue_invoice'
  severity: 'high' | 'medium' | 'low'
  patientId: string
  patientName: string
  title: string
  detail: string
  href: string
  at: number
}

/** The generated api types sit at TypeScript's depth limit, so Home reads its functions untyped. */
const homeApi = api as unknown as Record<string, Record<string, unknown>>
const searchApi = (homeApi.marketplace as unknown as Record<string, Record<string, unknown>>).search

const CANCELLED = new Set(['cancelled_by_patient', 'cancelled_by_therapist'])

/**
 * One meaning per colour, matching the Schedule: rose = the patient is hurting, amber = waiting
 * on your answer, blue = waiting on the patient, violet = care plan, sun = money, neutral = a nudge.
 */
const ATTENTION_STYLE: Record<AttentionItem['kind'], { icon: typeof HeartPulse; tone: Tone }> = {
  check_in: { icon: HeartPulse, tone: 'rose' },
  exercise_pain: { icon: Activity, tone: 'rose' },
  plan_review: { icon: ClipboardCheck, tone: 'violet' },
  no_booking: { icon: CalendarClock, tone: 'neutral' },
  unconfirmed: { icon: CalendarDays, tone: 'amber' },
  overdue_invoice: { icon: Receipt, tone: 'sun' },
}

const FALLBACK_STYLE = { icon: CalendarDays, tone: 'neutral' as Tone }

function attentionStyle(item: AttentionItem) {
  // Bookings waiting on the patient (not on you) are low priority and blue
  if (item.kind === 'unconfirmed' && item.severity === 'low') return { icon: CalendarDays, tone: 'blue' as Tone }
  return ATTENTION_STYLE[item.kind] ?? FALLBACK_STYLE
}

function greeting(date: Date) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const fullName = (p?: { firstName?: string; lastName?: string } | null) =>
  [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Patient'
const initials = (p?: { firstName?: string; lastName?: string } | null) =>
  `${p?.firstName?.[0] ?? ''}${p?.lastName?.[0] ?? ''}`.toUpperCase() || 'P'

// ─────────────────────────────────────────────────────────────────────────────

function Hero({
  firstName,
  clinicName,
  todayCount,
  attentionCount,
}: {
  firstName?: string
  clinicName?: string
  todayCount?: number
  attentionCount?: number
}) {
  const now = new Date()
  const openBooking = useBooking()
  const parts: string[] = []
  if (todayCount !== undefined) parts.push(todayCount === 0 ? 'No sessions today' : `${todayCount} session${todayCount === 1 ? '' : 's'} today`)
  if (attentionCount) parts.push(`${attentionCount} thing${attentionCount === 1 ? '' : 's'} need${attentionCount === 1 ? 's' : ''} your attention`)

  return (
    <section className="relative overflow-hidden rounded-3xl bg-rh-ink px-5 py-6 text-white dark:bg-rh-ink-2 sm:px-8 sm:py-8">
      {/* Flat brand shapes: no gradients, no glows */}
      <span aria-hidden className="pointer-events-none absolute right-16 top-10 hidden h-16 w-16 rounded-2xl bg-rh-amber/80 sm:block" style={{ transform: 'rotate(14deg)' }} />
      <span aria-hidden className="pointer-events-none absolute right-36 top-24 hidden h-7 w-7 rounded-full bg-rh-rose sm:block" />

      <div className="relative max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
          {format(now, 'EEEE, d MMMM')}
          {clinicName ? ` · ${clinicName}` : ''}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {greeting(now)}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-2 text-[15px] text-white/80">{parts.length > 0 ? `${parts.join(' · ')}.` : 'Here’s your practice at a glance.'}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button className="rounded-xl bg-rh-lime text-rh-ink hover:bg-rh-lime-deep active:scale-[0.98]" onClick={() => openBooking()}>
            <Plus className="mr-2 h-4 w-4" />
            New appointment
          </Button>
          <AddPatientModal
            trigger={
              <Button variant="ghost" className="rounded-xl bg-white/15 text-white hover:bg-white/25 hover:text-white active:scale-[0.98]">
                <UserPlus className="mr-2 h-4 w-4" />
                Add patient
              </Button>
            }
          />
        </div>
      </div>
    </section>
  )
}

function NeedsAttention({ items }: { items: AttentionItem[] | undefined }) {
  return (
    <Panel
      title="Needs your attention"
      info="Things to act on: high pain or flagged check-ins, booking requests, follow-ups and reviews that are due. Tap one to open the patient."
      actions={items && items.length > 0 ? <StatusBadge tone="amber">{items.length}</StatusBadge> : undefined}
    >
      {items === undefined ? (
        <div className="space-y-2 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 pb-5 pt-3">
          <IconChip icon={Check} tone="mint" />
          <p className="text-sm text-pt-muted">All clear. Nothing needs you right now.</p>
        </div>
      ) : (
        <ul className="pb-2 pt-1">
          {items.map((item) => {
            const style = attentionStyle(item)
            return (
              <li key={item.key}>
                <Link href={item.href} className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-pt-hover">
                  <IconChip icon={style.icon} tone={style.tone} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-pt-ink">{item.patientName}</p>
                    <p className="truncate text-xs text-pt-muted">
                      {item.title}
                      {item.detail ? ` · ${item.detail}` : ''}
                    </p>
                  </div>
                  {item.severity === 'high' && <span className="h-2 w-2 shrink-0 rounded-full bg-pt-rose-fg" aria-label="Urgent" />}
                  <ChevronRight className="h-4 w-4 shrink-0 text-pt-faint transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function TodaySchedule({ appointments }: { appointments: Appointment[] | undefined }) {
  const sorted = useMemo(() => (appointments ?? []).slice().sort((a, b) => a.startTime - b.startTime), [appointments])
  const now = useNow(30_000)
  const nextId = sorted.find((a) => !CANCELLED.has(a.status) && (a.endTime ?? a.startTime) >= now)?._id
  const openBooking = useBooking()
  // The visit open in the drawer, looked up live so it updates while open
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const selected = (sorted.find((a) => a._id === selectedId) ?? null) as unknown as PhysioAppointment | null

  return (
    <div data-tour="today">
      <Panel
        title="Today’s schedule"
        description={format(new Date(), 'EEEE d MMMM')}
        info="Tap a session for details and actions. Video sessions get a Join button 10 minutes before they start."
        actions={
          <Link href={`${PHYSIO_HOME}/calendar`} className="text-xs font-semibold text-rh-ink hover:underline dark:text-rh-lime">
            Open calendar
          </Link>
        }
      >
        {appointments === undefined ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<CalendarDays />}
            title="A free day"
            description="New bookings from your link and the marketplace show up here."
            action={
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => openBooking()}>
                New appointment
              </Button>
            }
          />
        ) : (
          <ol className="space-y-2 px-3 pb-3 pt-2">
            {sorted.map((appointment) => {
              const online = appointment.isOnline || appointment.appointmentType === 'telehealth'
              const isNext = appointment._id === nextId
              const cancelled = CANCELLED.has(appointment.status)
              const full = appointment as unknown as PhysioAppointment
              const link = joinLink(full, now)
              const status = visitStatus(full, now)
              return (
                <li key={appointment._id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(appointment._id)
                      setDrawerOpen(true)
                    }}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 text-left transition-all hover:bg-rh-canvas dark:hover:bg-white/[0.03]',
                      isNext && 'bg-rh-honeydew ring-1 ring-rh-lime/15 hover:bg-rh-honeydew dark:bg-white/[0.06] dark:ring-white/10',
                      cancelled && 'opacity-60'
                    )}
                  >
                    <div className="w-16 shrink-0 text-center">
                      <p className={cn('text-sm font-semibold tabular-nums', isNext ? 'text-rh-ink dark:text-rh-lime' : 'text-rh-ink dark:text-white')}>
                        {format(appointment.startTime, 'h:mm')}
                      </p>
                      <p className="text-[11px] uppercase text-neutral-400">{format(appointment.startTime, 'a')}</p>
                    </div>
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={appointment.patient?.imageUrl} alt="" />
                      <AvatarFallback className="bg-rh-cream text-xs font-semibold text-rh-ink dark:bg-white/10 dark:text-rh-lime">
                        {initials(appointment.patient)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{fullName(appointment.patient)}</p>
                      <p className="flex items-center gap-1.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {online && <Video className="h-3 w-3 shrink-0" aria-label="Video session" />}
                        <span className="truncate">{appointment.serviceType || (online ? 'Video session' : 'In person')}</span>
                        {appointment.endTime ? <span className="shrink-0">· {Math.round((appointment.endTime - appointment.startTime) / 60000)} min</span> : null}
                      </p>
                    </div>
                    {isNext && !link ? <StatusBadge tone="teal">Up next</StatusBadge> : !link && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
                  </button>
                  {link && (
                    <Button asChild size="sm" className={cn(accentButtonClass, 'h-9 shrink-0 px-3')}>
                      <a href={link} target="_blank" rel="noopener noreferrer">
                        <Video className="mr-1.5 h-3.5 w-3.5" />
                        Join
                      </a>
                    </Button>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </Panel>
      <AppointmentDrawer appointment={selected} open={drawerOpen && selected !== null} onOpenChange={setDrawerOpen} />
    </div>
  )
}

type RecentCheckIn = {
  _id: string
  painScore: number
  exercisesDone: 'all' | 'some' | 'none'
  mood?: string
  note?: string
  flagged: boolean
  flagReason?: string
  createdAt: number
  patient: { _id: string; firstName?: string; lastName?: string; imageUrl?: string } | null
}

function CheckInFeed({ checkIns }: { checkIns: RecentCheckIn[] | undefined }) {
  return (
    <Panel
      title="Patient check-ins"
      description="How patients say they’re doing between sessions"
      info="Patients log their pain and exercises from their dashboard. High pain or a flag also shows in Needs your attention."
    >
      {checkIns === undefined ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      ) : checkIns.length === 0 ? (
        <div className="flex items-start gap-3 px-5 pb-5 pt-3">
          <IconChip icon={HeartPulse} tone="rose" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No check-ins yet. Your patients can share their pain, mood and exercises from their Rehabify home screen.
          </p>
        </div>
      ) : (
        <ul className="pb-2 pt-1">
          {checkIns.map((c) => (
            <li key={c._id}>
              <Link
                href={`${PHYSIO_HOME}/patients/${c.patient?._id ?? ''}?tab=checkins`}
                className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-rh-canvas dark:hover:bg-white/[0.03]"
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={c.patient?.imageUrl} alt="" />
                  <AvatarFallback className="bg-rh-blush text-xs font-semibold text-[#be3a5f] dark:bg-rose-400/10 dark:text-rose-300">
                    {initials(c.patient)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{fullName(c.patient)}</p>
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {c.note ? `“${c.note}”` : c.exercisesDone === 'all' ? 'Did all exercises' : c.exercisesDone === 'some' ? 'Did some exercises' : 'Skipped exercises'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <PainPill score={c.painScore} />
                  <span className="text-[11px] text-neutral-400">{formatDistanceToNow(c.createdAt, { addSuffix: true })}</span>
                </div>
                {c.flagged && <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" aria-label={c.flagReason ?? 'Flagged'} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function OpenWorkspace({ patients }: { patients: PatientRow[] | undefined }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const list = patients ?? []
    const term = query.trim().toLowerCase()
    const filtered = term
      ? list.filter(
          (p) =>
            `${p.firstName ?? ''} ${p.lastName ?? ''} ${p.email ?? ''}`.toLowerCase().includes(term) ||
            matchesRehabifyId(p.patientNumber, term)
        )
      : list.slice().sort((a, b) => (b.stats?.lastSessionDate ?? 0) - (a.stats?.lastSessionDate ?? 0))
    return filtered.slice(0, 5)
  }, [patients, query])

  return (
    <Panel title="Open a patient workspace">
      <div className="px-5 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your patients"
            className="h-10 rounded-xl border-0 bg-rh-canvas pl-9 dark:bg-white/[0.05]"
            aria-label="Search your patients"
          />
        </div>
      </div>
      {patients === undefined ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : results.length === 0 ? (
        <p className="px-5 pb-5 pt-4 text-sm text-neutral-500 dark:text-neutral-400">
          {query ? 'No patients match.' : 'Your patients will show up here.'}
        </p>
      ) : (
        <ul className="pb-2 pt-2">
          {results.map((patient) => (
            <li key={patient._id}>
              <Link
                href={`${PHYSIO_HOME}/patients/${patient._id}`}
                className="group flex items-center gap-3 px-5 py-2 transition-colors hover:bg-rh-canvas dark:hover:bg-white/[0.03]"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={patient.imageUrl} alt="" />
                  <AvatarFallback className="bg-rh-honeydew text-xs font-semibold text-rh-ink">{initials(patient)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium text-rh-ink dark:text-white">{fullName(patient)}</p>
                    <RehabifyId value={patient.patientNumber} copyable={false} />
                  </div>
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {patient.stats?.lastSessionDate
                      ? `Last seen ${formatDistanceToNow(patient.stats.lastSessionDate, { addSuffix: true })}`
                      : 'No sessions yet'}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 dark:text-neutral-600" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="px-5 pb-4">
        <Link href={`${PHYSIO_HOME}/patients`} className="text-xs font-semibold text-rh-ink hover:underline dark:text-rh-lime">
          All patients
        </Link>
      </div>
    </Panel>
  )
}

function BookingLinkCard({ physioId, name }: { physioId: Id<'users'>; name?: string }) {
  const ensureSlug = useMutationUntyped(searchApi.ensureBookingSlug) as (args: { userId: Id<'users'> }) => Promise<string | null>
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    const base = publicAppUrl()
    // The slug never changes once set: ask the server once per browser session, not every visit
    const cacheKey = `rehabify:booking-slug:${physioId}`
    let cached: string | null = null
    try {
      cached = sessionStorage.getItem(cacheKey)
    } catch {
      // Storage blocked: ask the server
    }
    if (cached) {
      setUrl(`${base}/book/${cached}`)
      return
    }
    ensureSlug({ userId: physioId })
      .then((slug) => {
        if (slug) {
          try {
            sessionStorage.setItem(cacheKey, slug)
          } catch {
            // Fine: asked again next visit
          }
        }
        if (active) setUrl(`${base}/book/${slug || physioId}`)
      })
      .catch(() => active && setUrl(`${base}/book/${physioId}`))
    return () => {
      active = false
    }
  }, [physioId, ensureSlug])

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Couldn’t copy. Press and hold the link to copy it.')
    }
  }
  const message = `Book a physiotherapy session${name ? ` with ${name}` : ''}: ${url ?? ''}`

  return (
    <div data-tour="booking-link">
      <section className="overflow-hidden rounded-2xl bg-rh-cream p-5 dark:bg-white/[0.04]">
        <div className="flex items-center gap-3">
          <IconChip icon={CalendarClock} tone="peach" className="bg-white dark:bg-white/10" />
          <div className="min-w-0">
            <h2 className="flex items-center gap-1 text-[15px] font-semibold tracking-tight text-rh-ink dark:text-white">
              Your booking link
              <InfoTip>Your public page: patients see your services and open times, then book and pay. Share it on WhatsApp, Instagram or your business card.</InfoTip>
            </h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">Patients book and pay through it</p>
          </div>
        </div>
        <div className="mt-4 truncate rounded-xl bg-white px-3 py-2 text-sm text-neutral-700 shadow-sm dark:bg-rh-ink-2 dark:text-neutral-300">
          {url ? url.replace(/^https?:\/\//, '') : <Skeleton className="h-4 w-48" />}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={copy} disabled={!url} className="rounded-xl bg-rh-lime text-rh-ink hover:bg-rh-lime-deep dark:bg-rh-lime dark:text-rh-ink">
            {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button asChild variant="ghost" className={cn('rounded-xl bg-white text-rh-ink hover:bg-white/80 dark:bg-white/10 dark:text-white', !url && 'pointer-events-none opacity-50')}>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-1.5 h-4 w-4" />
              WhatsApp
            </a>
          </Button>
        </div>
      </section>
    </div>
  )
}

export function PhysioHome({ setup }: { setup: SetupStatus | null | undefined }) {
  const user = useQueryUntyped(homeApi.users.getMyUser) as { _id: Id<'users'>; firstName?: string; lastName?: string } | null | undefined
  const clinicInfo = useQueryUntyped(homeApi.clinics.getMyClinicInfo) as { name?: string } | null | undefined
  const stats = useQueryUntyped(homeApi.patients.getDashboardStats, {}) as Stats | undefined
  const patients = useQueryUntyped(homeApi.patients.getMyPatients, { limit: 60 }) as PatientRow[] | undefined
  // A fixed "now" (start of this hour) keeps the query's arguments stable, so Convex can cache it
  const [attentionNow] = useState(() => Math.floor(Date.now() / 3_600_000) * 3_600_000)
  const attention = useQueryUntyped(homeApi.physioCare.getNeedsAttention, { now: attentionNow }) as AttentionItem[] | undefined
  const checkIns = useQueryUntyped(homeApi.physioCare.getRecentCheckIns, { limit: 6 }) as RecentCheckIn[] | undefined

  const [range] = useState(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setHours(23, 59, 59, 999)
    return { startDate: start.getTime(), endDate: end.getTime() }
  })
  const today = useQueryUntyped(homeApi.appointments.getMyAppointments, { ...range, limit: 50 }) as Appointment[] | undefined
  const todayActive = today?.filter((a) => !CANCELLED.has(a.status))
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ')
  const stat = (value: number | undefined) => (stats === undefined ? '–' : value ?? 0)

  return (
    <PageContainer className="max-w-7xl">
      <Hero firstName={user?.firstName} clinicName={clinicInfo?.name} todayCount={todayActive?.length} attentionCount={attention?.length} />

      {setup && <SetupChecklistCard setup={setup} />}

      {setup?.isComplete && setup.approvalStatus === 'approved' && !setup.isListed && (
        <div className="flex flex-col gap-2 rounded-2xl bg-white px-5 py-3 text-sm shadow-soft dark:bg-rh-ink-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-neutral-600 dark:text-neutral-400">You’re hidden from the marketplace. Patients can still book you through your link.</p>
          <Link href={`${PHYSIO_HOME}/settings/marketplace`} className="shrink-0 font-semibold text-rh-ink hover:underline dark:text-rh-lime">
            Change
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Today" value={stat(stats?.todaysAppointments)} hint="appointments" icon={CalendarDays} tone="mint" href={`${PHYSIO_HOME}/calendar`} info="Sessions booked for today, including any still waiting to be confirmed." />
        <StatTile label="This week" value={stat(stats?.completedSessionsThisWeek)} hint="sessions completed" icon={Activity} tone="teal" info="Sessions you’ve marked done since Monday." />
        <StatTile label="Patients" value={stat(stats?.totalPatients)} hint="in treatment" icon={Users} tone="peach" href={`${PHYSIO_HOME}/patients`} info="Patients currently in your care. Finished courses are under Patients → Care completed." />
        <StatTile label="Invites" value={stat(stats?.pendingInvitations)} hint="waiting to join" icon={UserPlus} tone="rose" href={`${PHYSIO_HOME}/patients`} info="Patients you’ve invited who haven’t created their account yet. You can resend the invite from Patients." />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <TodaySchedule appointments={today} />
          <CheckInFeed checkIns={checkIns} />
        </div>
        <div className="space-y-5">
          <NeedsAttention items={attention} />
          <OpenWorkspace patients={patients} />
          {user?._id && <BookingLinkCard physioId={user._id} name={name || undefined} />}
        </div>
      </div>
    </PageContainer>
  )
}
