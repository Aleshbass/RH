'use client'

import { useEffect, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import { format } from 'date-fns'
import Tippy from '@tippyjs/react'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/themes/light.css'
import 'tippy.js/themes/light-border.css'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { 
  Calendar, 
  Video, 
  MapPin, 
  Clock,
  Phone,
  Mail,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader,
  Pin
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export interface AppointmentData {
  _id: string
  patientId: string
  physiotherapistId: string
  clinicId: string
  startTime: number
  endTime: number
  serviceType: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled_by_patient' | 'cancelled_by_therapist' | 'no_show'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  appointmentType?: 'in-person' | 'telehealth'
  isPinned?: boolean
  colorCode?: string
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
  physiotherapist?: {
    _id: string
    firstName: string
    lastName: string
    email: string
    imageUrl?: string
    phoneNumber?: string
  } | null
}

interface DragDropTooltipCalendarProps {
  appointments: AppointmentData[]
  onCreateAppointment: (date?: Date) => void
  onAppointmentClick: (appointment: AppointmentData) => void
  onAppointmentUpdate?: (appointmentId: string, updates: Partial<AppointmentData>) => Promise<void>
  viewMode?: 'week' | 'day' | 'month'
  currentDate?: Date
  enableDragDrop?: boolean
  showTooltips?: boolean
  showColorPicker?: boolean
  allowPinning?: boolean
  isLoading?: boolean
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

// Enhanced color schemes
const APPOINTMENT_COLORS = {
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
  gradients: {
    primary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    success: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    warning: 'linear-gradient(135deg, #ffeaa7 0%, #fab1a0 100%)',
    danger: 'linear-gradient(135deg, #fd79a8 0%, #e84393 100%)',
    pink: 'linear-gradient(135deg, #fd79a8 0%, #fdcb6e 100%)',
    purple: 'linear-gradient(135deg, #a29bfe 0%, #6c5ce7 100%)',
    ocean: 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)',
  }
}

const getPriorityColor = (priority?: string): string => {
  return APPOINTMENT_COLORS.priority[priority as keyof typeof APPOINTMENT_COLORS.priority] || '#6B7280'
}

const getAppointmentColor = (appointment: AppointmentData): string => {
  // Custom color takes precedence
  if (appointment.colorCode) {
    return appointment.colorCode
  }
  
  // Priority color
  if (appointment.priority) {
    return getPriorityColor(appointment.priority)
  }
  
  // Service type color
  if (appointment.serviceType && APPOINTMENT_COLORS.serviceType[appointment.serviceType as keyof typeof APPOINTMENT_COLORS.serviceType]) {
    return APPOINTMENT_COLORS.serviceType[appointment.serviceType as keyof typeof APPOINTMENT_COLORS.serviceType]
  }
  
  // Default to status color
  return getStatusColor(appointment.status)
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'scheduled':
      return <Clock className="h-3 w-3" />
    case 'confirmed':
      return <CheckCircle className="h-3 w-3" />
    case 'completed':
      return <CheckCircle className="h-3 w-3 text-green-600" />
    case 'cancelled_by_patient':
    case 'cancelled_by_therapist':
      return <XCircle className="h-3 w-3 text-red-600" />
    case 'no_show':
      return <AlertCircle className="h-3 w-3 text-orange-600" />
    default:
      return <Clock className="h-3 w-3" />
  }
}

// Enhanced tooltip content component
const AppointmentTooltip = ({ appointment }: { appointment: AppointmentData }) => {
  const startTime = new Date(appointment.startTime)
  const endTime = new Date(appointment.endTime)
  const duration = Math.round((appointment.endTime - appointment.startTime) / (1000 * 60)) // minutes

  return (
    <div className="p-3 max-w-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">
            {appointment.patient 
              ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
              : 'Unknown Patient'
            }
          </h3>
          <p className="text-sm text-gray-600">{appointment.serviceType}</p>
        </div>
        <Badge 
          variant="secondary" 
          className="text-xs"
          style={{ backgroundColor: getStatusColor(appointment.status) + '20', color: getStatusColor(appointment.status) }}
        >
          {appointment.status.replace(/_/g, ' ')}
        </Badge>
      </div>

      {/* Time Information */}
      <div className="space-y-1 mb-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Clock className="h-3 w-3" />
          <span>{format(startTime, 'MMM d, yyyy')}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="ml-5">{format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}</span>
          <span className="text-xs text-gray-500">({duration} min)</span>
        </div>
      </div>

      {/* Appointment Type */}
      <div className="flex items-center gap-2 mb-2">
        {appointment.appointmentType === 'telehealth' ? (
          <Video className="h-3 w-3 text-blue-600" />
        ) : (
          <MapPin className="h-3 w-3 text-green-600" />
        )}
        <span className="text-sm text-gray-600 capitalize">
          {appointment.appointmentType || 'in-person'}
        </span>
      </div>

      {/* Priority */}
      {appointment.priority && (
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle 
            className="h-3 w-3" 
            style={{ color: getPriorityColor(appointment.priority) }}
          />
          <span className="text-sm text-gray-600 capitalize">
            {appointment.priority} priority
          </span>
        </div>
      )}

      {/* Patient Contact */}
      {appointment.patient && (
        <div className="border-t pt-2 mt-2">
          <div className="text-xs text-gray-500 mb-1">Patient Contact:</div>
          {appointment.patient.email && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Mail className="h-3 w-3" />
              <span>{appointment.patient.email}</span>
            </div>
          )}
          {appointment.patient.phoneNumber && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Phone className="h-3 w-3" />
              <span>{appointment.patient.phoneNumber}</span>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {appointment.notesForTherapist && (
        <div className="border-t pt-2 mt-2">
          <div className="text-xs text-gray-500 mb-1">Notes:</div>
          <p className="text-xs text-gray-600 line-clamp-2">
            {appointment.notesForTherapist}
          </p>
        </div>
      )}

      {/* Drag & Drop Hint */}
      <div className="border-t pt-2 mt-2">
        <p className="text-xs text-gray-400 italic">
          💡 Drag to reschedule • Click for details
        </p>
      </div>
    </div>
  )
}

export function DragDropTooltipCalendar({
  appointments,
  onCreateAppointment,
  onAppointmentClick,
  onAppointmentUpdate,
  viewMode = 'week',
  currentDate = new Date(),
  enableDragDrop = true,
  showTooltips = true,
  showColorPicker = true,
  allowPinning = true,
  isLoading = false
}: DragDropTooltipCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [draggedEvent, setDraggedEvent] = useState<string | null>(null)
  
  // Interactive mode states
  const [pinMode, setPinMode] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [selectedPriority, setSelectedPriority] = useState<'low' | 'medium' | 'high' | 'urgent' | null>(null)
  
  // Toggle functions
  const togglePinMode = () => {
    setPinMode(!pinMode)
    if (selectedColor) setSelectedColor(null)
    if (selectedPriority) setSelectedPriority(null)
  }
  
  const clearSelections = () => {
    setPinMode(false)
    setSelectedColor(null)
    setSelectedPriority(null)
  }
  
  // Update functions
  const togglePin = async (appointmentId: string, isPinned: boolean) => {
    if (onAppointmentUpdate) {
      try {
        await onAppointmentUpdate(appointmentId, { isPinned: !isPinned })
        toast.success(isPinned ? 'Appointment unpinned' : 'Appointment pinned')
      } catch {
        toast.error('Failed to update pin status')
      }
    }
  }
  
  const updateColor = async (appointmentId: string, colorCode: string) => {
    if (onAppointmentUpdate) {
      try {
        await onAppointmentUpdate(appointmentId, { colorCode })
        toast.success('Color updated successfully')
      } catch {
        toast.error('Failed to update color')
      }
    }
  }
  
  const updatePriority = async (appointmentId: string, priority: 'low' | 'medium' | 'high' | 'urgent') => {
    if (onAppointmentUpdate) {
      try {
        await onAppointmentUpdate(appointmentId, { priority })
        toast.success(`Priority set to ${priority}`)
      } catch {
        toast.error('Failed to update priority')
      }
    }
  }

  // Convert appointments to FullCalendar events
  const events = appointments.map((appointment) => ({
    id: appointment._id,
    title: appointment.patient 
      ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
      : 'Unknown Patient',
    start: new Date(appointment.startTime),
    end: new Date(appointment.endTime),
    backgroundColor: getAppointmentColor(appointment),
    borderColor: getAppointmentColor(appointment),
    extendedProps: {
      appointment,
      serviceType: appointment.serviceType,
      status: appointment.status,
      priority: appointment.priority,
      appointmentType: appointment.appointmentType,
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

  // Handle date click for creating new appointments
  const handleDateClick = (info: { date: Date }): void => {
    if (!isDragging) {
      onCreateAppointment(info.date)
    }
  }

  // Handle event click with interactive modes
  const handleEventClick = (info: { event: { extendedProps: { appointment: AppointmentData } } }): void => {
    if (isDragging) return
    
    const appointment = info.event.extendedProps.appointment as AppointmentData
    
    // Handle interactive modes
    if (pinMode) {
      togglePin(appointment._id, appointment.isPinned || false)
      return
    }
    
    if (selectedColor) {
      updateColor(appointment._id, selectedColor)
      return
    }
    
    if (selectedPriority) {
      updatePriority(appointment._id, selectedPriority)
      return
    }
    
    // Default click behavior
    onAppointmentClick(appointment)
  }

  // Enhanced drag & drop handler
  const handleEventDrop = async (info: { event: { id: string }; revert: () => void }): Promise<void> => {
    if (!enableDragDrop || !onAppointmentUpdate) {
      info.revert()
      toast.error('Drag & drop is not enabled')
      return
    }

    const appointmentId = info.event.id
    const newStart = info.event.start
    const newEnd = info.event.end

    if (!newStart || !newEnd) {
      info.revert()
      toast.error('Invalid time range')
      return
    }

    setDraggedEvent(appointmentId)
    
    try {
      // Show loading state
      toast.loading('Rescheduling appointment...', { id: appointmentId })
      
      await onAppointmentUpdate(appointmentId, {
        startTime: newStart.getTime(),
        endTime: newEnd.getTime()
      })

      toast.success('Appointment rescheduled successfully!', { id: appointmentId })
      
      // Show success feedback
      const eventEl = info.el
      eventEl.style.transform = 'scale(1.05)'
      eventEl.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)'
      
      setTimeout(() => {
        eventEl.style.transform = 'scale(1)'
        eventEl.style.boxShadow = ''
      }, 300)

    } catch (error) {
      console.error('Failed to reschedule appointment:', error)
      info.revert()
      toast.error('Failed to reschedule appointment. Please try again.', { id: appointmentId })
    } finally {
      setDraggedEvent(null)
      setIsDragging(false)
    }
  }

  // Enhanced resize handler
  const handleEventResize = async (info: { event: { id: string }; revert: () => void }): Promise<void> => {
    if (!enableDragDrop || !onAppointmentUpdate) {
      info.revert()
      toast.error('Resizing is not enabled')
      return
    }

    const appointmentId = info.event.id
    const newStart = info.event.start
    const newEnd = info.event.end

    if (!newStart || !newEnd) {
      info.revert()
      toast.error('Invalid time range')
      return
    }

    setDraggedEvent(appointmentId)

    try {
      toast.loading('Updating appointment duration...', { id: appointmentId })
      
      await onAppointmentUpdate(appointmentId, {
        startTime: newStart.getTime(),
        endTime: newEnd.getTime()
      })

      toast.success('Appointment duration updated!', { id: appointmentId })

    } catch (error) {
      console.error('Failed to resize appointment:', error)
      info.revert()
      toast.error('Failed to update appointment duration. Please try again.', { id: appointmentId })
    } finally {
      setDraggedEvent(null)
    }
  }

  // Drag start handler
  const handleEventDragStart = (info: { event: { id: string }; el: HTMLElement }): void => {
    setIsDragging(true)
    setDraggedEvent(info.event.id)
    
    // Add visual feedback
    info.el.style.opacity = '0.7'
    info.el.style.transform = 'rotate(2deg)'
    
    toast.info('Drag to reschedule appointment', { duration: 2000 })
  }

  // Drag stop handler
  const handleEventDragStop = (info: { el: HTMLElement }): void => {
    // Reset visual feedback
    info.el.style.opacity = '1'
    info.el.style.transform = 'rotate(0deg)'
  }

  return (
    <div className="w-full h-full min-h-[600px] relative">
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
                          className={`w-8 h-8 rounded-lg mx-auto mb-1 cursor-pointer shadow-md transition-all ${
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
                  
                  <h4 className="font-semibold text-gray-800 mt-4">Gradient Themes</h4>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(APPOINTMENT_COLORS.gradients).map(([name, gradient]) => (
                      <div key={name} className="text-center">
                        <div 
                          className={`w-8 h-8 rounded-lg mx-auto mb-1 cursor-pointer shadow-md transition-all ${
                            selectedColor === gradient ? 'ring-2 ring-pink-500 ring-offset-2' : ''
                          }`}
                          style={{ background: gradient }}
                          title={`${name} Theme`}
                          onClick={() => setSelectedColor(selectedColor === gradient ? null : gradient)}
                        />
                        <span className="text-xs text-gray-600 capitalize">{name}</span>
                      </div>
                    ))}
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
                {(['low', 'medium', 'high', 'urgent'] as const).map((priority) => (
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
                    <AlertCircle 
                      className="h-3 w-3 mr-2" 
                      style={{ color: getPriorityColor(priority) }}
                    />
                    <span className="capitalize">{priority}</span>
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

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Enhanced Appointment Calendar
            {enableDragDrop && (
              <Badge variant="secondary" className="text-xs">
                Drag & Drop
              </Badge>
            )}
            {showTooltips && (
              <Badge variant="secondary" className="text-xs">
                Rich Tooltips
              </Badge>
            )}
            {isLoading && (
              <Loader className="h-4 w-4 animate-spin text-gray-500" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
        <div className="calendar-container">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView={viewMode === 'month' ? 'dayGridMonth' : viewMode === 'day' ? 'timeGridDay' : 'timeGridWeek'}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            events={events}
            editable={enableDragDrop}
            droppable={enableDragDrop}
            selectable={true}
            selectMirror={true}
            dayMaxEvents={true}
            weekends={true}
            height="auto"
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
            eventDragStart={handleEventDragStart}
            eventDragStop={handleEventDragStop}
            eventContent={(eventInfo) => {
              const { serviceType, status, priority, appointmentType, patientName, appointment } = eventInfo.event.extendedProps
              
              const EventContent = (
                <div className={cn(
                  "p-1 text-xs cursor-pointer transition-all duration-200",
                  draggedEvent === eventInfo.event.id ? "animate-pulse" : "",
                  enableDragDrop ? "hover:scale-105 hover:shadow-md" : ""
                )}>
                  <div className="flex items-center gap-1 mb-1">
                    <div className="font-medium truncate flex-1">{patientName}</div>
                    {appointment.isPinned && (
                      <Pin className="h-3 w-3 text-pink-500 flex-shrink-0" />
                    )}
                    {priority && (
                      <div 
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getPriorityColor(priority) }}
                        title={`${priority} priority`}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs opacity-75">
                    {appointmentType === 'telehealth' ? (
                      <Video className="h-3 w-3" />
                    ) : (
                      <MapPin className="h-3 w-3" />
                    )}
                    <span className="truncate">{serviceType}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs opacity-75 mt-1">
                    {getStatusIcon(status)}
                    <span className="capitalize truncate">{status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              )

              // Wrap with tooltip if enabled
              if (showTooltips) {
                return (
                  <Tippy
                    content={<AppointmentTooltip appointment={appointment} />}
                    theme="light-border"
                    placement="auto"
                    interactive={true}
                    delay={[500, 200]}
                    duration={[300, 200]}
                    arrow={true}
                    maxWidth={400}
                    appendTo={() => document.body}
                  >
                    <div>{EventContent}</div>
                  </Tippy>
                )
              }

              return EventContent
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
              const priority = arg.event.extendedProps.priority
              const appointment = arg.event.extendedProps.appointment
              
              return [
                'cursor-pointer',
                'transition-all',
                'duration-200',
                'border-l-4',
                'hover:opacity-90',
                enableDragDrop ? 'hover:shadow-lg' : '',
                status === 'confirmed' ? 'border-l-green-500' : '',
                status === 'scheduled' ? 'border-l-blue-500' : '',
                status === 'completed' ? 'border-l-gray-500' : '',
                status === 'cancelled_by_patient' || status === 'cancelled_by_therapist' ? 'border-l-red-500' : '',
                status === 'no_show' ? 'border-l-orange-500' : '',
                priority === 'urgent' ? 'ring-2 ring-red-200' : '',
                priority === 'high' ? 'ring-1 ring-orange-200' : '',
                appointment?.isPinned ? 'ring-2 ring-pink-300 shadow-lg' : '',
              ].filter(Boolean)
            }}
            eventDidMount={(info) => {
              // Add enhanced styling for drag & drop
              if (enableDragDrop) {
                info.el.style.cursor = 'grab'
                info.el.addEventListener('mousedown', () => {
                  info.el.style.cursor = 'grabbing'
                })
                info.el.addEventListener('mouseup', () => {
                  info.el.style.cursor = 'grab'
                })
              }
            }}
          />
        </div>

        {/* Enhanced Legend */}
        <div className="mt-6 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Status Legend</h4>
            <div className="flex flex-wrap gap-4">
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
                <div className="w-3 h-3 rounded bg-orange-500"></div>
                <span className="text-sm">No Show</span>
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Appointment Type</h4>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Video className="h-3 w-3 text-blue-600" />
                <span className="text-sm">Telehealth</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3 text-green-600" />
                <span className="text-sm">In-Person</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-800 mb-2">💡 Interactive Features</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-700">
              <div>
                <strong>🎨 Color Mode:</strong> Select a color, then click appointments to apply
              </div>
              <div>
                <strong>📌 Pin Mode:</strong> Click appointments to pin/unpin them
              </div>
              <div>
                <strong>⚡ Priority Mode:</strong> Select priority level, then click appointments
              </div>
              {enableDragDrop && (
                <div>
                  <strong>🖱️ Drag & Drop:</strong> Drag appointments to reschedule
                </div>
              )}
            </div>
          </div>
        </div>
        </CardContent>
      </Card>
    </div>
  )
}
