'use client';

import { useMyUser, useMyAppointments } from '@/hooks/useDashboardData';
import { useAuth } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Loader2, Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';


import { AppointmentCalendar } from '@/components/calendar/AppointmentCalendar';
import { AppointmentData } from '@/lib/calendar/dayPilotAdapter';
import { AppointmentModal } from '@/components/calendar/AppointmentModal';
import { SessionLogModal } from '@/components/dashboard/physiotherapist/SessionLogModal';
import { TimeConflictModal } from '@/components/appointments/TimeConflictModal';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, startOfDay, endOfDay } from 'date-fns';
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';

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
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentData | null>(null);
  const [isSessionLogModalOpen, setIsSessionLogModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');

  // Auto-switch to day view on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setViewMode('day');
      } else {
        setViewMode('week');
      }
    };

    // Initial check
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // Removed unused refreshKey state
  const [openedFromQuery, setOpenedFromQuery] = useState(false);


  // Get current user
  const { data: currentUser, isLoading: userLoading } = useMyUser();

  // Calculate date range based on view mode
  const startDate = viewMode === 'week'
    ? startOfWeek(currentWeek, { weekStartsOn: 1 }).getTime()
    : startOfDay(currentWeek).getTime();
  const endDate = viewMode === 'week'
    ? endOfWeek(currentWeek, { weekStartsOn: 1 }).getTime()
    : endOfDay(currentWeek).getTime();

  // Get appointments for the current view with expanded date range to catch edge cases
  const expandedStartDate = startDate - (24 * 60 * 60 * 1000); // 1 day before
  const expandedEndDate = endDate + (24 * 60 * 60 * 1000); // 1 day after

  const { data: appointments, isLoading: appointmentsLoading } = useMyAppointments({
    startDate: expandedStartDate,
    endDate: expandedEndDate,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 200, // Increased limit to ensure we don't miss appointments
    // refreshKey removed - not supported by query parameters
  });

  // Map appointments to match AppointmentData type for calendar
  const currentUserId = (currentUser as { _id?: string } | null | undefined)?._id;
  const calendarAppointments = useMemo(() => {
    if (!appointments) return [];

    return (appointments as Array<{
      _id: string;
      patientId?: string;
      physiotherapistId?: string;
      startTime: number;
      endTime: number;
      serviceType?: string;
      status: string;
      patient?: {
        _id: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        imageUrl?: string;
        phoneNumber?: string;
      };
    }>).map((a) => ({
      _id: a._id as Id<'appointments'>,
      patientId: (a.patientId || a.patient?._id || '') as Id<'users'>,
      physiotherapistId: (a.physiotherapistId || (currentUserId as string) || '') as Id<'users'>,
      startTime: a.startTime,
      endTime: a.endTime,
      serviceType: a.serviceType || 'General Consultation',
      status: a.status as AppointmentStatus,
      patient: a.patient
        ? {
          firstName: a.patient.firstName || 'Unknown',
          lastName: a.patient.lastName || 'Patient',
          imageUrl: a.patient.imageUrl,
        }
        : undefined,
    } as AppointmentData));
  }, [appointments, currentUserId]);

  // Get today's schedule for the sidebar - memoize date to prevent infinite re-renders
  const today = useMemo(() => new Date(), []);
  const { data: todaysSchedule, isLoading: todaysScheduleLoading } = useMyAppointments({
    startDate: startOfDay(today).getTime(),
    endDate: endOfDay(today).getTime(),
    limit: 50,
  });

  // Mutation for rescheduling (preserves emails and notifications)
  const rescheduleAppointment = useMutation(api.appointments.rescheduleAppointment)

  const handleAppointmentReschedule = async (appointmentId: string, newStartTime: number, newEndTime: number) => {
    try {
      await rescheduleAppointment({
        appointmentId: appointmentId as Id<"appointments">,
        newStartTime,
        newEndTime,
      });
    } catch (error) {
      console.error('Failed to reschedule appointment:', error);
      throw error; // Re-throw to let DayPilot handler show error toast
    }
  }

  const handleCreateFromSlot = (startTime: number, endTime: number) => {
    const date = new Date(startTime);
    setSelectedDate(date);
    setIsAppointmentModalOpen(true);
  }

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  // If arriving with ?new=1, auto-open the new appointment modal once
  useEffect(() => {
    const shouldOpen = searchParams.get('new') === '1';
    if (isLoaded && shouldOpen && !openedFromQuery) {
      setSelectedDate(new Date());
      setIsAppointmentModalOpen(true);
      setOpenedFromQuery(true);
    }
  }, [searchParams, isLoaded, openedFromQuery]);

  // Redirect if not physiotherapist
  useEffect(() => {
    if (currentUser && (currentUser as { role: string }).role !== 'physiotherapist') {
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

  const handleAppointmentClick = (appointment: AppointmentData): void => {
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
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Main Calendar Area */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 order-1">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 p-6 flex-shrink-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
                <p className="text-gray-600">Manage your appointments and schedule</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-4 sm:mt-0">
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
                    className={`px-3 py-2 text-sm font-medium ${viewMode === 'week'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    Week
                  </button>
                  <button
                    onClick={() => setViewMode('day')}
                    className={`px-3 py-2 text-sm font-medium border-l border-gray-300 ${viewMode === 'day'
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
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
          <div className="flex-1 p-2 sm:p-6 min-h-0 flex flex-col">
            {/* Date Header */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600 text-white rounded-lg p-2">
                    <CalendarIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {viewMode === 'week'
                        ? `Week of ${format(startOfWeek(currentWeek, { weekStartsOn: 1 }), 'MMMM d, yyyy')}`
                        : format(currentWeek, 'EEEE, MMMM d, yyyy')}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Week {format(currentWeek, 'w')} of {format(currentWeek, 'yyyy')} • {viewMode === 'week' ? 'Weekly' : 'Daily'} View
                    </p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-sm">
                  <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
                    {calendarAppointments.length} appointments
                  </div>
                  <div className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-medium">
                    8 AM - 9 PM
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 bg-white rounded-lg border shadow-sm min-h-0">
              <AppointmentCalendar
                appointments={calendarAppointments}
                viewMode={viewMode}
                currentDate={currentWeek}
                onCreateAppointment={handleCreateFromSlot}
                onAppointmentClick={handleAppointmentClick}
                onAppointmentReschedule={handleAppointmentReschedule}
                businessHoursStart={8}
                businessHoursEnd={21}
                cellDuration={30}
                loading={appointmentsLoading}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-full lg:w-80 bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col flex-shrink-0 order-2 overflow-y-auto lg:overflow-visible h-1/3 lg:h-auto">
        {/* Today's Schedule */}
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Today&apos;s Schedule</h3>
          <div className="space-y-3">
            {!todaysSchedule || (todaysSchedule as { _id: string; patient?: { firstName?: string; lastName?: string }; startTime: number; endTime: number; serviceType?: string; status: string }[])?.length === 0 ? (
              <div className="text-center py-8">
                <CalendarIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No appointments today</p>
              </div>
            ) : (
              (todaysSchedule as Array<{
                _id: string;
                patient?: { _id?: string; firstName?: string; lastName?: string };
                patientId?: string;
                physiotherapistId?: string;
                startTime: number;
                endTime: number;
                serviceType?: string;
                status: string;
              }>).map((appointment) => (
                <div key={appointment._id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {appointment.patient?.firstName} {appointment.patient?.lastName || 'Unknown Patient'}
                      </p>
                      <p className="text-xs text-gray-600">{appointment.serviceType}</p>
                    </div>
                    <Badge className={getStatusColor(appointment.status as AppointmentStatus)}>
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
              <span className="font-medium text-gray-900">{(appointments as Array<{ _id: string; status: string }>)?.length || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Confirmed</span>
              <span className="font-medium text-green-600">
                {(appointments as { status: string }[])?.filter((a: { status: string }) => a.status === 'confirmed').length || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Completed</span>
              <span className="font-medium text-gray-600">
                {(appointments as { status: string }[])?.filter((a: { status: string }) => a.status === 'completed').length || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Pending</span>
              <span className="font-medium text-blue-600">
                {(appointments as { status: string }[])?.filter((a: { status: string }) => a.status === 'scheduled').length || 0}
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

      {/* Appointment Modal */}
      <AppointmentModal
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        selectedDate={selectedDate || new Date()}
        onAppointmentCreated={() => {
          setIsAppointmentModalOpen(false);
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
        appointmentId={selectedAppointment?._id as Id<"appointments">}
        patientId={undefined}
      />
    </div>
  );
} 