'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { CalendarDays, Plus, Repeat, Search } from 'lucide-react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RecurringAppointmentModal } from '@/components/appointments/RecurringAppointmentModal';
import { RecurringSeriesManager } from '@/components/appointments/RecurringSeriesManager';
import { SchedulingWizard } from '@/components/appointments/scheduling/SchedulingWizard';
import { AppointmentDashboard } from '@/components/appointments/AppointmentDashboard';
import { PageContainer, PageHeader, primaryButtonClass } from '@/components/physio/ui';

type AppointmentLike = {
  _id: string;
  patientId: string;
  patient?: { _id?: string; firstName?: string; lastName?: string; email?: string } | null;
  startTime: number;
  endTime: number;
  serviceType?: string;
  status?: string;
  isPinned?: boolean;
};

type PatientLite = { _id: string; firstName?: string; lastName?: string; email?: string };

export default function AppointmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPatientId = (searchParams?.get('patient') || '').trim();

  const currentUser = useQuery(api.users.getMyUser);
  const appointments = useQuery(api.appointments.getMyAppointments, { limit: 100 }) as AppointmentLike[] | undefined;
  const patients = useQuery(
    api.patients.getMyPatients,
    preselectedPatientId ? { limit: 200 } : 'skip'
  ) as PatientLite[] | undefined;

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'appointments' | 'recurring'>('appointments');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [openedForPatient, setOpenedForPatient] = useState(false);

  // "Schedule" on a patient lands here with ?patient=<id>: open the wizard on the date step
  const initialPatient = useMemo(() => {
    if (!preselectedPatientId || !patients) return null;
    const patient = patients.find((p) => p._id === preselectedPatientId);
    return patient
      ? {
          id: patient._id,
          name: [patient.firstName, patient.lastName].filter(Boolean).join(' ') || 'Patient',
          email: patient.email,
        }
      : null;
  }, [preselectedPatientId, patients]);

  useEffect(() => {
    if (initialPatient && !openedForPatient) {
      setIsWizardOpen(true);
      setOpenedForPatient(true);
    }
  }, [initialPatient, openedForPatient]);

  const filteredAppointments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const list = appointments ?? [];
    if (!term) return list;
    return list.filter((appointment) => {
      const name = `${appointment.patient?.firstName ?? ''} ${appointment.patient?.lastName ?? ''}`.toLowerCase();
      return name.includes(term) || (appointment.serviceType ?? '').toLowerCase().includes(term);
    });
  }, [appointments, searchTerm]);

  const closeWizard = () => {
    setIsWizardOpen(false);
    if (preselectedPatientId) router.replace('/dashboard/physiotherapist/appointments');
  };

  return (
    <PageContainer>
      <PageHeader
        title="Appointments"
        description="Upcoming and past sessions, and recurring series."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/physiotherapist/calendar">
                <CalendarDays className="mr-2 h-4 w-4" />
                Calendar
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setIsRecurringModalOpen(true)}>
              <Repeat className="mr-2 h-4 w-4" />
              Recurring
            </Button>
            <Button onClick={() => setIsWizardOpen(true)} className={primaryButtonClass}>
              <Plus className="mr-2 h-4 w-4" />
              New appointment
            </Button>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'appointments' | 'recurring')} className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="appointments" className="flex-1 sm:flex-none">Appointments</TabsTrigger>
            <TabsTrigger value="recurring" className="flex-1 sm:flex-none">Recurring series</TabsTrigger>
          </TabsList>
          {activeTab === 'appointments' && (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                placeholder="Search by patient or service"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                aria-label="Search appointments"
              />
            </div>
          )}
        </div>

        <TabsContent value="appointments" className="space-y-4">
          {appointments === undefined ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : (
            <AppointmentDashboard
              appointments={filteredAppointments}
              onNewAppointment={() => setIsWizardOpen(true)}
              onAppointmentClick={(appointment: AppointmentLike) => {
                const patientId = appointment.patientId || appointment.patient?._id;
                if (patientId) router.push(`/dashboard/physiotherapist/patients/${patientId}`);
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="recurring" className="space-y-4">
          {currentUser && <RecurringSeriesManager userId={currentUser._id as Id<'users'>} role="physiotherapist" />}
        </TabsContent>
      </Tabs>

      <SchedulingWizard
        isOpen={isWizardOpen}
        onClose={closeWizard}
        onComplete={closeWizard}
        physiotherapistId={currentUser?._id || ''}
        initialPatient={initialPatient}
      />

      {currentUser && (
        <RecurringAppointmentModal
          isOpen={isRecurringModalOpen}
          onClose={() => setIsRecurringModalOpen(false)}
          userId={currentUser._id as Id<'users'>}
          role="physiotherapist"
        />
      )}
    </PageContainer>
  );
}
