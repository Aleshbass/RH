

'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Plus
} from 'lucide-react'
import { format } from 'date-fns'
import { User as UserType } from '@/app/types'
import { PatientAppointmentBookingModal } from '@/components/patient/PatientAppointmentBookingModal'
import {
  CancelAppointmentModal,
  ConfirmAppointmentModal,
  RescheduleAppointmentModal
} from '@/components/patient/AppointmentActionModals'
import { AppointmentFeedbackModal } from '@/components/patient/AppointmentFeedbackModal'
import { Id } from '@/convex/_generated/dataModel'
import { PatientAppointmentDashboard } from '@/components/appointments/PatientAppointmentDashboard'

interface Appointment {
  _id: string
  patientId: string
  physiotherapistId: string
  clinicId?: string
  startTime: number
  endTime: number
  serviceType: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled_by_patient' | 'cancelled_by_therapist' | 'no_show'
  notesForPatient?: string
  notesForTherapist?: string
  cancellationReason?: string
  feedbackSubmitted?: boolean
  physiotherapistName?: string
  googleMeetLink?: string
  streamMeetingLink?: string
  videoCallId?: string
  appointmentType?: 'in-person' | 'telehealth'
}


export default function PatientAppointmentsPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const [activeTab, setActiveTab] = useState('upcoming')

  // Modal states
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)

  const user = useQuery(api.users.getMyUser) as UserType | null | undefined
  const allAppointments = useQuery(api.appointments.getPatientAppointments, {
    limit: 100,
  })

  // Stable filtering with useMemo
  const { upcoming, past } = useMemo(() => {
    if (!allAppointments) return { upcoming: [], past: [] }

    const now = Date.now()
    const upcomingList = allAppointments.filter((apt: { startTime: number; status: string }) =>
      apt.startTime >= now && ['scheduled', 'confirmed'].includes(apt.status)
    ).sort((a: { startTime: number }, b: { startTime: number }) => a.startTime - b.startTime)

    const pastList = allAppointments.filter((apt: { startTime: number; status: string }) =>
      apt.startTime < now || ['completed', 'cancelled_by_patient', 'cancelled_by_therapist', 'no_show'].includes(apt.status)
    ).sort((a: { startTime: number }, b: { startTime: number }) => b.startTime - a.startTime)

    return { upcoming: upcomingList, past: pastList }
  }, [allAppointments])

  // Stable redirect logic
  useEffect(() => {
    if (!isLoaded) return

    if (!isSignedIn) {
      router.push('/sign-in')
      return
    }

    if (user && user.role !== 'patient') {
      router.push('/dashboard')
    }
  }, [isLoaded, isSignedIn, user, router])

  // Modal handlers
  const handleBookingComplete = () => {
    // Appointments will refresh automatically due to Convex reactivity
  }

  const handleCancel = (appointment: Appointment) => {
    setSelectedAppointment(appointment)
    setIsCancelModalOpen(true)
  }

  const handleReschedule = (appointment: Appointment) => {
    setSelectedAppointment(appointment)
    setIsRescheduleModalOpen(true)
  }

  const handleConfirm = (appointment: Appointment) => {
    setSelectedAppointment(appointment)
    setIsConfirmModalOpen(true)
  }

  const handleActionComplete = () => {
    // Appointments will refresh automatically due to Convex reactivity
    setSelectedAppointment(null)
  }

  // Add state for feedback modal
  const [feedbackModal, setFeedbackModal] = useState<{
    isOpen: boolean
    appointment: Appointment | null
  }>({
    isOpen: false,
    appointment: null
  })



  if (!isLoaded || user === undefined || allAppointments === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">Loading your appointments...</p>
        </div>
      </div>
    )
  }

  if (user === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-600">User not found. Please try signing in again.</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Appointment Booking Modal */}
      <PatientAppointmentBookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        onAppointmentBooked={handleBookingComplete}
      />

      {/* Cancel Appointment Modal */}
      <CancelAppointmentModal
        isOpen={isCancelModalOpen}
        onClose={() => {
          setIsCancelModalOpen(false)
          setSelectedAppointment(null)
        }}
        appointment={selectedAppointment}
        onAppointmentCancelled={handleActionComplete}
      />

      {/* Confirm Appointment Modal */}
      <ConfirmAppointmentModal
        isOpen={isConfirmModalOpen}
        onClose={() => {
          setIsConfirmModalOpen(false)
          setSelectedAppointment(null)
        }}
        appointment={selectedAppointment}
        onAppointmentConfirmed={handleActionComplete}
      />

      {/* Reschedule Appointment Modal */}
      <RescheduleAppointmentModal
        isOpen={isRescheduleModalOpen}
        onClose={() => {
          setIsRescheduleModalOpen(false)
          setSelectedAppointment(null)
        }}
        appointment={selectedAppointment}
        onAppointmentRescheduled={handleActionComplete}
      />

      {/* Feedback Modal */}
      {feedbackModal.appointment && (
        <AppointmentFeedbackModal
          isOpen={feedbackModal.isOpen}
          onClose={() => setFeedbackModal({ isOpen: false, appointment: null })}
          appointmentId={feedbackModal.appointment._id as Id<"appointments">}
          physiotherapistName={feedbackModal.appointment.physiotherapistName ?? ''}
          appointmentDate={feedbackModal.appointment.startTime.toString()}
          serviceType={feedbackModal.appointment.serviceType}
        />
      )}

      <PatientAppointmentDashboard
        appointments={allAppointments || []}
        onNewAppointment={() => setIsBookingModalOpen(true)}
        onCancel={handleCancel}
        onReschedule={handleReschedule}
        onConfirm={handleConfirm}
        onRateVisit={(apt) => setFeedbackModal({ isOpen: true, appointment: apt })}
      />
    </div>
  )
}