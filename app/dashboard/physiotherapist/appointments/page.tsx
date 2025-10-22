'use client';

import { useMutation } from 'convex/react';
import { useQuery as useTanStackQuery } from '@tanstack/react-query';
import { useConvex } from 'convex/react';
import { api } from '@/convex/_generated/api';
// Removed unused Appointment import


import { useAuth } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Calendar, Filter, Plus, Repeat, Settings, Pin, Video, Home, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { AppointmentCalendar } from '@/components/calendar/AppointmentCalendar';
import { AppointmentData } from '@/lib/calendar/dayPilotAdapter';
import { AppointmentBookingModal } from '@/components/appointments/AppointmentBookingModal';
import { RecurringAppointmentModal } from '@/components/appointments/RecurringAppointmentModal';
import { RecurringSeriesManager } from '@/components/appointments/RecurringSeriesManager';
import { ResourceDashboard } from '@/components/resources/ResourceDashboard';
import { TimeConflictModal } from '@/components/appointments/TimeConflictModal';
import { AppointmentQuickActions } from '@/components/appointments/AppointmentQuickActions';
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
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  appointmentType?: 'in-person' | 'telehealth';
  isPinned?: boolean;
  isRecurring?: boolean;
  colorCode?: string;
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
  const convex = useConvex();
  const { isLoaded, isSignedIn } = useAuth();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [activeTab, setActiveTab] = useState<'appointments' | 'recurring' | 'resources'>('appointments');
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isCreating, setIsCreating] = useState(false);
  
  // Time conflict modal state
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState<{
    requestedStartTime: number;
    requestedEndTime: number;
    conflictingAppointment?: any;
  } | null>(null);

  // Day window for conflict checks
  const dayStartMs = selectedDate
    ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime()
    : undefined;
  const dayEndMs = dayStartMs ? dayStartMs + (24 * 60 * 60 * 1000) - 1 : undefined;
  // Broaden conflict window to catch cross-midnight overlaps
  const conflictStartMs = dayStartMs ? dayStartMs - (24 * 60 * 60 * 1000) : undefined;
  const conflictEndMs = dayEndMs ? dayEndMs + (24 * 60 * 60 * 1000) : undefined;

  // OPTIMIZED: Get current user with caching
  type UserLike = { _id: string; clinicId?: string; role?: string };
  const { data: currentUser, isLoading: userLoading } = useTanStackQuery({
    queryKey: ['user', 'profile'],
    queryFn: () => convex.query(api.users.getMyUser),
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 30 * 60 * 1000,
    enabled: isLoaded && isSignedIn,
  }) as { data: UserLike | null | undefined; isLoading: boolean };
  const preselectedPatientId = (searchParams?.get('patient') || '').trim();

  // OPTIMIZED: Get appointments with caching and reduced limit
  const { data: appointments, isLoading: appointmentsLoading, refetch: refetchAppointments } = useTanStackQuery({
    queryKey: ['appointments', 'list'],
    queryFn: () => convex.query(api.appointments.getMyAppointments, {
      startDate: undefined,
      endDate: undefined,
      status: undefined,
      limit: 50, // REDUCED from 100 for faster loading
    }),
    staleTime: 2 * 60 * 1000, // 2 minutes cache
    gcTime: 5 * 60 * 1000,
    enabled: !!currentUser,
  });

  // OPTIMIZED: Lazy load conflict appointments only when modal opens
  const { data: appointmentsForConflicts } = useTanStackQuery({
    queryKey: ['appointments', 'conflicts', conflictStartMs, conflictEndMs],
    queryFn: () => convex.query(api.appointments.getMyAppointments, {
      startDate: conflictStartMs,
      endDate: conflictEndMs,
      status: undefined,
      limit: 100, // REDUCED from 500
    }),
    staleTime: 1 * 60 * 1000,
    gcTime: 3 * 60 * 1000,
    enabled: isAppointmentModalOpen && !!conflictStartMs, // ONLY load when modal is open
  });

  // Convex mutations - MUST be called before any conditional returns
  const createAppointment = useMutation(api.appointments.createAppointment);
  const bookResource = useMutation(api.resourceManagement.bookResource);
  const rescheduleAppointment = useMutation(api.appointments.rescheduleAppointment);

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

  // OPTIMIZED: Memoized filtering to prevent re-computation
  // MUST be before any conditional returns to maintain hook order
  const filteredAppointments = useMemo(() => {
    if (!appointments) return [];
    
    return (appointments as AppointmentLike[]).filter((appointment: AppointmentLike) => {
      if (searchTerm) {
        const patientName = appointment.patient
          ? `${appointment.patient.firstName} ${appointment.patient.lastName}`.toLowerCase()
          : '';
        const matchesSearch = patientName.includes(searchTerm.toLowerCase()) ||
          (appointment.serviceType || '').toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;
      }
      return true;
    });
  }, [appointments, searchTerm]);

  // OPTIMIZED: Memoized pinned/unpinned separation
  // MUST be before any conditional returns to maintain hook order
  const { pinnedAppointments, unpinnedAppointments } = useMemo(() => ({
    pinnedAppointments: filteredAppointments.filter(apt => apt.isPinned),
    unpinnedAppointments: filteredAppointments.filter(apt => !apt.isPinned),
  }), [filteredAppointments]);

  // OPTIMIZED: Only block on critical user data
  if (!isLoaded || userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-gray-600">Loading appointments...</p>
        </div>
      </div>
    );
  }

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
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    appointmentType?: 'in-person' | 'telehealth';
    isPinned?: boolean;
    colorCode?: string;
  }) => {
    try {
      // Guard: a valid patient must be selected; otherwise Convex will reject and can cause runtime errors
      if (!appointmentData.patientId) {
        toast.error('Please select or attach a patient before creating an appointment');
        throw new Error('Missing patientId');
      }
      // Create the appointment first
      const appointmentResult = await createAppointment({
        patientId: appointmentData.patientId as Id<'users'>,
        startTime: appointmentData.startTime,
        endTime: appointmentData.endTime,
        serviceType: appointmentData.serviceType,
        notesForTherapist: appointmentData.notesForTherapist,
        priority: appointmentData.priority,
        appointmentType: appointmentData.appointmentType,
        isPinned: appointmentData.isPinned,
        colorCode: appointmentData.colorCode,
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

      {/* Enhanced Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Search and View Mode */}
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

      {/* Tabs */}
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
            <div className="space-y-4">
              {/* Date Header */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-600 text-white rounded-lg p-2">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {format(new Date(), 'EEEE, MMMM d, yyyy')}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Week {format(new Date(), 'w')} of {format(new Date(), 'yyyy')} • Today
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
                      {filteredAppointments.filter(a => {
                        // Skip cancelled appointments
                        if (a.status === 'cancelled_by_patient' || a.status === 'cancelled_by_therapist') {
                          return false;
                        }
                        // Check if appointment is today
                        const appointmentDate = new Date(a.startTime);
                        const today = new Date();
                        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                        const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
                        return appointmentDate >= todayStart && appointmentDate <= todayEnd;
                      }).length} appointments today
                    </div>
                    <div className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-medium">
                      8 AM - 9 PM
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="h-[600px]">
                <AppointmentCalendar
                  appointments={filteredAppointments.map((appointment: AppointmentLike) => ({
                    _id: appointment._id as Id<'appointments'>,
                    patientId: (appointment.patient?._id || '') as Id<'users'>,
                    physiotherapistId: '' as Id<'users'>,
                    startTime: appointment.startTime,
                    endTime: appointment.endTime,
                    serviceType: appointment.serviceType || 'General',
                    status: (appointment.status || 'scheduled') as AppointmentStatus,
                    priority: appointment.priority,
                    appointmentType: appointment.appointmentType,
                    isPinned: appointment.isPinned,
                    isRecurring: appointment.isRecurring,
                    colorCode: appointment.colorCode,
                    patient: appointment.patient ? {
                      firstName: appointment.patient.firstName || 'Unknown',
                      lastName: appointment.patient.lastName || 'Patient',
                      imageUrl: appointment.patient.imageUrl,
                    } : undefined
                  }))}
                  viewMode="week"
                  currentDate={new Date()}
                  onCreateAppointment={(startTime, endTime) => {
                    console.log('📅 onCreateAppointment called:', { startTime, endTime });
                    const date = new Date(startTime);
                    setSelectedDate(date);
                    console.log('🔓 Opening modal...');
                    setIsAppointmentModalOpen(true);
                  }}
                  onAppointmentClick={(appointment) => {
                    console.log('Appointment clicked:', appointment);
                  }}
                  onAppointmentReschedule={async (appointmentId, newStartTime, newEndTime) => {
                    try {
                      await rescheduleAppointment({
                        appointmentId: appointmentId as Id<'appointments'>,
                        newStartTime,
                        newEndTime,
                      });
                    } catch (error) {
                      console.error('Error rescheduling appointment:', error);
                      throw error;
                    }
                  }}
                  businessHoursStart={8}
                  businessHoursEnd={21}
                  cellDuration={30}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredAppointments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No appointments found</p>
                </div>
              ) : (
                <>
                  {/* Pinned Appointments Section */}
                  {pinnedAppointments.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Pin className="h-5 w-5 text-amber-500" />
                        <h3 className="text-lg font-semibold text-gray-900">Pinned Appointments</h3>
                        <Badge variant="secondary">{pinnedAppointments.length}</Badge>
                      </div>
                      {pinnedAppointments.map((appointment: AppointmentLike) => (
                        <Card 
                          key={appointment._id} 
                          className="p-4 hover:shadow-md transition-shadow border-l-4 bg-amber-50/50"
                          style={{ borderLeftColor: appointment.colorCode || '#3B82F6' }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div 
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: appointment.colorCode || '#3B82F6' }}
                              ></div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">
                                    {appointment.patient?.firstName || 'Unknown'} {appointment.patient?.lastName || 'Patient'}
                                  </p>
                                  <Pin className="h-4 w-4 text-amber-500 fill-amber-500" />
                                  {appointment.appointmentType === 'telehealth' && <Video className="h-4 w-4 text-blue-500" />}
                                  {appointment.appointmentType === 'in-person' && <Home className="h-4 w-4 text-green-500" />}
                                </div>
                                <p className="text-sm text-gray-500">
                                  {format(new Date(appointment.startTime), 'MMM d, yyyy • h:mm a')}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              {appointment.priority && appointment.priority !== 'low' && (
                                <Badge 
                                  variant="outline"
                                  className={
                                    appointment.priority === 'urgent' ? 'border-red-500 text-red-700 bg-red-50' :
                                    appointment.priority === 'high' ? 'border-orange-500 text-orange-700 bg-orange-50' :
                                    'border-yellow-500 text-yellow-700 bg-yellow-50'
                                  }
                                >
                                  {appointment.priority === 'urgent' && <Zap className="w-3 h-3 mr-1" />}
                                  {appointment.priority.toUpperCase()}
                                </Badge>
                              )}
                              <Badge variant={appointment.status === 'confirmed' ? 'default' : 'secondary'}>
                                {getStatusLabel((appointment.status || 'scheduled') as AppointmentStatus)}
                              </Badge>
                            </div>
                          </div>
                          {appointment.notesForTherapist && (
                            <div className="mt-3 p-2 bg-white rounded text-sm border border-amber-200">
                              <strong>Notes:</strong> {appointment.notesForTherapist}
                            </div>
                          )}
                          <div className="mt-3">
                            <AppointmentQuickActions 
                              appointment={appointment as any}
                              userRole="physiotherapist"
                            />
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Regular Appointments Section */}
                  {unpinnedAppointments.length > 0 && (
                    <div className="space-y-4">
                      {pinnedAppointments.length > 0 && (
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">Other Appointments</h3>
                          <Badge variant="secondary">{unpinnedAppointments.length}</Badge>
                        </div>
                      )}
                      {unpinnedAppointments.map((appointment: AppointmentLike) => (
                  <Card 
                    key={appointment._id} 
                    className="p-4 hover:shadow-md transition-shadow border-l-4"
                    style={{ borderLeftColor: appointment.colorCode || '#3B82F6' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: appointment.colorCode || '#3B82F6' }}
                        ></div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">
                              {appointment.patient?.firstName || 'Unknown'} {appointment.patient?.lastName || 'Patient'}
                            </p>
                            {appointment.isPinned && <Pin className="h-4 w-4 text-amber-500" />}
                            {appointment.appointmentType === 'telehealth' && <Video className="h-4 w-4 text-blue-500" />}
                            {appointment.appointmentType === 'in-person' && <Home className="h-4 w-4 text-green-500" />}
                          </div>
                          <p className="text-sm text-gray-500">
                            {format(new Date(appointment.startTime), 'MMM d, yyyy • h:mm a')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {appointment.priority && appointment.priority !== 'low' && (
                          <Badge 
                            variant="outline"
                            className={
                              appointment.priority === 'urgent' ? 'border-red-500 text-red-700 bg-red-50' :
                              appointment.priority === 'high' ? 'border-orange-500 text-orange-700 bg-orange-50' :
                              'border-yellow-500 text-yellow-700 bg-yellow-50'
                            }
                          >
                            {appointment.priority === 'urgent' && <Zap className="w-3 h-3 mr-1" />}
                            {appointment.priority.toUpperCase()}
                          </Badge>
                        )}
                        <Badge variant={appointment.status === 'confirmed' ? 'default' : 'secondary'}>
                          {getStatusLabel((appointment.status || 'scheduled') as AppointmentStatus)}
                        </Badge>
                      </div>
                    </div>
                    {appointment.notesForTherapist && (
                      <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                        <strong>Notes:</strong> {appointment.notesForTherapist}
                      </div>
                    )}
                    <div className="mt-3">
                      <AppointmentQuickActions 
                        appointment={appointment as any}
                        userRole="physiotherapist"
                      />
                    </div>
                  </Card>
                      ))}
                    </div>
                  )}
                </>
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
        existingAppointments={((appointmentsForConflicts as AppointmentLike[] | undefined) ?? []).map(a => ({
          startTime: a.startTime,
          endTime: a.endTime,
          status: a.status,
        }))}
        providerScheduleReady={appointmentsForConflicts !== undefined}
        onSubmit={async (appointmentData) => {
          if (isCreating) return; // prevent duplicate submissions
          
          // Inject preselected patientId if present (define outside try-catch for error handler access)
          const merged = {
            ...appointmentData,
            patientId: preselectedPatientId || appointmentData.patientId,
          };
          
          try {
            setIsCreating(true);

            // Create appointment with Convex + resources
            const appointmentId = await handleCreateAppointmentWithResources(merged);
            console.log('✅ Appointment created:', appointmentId);

            // Clear search so new appointment is visible
            setSearchTerm('');

            toast.success('🎉 Appointment created successfully!', {
              description: 'Your new appointment has been added to the calendar',
              duration: 4000,
            });

            setIsAppointmentModalOpen(false);
            
            // OPTIMIZED: Refetch using TanStack Query cache invalidation
            refetchAppointments();
          } catch (error: any) {
            console.error('Failed to create appointment:', error);
            const msg = (error?.message || '').toString();
            const match = msg.match(/Time slot conflicts.*?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) - (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
            
            if (match || msg.includes('Time slot conflicts') || msg.includes('no longer available')) {
              // Show beautiful conflict modal instead of toast
              const startTime = match ? new Date(match[1]).getTime() : merged.startTime;
              const endTime = match ? new Date(match[2]).getTime() : merged.endTime;
              
              setConflictData({
                requestedStartTime: merged.startTime,
                requestedEndTime: merged.endTime,
                conflictingAppointment: {
                  startTime: startTime,
                  endTime: endTime,
                  patientName: 'Existing Patient',
                  serviceType: 'Booked Appointment',
                },
              });
              setShowConflictModal(true);
              setIsAppointmentModalOpen(false); // Close booking modal
            } else {
              toast.error('Failed to create appointment. Please try again.');
            }
          } finally {
            setIsCreating(false);
          }
        }}
      />
      {currentUser && (
        <RecurringAppointmentModal
          isOpen={isRecurringModalOpen}
          onClose={() => setIsRecurringModalOpen(false)}
          userId={currentUser._id as Id<"users">}
          role="physiotherapist"
        />
      )}

      {/* Time Conflict Modal */}
      {conflictData && (
        <TimeConflictModal
          open={showConflictModal}
          onOpenChange={setShowConflictModal}
          conflictingAppointment={conflictData.conflictingAppointment}
          requestedStartTime={conflictData.requestedStartTime}
          requestedEndTime={conflictData.requestedEndTime}
          onChooseDifferentTime={() => {
            setShowConflictModal(false);
            setIsAppointmentModalOpen(true); // Reopen booking modal
          }}
          onCancel={() => {
            setShowConflictModal(false);
            setConflictData(null);
          }}
        />
      )}

    </div>
  );
}