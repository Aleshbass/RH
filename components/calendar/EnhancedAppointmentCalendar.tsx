'use client';

import { useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { format } from 'date-fns';
import { Pin, Clock, MapPin, Video, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCalendarUIStore, type PriorityLevel } from '@/stores/calendarUIStore';

export interface AppointmentData {
  _id: string;
  patientId: string;
  physiotherapistId: string;
  clinicId?: string;
  startTime: number;
  endTime: number;
  serviceType: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled_by_patient' | 'cancelled_by_therapist' | 'no_show';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  appointmentType?: 'in-person' | 'telehealth';
  isPinned?: boolean;
  colorCode?: string;
  notesForPatient?: string;
  notesForTherapist?: string;
  cancellationReason?: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    imageUrl?: string;
    phoneNumber?: string;
  } | null;
}

interface EnhancedAppointmentCalendarProps {
  appointments: AppointmentData[];
  onCreateAppointment: (date?: Date) => void;
  onAppointmentClick: (appointment: AppointmentData) => void;
  onAppointmentUpdate?: (appointmentId: string, updates: Partial<AppointmentData>) => void;
  viewMode?: 'week' | 'day' | 'month';
  currentDate?: Date;
  showColorPicker?: boolean;
  allowPinning?: boolean;
}

// Color schemes for different appointment types - Enhanced with pink and modern colors
export const APPOINTMENT_COLORS = {
  status: {
    scheduled: '#3B82F6',      // Blue
    confirmed: '#10B981',      // Emerald
    completed: '#6B7280',      // Gray
    cancelled_by_patient: '#EF4444',    // Red
    cancelled_by_therapist: '#F59E0B',  // Amber
    no_show: '#F97316',        // Orange
  },
  priority: {
    low: '#10B981',            // Emerald
    medium: '#F59E0B',         // Amber
    high: '#EF4444',           // Red
    urgent: '#DC2626',         // Dark Red
  },
  serviceType: {
    'Initial Assessment': '#EC4899',    // Pink
    'Follow-up': '#06B6D4',            // Cyan
    'Massage Therapy': '#84CC16',      // Lime
    'Exercise Therapy': '#F59E0B',     // Amber
    'Manual Therapy': '#8B5CF6',      // Violet
    'Electrotherapy': '#6366F1',       // Indigo
    'Physiotherapy': '#EC4899',        // Pink
    'Rehabilitation': '#F472B6',       // Pink-400
    'Consultation': '#E879F9',         // Fuchsia
    'Assessment': '#C084FC',           // Purple-400
  },
  appointmentType: {
    'in-person': '#10B981',     // Emerald
    'telehealth': '#3B82F6',    // Blue
  },
  // New gradient color schemes
  gradients: {
    primary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    success: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    warning: 'linear-gradient(135deg, #ffeaa7 0%, #fab1a0 100%)',
    danger: 'linear-gradient(135deg, #fd79a8 0%, #e84393 100%)',
    pink: 'linear-gradient(135deg, #fd79a8 0%, #fdcb6e 100%)',
    purple: 'linear-gradient(135deg, #a29bfe 0%, #6c5ce7 100%)',
    ocean: 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)',
  }
};

const getPriorityIcon = (priority?: string) => {
  switch (priority) {
    case 'urgent':
      return <AlertCircle className="h-3 w-3 text-red-600" />;
    case 'high':
      return <AlertCircle className="h-3 w-3 text-orange-600" />;
    case 'medium':
      return <Clock className="h-3 w-3 text-yellow-600" />;
    case 'low':
      return <Clock className="h-3 w-3 text-green-600" />;
    default:
      return null;
  }
};

const getAppointmentColor = (appointment: AppointmentData): string => {
  // Priority takes precedence
  if (appointment.priority && APPOINTMENT_COLORS.priority[appointment.priority]) {
    return APPOINTMENT_COLORS.priority[appointment.priority];
  }
  
  // Custom color code
  if (appointment.colorCode) {
    return appointment.colorCode;
  }
  
  // Service type color (now with pink included)
  if (appointment.serviceType && APPOINTMENT_COLORS.serviceType[appointment.serviceType as keyof typeof APPOINTMENT_COLORS.serviceType]) {
    return APPOINTMENT_COLORS.serviceType[appointment.serviceType as keyof typeof APPOINTMENT_COLORS.serviceType];
  }
  
  // Then status
  if (APPOINTMENT_COLORS.status[appointment.status]) {
    return APPOINTMENT_COLORS.status[appointment.status];
  }
  
  // Default color
  return '#6B7280';
};

const getAppointmentGradient = (appointment: AppointmentData): string => {
  if (appointment.priority === 'urgent') return APPOINTMENT_COLORS.gradients.danger;
  if (appointment.priority === 'high') return APPOINTMENT_COLORS.gradients.warning;
  if (appointment.status === 'confirmed') return APPOINTMENT_COLORS.gradients.success;
  if (appointment.serviceType?.includes('Assessment')) return APPOINTMENT_COLORS.gradients.pink;
  if (appointment.serviceType?.includes('Physiotherapy')) return APPOINTMENT_COLORS.gradients.purple;
  return APPOINTMENT_COLORS.gradients.primary;
};

export function EnhancedAppointmentCalendar({
  appointments,
  onCreateAppointment,
  onAppointmentClick,
  onAppointmentUpdate,
  viewMode = 'week',
  currentDate = new Date(),
  showColorPicker = true,
  allowPinning = true,
}: EnhancedAppointmentCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null);
  
  // Calendar UI store state
  const { 
    pinMode, 
    selectedColor, 
    selectedPriority, 
    togglePinMode, 
    setSelectedColor, 
    setSelectedPriority, 
    clearSelections 
  } = useCalendarUIStore();

  // Convert appointments to FullCalendar events
  const events = appointments.map((appointment) => {
    const color = getAppointmentColor(appointment);
    const gradient = getAppointmentGradient(appointment);
    const patientName = appointment.patient 
      ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
      : 'Unknown Patient';

    return {
      id: appointment._id,
      title: patientName,
      start: new Date(appointment.startTime),
      end: new Date(appointment.endTime),
      backgroundColor: appointment.priority === 'urgent' || appointment.priority === 'high' ? gradient : color,
      borderColor: appointment.isPinned ? '#EC4899' : 'transparent',
      borderWidth: appointment.isPinned ? 3 : 0,
      textColor: '#ffffff',
      extendedProps: {
        appointment,
        serviceType: appointment.serviceType,
        status: appointment.status,
        priority: appointment.priority,
        appointmentType: appointment.appointmentType,
        isPinned: appointment.isPinned,
        patientName,
        patientPhone: appointment.patient?.phoneNumber,
        patientEmail: appointment.patient?.email,
        gradient,
      },
      classNames: [
        'enhanced-appointment',
        appointment.isPinned ? 'pinned-appointment' : '',
        appointment.priority ? `priority-${appointment.priority}` : '',
        appointment.appointmentType ? `type-${appointment.appointmentType}` : '',
        appointment.serviceType?.includes('Assessment') ? 'service-assessment' : '',
        appointment.serviceType?.includes('Physiotherapy') ? 'service-physiotherapy' : '',
      ].filter(Boolean),
    };
  });

  // Update calendar view when viewMode or currentDate changes
  useEffect(() => {
    if (calendarRef.current) {
      // Use setTimeout to defer the calendar operations outside of React's render cycle
      setTimeout(() => {
        if (calendarRef.current) {
          const calendarApi = calendarRef.current.getApi();
          
          switch (viewMode) {
            case 'day':
              calendarApi.changeView('timeGridDay');
              break;
            case 'week':
              calendarApi.changeView('timeGridWeek');
              break;
            case 'month':
              calendarApi.changeView('dayGridMonth');
              break;
          }
          
          calendarApi.gotoDate(currentDate);
        }
      }, 0);
    }
  }, [viewMode, currentDate]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDateClick = (info: any) => {
    onCreateAppointment(info.date);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEventClick = (info: any) => {
    const appointment = info.event.extendedProps.appointment;
    const { pinMode, selectedColor, selectedPriority, clearSelections } = useCalendarUIStore.getState();
    
    // Handle different modes
    if (pinMode) {
      // Toggle pin mode
      togglePin(appointment._id, appointment.isPinned);
      clearSelections();
    } else if (selectedColor) {
      // Apply selected color
      updateColor(appointment._id, selectedColor);
      clearSelections();
    } else if (selectedPriority) {
      // Apply selected priority
      updatePriority(appointment._id, selectedPriority);
      clearSelections();
    } else {
      // Default behavior - open appointment details
      onAppointmentClick(appointment);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEventDrop = (info: any) => {
    const appointment = info.event.extendedProps.appointment as AppointmentData;
    const newStartTime = info.event.start?.getTime();
    const newEndTime = info.event.end?.getTime();
    
    if (newStartTime && newEndTime && onAppointmentUpdate) {
      onAppointmentUpdate(appointment._id, {
        startTime: newStartTime,
        endTime: newEndTime,
      });
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEventResize = (info: any) => {
    const appointment = info.event.extendedProps.appointment as AppointmentData;
    const newEndTime = info.event.end?.getTime();
    
    if (newEndTime && onAppointmentUpdate) {
      onAppointmentUpdate(appointment._id, {
        endTime: newEndTime,
      });
    }
  };

  const togglePin = (appointmentId: string, isPinned: boolean) => {
    if (onAppointmentUpdate) {
      onAppointmentUpdate(appointmentId, { isPinned: !isPinned });
    }
  };

  const updateColor = (appointmentId: string, colorCode: string) => {
    if (onAppointmentUpdate) {
      onAppointmentUpdate(appointmentId, { colorCode });
    }
  };

  const updatePriority = (appointmentId: string, priority: 'low' | 'medium' | 'high' | 'urgent') => {
    if (onAppointmentUpdate) {
      onAppointmentUpdate(appointmentId, { priority });
    }
  };

  return (
    <div className="w-full h-full min-h-[600px] relative">
      {/* Custom CSS for enhanced styling */}
      <style jsx global>{`
        .enhanced-appointment {
          border-radius: 8px !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          backdrop-filter: blur(10px) !important;
          position: relative !important;
          overflow: hidden !important;
        }
        
        .enhanced-appointment::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
          border-radius: 8px;
          z-index: 1;
        }
        
        .enhanced-appointment:hover {
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15) !important;
          transform: translateY(-2px) scale(1.02) !important;
          border-color: rgba(255, 255, 255, 0.3) !important;
        }
        
        .pinned-appointment {
          border-left: 4px solid #DC2626 !important;
          position: relative;
        }
        
        .pinned-appointment::before {
          content: '📌';
          position: absolute;
          top: 2px;
          right: 2px;
          font-size: 10px;
          z-index: 10;
        }
        
        .priority-urgent {
          animation: pulse 2s infinite;
        }
        
        .priority-high {
          border-top: 3px solid #EF4444 !important;
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.3) !important;
        }
        
        .service-assessment {
          background: linear-gradient(135deg, #EC4899 0%, #F472B6 100%) !important;
          box-shadow: 0 4px 15px rgba(236, 72, 153, 0.3) !important;
        }
        
        .service-physiotherapy {
          background: linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%) !important;
          box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3) !important;
        }
        
        .type-telehealth {
          position: relative;
        }
        
        .type-telehealth::after {
          content: '💻';
          position: absolute;
          bottom: 2px;
          right: 2px;
          font-size: 12px;
          z-index: 2;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
          padding: 1px 3px;
        }
        
        .type-in-person::after {
          content: '🏥';
          position: absolute;
          bottom: 2px;
          right: 2px;
          font-size: 12px;
          z-index: 2;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
          padding: 1px 3px;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        
        .fc-event-title {
          font-weight: 600 !important;
        }
        
        .fc-daygrid-event {
          padding: 2px 4px !important;
        }
        
        .fc-timegrid-event {
          padding: 4px !important;
        }

        /* Fix calendar height and layout issues */
        .fc {
          height: 100% !important;
        }

        .fc-view-harness {
          height: 100% !important;
        }

        .fc-scroller {
          overflow-y: auto !important;
        }

        .fc-timegrid-body {
          min-height: 400px !important;
        }

        .fc-daygrid-body {
          min-height: 300px !important;
        }

        /* Improve day header styling */
        .fc-col-header-cell {
          background-color: #f8fafc !important;
          border-color: #e2e8f0 !important;
          font-weight: 600 !important;
        }

        /* Improve slot styling */
        .fc-timegrid-slot {
          height: 2em !important;
          border-color: #f1f5f9 !important;
        }

        .fc-timegrid-slot-minor {
          border-color: #f8fafc !important;
        }

        /* Current time indicator */
        .fc-timegrid-now-indicator-line {
          border-color: #ef4444 !important;
          border-width: 2px !important;
        }

        .fc-timegrid-now-indicator-arrow {
          border-left-color: #ef4444 !important;
          border-width: 5px !important;
        }

        /* Business hours styling */
        .fc-non-business {
          background-color: #f8fafc !important;
        }

        /* Week/day grid improvements */
        .fc-timegrid-col-frame {
          position: relative;
        }

        .fc-timegrid-slots .fc-timegrid-slot {
          border-bottom: 1px solid #f1f5f9;
        }

        .fc-timegrid-axis {
          font-size: 12px !important;
          color: #64748b !important;
        }
      `}</style>

      <div className="h-full pb-20">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView={viewMode === 'month' ? 'dayGridMonth' : 'timeGridWeek'}
          headerToolbar={false} // Disable default header since we have custom controls
          events={events}
          editable={true}
          selectable={true}
          selectMirror={true}
          dayMaxEvents={true}
          weekends={true}
          height="100%"
          aspectRatio={1.8} // Better aspect ratio for calendar display
          slotMinTime="07:00:00"
          slotMaxTime="20:00:00"
          slotDuration="00:30:00"
          slotLabelInterval="01:00:00" // Show hour labels only
          allDaySlot={false} // Disable all-day slot for cleaner look
          businessHours={{
            daysOfWeek: [1, 2, 3, 4, 5],
            startTime: '09:00',
            endTime: '17:00',
          }}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventContent={(eventInfo) => {
            const { appointment, serviceType, status, appointmentType, isPinned, patientName, gradient } = eventInfo.event.extendedProps;
            const priority = appointment?.priority || null;
            
            return (
              <div className="p-2 text-xs relative overflow-hidden h-full" style={{
                background: appointment?.priority === 'urgent' || appointment?.priority === 'high' ? gradient : undefined,
                zIndex: 2
              }}>
                {/* Gradient overlay for special appointments */}
                {serviceType?.includes('Assessment') || serviceType?.includes('Physiotherapy') ? (
                  <div 
                    className="absolute inset-0 opacity-20 rounded-lg"
                    style={{ 
                      background: serviceType.includes('Assessment') ? 
                        'linear-gradient(135deg, #EC4899 0%, #F472B6 100%)' : 
                        'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)'
                    }}
                  />
                ) : null}

                {/* Pin indicator */}
                {isPinned && (
                  <Pin className="absolute top-1 right-1 h-3 w-3 text-pink-300 drop-shadow-sm z-10" />
                )}
                
                {/* Priority indicator */}
                {priority && (
                  <div className="absolute top-1 left-1 z-10">
                    {getPriorityIcon(priority)}
                  </div>
                )}
                
                {/* Patient name */}
                <div className="font-semibold truncate mt-2 text-white drop-shadow-sm z-10 relative">
                  {patientName}
                </div>
                
                {/* Service type */}
                <div className="text-xs opacity-95 truncate text-white drop-shadow-sm z-10 relative">
                  {serviceType}
                </div>
                
                {/* Status badge */}
                <div className="flex items-center gap-1 mt-1 z-10 relative">
                  {appointmentType === 'telehealth' ? (
                    <Video className="h-3 w-3 opacity-90 text-white drop-shadow-sm" />
                  ) : (
                    <MapPin className="h-3 w-3 opacity-90 text-white drop-shadow-sm" />
                  )}
                  <span className="text-xs opacity-90 capitalize text-white drop-shadow-sm bg-black bg-opacity-20 px-1 py-0.5 rounded">
                    {status ? status.replace(/_/g, ' ') : 'scheduled'}
                  </span>
                </div>
              </div>
            );
          }}
          dayHeaderContent={(args) => {
            return (
              <div className="text-center py-2">
                <div className="font-semibold text-gray-700">{format(args.date, 'EEE')}</div>
                <div className="text-sm text-gray-500">{format(args.date, 'MMM d')}</div>
              </div>
            );
          }}
          slotLabelContent={(args) => {
            return (
              <div className="text-xs text-gray-600 pr-2">
                {format(args.date, 'h a')}
              </div>
            );
          }}
          nowIndicator={true}
          eventDidMount={(info) => {
            const { appointment, patientName, patientPhone, patientEmail } = info.event.extendedProps;
            
            // Add enhanced tooltip
            const tooltipContent = [
              `Patient: ${patientName || 'Unknown'}`,
              `Service: ${appointment?.serviceType || 'Unknown'}`,
              `Status: ${appointment?.status?.replace(/_/g, ' ') || 'Unknown'}`,
              appointment?.priority ? `Priority: ${appointment.priority}` : '',
              appointment?.appointmentType ? `Type: ${appointment.appointmentType}` : '',
              patientPhone ? `Phone: ${patientPhone}` : '',
              patientEmail ? `Email: ${patientEmail}` : '',
              appointment?.notesForTherapist ? `Notes: ${appointment.notesForTherapist}` : '',
            ].filter(Boolean).join('\n');
            
            info.el.setAttribute('title', tooltipContent);
            
            // Add context menu for enhanced features
            info.el.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              // You can implement a context menu here for quick actions
              console.log('Right-clicked appointment:', appointment?._id || 'Unknown appointment');
            });
          }}
        />
      </div>

      {/* Enhanced Color Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-xl shadow-2xl p-4 border border-gray-200 max-w-xs z-50">
        <h4 className="font-semibold text-sm mb-3 text-gray-800">Legend</h4>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded-md shadow-sm"></div>
            <span className="text-gray-700">Scheduled</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-emerald-500 rounded-md shadow-sm"></div>
            <span className="text-gray-700">Confirmed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-500 rounded-md shadow-sm"></div>
            <span className="text-gray-700">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded-md shadow-sm"></div>
            <span className="text-gray-700">Cancelled</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gradient-to-r from-pink-500 to-pink-400 rounded-md shadow-sm"></div>
            <span className="text-gray-700">Assessment</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gradient-to-r from-purple-500 to-purple-400 rounded-md shadow-sm"></div>
            <span className="text-gray-700">Physiotherapy</span>
          </div>
          <div className="flex items-center gap-2">
            <Pin className="h-4 w-4 text-pink-500" />
            <span className="text-gray-700">Pinned</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-gray-700">Urgent</span>
          </div>
        </div>
      </div>

      {/* Mode Status Indicator */}
      {(pinMode || selectedColor || selectedPriority) && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-full shadow-lg backdrop-blur-sm z-50">
          <div className="flex items-center gap-2">
            {pinMode && <span>📌 Pin Mode Active</span>}
            {selectedColor && <span>🎨 Color Mode Active</span>}
            {selectedPriority && <span>⚡ Priority Mode Active ({selectedPriority})</span>}
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20 h-6 w-6 p-0 ml-2"
              onClick={clearSelections}
            >
              ✕
            </Button>
          </div>
        </div>
      )}

      {/* Enhanced Quick Actions Toolbar */}
      {(showColorPicker || allowPinning) && (
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-xl shadow-xl p-3 border border-gray-200 flex gap-2 z-50">
          {showColorPicker && (
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant={selectedColor ? "default" : "outline"} 
                  size="sm" 
                  className={`${selectedColor ? 'bg-pink-500 text-white hover:bg-pink-600' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  🎨 Colors
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-800">Service Type Colors</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(APPOINTMENT_COLORS.serviceType).map(([service, color]) => (
                      <div key={service} className="text-center">
                        <div 
                          className={`w-8 h-8 rounded-lg mx-auto mb-2 cursor-pointer shadow-md hover:shadow-lg transition-all ${
                            selectedColor === color ? 'ring-2 ring-pink-500 ring-offset-2' : ''
                          }`}
                          style={{ backgroundColor: color }}
                          title={service}
                          onClick={() => setSelectedColor(selectedColor === color ? null : color)}
                        />
                        <span className="text-xs text-gray-600">{service.split(' ')[0]}</span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="pt-3 border-t">
                    <h5 className="font-medium text-gray-700 mb-2">Gradient Themes</h5>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center">
                        <div 
                          className={`w-8 h-8 rounded-lg mx-auto mb-1 cursor-pointer shadow-md transition-all ${
                            selectedColor === APPOINTMENT_COLORS.gradients.pink ? 'ring-2 ring-pink-500 ring-offset-2' : ''
                          }`}
                          style={{ background: APPOINTMENT_COLORS.gradients.pink }}
                          title="Pink Theme"
                          onClick={() => setSelectedColor(selectedColor === APPOINTMENT_COLORS.gradients.pink ? null : APPOINTMENT_COLORS.gradients.pink)}
                        />
                        <span className="text-xs text-gray-600">Pink</span>
                      </div>
                      <div className="text-center">
                        <div 
                          className={`w-8 h-8 rounded-lg mx-auto mb-1 cursor-pointer shadow-md transition-all ${
                            selectedColor === APPOINTMENT_COLORS.gradients.purple ? 'ring-2 ring-pink-500 ring-offset-2' : ''
                          }`}
                          style={{ background: APPOINTMENT_COLORS.gradients.purple }}
                          title="Purple Theme"
                          onClick={() => setSelectedColor(selectedColor === APPOINTMENT_COLORS.gradients.purple ? null : APPOINTMENT_COLORS.gradients.purple)}
                        />
                        <span className="text-xs text-gray-600">Purple</span>
                      </div>
                      <div className="text-center">
                        <div 
                          className={`w-8 h-8 rounded-lg mx-auto mb-1 cursor-pointer shadow-md transition-all ${
                            selectedColor === APPOINTMENT_COLORS.gradients.ocean ? 'ring-2 ring-pink-500 ring-offset-2' : ''
                          }`}
                          style={{ background: APPOINTMENT_COLORS.gradients.ocean }}
                          title="Ocean Theme"
                          onClick={() => setSelectedColor(selectedColor === APPOINTMENT_COLORS.gradients.ocean ? null : APPOINTMENT_COLORS.gradients.ocean)}
                        />
                        <span className="text-xs text-gray-600">Ocean</span>
                      </div>
                    </div>
                  </div>
                  
                  {(selectedColor || selectedPriority || pinMode) && (
                    <div className="pt-3 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-gray-500 hover:text-gray-700"
                        onClick={clearSelections}
                      >
                        Clear All Selections
                      </Button>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          
          <Button 
            variant={pinMode ? "default" : "outline"} 
            size="sm" 
            className={`${pinMode ? 'bg-pink-500 text-white hover:bg-pink-600' : 'text-gray-700 hover:bg-pink-50 hover:text-pink-600'}`}
            onClick={togglePinMode}
          >
            📌 Pin Mode
          </Button>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant={selectedPriority ? "default" : "outline"} 
                size="sm" 
                className={`${selectedPriority ? 'bg-purple-500 text-white hover:bg-purple-600' : 'text-gray-700 hover:bg-purple-50 hover:text-purple-600'}`}
              >
                ⚡ Priority
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48">
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-800 mb-3">Set Priority</h4>
                {(['low', 'medium', 'high', 'urgent'] as PriorityLevel[]).map((priority) => (
                  <Button
                    key={priority}
                    variant={selectedPriority === priority ? "default" : "outline"}
                    size="sm"
                    className={`w-full justify-start ${
                      selectedPriority === priority 
                        ? 'bg-purple-500 text-white hover:bg-purple-600' 
                        : 'hover:bg-purple-50'
                    }`}
                    onClick={() => setSelectedPriority(selectedPriority === priority ? null : priority)}
                  >
                    {getPriorityIcon(priority)}
                    <span className="ml-2 capitalize">{priority}</span>
                  </Button>
                ))}
                {selectedPriority && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-gray-500 hover:text-gray-700"
                    onClick={clearSelections}
                  >
                    Clear Selection
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
} 