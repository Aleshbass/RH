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
import { api } from '@/convex/_generated/api'
import { useQueryUntyped } from '@/lib/convexUntyped'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { QuickActions } from '@/components/dashboard/shared/QuickActions'
import { RecentSessions } from '@/components/dashboard/physiotherapist/RecentSessions'
import EnhancedPatientInviteModal from '@/components/dashboard/shared/EnhancedPatientInviteModal'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
 
 

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

type ClinicInfo = {
  name?: string;
  staffRole?: string;
  joinedAt?: number;
  address?: string;
  owner?: { firstName?: string; lastName?: string };
  contactEmail?: string;
} | null;

type DashboardStats = {
  completedSessionsThisWeek?: number;
  totalPatients?: number;
  todaysAppointments?: number;
  pendingInvitations?: number;
} | null;

export function PhysiotherapistDashboardV2() {
  // Avoid deep generic instantiation by routing through an any-cast handle
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiAny = api as unknown as any
  // Only the firstName is used in the header; keep a minimal shape
  const user = useQueryUntyped(apiAny.users.getMyUser) as { firstName?: string } | null | undefined
  
  // Use the existing getCurrentUser query to get profile information
  const currentUserWithProfile = useQueryUntyped(apiAny.queries.getCurrentUser) as unknown | null | undefined
  
  // Get clinic information if user is clinic staff
  const clinicInfo = useQueryUntyped(apiAny.clinics.getMyClinicInfo) as ClinicInfo | undefined
  
  // Use direct Convex queries instead of custom hooks that depend on auth store
  const dashboardStats = useQueryUntyped(apiAny.patients.getDashboardStats, {}) as DashboardStats | undefined
  const patientsData = useQueryUntyped(apiAny.patients.getMyPatients, { limit: 10 }) as Patient[] | undefined
  const todaysAppointmentsData = useQueryUntyped(apiAny.appointments.getMyAppointments, {
    startDate: new Date().setHours(0, 0, 0, 0),
    endDate: new Date().setHours(23, 59, 59, 999),
    limit: 5
  }) as Appointment[] | undefined

  // Recent session logs
  const recentSessionsData = useQueryUntyped(apiAny.sessionLogs.getMySessionLogs, { limit: 5 }) as Array<{
    _id: string;
    sessionDate: number;
    patient?: { firstName?: string; lastName?: string } | null;
  }> | undefined
  
  // Transform the data to match the RecentSessions prop type exactly
  type RecentSession = {
    _id: string;
    sessionDate: number;
    patient?: { firstName: string; lastName: string };
  };
  const recentSessions: RecentSession[] = (recentSessionsData?.map((session) => ({
    _id: session._id,
    sessionDate: session.sessionDate,
    patient: session.patient
      ? {
          firstName: session.patient.firstName || '',
          lastName: session.patient.lastName || '',
        }
      : undefined,
  })) || [])

  // Router for navigation in quick actions
  const router = useRouter()

  // Patient invitation modal state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  // Type the data with fallbacks
  const patients = (patientsData || []) as Patient[]
  const todaysAppointments = (todaysAppointmentsData || []) as Appointment[]

  // Invitation is now handled entirely within EnhancedPatientInviteModal

  const handleInvitePatient = () => setIsInviteModalOpen(true)
  const handleScheduleAppointment = () => router.push('/dashboard/physiotherapist/calendar?new=1')
  const handleCreateSession = () => router.push('/dashboard/physiotherapist/calendar')
  const handleManagePatients = () => router.push('/dashboard/physiotherapist/patients')
  const handleExerciseLibrary = () => router.push('/dashboard/physiotherapist/exercise-library')
  const handleTreatmentTemplates = () => router.push('/dashboard/physiotherapist/treatment-templates')
  const handleAssessments = () => router.push('/dashboard/physiotherapist/assessments')

  // Loading state
  if (user === undefined || dashboardStats === undefined || currentUserWithProfile === undefined || patientsData === undefined || todaysAppointmentsData === undefined || clinicInfo === undefined) {
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
  const isClinicBased = clinicInfo !== null;
  const patientCount = dashboardStats?.totalPatients || 0
  const todaysAppointmentCount = dashboardStats?.todaysAppointments || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#005b57]"> 
            Welcome back, {user?.firstName || 'User'}!
          </h1>
          <p className="text-muted-foreground">
            {isClinicBased ? (
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Physiotherapist at {clinicInfo?.name || 'Clinic'}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4" />
                Independent Physiotherapist
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:self-auto">
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

      

      {/* Enhanced Clinic Context Card for Clinic-based Physiotherapists */}
      {isClinicBased && clinicInfo && (
        <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-full">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg text-blue-900">
                  {clinicInfo.name}
                </CardTitle>
                <CardDescription className="text-blue-700">
                  You are a staff physiotherapist at this clinic
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-blue-800 capitalize">
                  {clinicInfo.staffRole?.replace('_', ' ') || 'Physiotherapist'}
                </div>
                {clinicInfo.joinedAt && (
                  <div className="text-xs text-blue-600">
                    Joined {format(new Date(clinicInfo.joinedAt), 'MMM yyyy')}
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {clinicInfo.address && (
                <div className="flex items-center gap-2 text-blue-800">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span><strong>Location:</strong> {clinicInfo.address}</span>
                </div>
              )}
              {clinicInfo.owner && (
                <div className="flex items-center gap-2 text-blue-800">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span><strong>Clinic Owner:</strong> {clinicInfo.owner.firstName} {clinicInfo.owner.lastName}</span>
                </div>
              )}
              {clinicInfo.contactEmail && (
                <div className="flex items-center gap-2 text-blue-800">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span><strong>Contact:</strong> {clinicInfo.contactEmail}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-blue-800">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span><strong>Status:</strong> Active Staff Member</span>
              </div>
            </div>
            <div className="mt-3 p-3 bg-blue-100 rounded-lg">
              <p className="text-xs text-blue-800">
                <strong>Note:</strong> Your patients, appointments, and treatment plans are managed within this clinic&apos;s system. 
                You have your own individual dashboard with full access to manage your assigned patients.
              </p>
            </div>
          </CardContent>
        </Card>
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
          onExerciseLibrary={handleExerciseLibrary}
          onTreatmentTemplates={handleTreatmentTemplates}
          onAssessments={handleAssessments}
        />

        {/* Recent Sessions */}
        <RecentSessions
          recentSessions={recentSessions}
          onViewAll={() => router.push('/dashboard/physiotherapist/patients')}
          onViewSession={(sessionId: string) => router.push(`/dashboard/physiotherapist/session-logs/${sessionId}`)}
        />
      </div>

      {/* Patient Invitation Modal - enhanced multi-method */}
      <EnhancedPatientInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
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