 'use client'

import { useEffect, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Calendar, 
  Video, 
  MapPin, 
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppointmentData {
  _id: string
  patientId: string
  physiotherapistId: string
  clinicId: string
  startTime: number
  endTime: number
  serviceType: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled_by_patient' | 'cancelled_by_therapist' | 'no_show'
  notesForPatient?: string
  notesForTherapist?: string
  cancellationReason?: string
  patient: {
    _id: string
    firstName: string
    lastName: string
    email: string
    imageUrl?: string
    phoneNumber?: string
  } | null
}

interface AppointmentCalendarProps {
  appointments: AppointmentData[]
  onCreateAppointment: (date?: Date) => void
  onAppointmentClick: (appointment: AppointmentData) => void
  viewMode?: 'week' | 'day' | 'month'
  currentDate?: Date
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'scheduled':
      return '#3B82F6' // Blue
    case 'confirmed':
      return '#10B981' // Green
    case 'completed':
      return '#6B7280' // Gray
    case 'cancelled_by_patient':
    case 'cancelled_by_therapist':
      return '#EF4444' // Red
    case 'no_show':
      return '#F59E0B' // Orange
    default:
      return '#6B7280' // Gray
  }
}

export function AppointmentCalendar({
  appointments,
  onCreateAppointment,
  onAppointmentClick,
  viewMode = 'week',
  currentDate = new Date(),
}: AppointmentCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null)

  // Convert appointments to FullCalendar events
  const events = appointments.map((appointment) => ({
    id: appointment._id,
    title: appointment.patient 
      ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
      : 'Unknown Patient',
    start: new Date(appointment.startTime),
    end: new Date(appointment.endTime),
    backgroundColor: getStatusColor(appointment.status),
    borderColor: getStatusColor(appointment.status),
    extendedProps: {
      appointment,
      serviceType: appointment.serviceType,
      status: appointment.status,
      patientName: appointment.patient 
        ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
        : 'Unknown Patient',
    },
  }))

  // Update calendar view when viewMode or currentDate changes
  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi()
      
      // Set the view based on viewMode
      switch (viewMode) {
        case 'day':
          calendarApi.changeView('timeGridDay')
          break
        case 'week':
          calendarApi.changeView('timeGridWeek')
          break
        case 'month':
          calendarApi.changeView('dayGridMonth')
          break
      }
      
      // Navigate to the current date
      calendarApi.gotoDate(currentDate)
    }
  }, [viewMode, currentDate])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDateClick = (info: any): void => {
    onCreateAppointment(info.date)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEventClick = (info: any): void => {
    const appointment = info.event.extendedProps.appointment as AppointmentData
    onAppointmentClick(appointment)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEventDrop = (info: any): void => {
    // Handle appointment rescheduling
    console.log('Event dropped:', info)
    // You can implement rescheduling logic here
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEventResize = (info: any): void => {
    // Handle appointment duration change
    console.log('Event resized:', info)
    // You can implement duration change logic here
  }

  return (
    <Card className={cn("w-full")}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Appointment Calendar
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (calendarRef.current) {
                  calendarRef.current.getApi().today()
                }
              }}
            >
              Today
            </Button>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (calendarRef.current) {
                    calendarRef.current.getApi().prev()
                  }
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (calendarRef.current) {
                    calendarRef.current.getApi().next()
                  }
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        
        {/* View Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (calendarRef.current) {
                calendarRef.current.getApi().changeView('dayGridMonth')
              }
            }}
          >
            Month
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (calendarRef.current) {
                calendarRef.current.getApi().changeView('timeGridWeek')
              }
            }}
          >
            Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (calendarRef.current) {
                calendarRef.current.getApi().changeView('timeGridDay')
              }
            }}
          >
            Day
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (calendarRef.current) {
                calendarRef.current.getApi().changeView('listWeek')
              }
            }}
          >
            List
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="h-full">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView={viewMode === 'month' ? 'dayGridMonth' : 'timeGridWeek'}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
            }}
            events={events}
            editable={true}
              selectable={true}
              selectMirror={true}
              dayMaxEvents={true}
              weekends={true}
            height="100%"
            slotMinTime="07:00:00"
              slotMaxTime="20:00:00"
            slotDuration="00:30:00"
              businessHours={{
                daysOfWeek: [1, 2, 3, 4, 5], // Monday - Friday
                startTime: '09:00',
                endTime: '17:00',
              }}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            eventResize={handleEventResize}
            eventContent={(eventInfo) => {
              const { serviceType, status, patientName } = eventInfo.event.extendedProps
              
              return (
                <div className="p-1 text-xs">
                  <div className="font-medium truncate">{patientName}</div>
                  <div className="text-xs opacity-75 truncate">{serviceType}</div>
                  <div className="text-xs opacity-75 capitalize">{status.replace(/_/g, ' ')}</div>
                  </div>
              )
            }}
            dayHeaderContent={(args) => {
              return (
                <div className="text-center">
                  <div className="font-semibold">{format(args.date, 'EEE')}</div>
                  <div className="text-sm">{format(args.date, 'MMM d')}</div>
                  </div>
              )
            }}
            slotLabelContent={(args) => {
              return (
                <div className="text-xs text-gray-600">
                  {format(args.date, 'h:mm a')}
                </div>
              )
            }}
            nowIndicator={true}
            eventClassNames={(arg) => {
              const status = arg.event.extendedProps.status
              return [
                'cursor-pointer',
                'hover:opacity-80',
                'transition-opacity',
                'border-l-4',
                status === 'confirmed' ? 'border-l-green-500' : '',
                status === 'scheduled' ? 'border-l-blue-500' : '',
                status === 'completed' ? 'border-l-gray-500' : '',
                status === 'cancelled_by_patient' || status === 'cancelled_by_therapist' ? 'border-l-red-500' : '',
                status === 'no_show' ? 'border-l-orange-500' : '',
              ].filter(Boolean)
            }}
            // Custom styling
            eventDidMount={(info) => {
              // Add custom tooltip or styling if needed
              info.el.setAttribute('title', 
                `${info.event.extendedProps.patientName}\n${info.event.extendedProps.serviceType}\nStatus: ${info.event.extendedProps.status}`
              )
            }}
            />
          </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-500"></div>
            <span className="text-sm">Scheduled</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-500"></div>
            <span className="text-sm">Confirmed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-gray-500"></div>
            <span className="text-sm">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-red-500"></div>
            <span className="text-sm">Cancelled</span>
          </div>
          <div className="flex items-center gap-2">
            <Video className="h-3 w-3" />
            <span className="text-sm">Telehealth</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3" />
            <span className="text-sm">In-Person</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}