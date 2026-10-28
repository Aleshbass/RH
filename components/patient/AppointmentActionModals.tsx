'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Calendar, CheckCircle, Clock, Flag, Loader2 } from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { lagosDate, lagosDateTime, lagosTimeRange } from '@/convex/helpers/lagosTime'
import { appointmentErrorMessage } from '@/components/appointments/appointment-ui'
import { PatientSlotPicker } from '@/components/patient/PatientAppointmentBookingModal'
import {
  InfoTip,
  PatientDrawer,
  SectionLabel,
  dangerButtonClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/patient/ui'

interface Appointment {
  _id: string
  physiotherapistId: string
  startTime: number
  endTime: number
  serviceType?: string
  status: string
  proposedStartTime?: number
  proposedEndTime?: number
  proposalNote?: string
  physiotherapistName?: string
}

type MutationResult = { success?: boolean; message?: string } | null | undefined

/** The visit being acted on: date, time and service. */
function VisitSummary({ appointment, label = 'Your visit' }: { appointment: Appointment; label?: string }) {
  return (
    <div className="rounded-2xl bg-pt-sunken p-4">
      <SectionLabel>{label}</SectionLabel>
      <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-pt-ink">
        <Calendar className="h-4 w-4 text-pt-muted" />
        {lagosDate(appointment.startTime)}
      </p>
      <p className="mt-1 flex items-center gap-2 text-sm text-pt-ink">
        <Clock className="h-4 w-4 text-pt-muted" />
        {lagosTimeRange(appointment.startTime, appointment.endTime)} (Lagos time)
      </p>
      {(appointment.serviceType || appointment.physiotherapistName) && (
        <p className="mt-2 text-sm text-pt-muted">
          {[appointment.serviceType, appointment.physiotherapistName && `with ${appointment.physiotherapistName}`].filter(Boolean).join(' ')}
        </p>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Cancel                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

interface CancelAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  appointment: Appointment | null
  onAppointmentCancelled: () => void
}

type CancellationQuote = {
  tier: 'early' | 'late' | 'very_late'
  refundKobo: number
  paidKobo: number
  canReschedule: boolean
  rescheduleBy: number
}

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const cancellationQuoteRef = makeFunctionReference<'query', { appointmentId: Id<'appointments'> }, CancellationQuote | null>(
  'rehabifyFollowUps:getCancellationQuote'
)

/** For a visit paid through Rehabify: what cancelling now gives back (Payment Policy 4.3). */
function CancellationTerms({ appointmentId }: { appointmentId: Id<'appointments'> }) {
  const quote = useQuery(cancellationQuoteRef, { appointmentId })
  if (!quote) return null
  const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`
  return (
    <div className={cn('space-y-1.5 rounded-2xl p-4 text-sm', quote.tier === 'very_late' ? 'bg-pt-rose-bg text-pt-rose-fg' : 'bg-pt-sunken text-pt-ink')}>
      {quote.tier === 'early' && (
        <p>
          <span className="font-semibold">Full refund of {naira(quote.refundKobo)}.</span> You’re cancelling 24 hours or more before. You could also move
          it to another time for free instead.
        </p>
      )}
      {quote.tier === 'late' && (
        <p>
          <span className="font-semibold">Refund of {naira(quote.refundKobo)}</span> (half the session fee, plus any travel charge), because it’s
          less than 24 hours away.{' '}
          {quote.canReschedule
            ? 'Or move it once for free to a time within 14 days: close this and choose Reschedule.'
            : 'You’ve already used your free move for this visit.'}
        </p>
      )}
      {quote.tier === 'very_late' && (
        <p>
          <span className="font-semibold">No refund.</span> It’s less than 2 hours away, so your physio may already be on their way.
        </p>
      )}
      <p className="text-xs opacity-75">
        Refunds go back to how you paid, usually within 5 to 10 business days.{' '}
        <a href="/payment-policy#cancellations-and-refunds" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          Payment Policy
        </a>
      </p>
    </div>
  )
}

export function CancelAppointmentModal({ isOpen, onClose, appointment, onAppointmentCancelled }: CancelAppointmentModalProps) {
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const cancelAppointment = useMutation(api.appointments.cancelAppointmentAsPatient)

  useEffect(() => {
    if (isOpen) setReason('')
  }, [isOpen])

  if (!appointment) return null
  // A request the physio hasn't confirmed yet is withdrawn; a confirmed visit is cancelled
  const isRequest = appointment.status === 'scheduled'

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const result = (await cancelAppointment({
        appointmentId: appointment._id as Id<'appointments'>,
        cancellationReason: reason.trim() || undefined,
      })) as MutationResult
      if (result?.success) {
        playSound('reject')
        toast.success(result.message ?? (isRequest ? 'Request cancelled' : 'Visit cancelled'))
        onAppointmentCancelled()
        onClose()
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error)
      playSound('error')
      toast.error(appointmentErrorMessage(error, 'We couldn’t cancel this visit. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PatientDrawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose()
      }}
      title={isRequest ? 'Cancel this request?' : 'Cancel this visit?'}
      description={isRequest ? 'Your physio hasn’t confirmed it yet.' : 'Your physio will be told straight away.'}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button className={cn(secondaryButtonClass, 'h-11')} onClick={onClose} disabled={isSubmitting}>
            Keep it
          </Button>
          <Button className={cn(dangerButtonClass, 'h-11 font-semibold')} onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isRequest ? 'Yes, cancel request' : 'Yes, cancel visit'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <VisitSummary appointment={appointment} />
        <CancellationTerms appointmentId={appointment._id as Id<'appointments'>} />
        <div className="space-y-2">
          <label htmlFor="cancel-reason" className="flex items-center gap-1 text-sm font-medium text-pt-ink">
            Reason <span className="font-normal text-pt-faint">(optional)</span>
            <InfoTip>Your physio sees this. It helps them plan, and you don’t have to give one.</InfoTip>
          </label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. I’m travelling that week"
            rows={3}
            className={fieldClass}
          />
        </div>
      </div>
    </PatientDrawer>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Confirm a visit the physio booked                                                              */
/* ---------------------------------------------------------------------------------------------- */

interface ConfirmAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  appointment: Appointment | null
  onAppointmentConfirmed: () => void
}

export function ConfirmAppointmentModal({ isOpen, onClose, appointment, onAppointmentConfirmed }: ConfirmAppointmentModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const confirmAppointment = useMutation(api.appointments.confirmAppointmentAsPatient)

  if (!appointment) return null

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      const result = (await confirmAppointment({ appointmentId: appointment._id as Id<'appointments'> })) as MutationResult
      if (result?.success) {
        playSound('booked')
        toast.success(result.message ?? 'Visit confirmed')
        onAppointmentConfirmed()
        onClose()
      }
    } catch (error) {
      console.error('Error confirming appointment:', error)
      playSound('error')
      toast.error(appointmentErrorMessage(error, 'We couldn’t confirm this visit. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PatientDrawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose()
      }}
      title="Confirm your visit"
      description="Let your physio know you’re coming."
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button className={cn(secondaryButtonClass, 'h-11')} onClick={onClose} disabled={isSubmitting}>
            Not now
          </Button>
          <Button className={cn(primaryButtonClass, 'h-11')} onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
            Confirm
          </Button>
        </div>
      }
    >
      <VisitSummary appointment={appointment} />
      <p className="mt-4 text-sm text-pt-muted">Can’t make it? Close this and choose Reschedule instead.</p>
    </PatientDrawer>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Reschedule                                                                                     */
/* ---------------------------------------------------------------------------------------------- */

interface RescheduleAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  appointment: Appointment | null
  onAppointmentRescheduled: () => void
}

// Bookable slot from calendar.availability.getAvailableSlots
interface TimeSlot {
  start: number
  end: number
  duration: number
}

export function RescheduleAppointmentModal({ isOpen, onClose, appointment, onAppointmentRescheduled }: RescheduleAppointmentModalProps) {
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot | null>(null)
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const rescheduleAppointment = useMutation(api.appointments.requestAppointmentReschedule)

  useEffect(() => {
    if (isOpen) {
      setSelectedTimeSlot(null)
      setReason('')
    }
  }, [isOpen])

  if (!appointment) return null
  // Same length as the original visit, from the physio's real working hours
  const durationMinutes = Math.max(15, Math.round((appointment.endTime - appointment.startTime) / 60000))

  const handleSubmit = async () => {
    if (!selectedTimeSlot) return
    setIsSubmitting(true)
    try {
      const result = (await rescheduleAppointment({
        appointmentId: appointment._id as Id<'appointments'>,
        newStartTime: selectedTimeSlot.start,
        newEndTime: selectedTimeSlot.end,
        reason: reason.trim() || undefined,
      })) as MutationResult
      if (result?.success) {
        playSound('booked')
        toast.success(result.message ?? 'New time sent to your physio')
        onAppointmentRescheduled()
        onClose()
      }
    } catch (error) {
      console.error('Error rescheduling appointment:', error)
      playSound('error')
      toast.error(appointmentErrorMessage(error, 'We couldn’t move this visit. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PatientDrawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose()
      }}
      title="Pick a new time"
      description="Your physio confirms the new time, and we’ll let you know."
      footer={
        <div className="space-y-2">
          {selectedTimeSlot && (
            <p className="text-center text-sm text-pt-muted">
              New time: <span className="font-semibold text-pt-ink">{lagosDateTime(selectedTimeSlot.start)}</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button className={cn(secondaryButtonClass, 'h-11')} onClick={onClose} disabled={isSubmitting}>
              Back
            </Button>
            <Button className={cn(primaryButtonClass, 'h-11')} onClick={handleSubmit} disabled={!selectedTimeSlot || isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send new time
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <VisitSummary appointment={appointment} label="Current time" />
        <PatientSlotPicker
          physiotherapistId={appointment.physiotherapistId}
          durationMinutes={durationMinutes}
          excludeAppointmentId={appointment._id}
          selected={selectedTimeSlot}
          onSelect={setSelectedTimeSlot}
        />
        <div className="space-y-2">
          <label htmlFor="reschedule-reason" className="text-sm font-medium text-pt-ink">
            Reason <span className="font-normal text-pt-faint">(optional)</span>
          </label>
          <Textarea
            id="reschedule-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. work came up that morning"
            rows={2}
            className={fieldClass}
          />
        </div>
      </div>
    </PatientDrawer>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Answer the physio's proposed time                                                              */
/* ---------------------------------------------------------------------------------------------- */

interface RespondToProposalModalProps {
  isOpen: boolean
  onClose: () => void
  appointment: Appointment | null
  /** What the patient picked on the card; they can still switch here */
  accept: boolean
}

export function RespondToProposalModal({ isOpen, onClose, appointment, accept }: RespondToProposalModalProps) {
  const [isSubmitting, setIsSubmitting] = useState<'accept' | 'decline' | null>(null)
  const respond = useMutation(api.appointments.respondToProposedTime)

  if (!appointment || !appointment.proposedStartTime || !appointment.proposedEndTime) return null
  const physio = appointment.physiotherapistName || 'Your physio'
  const proposedStart = appointment.proposedStartTime
  const proposedEnd = appointment.proposedEndTime

  const answer = async (yes: boolean) => {
    setIsSubmitting(yes ? 'accept' : 'decline')
    try {
      const result = (await respond({ appointmentId: appointment._id as Id<'appointments'>, accept: yes })) as MutationResult
      if (yes) playSound('booked')
      toast.success(result?.message ?? (yes ? 'Your visit is moved and confirmed.' : 'Kept your original time.'))
      onClose()
    } catch (error) {
      console.error('Error answering proposed time:', error)
      playSound('error')
      toast.error(appointmentErrorMessage(error, 'We couldn’t send your answer. Please try again.'))
    } finally {
      setIsSubmitting(null)
    }
  }

  return (
    <PatientDrawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose()
      }}
      title={`${physio} suggested a new time`}
      description="Choose the time that works for you."
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            className={cn(accept ? secondaryButtonClass : primaryButtonClass, 'h-11')}
            onClick={() => answer(false)}
            disabled={isSubmitting !== null}
          >
            {isSubmitting === 'decline' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Keep my time
          </Button>
          <Button
            className={cn(accept ? primaryButtonClass : secondaryButtonClass, 'h-11')}
            onClick={() => answer(true)}
            disabled={isSubmitting !== null}
          >
            {isSubmitting === 'accept' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
            Accept new time
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-2xl bg-pt-amber-bg p-4 text-pt-amber-fg">
          <p className="text-[11px] font-semibold uppercase tracking-wider">New time</p>
          <p className="mt-1.5 font-semibold">{lagosDate(proposedStart)}</p>
          <p>{lagosTimeRange(proposedStart, proposedEnd)} (Lagos time)</p>
          {appointment.proposalNote && <p className="mt-2 italic">&ldquo;{appointment.proposalNote}&rdquo;</p>}
        </div>
        <div className="rounded-2xl bg-pt-sunken p-4 text-pt-ink">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">Your current time</p>
          <p className="mt-1.5 font-semibold">{lagosDate(appointment.startTime)}</p>
          <p className="text-pt-muted">{lagosTimeRange(appointment.startTime, appointment.endTime)}</p>
        </div>
        <p className="text-pt-muted">
          {appointment.status === 'scheduled'
            ? 'Accepting confirms the visit at the new time. Keeping yours sends your request back to your physio.'
            : 'Accepting moves your confirmed visit to the new time. Keeping yours leaves it as it is.'}
        </p>
      </div>
    </PatientDrawer>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Report a problem with a visit (Payment Policy 4.6)                                             */
/* ---------------------------------------------------------------------------------------------- */

type SessionConcernState = { reported: boolean; canReport: boolean; deadline: number }

const sessionConcernStateRef = makeFunctionReference<'query', { appointmentId: Id<'appointments'> }, SessionConcernState | null>(
  'payouts:getSessionConcernState'
)
const reportSessionProblemRef = makeFunctionReference<
  'mutation',
  { appointmentId: Id<'appointments'>; message: string },
  { success: boolean; message: string }
>('payouts:reportSessionProblem')

/**
 * "Report a problem with this session", for a completed Rehabify Care visit up to 7 days after it.
 * Sits inside the visit's drawer and renders nothing when it doesn't apply.
 */
export function ReportSessionProblem({ appointmentId }: { appointmentId: string }) {
  const state = useQuery(sessionConcernStateRef, { appointmentId: appointmentId as Id<'appointments'> })
  const report = useMutation(reportSessionProblemRef)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  if (!state) return null
  if (state.reported) {
    return (
      <p className="rounded-2xl bg-pt-sunken p-4 text-sm text-pt-muted">
        You reported a problem with this visit. The Rehabify team will get back to you.
      </p>
    )
  }
  if (!state.canReport) return null

  const submit = async () => {
    setSending(true)
    try {
      const result = await report({ appointmentId: appointmentId as Id<'appointments'>, message: message.trim() })
      playSound('success')
      toast.success(result.message)
      setOpen(false)
      setMessage('')
    } catch (error) {
      playSound('error')
      toast.error(appointmentErrorMessage(error, 'We couldn’t send that. Please try again.'))
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-pt-muted underline-offset-2 hover:text-pt-ink hover:underline"
      >
        <Flag className="h-3.5 w-3.5" />
        Report a problem with this session
      </button>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-pt-line p-4">
      <div>
        <p className="text-sm font-semibold text-pt-ink">Report a problem with this session</p>
        <p className="mt-0.5 text-sm text-pt-muted">
          Tell us what went wrong. The Rehabify team reads this, not your physio. You can report it until {lagosDate(state.deadline)}.
        </p>
      </div>
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="e.g. My physio arrived very late and the session was cut short"
        rows={3}
        maxLength={1000}
        className={fieldClass}
        aria-label="What went wrong"
      />
      <div className="grid grid-cols-2 gap-2">
        <Button className={cn(secondaryButtonClass, 'h-10')} onClick={() => setOpen(false)} disabled={sending}>
          Cancel
        </Button>
        <Button className={cn(primaryButtonClass, 'h-10')} onClick={submit} disabled={sending || message.trim().length < 5}>
          {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send
        </Button>
      </div>
    </div>
  )
}
