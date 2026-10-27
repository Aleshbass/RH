'use client'

/**
 * One visit, in a drawer: when and where, its status explained, and everything the physio can
 * do with it (join, accept, decline, suggest another time, cancel, mark done or no-show). After
 * "Mark done" it asks for a quick session note, so records stay complete without extra clicks.
 * A Rehabify patient's request is accepted with an invoice: the physio picks the service from
 * Rehabify's list (seeing only their payout, never the patient's price) and the patient pays to
 * confirm.
 */

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Home,
  Loader2,
  MapPin,
  MessageSquare,
  NotebookPen,
  Receipt,
  User,
  UserX,
  Video,
  X,
} from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { hasPendingProposal, isOpenAppointment } from '@/convex/helpers/appointmentStatus'
import { lagosDate, lagosDateTime, lagosShortDate, lagosTime, lagosTimeRange } from '@/convex/helpers/lagosTime'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PatientSlotPicker } from '@/components/patient/PatientAppointmentBookingModal'
import { isVideoVisit, meetingLinkOf } from '@/components/appointments/appointment-ui'
import {
  DetailRow,
  EmptyState,
  fieldClass,
  IconChip,
  InfoTip,
  PhysioDrawer,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from '@/components/physio/ui'
import { formatKobo } from '@/lib/rehabify-services'
import { useMutationUntyped } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { usePracticeMode } from '@/components/physio/practiceMode'
import { Choice, HomeVisitFields, earningsFor, suggestService, useRehabifyServices, type HomeVisit, type ScheduleService } from './rehabifyServices'
import { JoinVideoButton } from './JoinVideoButton'
import {
  asLike,
  minutesOf,
  needsMyAnswer,
  patientName,
  readableError,
  scheduleApi,
  useNow,
  videoJoin,
  visitStatus,
  type PhysioAppointment,
} from './shared'

export type View = 'details' | 'invoice' | 'propose' | 'decline' | 'cancel' | 'note'
type Slot = { start: number; end: number; duration: number }

const PHYSIO = '/dashboard/physiotherapist'

export function AppointmentDrawer({
  appointment,
  open: isOpen,
  onOpenChange,
  startWith = 'details',
}: {
  /** Kept while the drawer slides closed, so its content doesn't vanish mid-animation. */
  appointment: PhysioAppointment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Open straight on the note (e.g. "Write notes" from a past visit). */
  startWith?: View
}) {
  const now = useNow(30_000)
  const [view, setView] = useState<View>(startWith)
  const [busy, setBusy] = useState<string | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [message, setMessage] = useState('')
  const [note, setNote] = useState({ did: '', how: '', plan: '' })
  const [service, setService] = useState<ScheduleService | null>(null)
  const [visit, setVisit] = useState<HomeVisit | null>(null)
  const [address, setAddress] = useState('')

  const updateStatus = useMutationUntyped(scheduleApi.appointments.updateAppointmentStatus)
  const propose = useMutationUntyped(scheduleApi.appointments.proposeNewTime)
  const addNote = useMutationUntyped(scheduleApi.physioCare.addClinicalNote)
  const acceptWithInvoice = useMutationUntyped(scheduleApi.rehabifyFollowUps.acceptRequestWithInvoice)

  // A Rehabify Care patient's request: the services it's invoiced from (with the physio's payouts).
  // Independent physios only have their own patients, so it never applies to them.
  const practice = usePracticeMode()
  const needsInvoice = Boolean(appointment?.needsInvoice) && practice.loaded && !practice.isIndependent
  const invoicing = isOpen && needsInvoice
  const { zones, services, coveredZones, loading: servicesLoading } = useRehabifyServices(invoicing ? appointment?.patientId : null)

  const id = appointment?._id
  // Fresh each time it opens (not while it slides closed)
  useEffect(() => {
    if (!isOpen) return
    setView(startWith)
    setSlot(null)
    setMessage('')
    setNote({ did: '', how: '', plan: '' })
    setService(null)
    setVisit(null)
    setAddress(appointment?.location ?? '')
  }, [id, startWith, isOpen])

  // Start the invoice on what the patient asked for, and on their area if their address names one
  useEffect(() => {
    if (view !== 'invoice' || service || !appointment) return
    const pick = suggestService(services, { serviceType: appointment.serviceType, home: !isVideoVisit(asLike(appointment)) })
    if (pick) setService(pick)
  }, [view, service, services, appointment])
  useEffect(() => {
    if (view !== 'invoice' || visit || service?.mode !== 'home' || !appointment?.location) return
    const text = appointment.location.toLowerCase()
    for (const zone of coveredZones) {
      const area = zone.areas.find((a) => text.includes(a.toLowerCase()))
      if (area) {
        setVisit({ zoneId: zone.id, area })
        return
      }
    }
  }, [view, visit, service, coveredZones, appointment])

  if (!appointment) return null

  const name = patientName(appointment)
  const first = name.split(' ')[0]
  const status = visitStatus(appointment, now)
  const open = isOpenAppointment(appointment.status)
  const upcoming = appointment.startTime > now
  const started = appointment.startTime <= now
  const answer = needsMyAnswer(appointment, now)
  const join = videoJoin(appointment, now)
  const video = isVideoVisit(asLike(appointment))
  // Every online visit that's still to come shows Join: live in its window, greyed out before
  const joinButton = video && !answer && join.kind !== 'none' ? <JoinVideoButton join={join} size="lg" label="Join video call" /> : null
  const minutes = minutesOf(appointment)
  const patientHref = `${PHYSIO}/patients/${appointment.patientId}`

  const run = async (key: string, action: () => Promise<unknown>, done: string, sound: Parameters<typeof playSound>[0], next?: () => void) => {
    setBusy(key)
    try {
      await action()
      playSound(sound)
      toast.success(done)
      next?.()
    } catch (error) {
      playSound('error')
      toast.error(readableError(error, 'That didn’t work. Please try again.'))
    } finally {
      setBusy(null)
    }
  }

  const setStatus = (key: string, value: 'confirmed' | 'completed' | 'no_show' | 'cancelled_by_therapist', done: string, sound: Parameters<typeof playSound>[0], next?: () => void, reason?: string) =>
    run(
      key,
      () => updateStatus({ appointmentId: appointment._id as Id<'appointments'>, status: value, cancellationReason: reason }),
      done,
      sound,
      next
    )

  const close = () => onOpenChange(false)

  let body: ReactNode
  let footer: ReactNode
  let title = name
  let description: ReactNode = `${appointment.serviceType || 'Session'} · ${minutes} min`

  if (view === 'details' || (view === 'invoice' && !needsInvoice)) {
    const hasLink = Boolean(meetingLinkOf(asLike(appointment)))
    const place = video ? (
      <span className="inline-flex flex-wrap items-center gap-1">
        {join.kind === 'open'
          ? 'Video call · ready to join'
          : open && !hasLink && appointment.endTime > now
            ? 'Video call · link made once it’s confirmed'
            : join.kind === 'soon'
              ? `Video call · Join opens at ${lagosTime(join.opensAt)}`
              : 'Video call'}
        {join.kind !== 'none' && (
          <InfoTip>The private link is on your Schedule and the patient’s dashboard. Join opens 15 minutes before the start and stays open until the end.</InfoTip>
        )}
      </span>
    ) : appointment.location ? (
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appointment.location)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline-offset-2 hover:underline"
      >
        {appointment.location}
      </a>
    ) : (
      'In person'
    )

    body = (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <StatusBadge tone={status.tone} dot>
            {status.label}
          </StatusBadge>
          <InfoTip label="What this status means">{status.explain}</InfoTip>
        </div>
        {answer && needsInvoice && (
          <div className="flex gap-2.5 rounded-2xl bg-pt-blue-bg p-3.5 text-sm text-pt-blue-fg">
            <Receipt className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Paid visit. {first} came through Rehabify, so when you accept you pick the service from Rehabify’s price list and they get the
              invoice. It’s confirmed once they pay.
            </span>
          </div>
        )}
        <div className="divide-y divide-pt-line rounded-2xl border border-pt-line px-3">
          <DetailRow icon={CalendarDays} label="When">
            {lagosDate(appointment.startTime)}
            <span className="block font-semibold tabular-nums">{lagosTimeRange(appointment.startTime, appointment.endTime)}</span>
          </DetailRow>
          <DetailRow icon={video ? Video : MapPin} label={video ? 'Video call' : 'Where'}>
            {place}
          </DetailRow>
          <DetailRow icon={User} label="Patient">
            <Link href={patientHref} onClick={close} className="font-medium underline-offset-2 hover:underline">
              {name}
            </Link>
          </DetailRow>
          {appointment.notesForTherapist && (
            <DetailRow icon={ClipboardList} label="Your note">
              <span className="whitespace-pre-line">{appointment.notesForTherapist}</span>
            </DetailRow>
          )}
        </div>
        {hasPendingProposal(asLike(appointment), now) && appointment.proposedStartTime && (
          <p className="rounded-2xl bg-pt-blue-bg p-3 text-sm text-pt-blue-fg">
            You suggested {lagosDateTime(appointment.proposedStartTime)}. Waiting for {first} to answer.
          </p>
        )}
        {open && upcoming && !answer && (
          <div className="flex flex-wrap gap-2">
            <Button className={cn(secondaryButtonClass, 'h-10')} onClick={() => setView('propose')}>
              <Clock className="mr-2 h-4 w-4" />
              Suggest another time
            </Button>
            <Button variant="ghost" className="h-10 rounded-xl text-pt-rose-fg hover:bg-pt-rose-bg hover:text-pt-rose-fg" onClick={() => setView('cancel')}>
              Cancel visit
            </Button>
          </div>
        )}
        {appointment.status === 'completed' && (
          <Button className={cn(secondaryButtonClass, 'h-10')} onClick={() => setView('note')}>
            <NotebookPen className="mr-2 h-4 w-4" />
            Write a session note
          </Button>
        )}
      </div>
    )

    if (answer && needsInvoice) {
      footer = (
        <div className="space-y-2">
          <Button className={cn(primaryButtonClass, 'h-11 w-full')} disabled={busy !== null} onClick={() => setView('invoice')}>
            <Receipt className="mr-2 h-4 w-4" />
            Accept &amp; send invoice
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button className={cn(secondaryButtonClass, 'h-11')} disabled={busy !== null} onClick={() => setView('decline')}>
              <X className="mr-1.5 h-4 w-4" />
              Decline
            </Button>
            <Button className={cn(secondaryButtonClass, 'h-11')} disabled={busy !== null} onClick={() => setView('propose')}>
              Other time
            </Button>
          </div>
        </div>
      )
    } else if (answer) {
      footer = (
        <div className="grid grid-cols-3 gap-2">
          <Button className={cn(secondaryButtonClass, 'h-11')} disabled={busy !== null} onClick={() => setView('decline')}>
            <X className="mr-1.5 h-4 w-4" />
            Decline
          </Button>
          <Button className={cn(secondaryButtonClass, 'h-11')} disabled={busy !== null} onClick={() => setView('propose')}>
            Other time
          </Button>
          <Button
            className={cn(primaryButtonClass, 'h-11')}
            disabled={busy !== null}
            onClick={() => void setStatus('accept', 'confirmed', `Confirmed. ${first} has been told.`, 'booked', close)}
          >
            <Check className="mr-1.5 h-4 w-4" />
            Accept
          </Button>
        </div>
      )
    } else if (open && started) {
      footer = (
        <div className="space-y-2">
          {joinButton}
          <div className="grid grid-cols-2 gap-2">
            <Button
              className={cn(secondaryButtonClass, 'h-11')}
              disabled={busy !== null}
              onClick={() => void setStatus('noshow', 'no_show', 'Marked as a no-show.', 'reject', close)}
            >
              <UserX className="mr-1.5 h-4 w-4" />
              No-show
            </Button>
            <Button
              className={cn(primaryButtonClass, 'h-11')}
              disabled={busy !== null}
              onClick={() => void setStatus('done', 'completed', 'Marked as done.', 'success', () => setView('note'))}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Mark done
            </Button>
          </div>
        </div>
      )
    } else if (joinButton) {
      footer = (
        <div className="space-y-2">
          {joinButton}
          <div className="grid grid-cols-2 gap-2">
            <Button asChild className={cn(secondaryButtonClass, 'h-11')}>
              <Link href={`${PHYSIO}/messages?with=${appointment.patientId}`} onClick={close}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Message
              </Link>
            </Button>
            <Button asChild className={cn(secondaryButtonClass, 'h-11')}>
              <Link href={patientHref} onClick={close}>
                Open patient
              </Link>
            </Button>
          </div>
        </div>
      )
    } else if (appointment.status === 'no_show') {
      footer = (
        <Button
          className={cn(secondaryButtonClass, 'h-11 w-full')}
          disabled={busy !== null}
          onClick={() => void setStatus('done', 'completed', 'Changed to done.', 'success', () => setView('note'))}
        >
          They came after all: mark done
        </Button>
      )
    } else {
      footer = (
        <div className="grid grid-cols-2 gap-2">
          <Button asChild className={cn(secondaryButtonClass, 'h-11')}>
            <Link href={`${PHYSIO}/messages?with=${appointment.patientId}`} onClick={close}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Message
            </Link>
          </Button>
          <Button asChild className={cn(primaryButtonClass, 'h-11')}>
            <Link href={patientHref} onClick={close}>
              Open patient
            </Link>
          </Button>
        </div>
      )
    }
  }

  if (view === 'invoice' && needsInvoice) {
    const loading = servicesLoading
    const home = service?.mode === 'home'
    // The physio's payout (plus their travel share once the area is known), never the patient's price
    const earnings = service ? earningsFor(service, home && visit ? zones?.find((zone) => zone.id === visit.zoneId) : null) : null
    const ready = Boolean(service) && (!home || (Boolean(visit) && Boolean(address.trim())))

    title = 'Accept & send invoice'
    description = `${lagosShortDate(appointment.startTime)}, ${lagosTime(appointment.startTime)} · ${name}`
    body = (
      <div className="space-y-4">
        <p className="flex items-start gap-1 text-sm text-pt-muted">
          Choose what this visit is. {first} gets the invoice at Rehabify’s price and pays to confirm.
          <InfoTip>
            Prices are set by Rehabify. {first} has 24 hours to pay (or until the visit, if that’s sooner) and the time is held for them
            until then. You earn the amount shown once the session is done.
          </InfoTip>
        </p>
        <div className="rounded-2xl bg-pt-sunken p-3.5 text-sm">
          <p className="text-xs font-medium text-pt-muted">{first} asked for</p>
          <p className="mt-0.5 font-semibold text-pt-ink">
            {appointment.serviceType || 'A session'} · {video ? 'Video call' : 'Home visit'}
          </p>
          {appointment.notesForTherapist && <p className="mt-1 whitespace-pre-line text-pt-muted">“{appointment.notesForTherapist}”</p>}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-pt-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading prices…
          </div>
        ) : services.length === 0 ? (
          <EmptyState
            title="No Rehabify services switched on"
            description="Turn on video sessions or home visits in Settings → Services & coverage."
            action={
              <Button asChild className={cn(secondaryButtonClass, 'h-10')}>
                <Link href={`${PHYSIO}/settings/marketplace`} onClick={close}>
                  Open Services &amp; coverage
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {services.map((option) => (
              <Choice
                key={option.id}
                icon={<IconChip icon={option.mode === 'home' ? Home : Video} tone={option.mode === 'home' ? 'sun' : 'violet'} />}
                title={option.name}
                detail={`${option.durationLabel} · ${option.mode === 'home' ? 'Home visit' : 'Video call'}`}
                aside={
                  <>
                    <span className="block text-sm font-semibold tabular-nums text-pt-ink">You earn {formatKobo(option.payoutKobo)}</span>
                    {option.travelApplies && <span className="block text-[11px] text-pt-muted">+ your share of travel</span>}
                  </>
                }
                selected={service?.id === option.id}
                onClick={() => setService(option)}
              />
            ))}
          </div>
        )}

        {home && (
          <HomeVisitFields
            idPrefix="invoice"
            zones={zones}
            coveredZones={coveredZones}
            visit={visit}
            onVisit={setVisit}
            address={address}
            onAddress={setAddress}
          />
        )}

        {service && (
          <div className="rounded-2xl bg-pt-green-bg p-4 text-pt-green-fg">
            <p className="text-sm font-semibold">
              You earn {earnings !== null ? formatKobo(earnings) : `${formatKobo(service.payoutKobo)} plus your share of travel`}
            </p>
            <p className="mt-0.5 text-xs opacity-80">
              {service.durationMinutes !== minutes &&
                `Booked for ${service.durationMinutes} min: ${lagosTimeRange(appointment.startTime, appointment.startTime + service.durationMinutes * 60_000)}. `}
              {first} pays Rehabify to confirm, and you’re paid once it’s done.
            </p>
          </div>
        )}
      </div>
    )
    footer = (
      <div className="flex gap-2">
        <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} disabled={busy !== null} onClick={() => setView('details')}>
          Back
        </Button>
        <Button
          className={cn(primaryButtonClass, 'h-11 flex-[2]')}
          disabled={!ready || busy !== null}
          onClick={() =>
            service &&
            void run(
              'invoice',
              () =>
                acceptWithInvoice({
                  appointmentId: appointment._id as Id<'appointments'>,
                  serviceId: service.id,
                  zoneId: home ? (visit?.zoneId as Id<'travelZones'>) : undefined,
                  area: home ? visit?.area : undefined,
                  patientAddress: home ? address.trim() : undefined,
                }),
              `Accepted. ${first} has the invoice to pay.`,
              'booked',
              close
            )
          }
        >
          {busy === 'invoice' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
          {!service ? 'Choose a service' : home && !visit ? 'Choose their area' : 'Send invoice'}
        </Button>
      </div>
    )
  }

  if (view === 'propose') {
    title = 'Suggest another time'
    description = `Now: ${lagosShortDate(appointment.startTime)}, ${lagosTime(appointment.startTime)} · ${minutes} min`
    body = (
      <div className="space-y-4">
        <p className="flex items-start gap-1 text-sm text-pt-muted">
          {first} can accept the new time or keep the original.
          <InfoTip>Nothing changes until they answer. You’ll get a notification either way.</InfoTip>
        </p>
        {appointment.physiotherapistId && (
          <PatientSlotPicker
            physiotherapistId={appointment.physiotherapistId}
            durationMinutes={minutes}
            excludeAppointmentId={appointment._id}
            selected={slot}
            onSelect={setSlot}
          />
        )}
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Message for ${first} (optional)`}
          rows={2}
          maxLength={500}
          className={cn(fieldClass, 'resize-none')}
        />
      </div>
    )
    footer = (
      <div className="flex gap-2">
        <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} disabled={busy !== null} onClick={() => setView('details')}>
          Back
        </Button>
        <Button
          className={cn(primaryButtonClass, 'h-11 flex-[2]')}
          disabled={!slot || busy !== null}
          onClick={() =>
            slot &&
            void run(
              'propose',
              () =>
                propose({
                  appointmentId: appointment._id as Id<'appointments'>,
                  startTime: slot.start,
                  endTime: slot.end,
                  note: message.trim() || undefined,
                }),
              `New time sent to ${first}.`,
              'send',
              () => setView('details')
            )
          }
        >
          {slot ? `Suggest ${lagosShortDate(slot.start)}, ${lagosTime(slot.start)}` : 'Pick a time'}
        </Button>
      </div>
    )
  }

  if (view === 'decline' || view === 'cancel') {
    const declining = view === 'decline'
    title = declining ? 'Decline this request?' : 'Cancel this visit?'
    description = `${lagosDateTime(appointment.startTime)} with ${name}`
    body = (
      <div className="space-y-3">
        <p className="text-sm text-pt-muted">{first} is told in the app and by email. The time becomes free again.</p>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Reason for ${first} (optional)`}
          rows={3}
          maxLength={500}
          className={cn(fieldClass, 'resize-none')}
        />
      </div>
    )
    footer = (
      <div className="flex gap-2">
        <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} disabled={busy !== null} onClick={() => setView('details')}>
          Keep it
        </Button>
        <Button
          className="h-11 flex-[2] rounded-xl bg-pt-rose-bg text-pt-rose-fg shadow-none hover:brightness-95"
          disabled={busy !== null}
          onClick={() =>
            void setStatus(
              'cancel',
              'cancelled_by_therapist',
              declining ? 'Request declined. The patient has been told.' : 'Visit cancelled. The patient has been told.',
              'reject',
              close,
              message.trim() || undefined
            )
          }
        >
          {declining ? 'Yes, decline' : 'Yes, cancel visit'}
        </Button>
      </div>
    )
  }

  if (view === 'note') {
    title = 'How did it go?'
    description = `A quick note for ${name}’s record`
    const empty = !note.did.trim() && !note.how.trim() && !note.plan.trim()
    body = (
      <div className="space-y-4">
        <p className="flex items-start gap-1 text-sm text-pt-muted">
          It’s saved to the Notes tab on {first}’s page, linked to this session.
          <InfoTip>Only you and your clinic can see clinical notes. Write the full assessment from the patient’s page any time.</InfoTip>
        </p>
        {(
          [
            ['did', 'What you did today', 'e.g. Manual therapy to the knee, progressed squats'],
            ['how', 'How they are', 'e.g. Pain down to 3/10, walking further'],
            ['plan', 'Plan for next time', 'e.g. Add balance work, review in a week'],
          ] as const
        ).map(([key, label, placeholder]) => (
          <div key={key}>
            <label htmlFor={`note-${key}`} className="mb-1.5 block text-sm font-medium text-pt-ink">
              {label}
            </label>
            <Textarea
              id={`note-${key}`}
              value={note[key]}
              onChange={(e) => setNote((n) => ({ ...n, [key]: e.target.value }))}
              placeholder={placeholder}
              rows={2}
              maxLength={2000}
              className={cn(fieldClass, 'resize-none')}
            />
          </div>
        ))}
      </div>
    )
    footer = (
      <div className="flex gap-2">
        <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} disabled={busy !== null} onClick={close}>
          Not now
        </Button>
        <Button
          className={cn(primaryButtonClass, 'h-11 flex-[2]')}
          disabled={empty || busy !== null}
          onClick={() =>
            void run(
              'note',
              () =>
                addNote({
                  patientId: appointment.patientId as Id<'users'>,
                  noteType: 'treatment_note',
                  treatmentAdministered: note.did.trim() || undefined,
                  subjectiveAssessment: note.how.trim() || undefined,
                  planForNextSession: note.plan.trim() || undefined,
                  appointmentId: appointment._id as Id<'appointments'>,
                }),
              'Note saved.',
              'success',
              close
            )
          }
        >
          Save note
        </Button>
      </div>
    )
  }

  return (
    <PhysioDrawer open={isOpen} onOpenChange={onOpenChange} title={title} description={description} footer={footer}>
      <div key={view} className="animate-in fade-in slide-in-from-right-2 duration-200">
        {body}
      </div>
    </PhysioDrawer>
  )
}
