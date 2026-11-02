'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { differenceInCalendarDays, format, isToday, isTomorrow } from 'date-fns'
import {
  ArrowRight,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Clock,
  Dumbbell,
  FileText,
  Home,
  MapPin,
  MessageSquare,
  Stethoscope,
  Upload,
  Video,
} from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { Appointment } from '@/app/types'
import { appointmentStatusLabel, type AppointmentStatusFields } from '@/convex/helpers/appointmentStatus'
import { usePatientDocuments } from '@/lib/hooks/usePatientDocuments'
import { Button } from '@/components/ui/button'
import {
  DetailRow,
  IconChip,
  InfoTip,
  PageContainer,
  PageSkeleton,
  Panel,
  PatientDrawer,
  SectionLabel,
  StatTile,
  StatusBadge,
  accentButtonClass,
  cardClass,
  listRowClass,
  primaryButtonClass,
  secondaryButtonClass,
  type Tone,
} from '@/components/patient/ui'
import { BOOK_SESSION_HREF } from '@/components/patient/shell/PatientShell'
import { NAV } from '@/components/patient/shell/navItems'
import { PatientCheckInCard, PatientFollowUpBanner } from '@/components/patient/PatientCheckInCard'
import { PatientQuestionnaireBanner } from '@/components/questionnaires/PatientQuestionnaireBanner'
import { JoyJourneyCard } from '@/components/patient/JoyJourneyCard'
import { OpenBookingsCard } from '@/components/patient/OpenBookingsCard'
import { BookingDecisionCard } from '@/components/patient/BookingDecisionCard'
import { MediLoanCard } from '@/components/patient/MediLoanCard'
import { AccessAwardCard } from '@/components/patient/AccessAwardCard'
import { YourPlanCard } from '@/components/patient/YourPlanCard'
import { YourClinicCard } from '@/components/patient/YourClinicCard'
import { TodayCarePlanCard } from '@/components/patient/TodayCarePlanCard'
import { cn } from '@/lib/utils'

interface PatientDashboardProps {
  initialUser?: any;
  initialAppointments?: any[];
  initialStats?: any;
}

/** The appointment fields Home reads, beyond the shared Appointment type. */
type HomeAppointment = Appointment & {
  meetingLink?: string
  streamMeetingLink?: string
  manualMeetingLink?: string
  googleMeetLink?: string
  isOnline?: boolean
  location?: string
  physiotherapistName?: string
}

type PatientStats = { sessions?: { completed?: number } } | null | undefined

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const isCancelled = (a: HomeAppointment) => String(a.status).startsWith('cancelled') || String(a.status) === 'no_show'

const isOnlineVisit = (a: HomeAppointment) => a.appointmentType === 'telehealth' || a.isOnline === true

// The real room for an online visit: our Stream call, the physio's own link, or Google Meet
const meetingLinkFor = (a: HomeAppointment) =>
  a.meetingLink || a.streamMeetingLink || a.manualMeetingLink || a.googleMeetLink || null

/** A confirmed online visit with a room, that hasn't ended. */
const canJoin = (a: HomeAppointment) =>
  isOnlineVisit(a) && a.status === 'confirmed' && Boolean(meetingLinkFor(a)) && new Date(a.endTime) > new Date()

const statusLabel = (a: HomeAppointment) => appointmentStatusLabel(a as unknown as AppointmentStatusFields, 'patient')

function statusTone(a: HomeAppointment): Tone {
  const label = statusLabel(a)
  if (label === 'Please confirm' || label === 'New time proposed') return 'sun'
  if (a.status === 'confirmed') return 'green'
  if (a.status === 'completed') return 'blue'
  if (isCancelled(a)) return 'rose'
  return 'amber'
}

function statusHelp(a: HomeAppointment) {
  const label = statusLabel(a)
  if (label === 'New time proposed') return 'Your physio has suggested a different time. Open it in Appointments to accept or decline.'
  if (label === 'Please confirm') return 'Your physio set this time. Open it in Appointments and confirm that it works for you.'
  if (a.status === 'scheduled') return 'Your physio hasn’t confirmed this time yet. We’ll let you know as soon as they do.'
  if (a.status === 'confirmed') return 'All set. Your physio has confirmed this time.'
  if (a.status === 'completed') return 'This visit has happened.'
  return 'This visit won’t go ahead. You can book another time in Appointments.'
}

function whenLabel(startTime: number) {
  const date = new Date(startTime)
  if (date <= new Date()) return 'Happening now'
  if (isToday(date)) return 'Today'
  if (isTomorrow(date)) return 'Tomorrow'
  const days = differenceInCalendarDays(date, new Date())
  return days < 7 ? `In ${days} days` : format(date, 'EEEE')
}

function timeRange(a: HomeAppointment) {
  const minutes = Math.round((a.endTime - a.startTime) / 60000)
  return `${format(a.startTime, 'h:mm a')} – ${format(a.endTime, 'h:mm a')}${minutes > 0 ? ` (${minutes} min)` : ''}`
}

/** Month and day in a little calendar tile. */
function DateTile({ time, size = 'md' }: { time: number; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'flex shrink-0 flex-col items-center justify-center rounded-2xl bg-pt-sunken text-pt-ink',
        size === 'md' ? 'h-16 w-16' : 'h-11 w-11 rounded-xl'
      )}
      aria-hidden
    >
      <span className={cn('font-semibold uppercase text-pt-muted', size === 'md' ? 'text-[11px]' : 'text-[9px]')}>{format(time, 'MMM')}</span>
      <span className={cn('font-semibold leading-none tabular-nums', size === 'md' ? 'text-2xl' : 'text-base')}>{format(time, 'd')}</span>
    </span>
  )
}

function ModeChip({ appointment }: { appointment: HomeAppointment }) {
  const online = isOnlineVisit(appointment)
  const Icon = online ? Video : Home
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', online ? 'bg-pt-blue-bg text-pt-blue-fg' : 'bg-pt-amber-bg text-pt-amber-fg')}>
      <Icon className="h-3.5 w-3.5" />
      {online ? 'Video call' : 'In person'}
    </span>
  )
}

/** The next visit, front and centre, with its Join button. */
function NextVisitCard({
  appointment,
  onOpen,
  onJoin,
}: {
  appointment?: HomeAppointment
  onOpen: (a: HomeAppointment) => void
  onJoin: (a: HomeAppointment) => void
}) {
  if (!appointment) {
    return (
      <section data-tour="next-visit" className={cn(cardClass, 'flex h-full flex-col justify-center')}>
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <IconChip icon={CalendarPlus} tone="green" size="lg" className="mb-4" />
          <p className="text-lg font-semibold tracking-tight text-pt-ink">No visits booked</p>
          <p className="mt-1 max-w-xs text-sm text-pt-muted">Book a session with a physiotherapist. It takes about a minute.</p>
          <Button asChild className={cn(primaryButtonClass, 'mt-5 h-11 px-5')}>
            <Link href={BOOK_SESSION_HREF}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Book a session
            </Link>
          </Button>
        </div>
      </section>
    )
  }

  const online = isOnlineVisit(appointment)
  const joinable = canJoin(appointment)

  return (
    <section data-tour="next-visit" className={cn(cardClass, 'flex h-full flex-col p-5 sm:p-6')}>
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Next visit</SectionLabel>
        <span className="flex items-center gap-1">
          <StatusBadge tone={statusTone(appointment)} dot>
            {statusLabel(appointment)}
          </StatusBadge>
          <InfoTip label="What does this status mean?">{statusHelp(appointment)}</InfoTip>
        </span>
      </div>

      <button
        type="button"
        onClick={() => onOpen(appointment)}
        className="-mx-2 mt-3 flex items-center gap-4 rounded-2xl p-2 text-left transition-colors hover:bg-pt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50"
      >
        <DateTile time={appointment.startTime} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-pt-accent-ink">{whenLabel(appointment.startTime)}</span>
          <span className="block text-xl font-semibold tracking-tight text-pt-ink sm:text-2xl">
            {format(appointment.startTime, 'EEEE, d MMM')}
          </span>
          <span className="mt-0.5 block text-sm text-pt-muted">{timeRange(appointment)}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-pt-faint" />
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-pt-muted">
        <ModeChip appointment={appointment} />
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Stethoscope className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {appointment.serviceType}
            {appointment.physiotherapistName ? ` with ${appointment.physiotherapistName}` : ''}
          </span>
        </span>
      </div>

      <div className="mt-auto pt-5">
        {online ? (
          joinable ? (
            <Button className={cn(accentButtonClass, 'h-11 w-full sm:w-auto sm:px-6')} onClick={() => onJoin(appointment)}>
              <Video className="mr-2 h-4 w-4" />
              Join call
            </Button>
          ) : (
            <p className="rounded-2xl bg-pt-sunken px-4 py-3 text-sm text-pt-muted">
              {appointment.status === 'confirmed'
                ? 'Your video link will appear here before the session.'
                : 'Your video link will appear here once your physio confirms.'}
            </p>
          )
        ) : (
          <Button className={cn(secondaryButtonClass, 'h-11 w-full sm:w-auto sm:px-5')} onClick={() => onOpen(appointment)}>
            See visit details
          </Button>
        )}
      </div>
    </section>
  )
}

const QUICK_ACTIONS: { title: string; hint: string; href: string; icon: typeof Calendar; tone: Tone }[] = [
  { title: 'Book a session', hint: 'Pick a time that suits you', href: BOOK_SESSION_HREF, icon: CalendarPlus, tone: 'green' },
  { title: 'Message my physio', hint: 'Ask a question', href: NAV.messages.href, icon: MessageSquare, tone: 'blue' },
  { title: 'My exercises', hint: 'Today’s care plan', href: `${NAV.carePlan.href}#today`, icon: Dumbbell, tone: 'violet' },
  { title: 'Upload a record', hint: 'Scans, reports, letters', href: NAV.records.href, icon: Upload, tone: 'amber' },
]

function QuickActions() {
  return (
    <Panel data-tour="quick-actions" title="Quick actions" className="h-full" bodyClassName="px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
      <div className="grid grid-cols-2 gap-2">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="group flex min-h-[112px] flex-col justify-between gap-3 rounded-2xl bg-pt-sunken p-3.5 transition-colors hover:bg-pt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50 active:scale-[0.98]"
          >
            <IconChip icon={action.icon} tone={action.tone} />
            <span>
              <span className="block text-sm font-semibold leading-snug text-pt-ink">{action.title}</span>
              <span className="block text-xs text-pt-muted">{action.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  )
}

/** Full details of one visit, in a drawer so Home stays put. */
function VisitDrawer({
  appointment,
  onClose,
  onJoin,
}: {
  appointment: HomeAppointment | null
  onClose: () => void
  onJoin: (a: HomeAppointment) => void
}) {
  const a = appointment
  return (
    <PatientDrawer
      open={Boolean(a)}
      onOpenChange={(open) => !open && onClose()}
      title={a?.serviceType ?? 'Visit'}
      description={a ? format(a.startTime, 'EEEE d MMMM yyyy') : undefined}
      footer={
        a && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {canJoin(a) && (
              <Button className={cn(accentButtonClass, 'h-11 flex-1')} onClick={() => onJoin(a)}>
                <Video className="mr-2 h-4 w-4" />
                Join call
              </Button>
            )}
            <Button asChild className={cn(secondaryButtonClass, 'h-11 flex-1')}>
              <Link href={NAV.appointments.href}>Open in Appointments</Link>
            </Button>
          </div>
        )
      }
    >
      {a && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={statusTone(a)} dot>
              {statusLabel(a)}
            </StatusBadge>
            <ModeChip appointment={a} />
          </div>
          <p className="rounded-2xl bg-pt-sunken px-4 py-3 text-sm text-pt-muted">{statusHelp(a)}</p>

          <div className="divide-y divide-pt-line">
            <DetailRow icon={Calendar} label="Date">
              {format(a.startTime, 'EEEE d MMMM yyyy')}
            </DetailRow>
            <DetailRow icon={Clock} label="Time">
              {timeRange(a)}
            </DetailRow>
            {a.physiotherapistName && (
              <DetailRow icon={Stethoscope} label="Physiotherapist">
                {a.physiotherapistName}
              </DetailRow>
            )}
            <DetailRow icon={isOnlineVisit(a) ? Video : MapPin} label="Where">
              {isOnlineVisit(a)
                ? canJoin(a)
                  ? 'Video call. Tap Join call when it’s time.'
                  : 'Video call. The link appears here once it’s ready.'
                : a.location || 'In person. Your physio will confirm the address.'}
            </DetailRow>
            {a.notesForPatient && (
              <DetailRow icon={FileText} label="Note from your physio">
                <span className="whitespace-pre-line">{a.notesForPatient}</span>
              </DetailRow>
            )}
          </div>

          {!isCancelled(a) && a.status !== 'completed' && (
            <p className="text-xs text-pt-faint">To reschedule or cancel, open this visit in Appointments.</p>
          )}
        </div>
      )}
    </PatientDrawer>
  )
}

export function PatientDashboard({ initialUser, initialAppointments, initialStats }: PatientDashboardProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<HomeAppointment | null>(null)

  // Live data, falling back to the server's cached copy while it loads
  const liveUser = useQuery(api.users.getMyUser)
  const user = liveUser || initialUser

  const liveAppointments = useQuery(api.appointments.getPatientAppointments, {})
  const appointments = (liveAppointments || initialAppointments) as unknown as HomeAppointment[] | undefined

  const liveStats = useQuery(api.analytics.getPatientStats)
  const patientStats = (liveStats || initialStats) as PatientStats

  const patientProfileId = user?.patientProfileId as Id<'patientProfiles'> | undefined
  const { documents } = usePatientDocuments({ patientProfileId })

  if (!user) return <PageSkeleton />

  // A visit stays "next" until it ends, so a call in progress can still be joined
  const upcoming = (appointments ?? [])
    .filter((a) => new Date(a.endTime || a.startTime) > new Date() && !isCancelled(a))
    .sort((a, b) => a.startTime - b.startTime)
  const nextVisit = upcoming[0]
  const later = upcoming.slice(1, 4)
  const completedCount =
    patientStats?.sessions?.completed ?? (appointments ?? []).filter((a) => String(a.status) === 'completed').length

  const joinCall = (a: HomeAppointment) => {
    const link = meetingLinkFor(a)
    if (!link) return
    try {
      const url = new URL(link, window.location.origin)
      if (url.pathname.startsWith('/video-call/')) {
        router.push(url.pathname)
        return
      }
    } catch {
      /* not a URL we can parse; open as-is */
    }
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  return (
    <PageContainer className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-pt-ink sm:text-[30px]">
          {greeting()}
          {user.firstName ? `, ${user.firstName}` : ''}
        </h1>
        <p className="mt-1 text-sm text-pt-muted sm:text-[15px]">Here’s what’s next for your recovery.</p>
      </div>

      {/* Clinic mode: the clinic looking after them leads */}
      <YourClinicCard />

      {/* Things waiting on the patient come first */}
      <BookingDecisionCard />
      <OpenBookingsCard />
      <MediLoanCard />
      <PatientFollowUpBanner />
      <PatientQuestionnaireBanner />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <NextVisitCard appointment={nextVisit} onOpen={setSelected} onJoin={joinCall} />
        </div>
        <div className="lg:col-span-2">
          <QuickActions />
        </div>
      </div>

      <TodayCarePlanCard />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Upcoming visits"
          value={upcoming.length}
          icon={Calendar}
          tone="blue"
          href={NAV.appointments.href}
        />
        <StatTile
          label="Sessions done"
          value={completedCount}
          icon={CheckCircle2}
          tone="green"
          info="Visits your physio has marked as completed."
        />
        <div className="col-span-2 sm:col-span-1">
          <StatTile
            label="Your records"
            value={documents?.length ?? 0}
            icon={FileText}
            tone="amber"
            href={NAV.records.href}
            info="Scans, reports and letters you’ve uploaded. Only you can see them unless you share one with your physio."
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PatientCheckInCard />
        </div>
        <div className="lg:col-span-2">
          <Panel
            title="Coming up"
            actions={
              <Link href={NAV.appointments.href} className="inline-flex items-center gap-1 text-sm font-medium text-pt-muted hover:text-pt-ink">
                See all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
            className="h-full"
            bodyClassName="px-2 pb-3 pt-1 sm:px-3"
          >
            {later.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <p className="text-sm text-pt-muted">{nextVisit ? 'Nothing else booked yet.' : 'No visits booked yet.'}</p>
                <Link href={BOOK_SESSION_HREF} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-pt-ink hover:underline">
                  Book a session
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {later.map((appointment) => (
                  <li key={appointment._id}>
                    <button type="button" onClick={() => setSelected(appointment)} className={listRowClass}>
                      <DateTile time={appointment.startTime} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-pt-ink">{appointment.serviceType}</span>
                        <span className="block text-xs text-pt-muted">
                          {format(appointment.startTime, 'EEE d MMM, h:mm a')} · {isOnlineVisit(appointment) ? 'Video' : 'In person'}
                        </span>
                      </span>
                      <StatusBadge tone={statusTone(appointment)} className="hidden sm:inline-flex">
                        {statusLabel(appointment)}
                      </StatusBadge>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-pt-faint" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <YourPlanCard />
      <AccessAwardCard />
      <JoyJourneyCard />

      <VisitDrawer appointment={selected} onClose={() => setSelected(null)} onJoin={joinCall} />
    </PageContainer>
  )
}
