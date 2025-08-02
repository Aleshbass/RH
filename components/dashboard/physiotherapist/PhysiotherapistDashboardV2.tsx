'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Calendar, 
  Users, 
  FileText, 
  Clock, 
  UserPlus,
  Bell,
  Stethoscope,
  Building2,
  AlertCircle
} from 'lucide-react'
import { format } from 'date-fns'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { QuickActions } from '@/components/dashboard/shared/QuickActions'
import { RecentSessions } from '@/components/dashboard/physiotherapist/RecentSessions'
import { PatientInviteModal } from '@/components/dashboard/clinic-owner/PatientInviteModal'
import { toast } from 'sonner'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'convex/react'

// Type definitions for better type safety
interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl?: string;
  phoneNumber?: string;
  relationship: {
    isPrimary: boolean;
    startDate: number;
    status: string;
  };
  profile?: unknown;
  stats: {
    appointmentCount: number;
    lastSessionDate?: number;
  };
}

interface Appointment {
  _id: string;
  startTime: number;
  endTime?: number;
  serviceType: string;
  patient?: {
    firstName: string;
    lastName: string;
  };
}

export function PhysiotherapistDashboardV2() {
  const user = useQuery(api.users.getMyUser)
  
  // Use the existing getCurrentUser query to get profile information
  const currentUserWithProfile = useQuery(api.queries.getCurrentUser)
  
  // Use direct Convex queries instead of custom hooks that depend on auth store
  const dashboardStats = useQuery(api.patients.getDashboardStats, {})
  const patientsData = useQuery(api.patients.getMyPatients, { limit: 10 })
  const todaysAppointmentsData = useQuery(api.appointments.getMyAppointments, {
    startDate: new Date().setHours(0, 0, 0, 0),
    endDate: new Date().setHours(23, 59, 59, 999),
    limit: 5
  })

  // Recent session logs
  const recentSessionsData = useQuery(api.sessionLogs.getMySessionLogs, { limit: 5 })
  
  // Transform the data to match the expected interface
  const recentSessions = recentSessionsData?.map(session => ({
    _id: session._id,
    sessionDate: session.sessionDate,
    patient: session.patient ? {
      firstName: session.patient.firstName || '',
      lastName: session.patient.lastName || ''
    } : undefined
  }))

  // Router for navigation in quick actions
  const router = useRouter()

  // Patient invitation modal state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  // Mutation for creating patient invitation
  const createPatientInvitationWithEmail = useAction(api.actions.patients.invitePatient.createPatientInvitationWithNotification)

  // Type the data with fallbacks
  const patients = (patientsData || []) as Patient[]
  const todaysAppointments = (todaysAppointmentsData || []) as Appointment[]

  const handleInviteSubmit = async (data: { patientEmail: string; patientName?: string; notes?: string }): Promise<boolean> => {
    try {
      const result = await createPatientInvitationWithEmail({
        patientEmail: data.patientEmail,
        patientName: data.patientName,
        notes: data.notes,
        sendEmail: true // Enable email sending
      })
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to send invitation')
      }
      
      toast.success('Invitation sent successfully')
      return true
    } catch (error: unknown) {
      console.error('Failed to send invitation', error)
      toast.error(error instanceof Error ? error.message : 'Failed to send invitation')
      return false
    }
  }

  const handleInvitePatient = () => setIsInviteModalOpen(true)
  const handleScheduleAppointment = () => router.push('/dashboard/physiotherapist/appointments')
  const handleCreateSession = () => router.push('/dashboard/physiotherapist/calendar')
  const handleManagePatients = () => router.push('/dashboard/physiotherapist/patients')

  // Loading state
  if (user === undefined || dashboardStats === undefined || currentUserWithProfile === undefined || patientsData === undefined || todaysAppointmentsData === undefined) {
    return <PhysiotherapistDashboardSkeleton />
  }

  // Error state - if user is null, they're not found in the database
  if (user === null) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            User not found. Please try signing in again.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Determine if physiotherapist is clinic-based from their profile
  const isClinicBased = currentUserWithProfile?.clinicId ? true : false;
  const clinicInfo = currentUserWithProfile?.clinic;
  const patientCount = dashboardStats?.totalPatients || 0
  const todaysAppointmentCount = dashboardStats?.todaysAppointments || 0

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {user?.firstName || 'User'}!
          </h1>
          <p className="text-muted-foreground">
            {isClinicBased ? (
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {clinicInfo?.name || 'Clinic-based'} Physiotherapist
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4" />
                Independent Physiotherapist
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </Button>
          <Button onClick={handleInvitePatient}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Patient
          </Button>
        </div>
      </div>

      {/* Clinic Context Alert for Clinic-based Physiotherapists */}
      {isClinicBased && clinicInfo && (
        <Alert className="border-blue-200 bg-blue-50">
          <Building2 className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            You are working under <strong>{clinicInfo.name}</strong>. 
            Your patients and appointments are managed within this clinic&apos;s system.
            {clinicInfo.address && ` Located at ${clinicInfo.address}.`}
          </AlertDescription>
        </Alert>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isClinicBased ? 'My Patients' : 'Total Patients'}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{patientCount}</div>
            <p className="text-xs text-muted-foreground">
              {isClinicBased 
                ? 'Assigned to you' 
                : patientCount > 0 ? 'Active patients' : 'No patients yet'
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s Schedule</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todaysAppointmentCount}</div>
            <p className="text-xs text-muted-foreground">
              {todaysAppointmentCount === 1 ? 'appointment' : 'appointments'} today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isClinicBased ? 'Sessions This Week' : 'Completed Sessions'}
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardStats?.completedSessionsThisWeek || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {isClinicBased ? 'This week' : 'Total completed'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isClinicBased ? 'Clinic Status' : 'Pending Invites'}
            </CardTitle>
            {isClinicBased ? (
              <Building2 className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isClinicBased ? (
                <span className="text-green-600">Active</span>
              ) : (
                dashboardStats?.pendingInvitations || 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {isClinicBased ? 'Member status' : 'Patient invitations'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Today&apos;s Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Today&apos;s Schedule
            </CardTitle>
            <CardDescription>
              Your appointments for {format(new Date(), 'EEEE, MMMM do')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {todaysAppointments.length === 0 ? (
                <div className="text-center py-6">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-gray-600 mb-2">No appointments scheduled for today</p>
                  <p className="text-sm text-muted-foreground mb-4">You&apos;re all caught up! Ready to help your patients.</p>
                  <Button variant="outline" size="sm" onClick={handleScheduleAppointment}>
                    Schedule Appointment
                  </Button>
                </div>
              ) : (
                todaysAppointments.slice(0, 3).map((appointment, index: number) => (
                  <div key={appointment._id || index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">
                        {appointment.patient?.firstName} {appointment.patient?.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {appointment.serviceType}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {appointment.startTime ? format(new Date(appointment.startTime), 'HH:mm') : 'TBD'}
                      </p>
                      {appointment.endTime && appointment.startTime && (
                        <p className="text-xs text-muted-foreground">
                          {Math.round((appointment.endTime - appointment.startTime) / (1000 * 60))}m
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Patients */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Recent Patients
            </CardTitle>
            <CardDescription>
              Patients you&apos;ve worked with recently
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {patients.length === 0 ? (
                <div className="text-center py-6">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-gray-600 mb-2">No patients yet</p>
                  <p className="text-sm text-muted-foreground mb-4">Start building your patient base</p>
                  <Button variant="outline" size="sm" onClick={handleInvitePatient}>
                    Invite Patient
                  </Button>
                </div>
              ) : (
                patients.slice(0, 3).map((patient) => (
                  <div key={patient._id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-sm font-medium text-blue-700">
                        {patient.firstName?.[0]}{patient.lastName?.[0]}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">
                        {patient.firstName} {patient.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {patient.stats.appointmentCount} appointments
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Widgets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Quick Actions */}
        <QuickActions
          onInvitePatient={handleInvitePatient}
          onScheduleAppointment={handleScheduleAppointment}
          onCreateSession={handleCreateSession}
          onManagePatients={handleManagePatients}
        />

        {/* Recent Sessions */}
        <RecentSessions
          recentSessions={recentSessions}
          onViewAll={() => router.push('/dashboard/physiotherapist/patients')}
          onViewSession={(sessionId: string) => router.push(`/dashboard/physiotherapist/session-logs/${sessionId}`)}
        />
      </div>

      {/* Patient Invitation Modal */}
      <PatientInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSubmit={handleInviteSubmit}
      />
    </div>
  )
}

function PhysiotherapistDashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex space-x-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      {/* Metrics Skeleton */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Content Grid Skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
} 