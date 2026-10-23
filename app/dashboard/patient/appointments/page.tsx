'use client'

import { Suspense, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar, CalendarPlus, CalendarX, ChevronRight, History, MapPin, Search, Video } from '@/components/icons'
import { formatLagos, lagosTime, zonedDateKey } from '@/convex/helpers/lagosTime'
import { isVideoVisit, meetingLinkOf } from '@/components/appointments/appointment-ui'
import { cn } from '@/lib/utils'
import {
  EmptyState,
  IconChip,
  InfoTip,
  PageContainer,
  PageHeader,
  PageSkeleton,
  Panel,
  StatusBadge,
  accentButtonClass,
  listRowClass,
  primaryButtonClass,
  secondaryButtonClass,
  tabsListClass,
  tabsTriggerClass,
} from '@/components/patient/ui'
import { PatientAppointmentBookingModal } from '@/components/patient/PatientAppointmentBookingModal'
import {
  CancelAppointmentModal,
  ConfirmAppointmentModal,
  RescheduleAppointmentModal,
  RespondToProposalModal,
} from '@/components/patient/AppointmentActionModals'
import { AppointmentFeedbackModal } from '@/components/patient/AppointmentFeedbackModal'
import {
  AppointmentDetailsDrawer,
  canJoinVisit,
  durationMinutes,
  isCancelled,
  isJoinTime,
  isLiveAppointment,
  needsPatientAnswer,
  patientStatus,
  placeLabel,
  useJoinVisit,
  type PatientAppointment,
} from '@/components/patient/AppointmentDetailsModal'
import { OpenBookingsCard } from '@/components/patient/OpenBookingsCard'

const DAY_MS = 24 * 60 * 60 * 1000

type Tab = 'upcoming' | 'past' | 'cancelled'
type DayGroup = { key: string; label: string; date: string; items: PatientAppointment[] }

/** Visits grouped by Lagos day, with "Today" / "Tomorrow" where it applies. */
function groupByDay(list: PatientAppointment[], now: number): DayGroup[] {
  const today = zonedDateKey(now)
  const tomorrow = zonedDateKey(now + DAY_MS)
  const yesterday = zonedDateKey(now - DAY_MS)
  const thisYear = formatLagos(now, { year: 'numeric' })
  const groups: DayGroup[] = []
  for (const apt of list) {
    const key = zonedDateKey(apt.startTime)
    let group = groups[groups.length - 1]
    if (!group || group.key !== key) {
      const sameYear = formatLagos(apt.startTime, { year: 'numeric' }) === thisYear
      const date = formatLagos(
        apt.startTime,
        sameYear ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' },
        'en-NG'
      )
      const label = key === today ? 'Today' : key === tomorrow ? 'Tomorrow' : key === yesterday ? 'Yesterday' : date
      group = { key, label, date: label === date ? '' : date, items: [] }
      groups.push(group)
    }
    group.items.push(apt)
  }
  return groups
}

function AppointmentRow({
  apt,
  now,
  onOpen,
  onJoin,
}: {
  apt: PatientAppointment
  now: number
  onOpen: (apt: PatientAppointment) => void
  onJoin: (apt: PatientAppointment) => void
}) {
  const status = patientStatus(apt, now)
  const video = isVideoVisit(apt)
  const showJoin = canJoinVisit(apt, now) && isJoinTime(apt, now)
  const askToRate = apt.status === 'completed' && !apt.feedbackSubmitted

  const badges = (
    <span className="flex flex-wrap items-center gap-1">
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      <InfoTip label="What does this status mean?">{status.explain}</InfoTip>
      {askToRate && <StatusBadge tone="sun">Rate this visit</StatusBadge>}
    </span>
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(event) => {
        // Clicks inside the status tip's popover bubble here through the portal; ignore them
        if (!event.currentTarget.contains(event.target as Node)) return
        onOpen(apt)
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(apt)
        }
      }}
      className={cn(listRowClass, 'cursor-pointer items-start sm:items-center')}
    >
      <div className="w-[72px] shrink-0 pt-0.5 sm:pt-0">
        <p className="text-sm font-semibold tabular-nums text-pt-ink">{lagosTime(apt.startTime)}</p>
        <p className="text-xs text-pt-faint">{durationMinutes(apt)} min</p>
      </div>
      <IconChip icon={video ? Video : MapPin} tone={video ? 'violet' : 'sun'} size="sm" className="hidden sm:flex" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-pt-ink">{apt.serviceType || 'Appointment'}</p>
        <p className="truncate text-xs text-pt-muted">
          {apt.physiotherapistName || 'Your physiotherapist'} · {placeLabel(apt)}
        </p>
        <div className="mt-1.5 md:hidden">{badges}</div>
      </div>
      <div className="hidden shrink-0 md:block">{badges}</div>
      {showJoin && (
        <Button
          size="sm"
          className={cn(accentButtonClass, 'h-9 shrink-0 px-3')}
          onClick={(event) => {
            event.stopPropagation()
            onJoin(apt)
          }}
        >
          <Video className="mr-1.5 h-3.5 w-3.5" />
          Join
        </Button>
      )}
      <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-pt-faint sm:mt-0" />
    </div>
  )
}

function DayGroups({
  groups,
  now,
  onOpen,
  onJoin,
}: {
  groups: DayGroup[]
  now: number
  onOpen: (apt: PatientAppointment) => void
  onJoin: (apt: PatientAppointment) => void
}) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.date || group.label}>
          <div className="flex items-center gap-2 px-3 pb-1">
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                group.label === 'Today' ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-ink'
              )}
            >
              {group.label}
            </span>
            {group.date && <span className="text-xs text-pt-faint">{group.date}</span>}
          </div>
          <div className="space-y-0.5">
            {group.items.map((apt) => (
              <AppointmentRow key={apt._id} apt={apt} now={now} onOpen={onOpen} onJoin={onJoin} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function AppointmentsView() {
  const router = useRouter()
  const pathname = usePathname() ?? '/dashboard/patient/appointments'
  const searchParams = useSearchParams()
  const join = useJoinVisit()

  const appointments = useQuery(api.appointments.getPatientAppointments, { limit: 100 }) as PatientAppointment[] | undefined

  const [tab, setTab] = useState<Tab>('upcoming')
  const [bookingOpen, setBookingOpen] = useState(false)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<PatientAppointment | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<PatientAppointment | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<PatientAppointment | null>(null)
  const [proposalAnswer, setProposalAnswer] = useState<{ appointment: PatientAppointment; accept: boolean } | null>(null)
  const [feedbackTarget, setFeedbackTarget] = useState<PatientAppointment | null>(null)

  // "Book a session" anywhere in the portal lands here with ?book=1
  const wantsBooking = searchParams?.get('book') === '1'
  useEffect(() => {
    if (wantsBooking) setBookingOpen(true)
  }, [wantsBooking])
  const closeBooking = () => {
    setBookingOpen(false)
    if (wantsBooking) router.replace(pathname, { scroll: false })
  }

  // Visits move from upcoming to past (and Join appears) on the clock, not only when data changes
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const lists = useMemo(() => {
    const all = appointments ?? []
    const needsAnswer = all.filter((a) => needsPatientAnswer(a)).sort((a, b) => a.startTime - b.startTime)
    const upcoming = all
      .filter((a) => isLiveAppointment(a, now) && !needsAnswer.includes(a))
      .sort((a, b) => a.startTime - b.startTime)
    const past = all.filter((a) => !isLiveAppointment(a, now) && !isCancelled(a)).sort((a, b) => b.startTime - a.startTime)
    const cancelled = all.filter((a) => isCancelled(a)).sort((a, b) => b.startTime - a.startTime)
    return { needsAnswer, upcoming, past, cancelled }
  }, [appointments, now])

  if (appointments === undefined) return <PageSkeleton />

  // The open drawer follows live data, so a confirmation elsewhere updates it in place
  const detailsAppointment = appointments.find((a) => a._id === detailsId) ?? null
  const openDetails = (apt: PatientAppointment) => {
    setDetailsId(apt._id)
    setDetailsOpen(true)
  }
  // Actions close the details drawer and open their own
  const fromDetails =
    <T,>(open: (value: T) => void) =>
    (value: T) => {
      setDetailsOpen(false)
      open(value)
    }
  const joinVisit = (apt: PatientAppointment) => join(meetingLinkOf(apt))

  const groups = {
    upcoming: groupByDay(lists.upcoming, now),
    past: groupByDay(lists.past, now),
    cancelled: groupByDay(lists.cancelled, now),
  }

  return (
    <PageContainer>
      <PageHeader
        title="Appointments"
        description="Book, change or join your visits."
        info="All times are Lagos time (WAT). A visit you ask for waits for your physio to confirm it. A visit your physio books for you needs your confirmation."
        actions={
          <Button className={cn(primaryButtonClass, 'h-11 px-5')} onClick={() => setBookingOpen(true)}>
            <CalendarPlus className="mr-2 h-4 w-4" />
            Book a session
          </Button>
        }
      />

      {/* Scheduled bookings waiting for payment (renders nothing when there are none) */}
      <OpenBookingsCard />

      {lists.needsAnswer.length > 0 && (
        <Panel
          title={
            <span className="flex items-center gap-2">
              Needs your answer
              <StatusBadge tone="amber">{lists.needsAnswer.length}</StatusBadge>
            </span>
          }
          description="Your physio is waiting to hear from you. Tap a visit to answer."
          bodyClassName="px-2 pb-2 pt-2 sm:px-3 sm:pb-3"
          className="ring-1 ring-inset ring-pt-amber-fg/20"
        >
          <DayGroups groups={groupByDay(lists.needsAnswer, now)} now={now} onOpen={openDetails} onJoin={joinVisit} />
        </Panel>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="space-y-4">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="upcoming" className={tabsTriggerClass}>
            Upcoming
            {lists.upcoming.length > 0 && (
              <span className="ml-1.5 rounded-full bg-pt-neutral-bg px-1.5 text-[11px] font-semibold tabular-nums text-pt-neutral-fg">
                {lists.upcoming.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="past" className={tabsTriggerClass}>
            Past
          </TabsTrigger>
          <TabsTrigger value="cancelled" className={tabsTriggerClass}>
            Cancelled
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-0 focus-visible:outline-none">
          <Panel bodyClassName="p-2 sm:p-3">
            {groups.upcoming.length > 0 ? (
              <DayGroups groups={groups.upcoming} now={now} onOpen={openDetails} onJoin={joinVisit} />
            ) : (
              <EmptyState
                icon={Calendar}
                title={lists.needsAnswer.length > 0 ? 'Nothing else booked yet' : 'No upcoming visits'}
                description="Regular sessions help you recover faster. Book your next one when you’re ready."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button className={cn(primaryButtonClass, 'h-10 px-4')} onClick={() => setBookingOpen(true)}>
                      <CalendarPlus className="mr-2 h-4 w-4" />
                      Book a session
                    </Button>
                    <Button asChild className={cn(secondaryButtonClass, 'h-10 px-4')}>
                      <Link href="/find-a-physio">
                        <Search className="mr-2 h-4 w-4" />
                        Find a physio
                      </Link>
                    </Button>
                  </div>
                }
              />
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="past" className="mt-0 focus-visible:outline-none">
          <Panel bodyClassName="p-2 sm:p-3">
            {groups.past.length > 0 ? (
              <DayGroups groups={groups.past} now={now} onOpen={openDetails} onJoin={joinVisit} />
            ) : (
              <EmptyState icon={History} title="No past visits yet" description="Visits you’ve had will show here, with any summary from your physio." />
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="cancelled" className="mt-0 focus-visible:outline-none">
          <Panel bodyClassName="p-2 sm:p-3">
            {groups.cancelled.length > 0 ? (
              <DayGroups groups={groups.cancelled} now={now} onOpen={openDetails} onJoin={joinVisit} />
            ) : (
              <EmptyState icon={CalendarX} title="Nothing cancelled" description="Visits that you or your physio cancel will show here." />
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <AppointmentDetailsDrawer
        appointment={detailsAppointment}
        open={detailsOpen && detailsAppointment !== null}
        onOpenChange={setDetailsOpen}
        onConfirm={fromDetails(setConfirmTarget)}
        onReschedule={fromDetails(setRescheduleTarget)}
        onCancel={fromDetails(setCancelTarget)}
        onRespondToProposal={(apt, accept) => {
          setDetailsOpen(false)
          setProposalAnswer({ appointment: apt, accept })
        }}
        onRateVisit={fromDetails(setFeedbackTarget)}
      />

      <PatientAppointmentBookingModal isOpen={bookingOpen} onClose={closeBooking} />

      <CancelAppointmentModal
        isOpen={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        appointment={cancelTarget}
        onAppointmentCancelled={() => setCancelTarget(null)}
      />
      <ConfirmAppointmentModal
        isOpen={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        appointment={confirmTarget}
        onAppointmentConfirmed={() => setConfirmTarget(null)}
      />
      <RescheduleAppointmentModal
        isOpen={rescheduleTarget !== null}
        onClose={() => setRescheduleTarget(null)}
        appointment={rescheduleTarget}
        onAppointmentRescheduled={() => setRescheduleTarget(null)}
      />
      <RespondToProposalModal
        isOpen={proposalAnswer !== null}
        onClose={() => setProposalAnswer(null)}
        appointment={proposalAnswer?.appointment ?? null}
        accept={proposalAnswer?.accept ?? true}
      />
      {feedbackTarget && (
        <AppointmentFeedbackModal
          isOpen
          onClose={() => setFeedbackTarget(null)}
          appointmentId={feedbackTarget._id as Id<'appointments'>}
          physiotherapistName={feedbackTarget.physiotherapistName ?? ''}
          appointmentDate={String(feedbackTarget.startTime)}
          serviceType={feedbackTarget.serviceType ?? 'Appointment'}
        />
      )}
    </PageContainer>
  )
}

export default function PatientAppointmentsPage() {
  // useSearchParams needs a Suspense boundary
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AppointmentsView />
    </Suspense>
  )
}
