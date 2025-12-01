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
import { Calendar, Filter, Plus, Repeat, Settings, Pin, Video, Home, Zap, Search } from 'lucide-react';
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
import { SchedulingWizard } from '@/components/appointments/scheduling/SchedulingWizard';
import { AppointmentDashboard } from '@/components/appointments/AppointmentDashboard';
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

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search patients..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-white border-gray-200"
        />
      </div>


      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'appointments' | 'recurring')} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="appointments" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Appointments
          </TabsTrigger>
          <TabsTrigger value="recurring" className="flex items-center gap-2">
            <Repeat className="h-4 w-4" />
            Recurring
            <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5 bg-blue-100 text-blue-700 font-medium">Beta</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="space-y-4">
          <AppointmentDashboard
            appointments={filteredAppointments}
            onNewAppointment={() => handleCreateAppointment()}
            onAppointmentClick={(apt) => {
              console.log('Clicked appointment:', apt);
            }}
          />
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
      </Tabs>

      {/* New Scheduling Wizard */}
      <SchedulingWizard
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        onComplete={() => {
          setIsAppointmentModalOpen(false);
          refetchAppointments();
        }}
        physiotherapistId={currentUser?._id || ''}
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
            setIsAppointmentModalOpen(true);
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