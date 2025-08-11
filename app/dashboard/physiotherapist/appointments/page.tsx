'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, Calendar, Plus, Search, Filter, Repeat, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EnhancedAppointmentCalendar } from '@/components/calendar/EnhancedAppointmentCalendar';
import { AppointmentBookingModal } from '@/components/appointments/AppointmentBookingModal';
import { RecurringAppointmentModal } from '@/components/appointments/RecurringAppointmentModal';
import { RecurringSeriesManager } from '@/components/appointments/RecurringSeriesManager';
import { ResourceDashboard } from '@/components/resources/ResourceDashboard';
import { format } from 'date-fns';
import { toast } from 'sonner';

type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled_by_patient' | 'cancelled_by_therapist' | 'no_show';

const getStatusColor = (status: AppointmentStatus): string => {
  switch (status) {
    case 'scheduled':
      return 'bg-blue-100 text-blue-800';
    case 'confirmed':
      return 'bg-green-100 text-green-800';
    case 'completed':
      return 'bg-gray-100 text-gray-800';
    case 'cancelled_by_patient':
    case 'cancelled_by_therapist':
      return 'bg-red-100 text-red-800';
    case 'no_show':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const getStatusLabel = (status: AppointmentStatus): string => {
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
      return 'Unknown';
  }
};

export default function AppointmentsPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [activeTab, setActiveTab] = useState<'appointments' | 'recurring' | 'resources'>('appointments');
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Get current user
  const currentUser = useQuery(api.users.getMyUser) as any;
  
  // Get appointments with optional filters
  const appointments = useQuery(api.appointments.getMyAppointments, {
    startDate: undefined,
    endDate: undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 100,
  }) as any[];

  // Convex mutations - MUST be called before any conditional returns
  const createAppointment = useMutation(api.appointments.createAppointment);
  const bookResource = useMutation(api.resourceManagement.bookResource);

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
  if (!isLoaded || currentUser === undefined || appointments === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading appointments...</p>
        </div>
      </div>
    );
  }

  // Filter appointments based on search term
  const filteredAppointments = appointments?.filter((appointment: any) => {
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

  const handleCreateAppointmentWithResources = async (appointmentData: any) => {
    try {
      // Create the appointment first
      const appointmentResult = await createAppointment({
        patientId: appointmentData.patientId || null, // Handle case where patient might not exist yet
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
              resourceId: resourceId as any,
              appointmentId: appointmentId as any,
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
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
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
                  appointments={filteredAppointments.map((appointment: any) => ({
                    ...appointment,
                    _id: appointment._id,
                    patientId: appointment.patientId || appointment.patient?._id,
                    physiotherapistId: appointment.physiotherapistId,
                    clinicId: appointment.clinicId ? String(appointment.clinicId) : undefined,
                    startTime: appointment.startTime,
                    endTime: appointment.endTime,
                    serviceType: appointment.serviceType || 'General',
                    status: appointment.status || 'scheduled',
                    priority: undefined, // Priority field not in schema yet
                    appointmentType: undefined, // Field not in schema yet
                    isPinned: undefined, // Field not in schema yet
                    colorCode: undefined, // Field not in schema yet
                    notesForPatient: appointment.notesForPatient,
                    notesForTherapist: appointment.notesForTherapist,
                    cancellationReason: appointment.cancellationReason,
                    // Add recurring appointment fields
                    seriesId: appointment.seriesId,
                    isRecurring: appointment.isRecurring || false,
                    instanceDate: appointment.instanceDate,
                    isException: appointment.isException || false,
                    patient: appointment.patient ? {
                      _id: String(appointment.patient._id),
                      firstName: appointment.patient.firstName || 'Unknown',
                      lastName: appointment.patient.lastName || 'Patient',
                      email: appointment.patient.email || '',
                      imageUrl: appointment.patient.imageUrl,
                      phoneNumber: appointment.patient.phoneNumber,
                    } : null
                  }))}
                  onCreateAppointment={handleCreateAppointment}
                  onCreateRecurring={handleCreateRecurring}
                  onEditRecurringSeries={handleEditRecurringSeries}
                  onAppointmentClick={(appointment) => {
                    // Handle appointment click - could open details modal
                    console.log('Appointment clicked:', appointment);
                  }}
                  showRecurringControls={true}
                />
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAppointments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No appointments found
                </div>
              ) : (
                filteredAppointments.map((appointment: any) => (
                  <Card key={appointment._id}>
                    <CardContent className="pt-6">
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {appointment.patient 
                                ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
                                : 'Unknown Patient'
                              }
                            </h3>
                            <Badge className={getStatusColor(appointment.status || 'scheduled')}>
                              {getStatusLabel(appointment.status || 'scheduled')}
                            </Badge>
                            {(appointment.isRecurring || false) && (
                              <Badge variant="outline" className="flex items-center gap-1">
                                <Repeat className="h-3 w-3" />
                                Recurring
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{appointment.serviceType || 'General'}</p>
                          <p className="text-sm text-gray-600">
                            {appointment.startTime ? format(new Date(appointment.startTime), 'PPP') : 'N/A'}
                          </p>
                          <p className="text-sm text-gray-600">
                            {appointment.startTime ? format(new Date(appointment.startTime), 'h:mm a') : 'N/A'} - {appointment.endTime ? format(new Date(appointment.endTime), 'h:mm a') : 'N/A'}
                          </p>
                          {appointment.notesForTherapist && (
                            <div className="mt-2">
                              <p className="text-xs text-gray-500">Notes: {appointment.notesForTherapist}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Badge className={getStatusColor(appointment.status || 'scheduled')}>
                            {getStatusLabel(appointment.status || 'scheduled')}
                          </Badge>
                          <div className="flex gap-2">
                            {(appointment.status || 'scheduled') === 'confirmed' && (
                              <Button size="sm">
                                Mark Complete
                              </Button>
                            )}
                            <Button variant="outline" size="sm">
                              View Details
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recurring" className="space-y-4">
          {currentUser && (
            <RecurringSeriesManager
              userId={currentUser._id}
              role="physiotherapist"
              onEditSeries={handleEditRecurringSeries}
            />
          )}
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          {currentUser?.clinicId && (
            <ResourceDashboard clinicId={currentUser.clinicId} />
          )}
        </TabsContent>
      </Tabs>

      {/* Enhanced Appointment Booking Modal with Resource Management */}
      {currentUser?.clinicId && (
        <AppointmentBookingModal
          isOpen={isAppointmentModalOpen}
          onClose={() => setIsAppointmentModalOpen(false)}
          clinicId={currentUser.clinicId}
          physiotherapistId={currentUser._id}
          selectedDate={selectedDate}
          selectedTime={selectedDate ? format(selectedDate, 'HH:mm') : undefined}
          onSubmit={async (appointmentData) => {
            try {
              // Create appointment with Convex
              await handleCreateAppointmentWithResources(appointmentData);
              setIsAppointmentModalOpen(false);
              toast.success('Appointment created successfully with resources!');
            } catch (error) {
              console.error('Failed to create appointment:', error);
              toast.error('Failed to create appointment. Please try again.');
            }
          }}
        />
      )}

      {/* Recurring Appointment Modal */}
      {currentUser && (
        <RecurringAppointmentModal
          isOpen={isRecurringModalOpen}
          onClose={() => setIsRecurringModalOpen(false)}
          userId={currentUser._id}
          role="physiotherapist"
          defaultValues={{
            startDate: selectedDate.toISOString().split('T')[0],
            physiotherapistId: currentUser._id,
          }}
        />
      )}
    </div>
  );
} 