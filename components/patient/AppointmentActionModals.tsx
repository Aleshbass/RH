

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
import { format, addDays } from 'date-fns'
import { toast } from 'sonner'
import { Id } from '@/convex/_generated/dataModel'

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
      toast.error(error instanceof Error ? error.message : 'Failed to cancel appointment')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!appointment) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            Cancel Appointment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">Are you sure you want to cancel this appointment?</p>
                <p className="text-sm text-red-700 mt-1">
                  {format(new Date(appointment.startTime), 'EEEE, MMMM do, yyyy')} at{' '}
                  {format(new Date(appointment.startTime), 'h:mm a')}
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
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1"
              >
                Keep Appointment
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  'Cancel Appointment'
                )}
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
      const result = await confirmAppointment({
        appointmentId: appointment._id as Id<'appointments'>,
      })

      if (result.success) {
        toast.success(result.message)
        onAppointmentConfirmed()
        onClose()
      }
    } catch (error) {
      console.error('Error confirming appointment:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to confirm appointment')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!appointment) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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
                  {format(new Date(appointment.startTime), 'EEEE, MMMM do, yyyy')}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {format(new Date(appointment.startTime), 'h:mm a')} -{' '}
                  {format(new Date(appointment.endTime), 'h:mm a')}
                </div>
                <div>Service: {appointment.serviceType}</div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Not Now
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirming...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirm Appointment
                </>
              )}
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

// Time slot returned by getAvailableTimeSlots query
interface TimeSlot {
  startTime: number;
  endTime: number;
  startTimeFormatted: string;
  endTimeFormatted: string;
  available: boolean;
}

export function RescheduleAppointmentModal({
  isOpen,
  onClose,
  appointment,
  onAppointmentRescheduled,
}: RescheduleAppointmentModalProps) {
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot | null>(null)
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Get available time slots for the physiotherapist
  const availableSlots = useQuery(
    api.appointments.getAvailableTimeSlots,
    appointment && selectedDate
      ? {
          physiotherapistId: appointment.physiotherapistId as Id<'users'>,
          date: selectedDate,
        }
      : 'skip'
  )

  const rescheduleAppointment = useMutation(api.appointments.requestAppointmentReschedule)

  useEffect(() => {
    if (isOpen) {
      setSelectedDate('')
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
        newStartTime: selectedTimeSlot.startTime,
        newEndTime: selectedTimeSlot.endTime,
        reason: reason || undefined,
      })

      if (result.success) {
        toast.success(result.message)
        onAppointmentRescheduled()
        onClose()
      }
    } catch (error) {
      console.error('Error rescheduling appointment:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to reschedule appointment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getNextAvailableDates = () => {
    const dates = []
    for (let i = 1; i <= 14; i++) { // Next 2 weeks
      const date = addDays(new Date(), i)
      dates.push({
        value: format(date, 'yyyy-MM-dd'),
        label: format(date, 'EEEE, MMMM do'),
      })
    }
    return dates
  }

  if (!appointment) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Reschedule Appointment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Appointment Info */}
          <Card className="bg-gray-50">
            <CardContent className="p-4">
              <p className="font-medium text-gray-800 mb-2">Current Appointment:</p>
              <div className="text-sm text-gray-600 space-y-1">
                <div>{format(new Date(appointment.startTime), 'EEEE, MMMM do, yyyy')}</div>
                <div>
                  {format(new Date(appointment.startTime), 'h:mm a')} -{' '}
                  {format(new Date(appointment.endTime), 'h:mm a')}
                </div>
                <div>{appointment.serviceType}</div>
              </div>
            </CardContent>
          </Card>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Date Selection */}
            <div className="space-y-2">
              <Label htmlFor="date">New Date *</Label>
              <Select value={selectedDate} onValueChange={setSelectedDate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select new appointment date" />
                </SelectTrigger>
                <SelectContent>
                  {getNextAvailableDates().map((date) => (
                    <SelectItem key={date.value} value={date.value}>
                      {date.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time Slot Selection */}
            {selectedDate && (
              <div className="space-y-2">
                <Label>Available Time Slots *</Label>
                {availableSlots === undefined ? (
                  <div className="flex items-center gap-2 p-4 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading available slots...
                  </div>
                ) : availableSlots?.length === 0 ? (
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-center text-gray-500">
                        No available slots for this date. Please select a different date.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                    {availableSlots?.map((slot: TimeSlot, index: number) => (
                      <Button
                        key={index}
                        type="button"
                        variant={selectedTimeSlot?.startTime === slot.startTime ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedTimeSlot(slot)}
                        className="justify-start"
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        {slot.startTimeFormatted}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Reason */}
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

            {/* Form Actions */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!selectedTimeSlot || isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Rescheduling...
                  </>
                ) : (
                  'Reschedule Appointment'
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
} 