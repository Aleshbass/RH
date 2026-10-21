'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addDays, startOfDay, endOfDay, isBefore, isAfter } from 'date-fns';
import { enUS } from 'date-fns/locale';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import { AppointmentData } from '@/lib/calendar/dayPilotAdapter';
import { toast } from 'sonner';
import { RecurringEditDialog } from './RecurringEditDialog';
import type { RecurringEditScope } from './RecurringEditDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { isOpenAppointment } from '@/convex/helpers/appointmentStatus';
import { lagosDateTime, lagosTimeRange } from '@/convex/helpers/lagosTime';
import { appointmentErrorMessage } from '@/components/appointments/appointment-ui';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

// Define types that aren't exported from react-big-calendar
type View = 'month' | 'week' | 'work_week' | 'day' | 'agenda';
type SlotInfo = {
  start: Date;
  end: Date;
  slots: Date[];
  action: 'select' | 'click' | 'doubleClick';
};

// Setup the localizer for react-big-calendar
const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }), // Monday
  getDay,
  locales,
});

// Create drag-and-drop enabled calendar
const DragAndDropCalendar = withDragAndDrop(Calendar);

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource?: AppointmentData;
}

interface AppointmentCalendarProps {
  appointments: AppointmentData[];
  viewMode?: 'week' | 'day';
  currentDate?: Date;
  onCreateAppointment: (startTime: number, endTime: number) => void;
  onAppointmentClick: (appointment: AppointmentData) => void;
  onAppointmentReschedule: (appointmentId: string, newStartTime: number, newEndTime: number) => Promise<void>;
  businessHoursStart?: number;
  businessHoursEnd?: number;
  cellDuration?: number;
  cellHeight?: number;
  loading?: boolean;
}

export function AppointmentCalendar({
  appointments,
  viewMode = 'week',
  currentDate = new Date(),
  onCreateAppointment,
  onAppointmentClick,
  onAppointmentReschedule,
  businessHoursStart = 8,
  businessHoursEnd = 21,
  cellDuration = 30,
  loading = false,
}: AppointmentCalendarProps) {
  const [view, setView] = useState<View>(viewMode === 'day' ? 'day' : 'week');

  // Sync view state with prop
  React.useEffect(() => {
    setView(viewMode === 'day' ? 'day' : 'week');
  }, [viewMode]);
  const [date, setDate] = useState(currentDate);
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [pendingRecurringEdit, setPendingRecurringEdit] = useState<{
    appointmentId: string;
    appointment: AppointmentData;
    newStartTime: number;
    newEndTime: number;
    actionType: 'move' | 'resize';
  } | null>(null);
  // A dragged visit waits here until the physio confirms the move (the patient gets told)
  const [pendingMove, setPendingMove] = useState<{
    appointment: AppointmentData;
    newStartTime: number;
    newEndTime: number;
    actionType: 'move' | 'resize';
  } | null>(null);
  const [moving, setMoving] = useState(false);

  const confirmPendingMove = async () => {
    if (!pendingMove) return;
    setMoving(true);
    try {
      await onAppointmentReschedule(pendingMove.appointment._id, pendingMove.newStartTime, pendingMove.newEndTime);
      toast.success(pendingMove.actionType === 'move' ? 'Visit moved. The patient has been asked to confirm.' : 'Visit length updated.');
      setPendingMove(null);
    } catch (error) {
      toast.error(appointmentErrorMessage(error, 'Could not move the visit. Please try again.'));
    } finally {
      setMoving(false);
    }
  };

  // Convert appointments to calendar events
  const events: CalendarEvent[] = useMemo(() => {
    return appointments.map((apt) => ({
      id: apt._id,
      title: apt.patient
        ? `${apt.patient.firstName} ${apt.patient.lastName} - ${apt.serviceType}`
        : apt.serviceType || 'Appointment',
      start: new Date(apt.startTime),
      end: new Date(apt.endTime),
      resource: apt,
    }));
  }, [appointments]);

  // Handle slot selection (creating new appointment)
  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    console.log('🎯 Slot selected:', slotInfo);
    const startTime = slotInfo.start.getTime();
    const endTime = slotInfo.end.getTime();
    const now = Date.now();

    // Prevent selecting past time slots
    if (startTime < now) {
      console.log('❌ Past time slot blocked');
      toast.error('Cannot schedule appointments in the past');
      return;
    }

    console.log('✅ Opening appointment modal');
    onCreateAppointment(startTime, endTime);
  }, [onCreateAppointment]);

  // Handle event click
  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    if (event.resource) {
      onAppointmentClick(event.resource);
    }
  }, [onAppointmentClick]);

  // Handle drag and drop event move
  const handleEventDrop = useCallback(async ({ event, start, end }: any) => {
    const appointment = event.resource as AppointmentData;
    if (!appointment) return;

    const newStartTime = start.getTime();
    const newEndTime = end.getTime();
    const now = Date.now();

    // Prevent moving to past
    if (newStartTime < now) {
      toast.error('Cannot reschedule appointments to the past');
      return;
    }
    // Finished or cancelled visits stay where they are
    if (!isOpenAppointment(appointment.status)) {
      toast.error('Only upcoming visits can be moved.');
      return;
    }

    // Check if recurring
    if (appointment.isRecurring) {
      setPendingRecurringEdit({
        appointmentId: appointment._id,
        appointment,
        newStartTime,
        newEndTime,
        actionType: 'move',
      });
      setRecurringDialogOpen(true);
      return;
    }

    setPendingMove({ appointment, newStartTime, newEndTime, actionType: 'move' });
  }, []);

  // Handle event resize
  const handleEventResize = useCallback(async ({ event, start, end }: any) => {
    const appointment = event.resource as AppointmentData;
    if (!appointment) return;

    const newStartTime = start.getTime();
    const newEndTime = end.getTime();
    const now = Date.now();

    // Prevent resizing to past
    if (newStartTime < now) {
      toast.error('Cannot reschedule appointments to the past');
      return;
    }
    if (!isOpenAppointment(appointment.status)) {
      toast.error('Only upcoming visits can be changed.');
      return;
    }

    // Check if recurring
    if (appointment.isRecurring) {
      setPendingRecurringEdit({
        appointmentId: appointment._id,
        appointment,
        newStartTime,
        newEndTime,
        actionType: 'resize',
      });
      setRecurringDialogOpen(true);
      return;
    }

    setPendingMove({ appointment, newStartTime, newEndTime, actionType: 'resize' });
  }, []);

  // Handle recurring edit confirmation
  const handleRecurringEditConfirm = async (scope: RecurringEditScope) => {
    if (!pendingRecurringEdit) return;

    const { appointmentId, newStartTime, newEndTime } = pendingRecurringEdit;

    // Map 'instance' to 'single' for backend compatibility
    const backendScope = scope === 'instance' ? 'single' : scope;

    try {
      // For now, only handle single instance
      // TODO: Wire to updateRecurringSeries for 'future' and 'series'
      await onAppointmentReschedule(appointmentId, newStartTime, newEndTime);
      toast.success('Visit moved. The patient has been asked to confirm.');
    } catch (error) {
      toast.error(appointmentErrorMessage(error, 'Failed to reschedule appointment'));
    } finally {
      setRecurringDialogOpen(false);
      setPendingRecurringEdit(null);
    }
  };

  // Custom event style getter
  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    const appointment = event.resource;
    if (!appointment) return {};

    // Status colors (vibrant, Google Calendar-inspired)
    const statusColors: Record<string, string> = {
      scheduled: '#7CB3FF',      // Bright blue
      confirmed: '#7FD89E',      // Bright green
      consultation: '#FFD666',   // Bright yellow
      completed: '#BFC9D9',      // Medium gray
      cancelled_by_patient: '#FF9999',
      cancelled_by_therapist: '#FF9999',
    };

    // Text colors for better contrast
    const textColors: Record<string, string> = {
      scheduled: '#1E3A8A',      // Dark blue
      confirmed: '#166534',      // Dark green
      consultation: '#92400E',   // Dark brown
      completed: '#374151',      // Dark gray
      cancelled_by_patient: '#7F1D1D',
      cancelled_by_therapist: '#7F1D1D',
    };

    // Priority border colors (more vibrant)
    const priorityColors: Record<string, string> = {
      low: '#6B7280',
      medium: '#F59E0B',
      high: '#F97316',
      urgent: '#DC2626',
    };

    const backgroundColor = statusColors[appointment.status] || '#7CB3FF';
    const textColor = textColors[appointment.status] || '#1E3A8A';
    const borderColor = appointment.priority ? priorityColors[appointment.priority] : '#3B82F6';

    return {
      style: {
        backgroundColor,
        color: textColor,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: '6px',
        padding: '4px 8px',
        fontSize: '13px',
        fontWeight: '600',
        border: appointment.isPinned ? '2px solid #F59E0B' : undefined,
        boxShadow: appointment.isPinned
          ? '0 0 0 3px rgba(245, 158, 11, 0.2)'
          : '0 2px 4px rgba(0, 0, 0, 0.15)',
      },
    };
  }, []);

  // Slot style getter (for past time slots)
  const slotPropGetter = useCallback((date: Date) => {
    const now = new Date();
    const isPast = isBefore(date, now);

    if (isPast) {
      return {
        className: 'rbc-time-slot-past',
        style: {
          background: 'repeating-linear-gradient(45deg, #F3F4F6, #F3F4F6 10px, #E5E7EB 10px, #E5E7EB 20px)',
          opacity: 0.6,
          cursor: 'not-allowed',
        },
      };
    }

    return {};
  }, []);

  // Day prop getter (highlight today)
  const dayPropGetter = useCallback((date: Date) => {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    if (isToday) {
      return {
        className: 'rbc-today',
        style: {
          backgroundColor: '#FEFCE8',
        },
      };
    }

    return {};
  }, []);

  return (
    <>
      <style jsx global>{`
        /* React Big Calendar Modern Styling - 2025 Edition */
        .rbc-calendar {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          height: 100%;
          background: #FFFFFF;
        }

        /* Toolbar */
        .rbc-toolbar {
          display: none; /* Using custom toolbar */
        }

        /* Time view container */
        .rbc-time-view {
          border: none;
          border-radius: 12px;
          overflow: hidden;
        }

        /* Modern gradient header */
        .rbc-time-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-bottom: none;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .rbc-header {
          padding: 20px 12px;
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 1px;
          color: #FFFFFF !important;
          text-transform: uppercase;
          border-left: 1px solid rgba(255, 255, 255, 0.2) !important;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
          transition: all 0.2s ease;
        }

        .rbc-header:hover {
          background: rgba(255, 255, 255, 0.1);
          cursor: pointer;
        }

        .rbc-header + .rbc-header {
          border-left: 1px solid rgba(255, 255, 255, 0.2) !important;
        }

        .rbc-today .rbc-header {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%) !important;
          color: #FFFFFF !important;
          font-weight: 800;
          box-shadow: 0 0 20px rgba(245, 87, 108, 0.4);
          transform: scale(1.02);
        }

        /* Time gutter */
        .rbc-time-gutter {
          background: #F9FAFB;
          border-right: 1px solid #E5E7EB;
        }

        .rbc-label {
          color: #6B7280;
          font-size: 12px;
          font-weight: 600;
          padding-right: 8px;
        }

        /* Time slots */
        .rbc-time-slot {
          border-top: 1px solid #F3F4F6;
          cursor: pointer;
        }

        .rbc-time-content {
          border-top: none;
        }

        .rbc-day-slot {
          background: #FFFFFF;
        }

        .rbc-day-slot .rbc-time-slot {
          border-right: 1px solid #F3F4F6;
          cursor: pointer;
        }

        .rbc-day-slot .rbc-time-slot:hover {
          background: rgba(102, 126, 234, 0.05);
          transition: background 0.2s ease;
        }

        /* Modern Appointment Cards */
        .rbc-event {
          padding: 8px 12px !important;
          border-radius: 10px !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border: none !important;
          font-weight: 500 !important;
          backdrop-filter: blur(10px);
          cursor: pointer !important;
        }

        .rbc-event:hover {
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
          transform: translateY(-2px) scale(1.01);
          filter: brightness(1.05);
          z-index: 10 !important;
          cursor: pointer !important;
        }

        .rbc-event-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          opacity: 0.9;
        }

        .rbc-event-content {
          font-size: 14px;
          font-weight: 600;
          line-height: 1.4;
        }

        /* Modern time slot selection */
        .rbc-slot-selection {
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%) !important;
          border: 2px dashed #667eea !important;
          border-radius: 8px !important;
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        /* Modern current time indicator */
        .rbc-current-time-indicator {
          background: linear-gradient(90deg, #f093fb 0%, #f5576c 100%);
          height: 3px;
          box-shadow: 0 0 10px rgba(245, 87, 108, 0.5);
          z-index: 5;
        }

        .rbc-current-time-indicator::before {
          content: '';
          position: absolute;
          left: -8px;
          top: -5px;
          width: 13px;
          height: 13px;
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          border-radius: 50%;
          box-shadow: 0 0 15px rgba(245, 87, 108, 0.6);
          animation: pulse-dot 2s ease-in-out infinite;
        }

        @keyframes pulse-dot {
          0%, 100% { 
            transform: scale(1);
            box-shadow: 0 0 15px rgba(245, 87, 108, 0.6);
          }
          50% { 
            transform: scale(1.2);
            box-shadow: 0 0 25px rgba(245, 87, 108, 0.8);
          }
        }

        /* Scrollbar */
        .rbc-time-content::-webkit-scrollbar {
          width: 8px;
        }

        .rbc-time-content::-webkit-scrollbar-track {
          background: #F3F4F6;
          border-radius: 4px;
        }

        .rbc-time-content::-webkit-scrollbar-thumb {
          background: #D1D5DB;
          border-radius: 4px;
        }

        .rbc-time-content::-webkit-scrollbar-thumb:hover {
          background: #9CA3AF;
        }

        /* Loading overlay */
        .calendar-loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          border-radius: 8px;
        }
      `}</style>

      <div className="relative h-full">
        {loading && (
          <div className="calendar-loading-overlay">
            <div className="flex items-center gap-2">
              <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
              <span className="text-sm text-gray-600">Loading appointments...</span>
            </div>
          </div>
        )}

        <DragAndDropCalendar
          localizer={localizer}
          events={events}
          view={view}
          date={date}
          onView={setView}
          onNavigate={setDate}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          draggableAccessor={(event: any) => Boolean(event.resource && isOpenAppointment(event.resource.status))}
          resizableAccessor={(event: any) => Boolean(event.resource && isOpenAppointment(event.resource.status))}
          eventPropGetter={eventStyleGetter}
          slotPropGetter={slotPropGetter}
          dayPropGetter={dayPropGetter}
          selectable
          resizable
          step={cellDuration}
          timeslots={60 / cellDuration}
          min={new Date(2024, 0, 1, businessHoursStart, 0, 0)}
          max={new Date(2024, 0, 1, businessHoursEnd, 0, 0)}
          defaultView="week"
          views={['week', 'day']}
          scrollToTime={new Date(2024, 0, 1, 8, 0, 0)}
          showMultiDayTimes
          style={{ height: '100%' }}
        />

        <AlertDialog open={pendingMove !== null} onOpenChange={(open) => { if (!open && !moving) setPendingMove(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingMove?.actionType === 'resize' ? 'Change the visit length?' : 'Move this visit?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingMove && (
                  <>
                    {pendingMove.appointment.patient
                      ? `${pendingMove.appointment.patient.firstName} ${pendingMove.appointment.patient.lastName}`.trim()
                      : 'The patient'}
                    : {lagosDateTime(pendingMove.appointment.startTime)} → {lagosDateTime(pendingMove.newStartTime)} (
                    {lagosTimeRange(pendingMove.newStartTime, pendingMove.newEndTime)}, Lagos time). The patient is told
                    by email and in the app, and asked to confirm the new time.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={moving}>Keep it</AlertDialogCancel>
              <AlertDialogAction
                disabled={moving}
                onClick={(e) => {
                  e.preventDefault();
                  void confirmPendingMove();
                }}
              >
                {moving ? 'Moving…' : pendingMove?.actionType === 'resize' ? 'Change length' : 'Move visit'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {pendingRecurringEdit && (
          <RecurringEditDialog
            isOpen={recurringDialogOpen}
            onClose={() => setRecurringDialogOpen(false)}
            appointmentDate={new Date(pendingRecurringEdit.newStartTime)}
            actionType={pendingRecurringEdit.actionType}
            onConfirm={handleRecurringEditConfirm}
          />
        )}
      </div>
    </>
  );
}
