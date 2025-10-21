'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Calendar, 
  Clock, 
  User, 
  MapPin, 
  FileText, 
  Phone, 
  Mail, 
  Stethoscope,
  Target,
  Activity,
  MessageSquare,
  Star,
  X,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import Image from 'next/image'
import { format } from 'date-fns'
import { Id } from '@/convex/_generated/dataModel'

interface AppointmentDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  appointmentId: string | null
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
      return <X className="h-4 w-4" />
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

export function AppointmentDetailsModal({
  isOpen,
  onClose,
  appointmentId,
}: AppointmentDetailsModalProps) {
  // Get detailed appointment information
  const appointmentDetails = useQuery(
    api.appointments.getPatientAppointmentDetails,
    appointmentId ? { appointmentId: appointmentId as Id<'appointments'> } : 'skip'
  )

  if (!appointmentId || !appointmentDetails) return null

  const { appointment, physiotherapist, clinic, sessionLog } = appointmentDetails

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Appointment Details
            </div>
            <Badge className={getStatusColor(appointment.status)}>
              <div className="flex items-center gap-1">
                {getStatusIcon(appointment.status)}
                {getStatusLabel(appointment.status)}
              </div>
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="space-y-6 pr-4">
            {/* Appointment Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Appointment Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Date</p>
                        <p className="font-medium">
                          {format(new Date(appointment.startTime), 'EEEE, MMMM do, yyyy')}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Time</p>
                        <p className="font-medium">
                          {format(new Date(appointment.startTime), 'h:mm a')} -{' '}
                          {format(new Date(appointment.endTime), 'h:mm a')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Service Type</p>
                        <p className="font-medium">{appointment.serviceType}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Duration</p>
                        <p className="font-medium">
                          {Math.round((appointment.endTime - appointment.startTime) / (1000 * 60))} minutes
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Physiotherapist Information */}
            {physiotherapist && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Your Physiotherapist
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                      {physiotherapist.imageUrl ? (
                        <Image
                          src={physiotherapist.imageUrl}
                          alt={`${physiotherapist.firstName} ${physiotherapist.lastName}`}
                          width={64}
                          height={64}
                          unoptimized
                          className="w-16 h-16 rounded-full object-cover"
                        />
                      ) : (
                        <User className="h-8 w-8 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <h3 className="font-semibold text-lg">
                        {physiotherapist.firstName} {physiotherapist.lastName}
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gray-500" />
                          <span>{physiotherapist.email}</span>
                        </div>
                        
                        {physiotherapist.specializations && physiotherapist.specializations.length > 0 && (
                          <div className="flex items-center gap-2">
                            <Stethoscope className="h-4 w-4 text-gray-500" />
                            <span>{physiotherapist.specializations.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Clinic Information */}
            {clinic && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Clinic Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <h3 className="font-semibold">{clinic.name}</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {clinic.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                          <span>{clinic.address}</span>
                        </div>
                      )}
                      
                      {clinic.contactPhone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-gray-500" />
                          <span>{clinic.contactPhone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Appointment Notes */}
            {(appointment.notesForPatient || appointment.notesForTherapist) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {appointment.notesForPatient && (
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <h4 className="font-medium text-blue-800 mb-2">Notes from your therapist:</h4>
                      <p className="text-blue-700 text-sm">{appointment.notesForPatient}</p>
                    </div>
                  )}
                  
                  {appointment.notesForTherapist && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <h4 className="font-medium text-gray-800 mb-2">Your notes:</h4>
                      <p className="text-gray-700 text-sm">{appointment.notesForTherapist}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Session Log (if appointment is completed) */}
            {sessionLog && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Session Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sessionLog.subjectiveAssessment && (
                    <div>
                      <h4 className="font-medium text-gray-800 mb-2">Patient Feedback (Subjective)</h4>
                      <p className="text-gray-700 text-sm bg-gray-50 p-3 rounded-lg">
                        {sessionLog.subjectiveAssessment}
                      </p>
                    </div>
                  )}
                  
                  {sessionLog.objectiveAssessment && (
                    <div>
                      <h4 className="font-medium text-gray-800 mb-2">Assessment (Objective)</h4>
                      <p className="text-gray-700 text-sm bg-gray-50 p-3 rounded-lg">
                        {sessionLog.objectiveAssessment}
                      </p>
                    </div>
                  )}
                  
                  {sessionLog.treatmentAdministered && (
                    <div>
                      <h4 className="font-medium text-gray-800 mb-2">Treatment Provided</h4>
                      <p className="text-gray-700 text-sm bg-green-50 p-3 rounded-lg">
                        {sessionLog.treatmentAdministered}
                      </p>
                    </div>
                  )}
                  
                  {sessionLog.planForNextSession && (
                    <div>
                      <h4 className="font-medium text-gray-800 mb-2">Plan for Next Session</h4>
                      <p className="text-gray-700 text-sm bg-blue-50 p-3 rounded-lg">
                        {sessionLog.planForNextSession}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Cancellation Reason */}
            {appointment.cancellationReason && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                    Cancellation Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="text-red-700 text-sm">{appointment.cancellationReason}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pre-appointment Information */}
            {appointment.status === 'scheduled' || appointment.status === 'confirmed' ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5" />
                    Prepare for Your Appointment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <h4 className="font-medium text-blue-800 mb-2">Before your appointment:</h4>
                      <ul className="text-blue-700 space-y-1 list-disc list-inside">
                        <li>Arrive 10-15 minutes early for check-in</li>
                        <li>Bring comfortable clothing suitable for movement</li>
                        <li>Bring any relevant medical documents or imaging</li>
                        <li>Prepare a list of current symptoms or concerns</li>
                        <li>Stay hydrated and avoid heavy meals beforehand</li>
                      </ul>
                    </div>
                    
                    <div className="p-3 bg-green-50 rounded-lg">
                      <h4 className="font-medium text-green-800 mb-2">What to expect:</h4>
                      <ul className="text-green-700 space-y-1 list-disc list-inside">
                        <li>Initial assessment and discussion of your condition</li>
                        <li>Physical examination and movement tests</li>
                        <li>Treatment session tailored to your needs</li>
                        <li>Exercise recommendations and home care instructions</li>
                        <li>Discussion of your treatment plan and next steps</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 