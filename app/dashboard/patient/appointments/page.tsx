

'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Calendar,
  Clock,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Plus,
  User,
  MapPin,
  Star,
} from 'lucide-react'
import { format } from 'date-fns'
import { User as UserType } from '@/app/types'
import { AppointmentBookingModal } from '@/components/patient/AppointmentBookingModal'
import { 
  CancelAppointmentModal, 
  ConfirmAppointmentModal, 
  RescheduleAppointmentModal 
} from '@/components/patient/AppointmentActionModals'
import { AppointmentFeedbackModal } from '@/components/patient/AppointmentFeedbackModal'

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
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'scheduled':
      return <Clock className="h-4 w-4" />
    case 'confirmed':
      return <CheckCircle className="h-4 w-4" />
    case 'completed':
      return <CheckCircle className="h-4 w-4" />
    case 'cancelled_by_patient':
    case 'cancelled_by_therapist':
      return <XCircle className="h-4 w-4" />
    case 'no_show':
      return <AlertCircle className="h-4 w-4" />
    default:
      return <Clock className="h-4 w-4" />
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'scheduled':
      return 'bg-blue-100 text-blue-800'
    case 'confirmed':
      return 'bg-green-100 text-green-800'
    case 'completed':
      return 'bg-gray-100 text-gray-800'
    case 'cancelled_by_patient':
    case 'cancelled_by_therapist':
      return 'bg-red-100 text-red-800'
    case 'no_show':
      return 'bg-orange-100 text-orange-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'scheduled':
      return 'Scheduled'
    case 'confirmed':
      return 'Confirmed'
    case 'completed':
      return 'Completed'
    case 'cancelled_by_patient':
      return 'Cancelled by You'
    case 'cancelled_by_therapist':
      return 'Cancelled by Therapist'
    case 'no_show':
      return 'No Show'
    default:
      return 'Unknown'
  }
}

function AppointmentCard({ 
  appointment, 
  onCancel, 
  onReschedule, 
  onConfirm 
}: { 
  appointment: Appointment
  onCancel: (appointment: Appointment) => void
  onReschedule: (appointment: Appointment) => void
  onConfirm: (appointment: Appointment) => void
}) {
  const startDate = new Date(appointment.startTime)
  const endDate = new Date(appointment.endTime)

  const canCancel = appointment.status === 'scheduled' || appointment.status === 'confirmed'
  const canReschedule = appointment.status === 'scheduled'
  const canConfirm = appointment.status === 'scheduled'

  return (
    <Card className="mb-4 hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            {appointment.serviceType}
          </CardTitle>
          <Badge className={getStatusColor(appointment.status)}>
            <div className="flex items-center gap-1">
              {getStatusIcon(appointment.status)}
              {getStatusLabel(appointment.status)}
            </div>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4" />
            <span>
              {format(startDate, 'EEEE, MMMM do, yyyy')}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="h-4 w-4" />
            <span>
              {format(startDate, 'h:mm a')} - {format(endDate, 'h:mm a')}
            </span>
          </div>
        </div>

        {appointment.notesForPatient && (
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800">Notes from your therapist:</p>
                <p className="text-sm text-blue-700">{appointment.notesForPatient}</p>
              </div>
            </div>
          </div>
        )}

        {appointment.cancellationReason && (
          <div className="p-3 bg-red-50 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Cancellation Reason:</p>
                <p className="text-sm text-red-700">{appointment.cancellationReason}</p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          {canConfirm && (
            <Button 
              variant="default" 
              size="sm"
              onClick={() => onConfirm(appointment)}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirm
            </Button>
          )}
          {canReschedule && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onReschedule(appointment)}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Reschedule
            </Button>
          )}
          {canCancel && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onCancel(appointment)}
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}
          {appointment.status === 'completed' && !appointment.feedbackSubmitted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openFeedbackModal(appointment)}
              className="hover:bg-yellow-50 hover:border-yellow-300"
            >
              <Star className="w-4 h-4 mr-1" />
              Rate Visit
            </Button>
          )}
          <Button variant="ghost" size="sm">
            <FileText className="h-4 w-4 mr-2" />
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function AppointmentsSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-6 w-20" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-16 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
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
    const upcomingList = allAppointments.filter(apt => 
      apt.startTime >= now && ['scheduled', 'confirmed'].includes(apt.status)
    ).sort((a, b) => a.startTime - b.startTime)
    
    const pastList = allAppointments.filter(apt => 
      apt.startTime < now || ['completed', 'cancelled_by_patient', 'cancelled_by_therapist', 'no_show'].includes(apt.status)
    ).sort((a, b) => b.startTime - a.startTime)
    
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
  }, [isLoaded, isSignedIn, user?.role, router])

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
    appointment: any | null
  }>({
    isOpen: false,
    appointment: null
  })

  // Add function to open feedback modal
  const openFeedbackModal = (appointment: any) => {
    setFeedbackModal({
      isOpen: true,
      appointment
    })
  }

  if (!isLoaded || user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading your appointments...</p>
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
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Appointments</h1>
          <p className="text-gray-600 mt-1">View and manage your physiotherapy appointments</p>
        </div>
        <Button onClick={() => setIsBookingModalOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Book Appointment
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upcoming" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Upcoming ({upcoming.length})
          </TabsTrigger>
          <TabsTrigger value="past" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Past ({past.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-6">
          {!allAppointments ? (
            <AppointmentsSkeleton />
          ) : upcoming.length > 0 ? (
            <div className="space-y-4">
              {upcoming.map((appointment) => (
                <AppointmentCard 
                  key={appointment._id} 
                  appointment={appointment} 
                  onCancel={handleCancel}
                  onReschedule={handleReschedule}
                  onConfirm={handleConfirm}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No upcoming appointments</h3>
                <p className="text-gray-600 mb-4 text-center">
                  You don't have any scheduled appointments. Book your next session to continue your therapy.
                </p>
                <Button onClick={() => setIsBookingModalOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Book Your Next Appointment
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-6">
          {!allAppointments ? (
            <AppointmentsSkeleton />
          ) : past.length > 0 ? (
            <div className="space-y-4">
              {past.map((appointment) => (
                <AppointmentCard 
                  key={appointment._id} 
                  appointment={appointment}
                  onCancel={handleCancel}
                  onReschedule={handleReschedule}
                  onConfirm={handleConfirm}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No appointment history</h3>
                <p className="text-gray-600">Your completed appointments will appear here.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Appointment Booking Modal */}
      <AppointmentBookingModal
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
          appointmentId={feedbackModal.appointment._id}
          physiotherapistName={feedbackModal.appointment.physiotherapistName}
          appointmentDate={feedbackModal.appointment.startTime}
          serviceType={feedbackModal.appointment.serviceType}
        />
      )}
    </div>
  )
}