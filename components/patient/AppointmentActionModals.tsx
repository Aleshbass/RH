// @ts-nocheck

'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, Calendar, Clock, CheckCircle, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { playSound } from '@/lib/sounds'
import { Id } from '@/convex/_generated/dataModel'
import { lagosDate, lagosTimeRange } from '@/convex/helpers/lagosTime'
import { SlotPicker, appointmentErrorMessage } from '@/components/appointments/appointment-ui'

interface Appointment {
  _id: string
  patientId: string
  physiotherapistId: string
  startTime: number
  endTime: number
  serviceType: string
  status: string
  notesForPatient?: string
  cancellationReason?: string
  proposedStartTime?: number
  proposedEndTime?: number
  proposalNote?: string
  physiotherapistName?: string
}

// Cancel Appointment Modal
interface CancelAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  appointment: Appointment | null
  onAppointmentCancelled: () => void
}

export function CancelAppointmentModal({
  isOpen,
  onClose,
  appointment,
  onAppointmentCancelled,
}: CancelAppointmentModalProps) {
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const cancelAppointment = useMutation(api.appointments.cancelAppointmentAsPatient)

  useEffect(() => {
    if (isOpen) {
      setReason('')
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!appointment) return

    setIsSubmitting(true)

    try {
      const result = await cancelAppointment({
        appointmentId: appointment._id as Id<'appointments'>,
        cancellationReason: reason || undefined,
      })

      if (result.success) {
        toast.success(result.message)
        onAppointmentCancelled()
        onClose()
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error)
      toast.error(appointmentErrorMessage(error, 'Failed to cancel appointment'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!appointment) return null
  // A request the physio hasn't confirmed yet is withdrawn; a confirmed visit is cancelled
  const isRequest = appointment.status === 'scheduled'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            {isRequest ? 'Cancel Request' : 'Cancel Appointment'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">
                  {isRequest ? 'Cancel this appointment request?' : 'Are you sure you want to cancel this appointment?'}
                </p>
                <p className="text-sm text-red-700 mt-1">
                  {lagosDate(appointment.startTime)}, {lagosTimeRange(appointment.startTime, appointment.endTime)}
                </p>
                <p className="text-sm text-red-700">{appointment.serviceType}</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for cancellation (Optional)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please let us know why you're cancelling..."
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting} className="flex-1">
                Keep Appointment
              </Button>
              <Button type="submit" variant="destructive" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cancelling...</>) : isRequest ? 'Cancel Request' : 'Cancel Appointment'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Confirm Appointment Modal
interface ConfirmAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  appointment: Appointment | null
  onAppointmentConfirmed: () => void
}

export function ConfirmAppointmentModal({
  isOpen,
  onClose,
  appointment,
  onAppointmentConfirmed,
}: ConfirmAppointmentModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const confirmAppointment = useMutation(api.appointments.confirmAppointmentAsPatient)

  const handleConfirm = async () => {
    if (!appointment) return
    setIsSubmitting(true)
    try {
      const result = await confirmAppointment({ appointmentId: appointment._id as Id<'appointments'> })
      if (result.success) {
        playSound('booked')
        toast.success(result.message)
        onAppointmentConfirmed()
        onClose()
      }
    } catch (error) {
      console.error('Error confirming appointment:', error)
      toast.error(appointmentErrorMessage(error, 'Failed to confirm appointment'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!appointment) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            Confirm Appointment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="space-y-2">
              <p className="font-medium text-green-800">Please confirm your appointment:</p>
              <div className="text-sm text-green-700 space-y-1">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {lagosDate(appointment.startTime)}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {lagosTimeRange(appointment.startTime, appointment.endTime)}
                </div>
                <div>Service: {appointment.serviceType}</div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting} className="flex-1">
              Not Now
            </Button>
            <Button onClick={handleConfirm} disabled={isSubmitting} className="flex-1">
              {isSubmitting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirming...</>) : (<><CheckCircle className="h-4 w-4 mr-2" /> Confirm Appointment</>)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Reschedule Appointment Modal
interface RescheduleAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  appointment: Appointment | null
  onAppointmentRescheduled: () => void
}

// Bookable slot from calendar.availability.getAvailableSlots
interface TimeSlot {
  start: number;
  end: number;
  duration: number;
}

export function RescheduleAppointmentModal({
  isOpen,
  onClose,
  appointment,
  onAppointmentRescheduled,
}: RescheduleAppointmentModalProps) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appointment || !selectedTimeSlot) return
    setIsSubmitting(true)
    try {
      const result = await rescheduleAppointment({
        appointmentId: appointment._id as Id<'appointments'>,
        newStartTime: selectedTimeSlot.start,
        newEndTime: selectedTimeSlot.end,
        reason: reason || undefined,
      })
      if (result.success) {
        toast.success(result.message)
        onAppointmentRescheduled()
        onClose()
      }
    } catch (error) {
      console.error('Error rescheduling appointment:', error)
      toast.error(appointmentErrorMessage(error, 'Failed to reschedule appointment'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!appointment) return null
  // Same length as the original visit, from the physio's real working hours
  const durationMinutes = Math.max(15, Math.round((appointment.endTime - appointment.startTime) / 60000))

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Reschedule Appointment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="bg-gray-50">
            <CardContent className="p-4">
              <p className="font-medium text-gray-800 mb-2">Current Appointment:</p>
              <div className="text-sm text-gray-600 space-y-1">
                <div>{lagosDate(appointment.startTime)}</div>
                <div>{lagosTimeRange(appointment.startTime, appointment.endTime)}</div>
                <div>{appointment.serviceType}</div>
              </div>
            </CardContent>
          </Card>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>New time *</Label>
              <SlotPicker
                physiotherapistId={appointment.physiotherapistId}
                durationMinutes={durationMinutes}
                excludeAppointmentId={appointment._id}
                selected={selectedTimeSlot}
                onSelect={setSelectedTimeSlot}
              />
              <p className="text-xs text-gray-500">Your physio confirms the new time; we&apos;ll let you know.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for rescheduling (Optional)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Let us know why you need to reschedule..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={!selectedTimeSlot || isSubmitting} className="flex-1">
                {isSubmitting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Rescheduling...</>) : 'Reschedule Appointment'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Answer the physio's proposed time
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

  const answer = async (yes: boolean) => {
    setIsSubmitting(yes ? 'accept' : 'decline')
    try {
      const result = await respond({ appointmentId: appointment._id as Id<'appointments'>, accept: yes })
      if (yes) playSound('booked')
      toast.success(result?.message ?? (yes ? 'Your visit is moved and confirmed.' : 'Kept your original time.'))
      onClose()
    } catch (error) {
      console.error('Error answering proposed time:', error)
      toast.error(appointmentErrorMessage(error, 'Could not send your answer. Please try again.'))
    } finally {
      setIsSubmitting(null)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-amber-600" />
            {physio} proposed a new time
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <p className="font-medium">New time</p>
            <p>{lagosDate(appointment.proposedStartTime)}</p>
            <p>{lagosTimeRange(appointment.proposedStartTime, appointment.proposedEndTime)} (Lagos time)</p>
            {appointment.proposalNote && <p className="mt-1">&ldquo;{appointment.proposalNote}&rdquo;</p>}
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-gray-700">
            <p className="font-medium">Original time</p>
            <p>{lagosDate(appointment.startTime)}</p>
            <p>{lagosTimeRange(appointment.startTime, appointment.endTime)}</p>
          </div>
          <p className="text-gray-500">
            {appointment.status === 'scheduled'
              ? 'Accepting confirms the visit at the new time. Keeping the original sends your request back to your physio.'
              : 'Accepting moves your confirmed visit to the new time. Keeping the original leaves it as it is.'}
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant={accept ? 'outline' : 'default'}
            onClick={() => answer(false)}
            disabled={isSubmitting !== null}
            className="flex-1"
          >
            {isSubmitting === 'decline' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Keep original time
          </Button>
          <Button
            type="button"
            variant={accept ? 'default' : 'outline'}
            onClick={() => answer(true)}
            disabled={isSubmitting !== null}
            className="flex-1"
          >
            {isSubmitting === 'accept' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
            Accept new time
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
 