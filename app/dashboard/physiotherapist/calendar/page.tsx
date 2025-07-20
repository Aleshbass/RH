'use client';

import { useMyUser, useMyAppointments } from '@/hooks/useDashboardData';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { Badge } from '@/components/ui/badge';
import { EnhancedAppointmentCalendar } from '@/components/calendar/EnhancedAppointmentCalendar';
import { AppointmentModal } from '@/components/calendar/AppointmentModal';
import { SessionLogModal } from '@/components/dashboard/physiotherapist/SessionLogModal';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, startOfDay, endOfDay } from 'date-fns';
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel';

type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled_by_patient' | 'cancelled_by_therapist' | 'no_show';

interface AppointmentWithPatient {
  _id: string;
  patientId: string;
  physiotherapistId: string;
  clinicId?: string;
  startTime: number;
  endTime: number;
  serviceType: string;
  status: AppointmentStatus;
  notesForPatient?: string;
  notesForTherapist?: string;
  cancellationReason?: string;
  patient: {
    _id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    imageUrl?: string;
    phoneNumber?: string;
  } | null;
}

const getStatusColor = (status: AppointmentStatus): string => {
  switch (status) {
    case 'scheduled':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'confirmed':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'completed':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'cancelled_by_patient':
    case 'cancelled_by_therapist':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'no_show':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

export default function CalendarPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithPatient | null>(null);
  const [isSessionLogModalOpen, setIsSessionLogModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');

  // Get current user
  const { data: currentUser, isLoading: userLoading } = useMyUser();
  
  // Calculate date range based on view mode
  const startDate = viewMode === 'week' 
    ? startOfWeek(currentWeek, { weekStartsOn: 1 }).getTime()
    : startOfDay(currentWeek).getTime();
  const endDate = viewMode === 'week' 
    ? endOfWeek(currentWeek, { weekStartsOn: 1 }).getTime()
    : endOfDay(currentWeek).getTime();

  // Get appointments for the current view
  const { data: appointments, isLoading: appointmentsLoading } = useMyAppointments({
    startDate,
    endDate,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 100,
  });

  // Get today's schedule for the sidebar
  const { data: todaysSchedule, isLoading: todaysScheduleLoading } = useMyAppointments({
    startDate: startOfDay(new Date()).getTime(),
    endDate: endOfDay(new Date()).getTime(),
    limit: 50,
  });

  // Mutation for updates
  const updateAppointment = useMutation(api.appointments.updateAppointmentFields)

  const handleAppointmentUpdate = (id: Id<"appointments">, updates: Partial<AppointmentWithPatient>) => {
    updateAppointment({ appointmentId: id, updates })
  }

  const mappedAppointments = (appointments || []).map((apt: any) => ({
    ...apt,
    patient: apt.patient ? {
      _id: String(apt.patient._id),
      firstName: apt.patient.firstName ?? 'Unknown',
      lastName: apt.patient.lastName ?? '',
      email: apt.patient.email ?? '',
      imageUrl: apt.patient.imageUrl,
      phoneNumber: apt.patient.phoneNumber,
    } : null,
  })) as AppointmentWithPatient[]

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  // Redirect if not physiotherapist
  useEffect(() => {
    if (currentUser && currentUser.role !== 'physiotherapist') {
      router.push('/dashboard');
    }
  }, [currentUser, router]);

  // Loading state
  if (!isLoaded || userLoading || appointmentsLoading || todaysScheduleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading calendar...</p>
        </div>
      </div>
    );
  }

  const handlePreviousWeek = (): void => {
    if (viewMode === 'week') {
      setCurrentWeek(subWeeks(currentWeek, 1));
    } else {
      setCurrentWeek(new Date(currentWeek.getTime() - 24 * 60 * 60 * 1000));
    }
  };

  const handleNextWeek = (): void => {
    if (viewMode === 'week') {
      setCurrentWeek(addWeeks(currentWeek, 1));
    } else {
      setCurrentWeek(new Date(currentWeek.getTime() + 24 * 60 * 60 * 1000));
    }
  };

  const handleCreateAppointment = (date?: Date): void => {
    setSelectedDate(date || new Date());
    setIsAppointmentModalOpen(true);
  };

  const handleAppointmentClick = (appointment: AppointmentWithPatient): void => {
    setSelectedAppointment(appointment);
    // If appointment is confirmed, allow creating session log
    if (appointment.status === 'confirmed' || appointment.status === 'completed') {
      setIsSessionLogModalOpen(true);
    } else {
      // Navigate to appointment details for other statuses
      router.push(`/dashboard/physiotherapist/appointments/${appointment._id}`);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Main Calendar Area */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 p-6 flex-shrink-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
                <p className="text-gray-600">Manage your appointments and schedule</p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | 'all')}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled_by_patient">Cancelled by Patient</option>
                  <option value="cancelled_by_therapist">Cancelled by Therapist</option>
                  <option value="no_show">No Show</option>
              </select>
              <div className="flex rounded-md border border-gray-300">
                <button
                  onClick={() => setViewMode('week')}
                  className={`px-3 py-2 text-sm font-medium ${
                    viewMode === 'week'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setViewMode('day')}
                  className={`px-3 py-2 text-sm font-medium border-l border-gray-300 ${
                    viewMode === 'day'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Day
                </button>
              </div>
              <Button onClick={() => handleCreateAppointment()} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                New Appointment
              </Button>
            </div>
          </div>
        </div>

          {/* Calendar Navigation */}
          <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handlePreviousWeek}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleNextWeek}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {viewMode === 'week' 
                    ? `${format(startOfWeek(currentWeek, { weekStartsOn: 1 }), 'MMM dd')} - ${format(endOfWeek(currentWeek, { weekStartsOn: 1 }), 'MMM dd, yyyy')}`
                    : format(currentWeek, 'EEEE, MMMM dd, yyyy')
                  }
                </h2>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentWeek(new Date())}
              >
                Today
              </Button>
            </div>
          </div>

          {/* Calendar Content */}
          <div className="flex-1 p-6 min-h-0">
            <div className="h-full bg-white rounded-lg border shadow-sm">
              <EnhancedAppointmentCalendar
                appointments={mappedAppointments as any}
                onCreateAppointment={handleCreateAppointment}
                onAppointmentClick={handleAppointmentClick}
                onAppointmentUpdate={handleAppointmentUpdate as any}
                viewMode={viewMode}
                currentDate={currentWeek}
              />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        {/* Today's Schedule */}
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Today&apos;s Schedule</h3>
          <div className="space-y-3">
            {!todaysSchedule || todaysSchedule.length === 0 ? (
              <div className="text-center py-8">
                <CalendarIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No appointments today</p>
              </div>
            ) : (
              todaysSchedule.map((appointment) => (
                <div
                  key={appointment._id}
                  className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleAppointmentClick(appointment)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 text-sm">
                        {appointment.patient 
                          ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
                          : 'Unknown Patient'
                        }
                      </p>
                      <p className="text-xs text-gray-600">{appointment.serviceType}</p>
                    </div>
                    <Badge className={getStatusColor(appointment.status)}>
                      {appointment.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600">
                    {format(new Date(appointment.startTime), 'h:mm a')} - {format(new Date(appointment.endTime), 'h:mm a')}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">This Week</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Appointments</span>
              <span className="font-medium text-gray-900">{appointments?.length || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Confirmed</span>
              <span className="font-medium text-green-600">
                {appointments?.filter(a => a.status === 'confirmed').length || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Completed</span>
              <span className="font-medium text-gray-600">
                {appointments?.filter(a => a.status === 'completed').length || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Pending</span>
              <span className="font-medium text-blue-600">
                {appointments?.filter(a => a.status === 'scheduled').length || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="p-6 flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-2">
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => handleCreateAppointment()}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Appointment
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => router.push('/dashboard/physiotherapist/patients')}
            >
              <CalendarIcon className="h-4 w-4 mr-2" />
              View Patients
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => router.push('/dashboard/physiotherapist/reports')}
            >
              <Filter className="h-4 w-4 mr-2" />
              View Reports
            </Button>
          </div>
                  </div>
        </div>
      </div>

      {/* Appointment Modal */}
      <AppointmentModal
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        selectedDate={selectedDate || new Date()}
        onAppointmentCreated={() => {
          setIsAppointmentModalOpen(false);
          // Refresh appointments would happen automatically due to Convex reactivity
        }}
        appointmentId={selectedAppointment?._id}
      />

      {/* Session Log Modal */}
      <SessionLogModal
        isOpen={isSessionLogModalOpen}
        onClose={() => {
          setIsSessionLogModalOpen(false);
          setSelectedAppointment(null);
        }}
        appointmentId={selectedAppointment?._id as any}
        patientId={selectedAppointment?.patient?._id}
      />
    </div>
  );
} 