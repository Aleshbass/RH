'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, Calendar, Plus, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EnhancedAppointmentCalendar } from '@/components/calendar/EnhancedAppointmentCalendar';
import { AppointmentModal } from '@/components/calendar/AppointmentModal';
import { format } from 'date-fns';

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
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Get current user
  const currentUser = useQuery(api.users.getMyUser);
  
  // Get appointments with optional filters
  const appointments = useQuery(api.appointments.getMyAppointments, {
    startDate: undefined,
    endDate: undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 100,
  });

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
  const filteredAppointments = appointments.filter((appointment) => {
    if (!searchTerm) return true;
    const patientName = appointment.patient 
      ? `${appointment.patient.firstName} ${appointment.patient.lastName}`.toLowerCase()
      : '';
    return patientName.includes(searchTerm.toLowerCase()) ||
           appointment.serviceType.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleCreateAppointment = (date?: Date): void => {
    if (date) {
      setSelectedDate(date);
    }
    setIsAppointmentModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <p className="text-gray-600">Manage your appointments and schedule</p>
        </div>
        <Button onClick={() => handleCreateAppointment()} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New Appointment
        </Button>
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

      {/* Content */}
      {viewMode === 'calendar' ? (
        <div className="h-[600px]">
          <EnhancedAppointmentCalendar
              appointments={filteredAppointments.map(appointment => ({
                ...appointment,
                _id: appointment._id,
                patientId: appointment.patientId,
                physiotherapistId: appointment.physiotherapistId,
                clinicId: appointment.clinicId ? String(appointment.clinicId) : undefined,
                startTime: appointment.startTime,
                endTime: appointment.endTime,
                serviceType: appointment.serviceType,
                status: appointment.status,
                priority: undefined, // Priority field not in schema yet
                appointmentType: undefined, // Field not in schema yet
                isPinned: undefined, // Field not in schema yet
                colorCode: undefined, // Field not in schema yet
                notesForPatient: appointment.notesForPatient,
                notesForTherapist: appointment.notesForTherapist,
                cancellationReason: appointment.cancellationReason,
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
              onAppointmentClick={(appointment) => {
                // Handle appointment click - could open details modal
                console.log('Appointment clicked:', appointment);
              }}
            />
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAppointments.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No appointments found</h3>
                  <p className="text-gray-600 mb-4">
                    {searchTerm || statusFilter !== 'all' 
                      ? 'Try adjusting your search or filters'
                      : 'Create your first appointment to get started'
                    }
                  </p>
                  <Button onClick={() => handleCreateAppointment()}>
                    Create Appointment
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            filteredAppointments.map((appointment) => (
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
                        <Badge className={getStatusColor(appointment.status)}>
                          {getStatusLabel(appointment.status)}
                        </Badge>
                      </div>
                      <p className="text-gray-600 mb-1">
                        <strong>Service:</strong> {appointment.serviceType}
                      </p>
                      <p className="text-gray-600 mb-1">
                        <strong>Date:</strong> {format(new Date(appointment.startTime), 'PPP')}
                      </p>
                      <p className="text-gray-600 mb-1">
                        <strong>Time:</strong> {format(new Date(appointment.startTime), 'p')} - {format(new Date(appointment.endTime), 'p')}
                      </p>
                      {appointment.notesForTherapist && (
                        <p className="text-gray-600 mt-2">
                          <strong>Notes:</strong> {appointment.notesForTherapist}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {appointment.status === 'scheduled' && (
                        <>
                          <Button variant="outline" size="sm">
                            Reschedule
                          </Button>
                          <Button variant="outline" size="sm">
                            Confirm
                          </Button>
                        </>
                      )}
                      {appointment.status === 'confirmed' && (
                        <Button size="sm">
                          Mark Complete
                        </Button>
                      )}
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Appointment Modal */}
      <AppointmentModal
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        selectedDate={selectedDate}
        onAppointmentCreated={() => {
          setIsAppointmentModalOpen(false);
          // Refresh appointments would happen automatically due to Convex reactivity
        }}
      />
    </div>
  );
} 