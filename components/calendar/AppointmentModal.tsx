 'use client'

import { useState, useEffect } from 'react'
import { ConvexError } from 'convex/values'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { 
  Calendar, 
  Clock, 
  User, 
  FileText,
  Video
} from '@/components/icons'
import { toast } from 'sonner'
import { Id } from '@/convex/_generated/dataModel'
import { PatientProfileMiniCard } from '@/components/dashboard/physiotherapist/PatientProfileMiniCard'
import { useQueryUntyped, useMutationUntyped } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { lagosDate, lagosTimeRange, zonedDateKey, zonedDateTimeToUtc, zonedTimeKey } from '@/convex/helpers/lagosTime'
import {
  AppointmentPlace,
  AppointmentStatusBadge,
  PhysioAppointmentActions,
  type AppointmentLike,
} from '@/components/appointments/appointment-ui'



interface AppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  selectedDate: Date
  onAppointmentCreated: () => void
  appointmentId?: string
}

interface PatientOption {
  _id: string
  firstName: string
  lastName: string
  email: string
}

  // Lightweight types to safely read getAppointmentDetails response without deep generics
type AppointmentCore = {
  patientId: string
  startTime: number
  endTime: number
  serviceType: string
  notesForPatient?: string | null
  notesForTherapist?: string | null
  manualMeetingLink?: string | null
}

type ExistingAppointmentResult = {
  appointment: AppointmentCore
  sessionLog?: unknown
}

const SERVICE_TYPES = [
  'Initial Consultation',
  'Follow-up Session',
  'Physical Assessment',
  'Exercise Therapy',
  'Manual Therapy',
  'Rehabilitation Session',
  'Progress Review',
  'Discharge Planning',
]

export function AppointmentModal({
  isOpen,
  onClose,
  selectedDate,
  onAppointmentCreated,
  appointmentId,
}: AppointmentModalProps) {
  // Date and times are typed as Lagos wall-clock time, whatever zone the browser is in
  const [formData, setFormData] = useState({
    patientId: '',
    date: zonedDateKey(selectedDate.getTime()),
    startTime: zonedTimeKey(selectedDate.getTime()),
    endTime: zonedTimeKey(selectedDate.getTime() + 60 * 60 * 1000),
    serviceType: '',
    notesForPatient: '',
    notesForTherapist: '',
    manualMeetingLink: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Get current user's patients (avoid deep type instantiation by indexing api via unknown maps)
  const apiRoot = api as unknown as Record<string, unknown>
  const patientsModule = apiRoot['patients'] as Record<string, unknown>
  const getMyPatientsQuery = patientsModule['getMyPatientOptions']
  // Only loaded while the dialog is open (it stays mounted on the calendar)
  const patients = useQueryUntyped(getMyPatientsQuery, isOpen ? {} : 'skip') as PatientOption[] | undefined

  // Get existing appointment details if editing (use untyped to avoid deep instantiation)
  const appointmentsModule = apiRoot['appointments'] as Record<string, unknown>
  const getAppointmentDetailsQuery = appointmentsModule['getAppointmentDetails']
  const existingAppointment = useQueryUntyped(
    getAppointmentDetailsQuery,
    appointmentId ? { appointmentId: appointmentId as Id<'appointments'> } : 'skip'
  ) as ExistingAppointmentResult | undefined

  // Mutations (resolve via untyped indexing to avoid deep generic expansion)
  const createAppointmentMutation = (appointmentsModule as Record<string, unknown>)[
    'createAppointment'
  ]
  const createAppointment = useMutationUntyped(createAppointmentMutation)

  // Update form data when selectedDate changes
  useEffect(() => {
    if (!appointmentId) {
      setFormData(prev => ({
        ...prev,
        date: zonedDateKey(selectedDate.getTime()),
        startTime: zonedTimeKey(selectedDate.getTime()),
        endTime: zonedTimeKey(selectedDate.getTime() + 60 * 60 * 1000),
        manualMeetingLink: '',
      }))
    }
  }, [selectedDate, appointmentId])

  // An existing appointment opens as details with its actions (see below), not this form

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  const validateForm = (): boolean => {
    if (!formData.patientId) {
      toast.error('Please select a patient')
      return false
    }
    if (!formData.serviceType) {
      toast.error('Please select a service type')
      return false
    }
    if (!formData.date || !formData.startTime || !formData.endTime) {
      toast.error('Please fill in all date and time fields')
      return false
    }

    // Validate that end time is after start time
    const startDateTime = zonedDateTimeToUtc(formData.date, formData.startTime)
    const endDateTime = zonedDateTimeToUtc(formData.date, formData.endTime)

    if (endDateTime <= startDateTime) {
      toast.error('End time must be after start time')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    setIsSubmitting(true)

    try {
      // Create new appointment (the times are Lagos wall-clock time)
      await createAppointment({
        patientId: formData.patientId as Id<'users'>,
        startTime: zonedDateTimeToUtc(formData.date, formData.startTime),
        endTime: zonedDateTimeToUtc(formData.date, formData.endTime),
        serviceType: formData.serviceType,
        notesForPatient: formData.notesForPatient || undefined,
        notesForTherapist: formData.notesForTherapist || undefined,
        manualMeetingLink: formData.manualMeetingLink || undefined,
        // A typed meeting link means a video visit; otherwise it's in person
        appointmentType: formData.manualMeetingLink ? 'telehealth' : 'in-person',
      })

      playSound('booked')
      toast.success('Appointment created successfully')

      onAppointmentCreated()
      onClose()
    } catch (error) {
      console.error('Error saving appointment:', error)
      // ConvexError carries a readable reason, e.g. a Rehabify patient who pays per session
      toast.error(
        error instanceof ConvexError && typeof error.data === 'string'
          ? error.data
          : error instanceof Error
            ? error.message
            : 'Failed to save appointment'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
    onClose()
  }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {appointmentId ? 'Appointment' : 'Create New Appointment'}
          </DialogTitle>
          <DialogDescription>
            {appointmentId
              ? 'Status, place and what you can do next. Times are Lagos time.'
              : 'Schedule a new appointment with your patient.'
            }
          </DialogDescription>
        </DialogHeader>

        {appointmentId ? (
          <ExistingAppointmentDetails details={existingAppointment} onClose={onClose} />
        ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Patient Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium mb-2 block">
              Patient *
            </label>
            <Select 
              value={formData.patientId} 
              onValueChange={(value) => handleInputChange('patientId', value)}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                <SelectValue placeholder="Select a patient" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {patients?.map((patient) => (
                  <SelectItem key={patient._id} value={patient._id}>
                    {patient.firstName} {patient.lastName} ({patient.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formData.patientId && (
              <div className="mt-3">
                <PatientProfileMiniCard patientId={formData.patientId as Id<'users'>} />
              </div>
            )}
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium mb-2 block">
                Date *
              </label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => handleInputChange('date', e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium mb-2 block">
                Start Time *
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="startTime"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => handleInputChange('startTime', e.target.value)}
                  disabled={isSubmitting}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium mb-2 block">
                End Time *
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="endTime"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => handleInputChange('endTime', e.target.value)}
                  disabled={isSubmitting}
                  className="pl-10"
                  required
                />
              </div>
            </div>
          </div>

          {/* Service Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium mb-2 block">
              Service Type *
            </label>
            <Select 
              value={formData.serviceType} 
              onValueChange={(value) => handleInputChange('serviceType', value)}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select service type" />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((service) => (
                  <SelectItem key={service} value={service}>
                    {service}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Meeting Link */}
          <div className="space-y-2">
            <label className="text-sm font-medium mb-2 block">
              Meeting Link (Optional)
            </label>
            <div className="relative">
              <Video className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="manualMeetingLink"
                placeholder="e.g., Google Meet or Zoom link"
                value={formData.manualMeetingLink}
                onChange={(e) => handleInputChange('manualMeetingLink', e.target.value)}
                disabled={isSubmitting}
                className="pl-10"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium mb-2 block">
                Notes for Patient
              </label>
              <Textarea
                id="notesForPatient"
                placeholder="Any instructions or information for the patient..."
                value={formData.notesForPatient}
                onChange={(e) => handleInputChange('notesForPatient', e.target.value)}
                disabled={isSubmitting}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium mb-2 block">
                Private Notes
              </label>
              <Textarea
                id="notesForTherapist"
                placeholder="Private notes for yourself..."
                value={formData.notesForTherapist}
                onChange={(e) => handleInputChange('notesForTherapist', e.target.value)}
                disabled={isSubmitting}
                rows={3}
              />
            </div>
          </div>

          {/* Appointment Summary */}
          {formData.patientId && formData.date && formData.startTime && formData.endTime && (
            <div className="p-4 bg-rh-lime/5 rounded-lg">
              <h4 className="font-medium text-rh-ink mb-2">Appointment Summary</h4>
              <div className="text-sm text-rh-ink space-y-1">
                                 <p>
                   <strong>Patient:</strong>{' '}
                   {(() => {
                     const patient = patients?.find(p => p._id === formData.patientId);
                     return patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown Patient';
                   })()}
                 </p>
                <p>
                  <strong>Date:</strong> {lagosDate(zonedDateTimeToUtc(formData.date, '12:00'))}
                </p>
                <p>
                  <strong>Time:</strong> {formData.startTime} - {formData.endTime}
                </p>
                {formData.serviceType && (
                  <p>
                    <strong>Service:</strong> {formData.serviceType}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Creating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Create Appointment
                </>
              )}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * A booked visit opened from the calendar: who, when (Lagos time), where, its status, and the
 * physio's actions (accept, decline, propose another time, cancel, mark completed).
 */
function ExistingAppointmentDetails({
  details,
  onClose,
}: {
  details: ExistingAppointmentResult | undefined
  onClose: () => void
}) {
  if (details === undefined) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading appointment…
      </div>
    )
  }

  const apt = details.appointment as unknown as AppointmentLike & {
    notesForPatient?: string | null
    notesForTherapist?: string | null
    cancellationReason?: string
    patient?: { _id?: string; firstName?: string; lastName?: string; email?: string } | null
  }
  const patientName = [apt.patient?.firstName, apt.patient?.lastName].filter(Boolean).join(' ') || 'Patient'

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900 dark:text-white">{patientName}</p>
          <p className="text-sm text-gray-500">{apt.serviceType}</p>
        </div>
        <AppointmentStatusBadge appointment={apt} viewer="provider" />
      </div>

      <div className="space-y-2 rounded-lg bg-rh-lime/5 p-4 text-sm text-rh-ink dark:text-neutral-200">
        <p className="flex items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0" />
          {lagosDate(apt.startTime)}
        </p>
        <p className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0" />
          {lagosTimeRange(apt.startTime, apt.endTime)}
        </p>
        <AppointmentPlace appointment={apt} viewer="provider" />
      </div>

      {(apt.notesForTherapist || apt.notesForPatient || apt.cancellationReason) && (
        <div className="space-y-1 text-sm text-gray-600 dark:text-neutral-300">
          {apt.notesForTherapist && <p><strong>Notes:</strong> {apt.notesForTherapist}</p>}
          {apt.notesForPatient && <p><strong>For the patient:</strong> {apt.notesForPatient}</p>}
          {apt.cancellationReason && <p><strong>Cancellation reason:</strong> {apt.cancellationReason}</p>}
        </div>
      )}

      <div className="space-y-2">
        <PhysioAppointmentActions appointment={apt} />
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}