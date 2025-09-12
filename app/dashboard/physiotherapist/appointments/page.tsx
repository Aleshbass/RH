'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
// Removed unused Appointment import


import { useAuth } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar, Filter, Plus, Repeat, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { EnhancedAppointmentCalendar } from '@/components/calendar/EnhancedAppointmentCalendar';
import { AppointmentBookingModal } from '@/components/appointments/AppointmentBookingModal';
import { RecurringAppointmentModal } from '@/components/appointments/RecurringAppointmentModal';
import { RecurringSeriesManager } from '@/components/appointments/RecurringSeriesManager';
import { ResourceDashboard } from '@/components/resources/ResourceDashboard';
import { toast } from 'sonner';
import { Id } from '@/convex/_generated/dataModel';

type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled_by_patient' | 'cancelled_by_therapist' | 'no_show';

type AppointmentLike = {
  _id: string;
  patient?: {
    _id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    imageUrl?: string;
    phoneNumber?: string;
  } | null;
  startTime: number;
  endTime: number;
  serviceType?: string;
  status?: string;
  notesForTherapist?: string;
};

// Removed unused getStatusColor function

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'confirmed':
      return 'Confirmed';
    case 'completed':
      return 'Completed';
    case 'cancelled_by_patient':
      return 'Cancelled by Patient';
    case 'cancelled_by_therapist':
      return 'Cancelled by Therapist';
    case 'no_show':
      return 'No Show';
    default:
      return status;
  }

  // If a patient is provided in query params, auto-open booking modal for convenience
  // useEffect(() => {
  //   if (preselectedPatientId) {
  //     setIsAppointmentModalOpen(true);
  //   }
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [preselectedPatientId]);
};

export default function AppointmentsPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [activeTab, setActiveTab] = useState<'appointments' | 'recurring' | 'resources'>('appointments');
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Get current user
  type UserLike = { _id: string; clinicId?: string; role?: string };
const currentUser = useQuery(api.users.getMyUser) as UserLike | null | undefined;
  const preselectedPatientId = (searchParams?.get('patient') || '').trim();

  // Get appointments with optional filters
  const appointments = useQuery(api.appointments.getMyAppointments, {
    startDate: undefined,
    endDate: undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 100,
  });

  // Convex mutations - MUST be called before any conditional returns
  const createAppointment = useMutation(api.appointments.createAppointment);
  const bookResource = useMutation(api.resourceManagement.bookResource);
  const updateAppointmentStatus = useMutation(api.appointments.updateAppointmentStatus);

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // router.push('/sign-in');
    }
  }, [isLoaded, isSignedIn]);

  // Redirect if not physiotherapist
  useEffect(() => {
    if (currentUser && currentUser.role !== 'physiotherapist') {
      // router.push('/dashboard');
    }
  }, [currentUser]);

  // Loading state
  if (!isLoaded || currentUser === undefined || appointments === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-gray-600">Loading appointments...</p>
        </div>
      </div>
    );
  }

  // Filter appointments based on search term
  const filteredAppointments = (appointments as AppointmentLike[])?.filter((appointment: AppointmentLike) => {
    if (!searchTerm) return true;
    const patientName = appointment.patient
      ? `${appointment.patient.firstName} ${appointment.patient.lastName}`.toLowerCase()
      : '';
    return patientName.includes(searchTerm.toLowerCase()) ||
           (appointment.serviceType || '').toLowerCase().includes(searchTerm.toLowerCase());
  }) || [];

  const handleCreateAppointment = (date?: Date): void => {
    if (date) {
      setSelectedDate(date);
    }
    setIsAppointmentModalOpen(true);
  };

  const handleCreateRecurring = (date?: Date): void => {
    if (date) {
      setSelectedDate(date);
    }
    setIsRecurringModalOpen(true);
  };

  const handleEditRecurringSeries = (seriesId: string): void => {
    // For now, just log - could open edit modal in future
    console.log('Edit recurring series:', seriesId);
  };

  const handleCreateAppointmentWithResources = async (appointmentData: {
    patientId?: string;
    startTime: number;
    endTime: number;
    serviceType: string;
    notesForTherapist?: string;
    selectedResources?: string[];
  }) => {
    try {
      // Create the appointment first
      const appointmentResult = await createAppointment({
        patientId: appointmentData.patientId as Id<'users'> || null as unknown as Id<'users'>, // Handle case where patient might not exist yet
        startTime: appointmentData.startTime,
        endTime: appointmentData.endTime,
        serviceType: appointmentData.serviceType,
        notesForTherapist: appointmentData.notesForTherapist,
      });

      // Extract appointment ID from result
      const appointmentId = appointmentResult?.appointmentId || appointmentResult;

      // Book all selected resources
      if (appointmentData.selectedResources && appointmentData.selectedResources.length > 0) {
        await Promise.all(
          appointmentData.selectedResources.map((resourceId: string) =>
            bookResource({
              resourceId: resourceId as Id<'resources'>,
              appointmentId: appointmentId as Id<'appointments'>,
              startTime: appointmentData.startTime,
              endTime: appointmentData.endTime,
              notes: `Booked for ${appointmentData.serviceType}`,
            })
          )
        );
      }

      return appointmentId;
    } catch (error) {
      console.error('Error creating appointment with resources:', error);
      throw error;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <p className="text-gray-600">Manage your appointments and recurring series</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => handleCreateAppointment()} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Appointment
          </Button>
          <Button onClick={() => handleCreateRecurring()} variant="outline" className="flex items-center gap-2">
            <Repeat className="h-4 w-4" />
            New Recurring Series
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by patient name or service type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
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
                  onClick={() => setViewMode('calendar')}
                  className={`px-3 py-2 text-sm font-medium ${
                    viewMode === 'calendar'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Calendar className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-2 text-sm font-medium border-l border-gray-300 ${
                    viewMode === 'list'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Filter className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content with Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'appointments' | 'recurring' | 'resources')} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="appointments" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Appointments
          </TabsTrigger>
          <TabsTrigger value="recurring" className="flex items-center gap-2">
            <Repeat className="h-4 w-4" />
            Recurring Series
          </TabsTrigger>
          <TabsTrigger value="resources" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Resources
          </TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="space-y-4">
          {viewMode === 'calendar' ? (
            <div className="h-[600px]">
              <EnhancedAppointmentCalendar
                appointments={filteredAppointments.map((appointment: AppointmentLike) => ({
                  _id: appointment._id,
                  patientId: appointment.patient?._id || '',
                  physiotherapistId: '',
                  clinicId: currentUser?.clinicId ? String(currentUser.clinicId) : undefined,
                  startTime: appointment.startTime,
                  endTime: appointment.endTime,
                  serviceType: appointment.serviceType || 'General',
                  status: (appointment.status || 'scheduled') as AppointmentStatus,
                  priority: 'low' as 'low' | 'medium' | 'high' | 'urgent' | undefined,
                  appointmentType: 'in-person' as 'in-person' | 'telehealth' | undefined,
                  isPinned: false,
                  colorCode: '',
                  notesForPatient: '',
                  notesForTherapist: appointment.notesForTherapist || '',
                  cancellationReason: '',
                  seriesId: '',
                  isRecurring: false,
                  instanceDate: '',
                  isException: false,
                  patient: appointment.patient ? {
                    _id: appointment.patient._id || '',
                    firstName: appointment.patient.firstName || 'Unknown',
                    lastName: appointment.patient.lastName || 'Patient',
                    email: appointment.patient.email || '',
                    imageUrl: appointment.patient.imageUrl || '',
                    phoneNumber: appointment.patient.phoneNumber || '',
                  } : null
                }))}
                onCreateAppointment={handleCreateAppointment}
                onCreateRecurring={handleCreateRecurring}
                onEditRecurringSeries={handleEditRecurringSeries}
                onAppointmentClick={(appointment) => {
                  // Handle appointment click - could open details modal
                  console.log('Appointment clicked:', appointment);
                }}
                onAppointmentUpdate={async (appointmentId, updates) => {
                  try {
                    await updateAppointmentStatus({
                      appointmentId: appointmentId as Id<'appointments'>,
                      status: updates.status as 'confirmed' | 'completed' | 'cancelled_by_therapist' | 'no_show',
                    });
                    toast.success('Appointment updated successfully');
                  } catch (error) {
                    console.error('Error updating appointment:', error);
                    toast.error('Failed to update appointment');
                  }
                }}
                showRecurringControls={true}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAppointments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No appointments found</p>
                </div>
              ) : (
                filteredAppointments.map((appointment: AppointmentLike) => (
                  <Card key={appointment._id} className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <div>
                          <p className="font-medium">
                            {appointment.patient?.firstName || 'Unknown'} {appointment.patient?.lastName || 'Patient'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {format(new Date(appointment.startTime), 'MMM d, yyyy • h:mm a')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={appointment.status === 'confirmed' ? 'default' : 'secondary'}>
                          {getStatusLabel((appointment.status || 'scheduled') as AppointmentStatus)}
                        </Badge>
                        {false && (
                          <Badge variant="outline" className="text-xs">
                            <Repeat className="w-3 h-3 mr-1" />
                            Recurring
                          </Badge>
                        )}
                      </div>
                    </div>
                    {appointment.notesForTherapist && (
                      <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                        <strong>Notes:</strong> {appointment.notesForTherapist}
                      </div>
                    )}
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recurring" className="space-y-4">
          {currentUser && (
            <RecurringSeriesManager
              userId={currentUser._id as Id<"users">}
              role="physiotherapist"
              onEditSeries={handleEditRecurringSeries}
            />
          )}
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          {currentUser?.clinicId && (
            <ResourceDashboard clinicId={currentUser.clinicId as Id<'clinics'>} />
          )}
        </TabsContent>
      </Tabs>

      {/* Enhanced Appointment Booking Modal with Resource Management */}
      <AppointmentBookingModal
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        clinicId={currentUser?.clinicId as Id<'clinics'>}
        physiotherapistId={currentUser?._id || ''}
        selectedDate={selectedDate}
        selectedTime={selectedDate ? format(selectedDate, 'HH:mm') : undefined}
        onSubmit={async (appointmentData) => {
          try {
            // Inject preselected patientId if present
            const merged = {
              ...appointmentData,
              patientId: preselectedPatientId || appointmentData.patientId,
            };

            // Create appointment with Convex
            await handleCreateAppointmentWithResources(merged);

            // Best-effort: notify user
            toast.success('Appointment created successfully');

            setIsAppointmentModalOpen(false);
          } catch (error) {
            console.error('Failed to create appointment:', error);
            toast.error('Failed to create appointment. Please try again.');
          }
        }}
      />

      {/* Recurring Appointment Modal */}
      {currentUser && (
        <RecurringAppointmentModal
          isOpen={isRecurringModalOpen}
          onClose={() => setIsRecurringModalOpen(false)}
          userId={currentUser._id as Id<"users">}
          role="physiotherapist"
        />
      )}

    </div>
  );
}