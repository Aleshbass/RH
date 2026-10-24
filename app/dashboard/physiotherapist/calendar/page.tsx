'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { addDays, addWeeks, endOfDay, endOfWeek, format, startOfDay, startOfWeek } from 'date-fns';
import { CalendarPlus, ChevronLeft, ChevronRight, Video } from '@/components/icons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppointmentCalendar } from '@/components/calendar/AppointmentCalendar';
import type { AppointmentData } from '@/lib/calendar/dayPilotAdapter';
import { accentButtonClass, cardClass, InfoTip, PageContainer, PageHeader, Panel, primaryButtonClass, StatusBadge } from '@/components/physio/ui';
import { AppointmentDrawer } from '@/components/physio/schedule/AppointmentDrawer';
import { useBooking } from '@/components/physio/schedule/BookingDrawer';
import { joinLink, useNow, visitStatus, type PhysioAppointment } from '@/components/physio/schedule/shared';
import { cn } from '@/lib/utils';
import { APPOINTMENT_STATUS_LABELS } from '@/convex/helpers/appointmentStatus';
import { lagosTimeRange } from '@/convex/helpers/lagosTime';

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
  ...(Object.keys(APPOINTMENT_STATUS_LABELS) as AppointmentStatus[]).map((value) => ({
    value,
    label: value === 'cancelled_by_therapist' ? 'Cancelled by you' : APPOINTMENT_STATUS_LABELS[value],
  })),
];


export default function CalendarPage() {
  const searchParams = useSearchParams();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  // Phones start in day view; after that the choice is the user's
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  useEffect(() => {
    if (window.innerWidth < 1024) setViewMode('day');
  }, []);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');

  const openBooking = useBooking();
  const now = useNow(30_000);
  // The visit open in the drawer (looked up live, so it updates while open)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // An empty slot books that time; the button starts from your open times
  const openNew = (date?: Date) => openBooking(date ? { slot: { start: date.getTime() } } : undefined);

  // ?new=1 (from Home and the patient page) opens a new appointment once
  const openedFromQuery = useRef(false);
  useEffect(() => {
    if (!openedFromQuery.current && searchParams.get('new') === '1') {
      openedFromQuery.current = true;
      openNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openVisit = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  };
  const handleAppointmentClick = (appointment: AppointmentData) => openVisit(appointment._id);
  const selected = useMemo(
    () =>
      ((appointmentsResult ?? []).find((a) => a._id === selectedId) ??
        (todaysSchedule ?? []).find((a) => a._id === selectedId) ??
        null) as PhysioAppointment | null,
    [appointmentsResult, todaysSchedule, selectedId]
  );

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
      <PageHeader
        title="Calendar"
        description="Tap an empty time to book it. Tap a session to see it or answer it."
        info="Drag a session to move it; the patient is told. Times are Lagos time. Paid Rehabify sessions appear once the patient has paid."
        actions={
          <Button onClick={() => openNew()} className={cn(primaryButtonClass, 'h-10 px-4')}>
            <CalendarPlus className="mr-2 h-4 w-4" />
            New appointment
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_18rem]">
        <section className={cn(cardClass, 'min-w-0 overflow-hidden')}>
          <div className="flex flex-col gap-3 border-b border-pt-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
              <p className="ml-1 truncate text-sm font-semibold text-pt-ink">{rangeLabel}</p>
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
              <div className="inline-flex rounded-xl bg-pt-sunken p-0.5" role="radiogroup" aria-label="View">
                {(['day', 'week'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={viewMode === mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      'rounded-lg px-3 py-1 text-sm capitalize transition-colors',
                      viewMode === mode ? 'bg-pt-surface font-medium text-pt-ink shadow-pt dark:shadow-none' : 'text-pt-muted hover:text-pt-ink'
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
          <Panel title="Today" info="Tap a session to open it. Video sessions get a Join button 10 minutes before they start." bodyClassName="px-2 pb-2 pt-1">
            {todaysSchedule === undefined ? (
              <div className="p-4 text-sm text-pt-muted">Loading…</div>
            ) : todaysSchedule.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-pt-muted">Nothing booked today.</p>
            ) : (
              <ul>
                {todaysSchedule
                  .slice()
                  .sort((a, b) => a.startTime - b.startTime)
                  .map((appointment) => {
                    const full = appointment as unknown as PhysioAppointment;
                    const status = visitStatus(full, now);
                    const link = joinLink(full, now);
                    return (
                      <li key={appointment._id} className="flex items-center gap-2 rounded-2xl px-2 py-2.5 transition-colors hover:bg-pt-hover">
                        <button type="button" onClick={() => openVisit(appointment._id)} className="min-w-0 flex-1 text-left">
                          <p className="truncate text-sm font-semibold text-pt-ink">
                            {[appointment.patient?.firstName, appointment.patient?.lastName].filter(Boolean).join(' ') || 'Patient'}
                          </p>
                          <p className="text-xs tabular-nums text-pt-muted">{lagosTimeRange(appointment.startTime, appointment.endTime)}</p>
                        </button>
                        {link ? (
                          <Button asChild size="sm" className={cn(accentButtonClass, 'h-8 px-2.5')}>
                            <a href={link} target="_blank" rel="noopener noreferrer">
                              <Video className="mr-1 h-3.5 w-3.5" />
                              Join
                            </a>
                          </Button>
                        ) : (
                          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </Panel>

          <section className={cn(cardClass, 'p-5')}>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-pt-ink">
              {viewMode === 'week' ? 'This week' : 'This day'}
              <InfoTip>Counts for the dates on screen. “Waiting” means the patient or you still have to confirm the time.</InfoTip>
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Appointments', counts.total],
                ['Confirmed', counts.confirmed],
                ['Completed', counts.completed],
                ['Waiting', counts.pending],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <dt className="text-pt-muted">{label}</dt>
                  <dd className="font-medium tabular-nums text-pt-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>

      <AppointmentDrawer appointment={selected} open={drawerOpen && selected !== null} onOpenChange={setDrawerOpen} />
    </PageContainer>
  );
}
