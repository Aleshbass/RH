'use client'

/**
 * Schedule → Requests & list: what needs an answer first, then sessions to close, Rehabify
 * sessions waiting for payment, and the day-by-day list (upcoming, past, cancelled). Every row
 * opens the visit in a drawer. Live: bookings, answers and cancellations appear by themselves.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarDays, CalendarPlus, Check, ChevronRight, Hourglass, Inbox, Loader2, MapPin, Receipt, Video } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { isCancelledAppointment, isOpenAppointment } from '@/convex/helpers/appointmentStatus'
import { lagosShortDate, lagosTime, zonedDateKey } from '@/convex/helpers/lagosTime'
import { Button } from '@/components/ui/button'
import { isVideoVisit } from '@/components/appointments/appointment-ui'
import {
  accentButtonClass,
  EmptyState,
  IconChip,
  InfoTip,
  LoadingBlocks,
  PageContainer,
  PageHeader,
  Panel,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from '@/components/physio/ui'
import { formatKobo } from '@/lib/rehabify-services'
import { useMutationUntyped, useQueryUntyped } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { AppointmentDrawer, type View } from './AppointmentDrawer'
import { useBooking } from './BookingDrawer'
import {
  asLike,
  joinLink,
  minutesOf,
  needsMyAnswer,
  patientName,
  Quiet,
  readableError,
  scheduleApi,
  useNow,
  visitStatus,
  type HeldBooking,
  type PhysioAppointment,
} from './shared'

type Tab = 'upcoming' | 'past' | 'cancelled' | 'repeating'

const DAY_MS = 24 * 60 * 60 * 1000

function dayLabel(start: number, now: number) {
  const key = zonedDateKey(start)
  if (key === zonedDateKey(now)) return 'Today'
  if (key === zonedDateKey(now + DAY_MS)) return 'Tomorrow'
  return lagosShortDate(start)
}

/** One visit as a row: time, how you meet, who and what, status, Join when it's time. */
export function VisitRow({
  appointment,
  now,
  onOpen,
  action,
  showDay = false,
}: {
  appointment: PhysioAppointment
  now: number
  onOpen: () => void
  action?: ReactNode
  showDay?: boolean
}) {
  const video = isVideoVisit(asLike(appointment))
  const status = visitStatus(appointment, now)
  const link = joinLink(appointment, now)
  return (
    <div className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-pt-hover">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none">
        <span className="w-16 shrink-0">
          {showDay && <span className="block text-[11px] font-medium text-pt-faint">{dayLabel(appointment.startTime, now)}</span>}
          <span className="block text-sm font-semibold tabular-nums text-pt-ink">{lagosTime(appointment.startTime)}</span>
          <span className="block text-[11px] tabular-nums text-pt-muted">{minutesOf(appointment)} min</span>
        </span>
        <IconChip icon={video ? Video : MapPin} tone={video ? 'violet' : 'sun'} className="h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-pt-ink">{patientName(appointment)}</span>
          <span className="block truncate text-xs text-pt-muted">
            {appointment.serviceType || 'Session'} · {video ? 'Video call' : appointment.location || 'In person'}
          </span>
        </span>
      </button>
      <span className="hidden shrink-0 items-center gap-1 sm:flex">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <InfoTip label="What this status means">{status.explain}</InfoTip>
      </span>
      {link ? (
        <Button asChild size="sm" className={cn(accentButtonClass, 'h-9 shrink-0 px-3')}>
          <a href={link} target="_blank" rel="noopener noreferrer">
            <Video className="mr-1.5 h-3.5 w-3.5" />
            Join
          </a>
        </Button>
      ) : (
        action
      )}
      <button type="button" onClick={onOpen} aria-label={`Open ${patientName(appointment)}'s visit`} className="shrink-0 text-pt-faint hover:text-pt-ink">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function DayGroups({ list, now, onOpen }: { list: PhysioAppointment[]; now: number; onOpen: (apt: PhysioAppointment) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, PhysioAppointment[]>()
    for (const apt of list) map.set(zonedDateKey(apt.startTime), [...(map.get(zonedDateKey(apt.startTime)) ?? []), apt])
    return [...map.values()]
  }, [list])
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const label = dayLabel(group[0].startTime, now)
        return (
          <div key={group[0].startTime}>
            <span
              className={cn(
                'ml-3 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                label === 'Today' ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-muted'
              )}
            >
              {label}
            </span>
            <div className="mt-1">
              {group.map((apt) => (
                <VisitRow key={apt._id} appointment={apt} now={now} onOpen={() => onOpen(apt)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HeldRow({ booking, now }: { booking: HeldBooking; now: number }) {
  const cancel = useMutationUntyped(scheduleApi.booking.cancelUnpaidMarketplaceBooking)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const withdraw = async () => {
    setBusy(true)
    try {
      await cancel({ bookingId: booking.id as Id<'marketplaceBookings'> })
      playSound('reject')
      toast.success('Withdrawn. The time is free again.')
    } catch (error) {
      playSound('error')
      toast.error(readableError(error, 'Couldn’t withdraw it. Please try again.'))
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl px-3 py-3">
      <span className="w-16 shrink-0">
        <span className="block text-[11px] font-medium text-pt-faint">{dayLabel(booking.sessionDate, now)}</span>
        <span className="block text-sm font-semibold tabular-nums text-pt-ink">{lagosTime(booking.sessionDate)}</span>
      </span>
      <IconChip icon={booking.isOnline ? Video : MapPin} tone={booking.isOnline ? 'violet' : 'sun'} className="h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-pt-ink">{booking.patientName}</span>
        <span className="block truncate text-xs text-pt-muted">
          {booking.fromPatientRequest ? 'Invoice sent · ' : ''}
          {booking.serviceName} · {formatKobo(booking.chargeKobo)}
          {booking.held && booking.holdExpiresAt ? ` · held until ${lagosTime(booking.holdExpiresAt)}, ${lagosShortDate(booking.holdExpiresAt)}` : ' · hold ended'}
        </span>
      </span>
      {confirming ? (
        <span className="flex shrink-0 items-center gap-2 text-xs text-pt-muted">
          Withdraw it?
          <Button size="sm" className="h-8 rounded-xl bg-pt-rose-bg px-3 text-pt-rose-fg shadow-none hover:brightness-95" disabled={busy} onClick={() => void withdraw()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Yes'}
          </Button>
          <Button size="sm" className={cn(secondaryButtonClass, 'h-8 px-3')} disabled={busy} onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </span>
      ) : (
        <Button size="sm" variant="ghost" className="h-8 shrink-0 rounded-xl text-pt-muted hover:bg-pt-hover hover:text-pt-ink" onClick={() => setConfirming(true)}>
          Withdraw
        </Button>
      )}
    </div>
  )
}

/** Rehabify sessions waiting for payment. Kept apart so a missing function (mid-deploy) can't take the page down. */
function HeldPanel({ now }: { now: number }) {
  const held = useQueryUntyped(scheduleApi.booking.getMyHeldBookingsAsPhysio, {}) as HeldBooking[] | undefined
  if (!held || held.length === 0) return null
  return (
    <Panel
      title={
        <>
          <Hourglass className="h-4 w-4 text-pt-muted" />
          Waiting for payment
        </>
      }
      info="Rehabify sessions the patient still has to pay for. The time is held for them for 24 hours; if they don’t pay, it’s released and you’re told."
      bodyClassName="p-2 sm:p-3"
    >
      {held.map((booking) => (
        <HeldRow key={booking.id} booking={booking} now={now} />
      ))}
    </Panel>
  )
}

export function ScheduleList({
  repeating,
  extraActions,
}: {
  /** Repeating series (weekly sessions etc.), shown as their own tab. */
  repeating?: ReactNode
  extraActions?: ReactNode
}) {
  const openBooking = useBooking()
  const now = useNow()
  const appointments = useQueryUntyped(scheduleApi.appointments.getMyAppointments, { limit: 300 }) as PhysioAppointment[] | undefined
  const updateStatus = useMutationUntyped(scheduleApi.appointments.updateAppointmentStatus)
  const [tab, setTab] = useState<Tab>('upcoming')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerView, setDrawerView] = useState<View>('details')
  const [accepting, setAccepting] = useState<string | null>(null)

  const sorted = useMemo(() => [...(appointments ?? [])].sort((a, b) => a.startTime - b.startTime), [appointments])
  const answer = sorted.filter((apt) => needsMyAnswer(apt, now))
  const toClose = sorted.filter((apt) => isOpenAppointment(apt.status) && apt.endTime < now).reverse()
  const upcoming = sorted.filter((apt) => isOpenAppointment(apt.status) && apt.endTime >= now && !needsMyAnswer(apt, now))
  const past = sorted.filter((apt) => apt.status === 'completed' || apt.status === 'no_show').reverse().slice(0, 60)
  const cancelled = sorted.filter((apt) => isCancelledAppointment(apt.status)).reverse().slice(0, 60)

  // The drawer follows live data: an accepted or rescheduled visit updates while it's open
  const selected = useMemo(() => (appointments ?? []).find((apt) => apt._id === selectedId) ?? null, [appointments, selectedId])
  const open = (apt: PhysioAppointment, view: View = 'details') => {
    setSelectedId(apt._id)
    setDrawerView(view)
    setDrawerOpen(true)
  }

  // ?visit=<id> (from Needs your attention on Today) opens that visit once the list has loaded
  const visitParam = useSearchParams().get('visit')
  const [handledParam, setHandledParam] = useState<string | null>(null)
  useEffect(() => {
    if (!visitParam || handledParam === visitParam || !appointments) return
    setHandledParam(visitParam)
    if (appointments.some((apt) => apt._id === visitParam)) {
      setSelectedId(visitParam)
      setDrawerView('details')
      setDrawerOpen(true)
    }
  }, [visitParam, handledParam, appointments])

  const accept = async (apt: PhysioAppointment) => {
    setAccepting(apt._id)
    try {
      await updateStatus({ appointmentId: apt._id as Id<'appointments'>, status: 'confirmed' })
      playSound('booked')
      toast.success(`Confirmed. ${patientName(apt).split(' ')[0]} has been told.`)
    } catch (error) {
      playSound('error')
      toast.error(readableError(error, 'Couldn’t confirm it. Please try again.'))
    } finally {
      setAccepting(null)
    }
  }

  const lists: Record<Exclude<Tab, 'repeating'>, PhysioAppointment[]> = { upcoming, past, cancelled }
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
    { key: 'past', label: 'Done' },
    { key: 'cancelled', label: 'Cancelled' },
    ...(repeating ? [{ key: 'repeating' as const, label: 'Repeating' }] : []),
  ]

  return (
    <PageContainer>
      <PageHeader
        title="Schedule"
        description="Requests, upcoming sessions and everything that’s done."
        info="Everything here is live. When a patient books, accepts or cancels, it updates by itself and you get a notification."
        actions={
          <>
            {extraActions}
            <Button className={cn(primaryButtonClass, 'h-10 px-4')} onClick={() => openBooking()}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              New appointment
            </Button>
          </>
        }
      />

      {appointments === undefined ? (
        <LoadingBlocks rows={4} />
      ) : (
        <>
          {answer.length > 0 && (
            <Panel
              title={
                <>
                  Needs your answer <StatusBadge tone="ink">{answer.length}</StatusBadge>
                </>
              }
              info="Patients asked for these times. Accept, decline or suggest another time. They’re told straight away. Rehabify patients pay per visit, so accepting theirs sends the invoice."
              bodyClassName="p-2 sm:p-3"
            >
              {answer.map((apt) => (
                <VisitRow
                  key={apt._id}
                  appointment={apt}
                  now={now}
                  showDay
                  onOpen={() => open(apt)}
                  action={
                    apt.needsInvoice ? (
                      <Button size="sm" className={cn(primaryButtonClass, 'h-9 shrink-0 px-3')} onClick={() => open(apt, 'invoice')}>
                        <Receipt className="mr-1 h-3.5 w-3.5" />
                        Accept &amp; invoice
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className={cn(primaryButtonClass, 'h-9 shrink-0 px-3')}
                        disabled={accepting !== null}
                        onClick={() => void accept(apt)}
                      >
                        {accepting === apt._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                        Accept
                      </Button>
                    )
                  }
                />
              ))}
            </Panel>
          )}

          {toClose.length > 0 && (
            <Panel
              title="To close"
              description={`${toClose.length} session${toClose.length === 1 ? '' : 's'} whose time has passed`}
              info="Mark each one done (and add a quick note) or a no-show, so your records, payments and the patient’s follow-ups stay right."
              bodyClassName="p-2 sm:p-3"
            >
              {toClose.slice(0, 8).map((apt) => (
                <VisitRow
                  key={apt._id}
                  appointment={apt}
                  now={now}
                  showDay
                  onOpen={() => open(apt)}
                  action={
                    <Button size="sm" className={cn(secondaryButtonClass, 'h-9 shrink-0 px-3')} onClick={() => open(apt)}>
                      Close it
                    </Button>
                  }
                />
              ))}
            </Panel>
          )}

          <Quiet>
            <HeldPanel now={now} />
          </Quiet>

          <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-pt-sunken p-1 sm:w-fit">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={tab === t.key}
                className={cn(
                  'rounded-xl px-3.5 py-2 text-sm font-medium transition',
                  tab === t.key ? 'bg-pt-surface text-pt-ink shadow-pt dark:shadow-none' : 'text-pt-muted hover:text-pt-ink'
                )}
              >
                {t.label}
                {t.count ? <span className="ml-1.5 rounded-full bg-pt-sunken px-1.5 text-xs tabular-nums">{t.count}</span> : null}
              </button>
            ))}
          </div>

          {tab === 'repeating' ? (
            repeating
          ) : (
          <Panel bodyClassName="p-2 sm:p-3">
            {lists[tab].length === 0 ? (
              <EmptyState
                icon={tab === 'upcoming' ? <CalendarDays /> : <Inbox />}
                title={tab === 'upcoming' ? 'Nothing coming up' : tab === 'past' ? 'No finished sessions yet' : 'Nothing cancelled'}
                description={tab === 'upcoming' ? 'Book a patient in, or share your booking page from Today.' : undefined}
                action={
                  tab === 'upcoming' ? (
                    <Button className={cn(primaryButtonClass, 'h-10')} onClick={() => openBooking()}>
                      <CalendarPlus className="mr-2 h-4 w-4" />
                      New appointment
                    </Button>
                  ) : undefined
                }
              />
            ) : tab === 'upcoming' ? (
              <DayGroups list={lists.upcoming} now={now} onOpen={open} />
            ) : (
              lists[tab].map((apt) => <VisitRow key={apt._id} appointment={apt} now={now} showDay onOpen={() => open(apt)} />)
            )}
          </Panel>
          )}
        </>
      )}

      <AppointmentDrawer appointment={selected} open={drawerOpen && selected !== null} onOpenChange={setDrawerOpen} startWith={drawerView} />
    </PageContainer>
  )
}
