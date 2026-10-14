'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { addDays, addWeeks, endOfDay, endOfWeek, format, startOfDay, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, List, Plus } from 'lucide-react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppointmentCalendar } from '@/components/calendar/AppointmentCalendar';
import type { AppointmentData } from '@/lib/calendar/dayPilotAdapter';
import { AppointmentModal } from '@/components/calendar/AppointmentModal';
import { SessionLogModal } from '@/components/dashboard/physiotherapist/SessionLogModal';
import { PageContainer, primaryButtonClass, StatusBadge } from '@/components/physio/ui';
import { cn } from '@/lib/utils';

type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled_by_patient' | 'cancelled_by_therapist' | 'no_show';

type RawAppointment = {
  _id: string;
  patientId?: string;
  physiotherapistId?: string;
  startTime: number;
  endTime: number;
  serviceType?: string;
  status: string;
  patient?: { _id: string; firstName?: string; lastName?: string; imageUrl?: string } | null;
};

const STATUS_FILTERS: { value: AppointmentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled_by_patient', label: 'Cancelled by patient' },
  { value: 'cancelled_by_therapist', label: 'Cancelled by you' },
  { value: 'no_show', label: 'No-show' },
];

function statusBadge(status: string) {
  if (status === 'confirmed') return <StatusBadge tone="teal">Confirmed</StatusBadge>;
  if (status === 'completed') return <StatusBadge tone="green">Completed</StatusBadge>;
  if (status === 'no_show') return <StatusBadge tone="amber">No-show</StatusBadge>;
  if (status.startsWith('cancelled')) return <StatusBadge tone="red">Cancelled</StatusBadge>;
  return <StatusBadge>Scheduled</StatusBadge>;
}

export default function CalendarPage() {
  const searchParams = useSearchParams();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  // Phones start in day view; after that the choice is the user's
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  useEffect(() => {
    if (window.innerWidth < 1024) setViewMode('day');
  }, []);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');

  // Modal state: creating (no id) or editing an existing appointment
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<Date>(new Date());
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [sessionLogFor, setSessionLogFor] = useState<AppointmentData | null>(null);

  const currentUser = useQuery(api.users.getMyUser);

  const rangeStart = viewMode === 'week' ? startOfWeek(currentDate, { weekStartsOn: 1 }) : startOfDay(currentDate);
  const rangeEnd = viewMode === 'week' ? endOfWeek(currentDate, { weekStartsOn: 1 }) : endOfDay(currentDate);

  const appointmentsResult = useQuery(api.appointments.getMyAppointments, {
    startDate: rangeStart.getTime(),
    endDate: rangeEnd.getTime(),
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 200,
  }) as RawAppointment[] | undefined;

  // Keep showing the previous range while the next one loads, instead of blanking the page
  const lastAppointments = useRef<RawAppointment[]>([]);
  if (appointmentsResult) lastAppointments.current = appointmentsResult;
  const appointments = appointmentsResult ?? lastAppointments.current;

  const [today] = useState(() => ({ start: startOfDay(new Date()).getTime(), end: endOfDay(new Date()).getTime() }));
  const todaysSchedule = useQuery(api.appointments.getMyAppointments, {
    startDate: today.start,
    endDate: today.end,
    limit: 50,
  }) as RawAppointment[] | undefined;

  const rescheduleAppointment = useMutation(api.appointments.rescheduleAppointment);

  const calendarAppointments = useMemo(
    () =>
      appointments.map(
        (a) =>
          ({
            _id: a._id as Id<'appointments'>,
            patientId: (a.patientId || a.patient?._id || '') as Id<'users'>,
            physiotherapistId: (a.physiotherapistId || currentUser?._id || '') as Id<'users'>,
            startTime: a.startTime,
            endTime: a.endTime,
            serviceType: a.serviceType || 'Consultation',
            status: a.status as AppointmentStatus,
            patient: a.patient
              ? { firstName: a.patient.firstName || 'Unknown', lastName: a.patient.lastName || '', imageUrl: a.patient.imageUrl }
              : undefined,
          }) as AppointmentData
      ),
    [appointments, currentUser?._id]
  );

  const openNew = (date?: Date) => {
    setEditingId(undefined);
    setModalDate(date ?? new Date());
    setModalOpen(true);
  };

  // ?new=1 (from Home and the patient page) opens a new appointment once
  const openedFromQuery = useRef(false);
  useEffect(() => {
    if (!openedFromQuery.current && searchParams.get('new') === '1') {
      openedFromQuery.current = true;
      openNew();
    }
  }, [searchParams]);

  const handleAppointmentClick = (appointment: AppointmentData) => {
    // Confirmed and completed sessions get notes; anything else opens for editing
    if (appointment.status === 'confirmed' || appointment.status === 'completed') {
      setSessionLogFor(appointment);
    } else {
      setEditingId(appointment._id);
      setModalDate(new Date(appointment.startTime));
      setModalOpen(true);
    }
  };

  const step = (direction: 1 | -1) =>
    setCurrentDate((date) => (viewMode === 'week' ? addWeeks(date, direction) : addDays(date, direction)));

  const counts = useMemo(
    () => ({
      total: appointments.length,
      confirmed: appointments.filter((a) => a.status === 'confirmed').length,
      completed: appointments.filter((a) => a.status === 'completed').length,
      pending: appointments.filter((a) => a.status === 'scheduled').length,
    }),
    [appointments]
  );

  const rangeLabel =
    viewMode === 'week'
      ? `${format(rangeStart, 'd MMM')} – ${format(rangeEnd, 'd MMM yyyy')}`
      : format(currentDate, 'EEEE, d MMMM yyyy');

  return (
    <PageContainer className="max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">Calendar</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Drag a session to move it. Click an empty slot to book.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/physiotherapist/appointments">
              <List className="mr-2 h-4 w-4" />
              List
            </Link>
          </Button>
          <Button onClick={() => openNew()} className={primaryButtonClass}>
            <Plus className="mr-2 h-4 w-4" />
            New appointment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_18rem]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-soft dark:border-white/[0.06] dark:bg-rh-ink-2 dark:shadow-none">
          <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-3 dark:border-white/[0.07] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => step(-1)} aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => step(1)} aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentDate(new Date())}>
                Today
              </Button>
              <p className="ml-1 truncate text-sm font-semibold text-neutral-900 dark:text-white">{rangeLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as AppointmentStatus | 'all')}>
                <SelectTrigger className="h-8 w-[10.5rem] text-sm" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-white/[0.07]" role="radiogroup" aria-label="View">
                {(['day', 'week'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={viewMode === mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      'rounded-md px-3 py-1 text-sm capitalize transition-colors',
                      viewMode === mode
                        ? 'bg-neutral-900 font-medium text-white dark:bg-white dark:text-neutral-950'
                        : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="h-[calc(100dvh-16rem)] min-h-[28rem] sm:h-[calc(100dvh-15rem)]">
            <AppointmentCalendar
              appointments={calendarAppointments}
              viewMode={viewMode}
              currentDate={currentDate}
              onCreateAppointment={(startTime) => openNew(new Date(startTime))}
              onAppointmentClick={handleAppointmentClick}
              onAppointmentReschedule={async (appointmentId, newStartTime, newEndTime) => {
                await rescheduleAppointment({
                  appointmentId: appointmentId as Id<'appointments'>,
                  newStartTime,
                  newEndTime,
                });
              }}
              businessHoursStart={7}
              businessHoursEnd={21}
              cellDuration={30}
              loading={appointmentsResult === undefined}
            />
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-black/[0.04] bg-white shadow-soft dark:border-white/[0.06] dark:bg-rh-ink-2 dark:shadow-none">
            <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-900 dark:border-white/[0.07] dark:text-white">
              Today
            </h2>
            {todaysSchedule === undefined ? (
              <div className="p-4 text-sm text-neutral-500">Loading…</div>
            ) : todaysSchedule.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">Nothing booked today.</p>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {todaysSchedule
                  .slice()
                  .sort((a, b) => a.startTime - b.startTime)
                  .map((appointment) => (
                    <li key={appointment._id} className="flex items-start justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                          {[appointment.patient?.firstName, appointment.patient?.lastName].filter(Boolean).join(' ') || 'Patient'}
                        </p>
                        <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                          {format(appointment.startTime, 'h:mm a')} – {format(appointment.endTime, 'h:mm a')}
                        </p>
                      </div>
                      {statusBadge(appointment.status)}
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-white/[0.07] dark:bg-rh-ink-2">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">{viewMode === 'week' ? 'This week' : 'This day'}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Appointments', counts.total],
                ['Confirmed', counts.confirmed],
                ['Completed', counts.completed],
                ['Awaiting confirmation', counts.pending],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
                  <dd className="font-medium tabular-nums text-neutral-900 dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>

      <AppointmentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedDate={modalDate}
        onAppointmentCreated={() => setModalOpen(false)}
        appointmentId={editingId}
      />

      <SessionLogModal
        isOpen={sessionLogFor !== null}
        onClose={() => setSessionLogFor(null)}
        appointmentId={sessionLogFor?._id as Id<'appointments'> | undefined}
        patientId={sessionLogFor?.patientId}
      />
    </PageContainer>
  );
}
