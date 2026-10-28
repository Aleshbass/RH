'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  MapPin,
  MessageCircle,
  NotebookPen,
  Star,
  Video,
  XCircle,
} from '@/components/icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  appointmentStatusLabel,
  awaitingConfirmationFrom,
  hasPendingProposal,
  isOpenAppointment,
  type AppointmentStatusFields,
} from '@/convex/helpers/appointmentStatus'
import { formatLagos, lagosDate, lagosTimeRange } from '@/convex/helpers/lagosTime'
import { isVideoVisit, meetingLinkOf } from '@/components/appointments/appointment-ui'
import { ReportSessionProblem } from '@/components/patient/AppointmentActionModals'
import {
  DetailRow,
  PatientDrawer,
  SectionLabel,
  StatusBadge,
  accentButtonClass,
  initials,
  primaryButtonClass,
  secondaryButtonClass,
  type Tone,
} from '@/components/patient/ui'
import { cn } from '@/lib/utils'

/* ---------------------------------------------------------------------------------------------- */
/* Shared appointment helpers for the patient portal                                              */
/* ---------------------------------------------------------------------------------------------- */

/** A row from api.appointments.getPatientAppointments. */
export type PatientAppointment = AppointmentStatusFields & {
  _id: string
  physiotherapistId: string
  startTime: number
  endTime: number
  status: string
  serviceType?: string
  appointmentType?: string
  isOnline?: boolean
  location?: string
  meetingLink?: string
  streamMeetingLink?: string
  googleMeetLink?: string
  manualMeetingLink?: string
  notesForPatient?: string
  cancellationReason?: string
  feedbackSubmitted?: boolean
  physiotherapistName?: string
  proposedStartTime?: number
  proposedEndTime?: number
  proposalNote?: string
}

export const MESSAGES_HREF = '/dashboard/patient/messages'

/** Booked and not over yet. */
export function isLiveAppointment(apt: PatientAppointment, now = Date.now()) {
  return isOpenAppointment(apt.status) && apt.endTime > now
}

export function isCancelled(apt: PatientAppointment) {
  return apt.status === 'cancelled_by_patient' || apt.status === 'cancelled_by_therapist'
}

/** Needs the patient's answer: a new time the physio proposed, or a visit the physio booked. */
export function needsPatientAnswer(apt: PatientAppointment) {
  return isLiveAppointment(apt) && (hasPendingProposal(apt) || awaitingConfirmationFrom(apt) === 'patient')
}

/** A confirmed video visit with a link that hasn't ended. */
export function canJoinVisit(apt: PatientAppointment, now = Date.now()) {
  return isVideoVisit(apt) && apt.status === 'confirmed' && !!meetingLinkOf(apt) && apt.endTime > now
}

/** True from 15 minutes before the start until the end. */
export function isJoinTime(apt: PatientAppointment, now = Date.now()) {
  return now >= apt.startTime - 15 * 60 * 1000 && now < apt.endTime
}

export function durationMinutes(apt: Pick<PatientAppointment, 'startTime' | 'endTime'>) {
  return Math.max(15, Math.round((apt.endTime - apt.startTime) / 60000))
}

export function placeLabel(apt: PatientAppointment) {
  return isVideoVisit(apt) ? 'Video call' : 'In person'
}

/** Label, colour and a plain explanation of where a visit stands, from the patient's side. */
export function patientStatus(apt: PatientAppointment, now = Date.now()): { label: string; tone: Tone; explain: string } {
  const label = appointmentStatusLabel(apt, 'patient')
  if (isOpenAppointment(apt.status)) {
    if (apt.endTime <= now) {
      return { label, tone: 'neutral', explain: 'The time for this visit has passed. Your physio will update it.' }
    }
    if (hasPendingProposal(apt, now)) {
      return { label, tone: 'amber', explain: 'Your physio suggested another time. Accept it, or keep the time you had.' }
    }
    const waitingOn = awaitingConfirmationFrom(apt)
    if (waitingOn === 'patient') {
      return { label, tone: 'amber', explain: 'Your physio booked this visit for you. Confirm it so they know you’re coming.' }
    }
    if (waitingOn === 'provider') {
      return {
        label,
        tone: 'neutral',
        explain: 'You asked for this time. Your physio will confirm it or suggest another, and we’ll let you know.',
      }
    }
    return { label, tone: 'green', explain: 'Your physio has confirmed this visit.' }
  }
  switch (apt.status) {
    case 'completed':
      return { label, tone: 'blue', explain: 'This visit has taken place.' }
    case 'cancelled_by_patient':
      return { label: 'Cancelled by you', tone: 'rose', explain: 'You cancelled this visit.' }
    case 'cancelled_by_therapist':
      return { label, tone: 'rose', explain: 'Your physio cancelled this visit.' }
    case 'no_show':
      return { label: 'Missed', tone: 'amber', explain: 'This visit was marked as missed.' }
    default:
      return { label, tone: 'neutral', explain: label }
  }
}

/** Opens a visit's video room: our own call page in the app, anything else in a new tab. */
export function useJoinVisit() {
  const router = useRouter()
  return useCallback(
    (link: string | undefined | null) => {
      if (!link) return
      try {
        const url = new URL(link, window.location.origin)
        if (url.origin === window.location.origin && url.pathname.startsWith('/video-call/')) {
          router.push(`${url.pathname}${url.search}`)
          return
        }
      } catch {
        // Not a URL we can parse; open it as-is
      }
      window.open(link, '_blank', 'noopener,noreferrer')
    },
    [router]
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Details drawer                                                                                 */
/* ---------------------------------------------------------------------------------------------- */

/** api.appointments.getPatientAppointmentDetails */
type AppointmentExtras = {
  physiotherapist: { _id: string; firstName?: string; lastName?: string; imageUrl?: string; specializations?: string[] } | null
  clinic: { _id: string; name?: string; address?: string; contactPhone?: string } | null
  sessionLog: {
    subjectiveAssessment?: string
    objectiveAssessment?: string
    treatmentAdministered?: string
    planForNextSession?: string
  } | null
}

export type AppointmentActionHandlers = {
  onConfirm: (apt: PatientAppointment) => void
  onReschedule: (apt: PatientAppointment) => void
  onCancel: (apt: PatientAppointment) => void
  onRespondToProposal: (apt: PatientAppointment, accept: boolean) => void
  onRateVisit: (apt: PatientAppointment) => void
}

/**
 * Everything about one visit, with the actions that make sense for it right now. Actions hand the
 * visit back to the page, which closes this drawer and opens the matching one.
 */
export function AppointmentDetailsDrawer({
  appointment,
  open,
  onOpenChange,
  onConfirm,
  onReschedule,
  onCancel,
  onRespondToProposal,
  onRateVisit,
}: {
  appointment: PatientAppointment | null
  open: boolean
  onOpenChange: (open: boolean) => void
} & AppointmentActionHandlers) {
  const join = useJoinVisit()
  const extras = useQuery(
    api.appointments.getPatientAppointmentDetails,
    open && appointment ? { appointmentId: appointment._id as Id<'appointments'> } : 'skip'
  ) as AppointmentExtras | undefined

  if (!appointment) return null

  const apt = appointment
  const now = Date.now()
  const status = patientStatus(apt, now)
  const live = isLiveAppointment(apt, now)
  const proposal = hasPendingProposal(apt, now)
  const needsConfirm = live && !proposal && awaitingConfirmationFrom(apt) === 'patient'
  const waitingOnPhysio = live && awaitingConfirmationFrom(apt) === 'provider'
  const video = isVideoVisit(apt)
  const link = meetingLinkOf(apt)
  const joinable = canJoinVisit(apt, now)
  const physioName =
    apt.physiotherapistName ||
    [extras?.physiotherapist?.firstName, extras?.physiotherapist?.lastName].filter(Boolean).join(' ') ||
    'Your physiotherapist'
  const canRate = apt.status === 'completed' && !apt.feedbackSubmitted
  const summary = extras?.sessionLog
  const summaryParts = summary
    ? ([
        ['What you told your physio', summary.subjectiveAssessment],
        ['What your physio found', summary.objectiveAssessment],
        ['Treatment', summary.treatmentAdministered],
        ['Plan for next time', summary.planForNextSession],
      ] as const).filter(([, text]) => typeof text === 'string' && text.trim())
    : []

  const copyLink = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy the link')
    }
  }

  const footer = (
    <div className="space-y-2">
      {proposal && (
        <div className="grid grid-cols-2 gap-2">
          <Button className={cn(secondaryButtonClass, 'h-11')} onClick={() => onRespondToProposal(apt, false)}>
            Keep my time
          </Button>
          <Button className={cn(primaryButtonClass, 'h-11')} onClick={() => onRespondToProposal(apt, true)}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Accept new time
          </Button>
        </div>
      )}
      {needsConfirm && (
        <Button className={cn(primaryButtonClass, 'h-11 w-full')} onClick={() => onConfirm(apt)}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Confirm this visit
        </Button>
      )}
      {joinable && (
        <Button className={cn(accentButtonClass, 'h-12 w-full text-[15px]')} onClick={() => join(link)}>
          <Video className="mr-2 h-4 w-4" />
          Join video call
        </Button>
      )}
      {live && (
        <div className="grid grid-cols-2 gap-2">
          {!proposal && (
            <Button className={cn(secondaryButtonClass, 'h-11')} onClick={() => onReschedule(apt)}>
              <CalendarClock className="mr-2 h-4 w-4" />
              Reschedule
            </Button>
          )}
          <Button
            className={cn(secondaryButtonClass, 'h-11 text-pt-rose-fg hover:bg-pt-rose-bg', proposal && 'col-span-2')}
            onClick={() => onCancel(apt)}
          >
            <XCircle className="mr-2 h-4 w-4" />
            {waitingOnPhysio ? 'Cancel request' : 'Cancel visit'}
          </Button>
        </div>
      )}
      {canRate && (
        <Button className={cn(primaryButtonClass, 'h-11 w-full')} onClick={() => onRateVisit(apt)}>
          <Star className="mr-2 h-4 w-4" />
          Rate this visit
        </Button>
      )}
      {apt.physiotherapistId && (
        <Button asChild variant="ghost" className="h-10 w-full rounded-xl text-pt-muted hover:bg-pt-hover hover:text-pt-ink">
          <Link href={`${MESSAGES_HREF}?with=${apt.physiotherapistId}`}>
            <MessageCircle className="mr-2 h-4 w-4" />
            Message {physioName.split(' ')[0] || 'your physio'}
          </Link>
        </Button>
      )}
    </div>
  )

  return (
    <PatientDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={apt.serviceType || 'Appointment'}
      description={`${placeLabel(apt)} with ${physioName}`}
      footer={footer}
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-pt-sunken p-4">
          <StatusBadge tone={status.tone} dot>
            {status.label}
          </StatusBadge>
          <p className="mt-3 text-xl font-semibold tracking-tight text-pt-ink">
            {formatLagos(apt.startTime, { weekday: 'long', day: 'numeric', month: 'long' }, 'en-NG')}
          </p>
          <p className="mt-0.5 text-sm text-pt-muted">
            {lagosTimeRange(apt.startTime, apt.endTime)} · {durationMinutes(apt)} min · Lagos time
          </p>
          <p className="mt-3 text-sm leading-relaxed text-pt-muted">{status.explain}</p>
        </div>

        {proposal && apt.proposedStartTime && apt.proposedEndTime && (
          <div className="rounded-2xl bg-pt-amber-bg p-4 text-sm text-pt-amber-fg">
            <p className="font-semibold">Suggested new time</p>
            <p className="mt-1">{lagosDate(apt.proposedStartTime)}</p>
            <p>{lagosTimeRange(apt.proposedStartTime, apt.proposedEndTime)} (Lagos time)</p>
            {apt.proposalNote && <p className="mt-2 italic">&ldquo;{apt.proposalNote}&rdquo;</p>}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11 rounded-2xl">
            <AvatarImage src={extras?.physiotherapist?.imageUrl} alt="" />
            <AvatarFallback className="rounded-2xl bg-pt-sun-bg text-sm font-semibold text-pt-sun-fg">{initials(physioName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-pt-ink">{physioName}</p>
            <p className="truncate text-xs text-pt-muted">
              {extras?.physiotherapist?.specializations?.length ? extras.physiotherapist.specializations.join(', ') : 'Physiotherapist'}
            </p>
          </div>
        </div>

        <div className="divide-y divide-pt-line rounded-2xl border border-pt-line px-3">
          <DetailRow icon={video ? Video : MapPin} label="Where">
            {video ? (
              link && live ? (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>Video call · your link is ready</span>
                  <button type="button" onClick={copyLink} className="inline-flex items-center gap-1 text-xs font-semibold text-pt-muted hover:text-pt-ink">
                    <Copy className="h-3 w-3" />
                    Copy link
                  </button>
                </span>
              ) : live ? (
                apt.status === 'confirmed' ? (
                  'Video call · your link will appear here before the session'
                ) : (
                  'Video call · the link arrives once your physio confirms'
                )
              ) : (
                'Video call'
              )
            ) : apt.location ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(apt.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-pt-line-strong underline-offset-2 hover:decoration-pt-ink"
              >
                {apt.location}
              </a>
            ) : (
              'In person'
            )}
          </DetailRow>
          {apt.serviceType && (
            <DetailRow icon={ClipboardList} label="Service">
              {apt.serviceType}
            </DetailRow>
          )}
          {extras?.clinic?.name && (
            <DetailRow icon={Building2} label="Clinic">
              <span className="block">{extras.clinic.name}</span>
              {extras.clinic.address && <span className="block text-pt-muted">{extras.clinic.address}</span>}
              {extras.clinic.contactPhone && (
                <a href={`tel:${extras.clinic.contactPhone}`} className="block text-pt-muted underline-offset-2 hover:underline">
                  {extras.clinic.contactPhone}
                </a>
              )}
            </DetailRow>
          )}
          {apt.notesForPatient && (
            <DetailRow icon={NotebookPen} label="Note from your physio">
              <span className="whitespace-pre-line">{apt.notesForPatient}</span>
            </DetailRow>
          )}
          {isCancelled(apt) && apt.cancellationReason && (
            <DetailRow icon={XCircle} label="Reason">
              {apt.cancellationReason}
            </DetailRow>
          )}
        </div>

        {summaryParts.length > 0 && (
          <div className="space-y-3">
            <SectionLabel>Visit summary</SectionLabel>
            <div className="space-y-3 rounded-2xl border border-pt-line p-4">
              {summaryParts.map(([heading, text]) => (
                <div key={heading}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-pt-faint">
                    <FileText className="h-3 w-3" />
                    {heading}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-pt-ink">{text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rehabify Care visits only, up to 7 days after; renders nothing otherwise */}
        {apt.status === 'completed' && <ReportSessionProblem appointmentId={apt._id} />}
      </div>
    </PatientDrawer>
  )
}

/** Older name, kept so existing imports keep working. */
export const AppointmentDetailsModal = AppointmentDetailsDrawer
