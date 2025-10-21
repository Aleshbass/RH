/**
 * DayPilot Adapter
 * Transforms application data to DayPilot-compatible formats
 */

import { Id } from '@/convex/_generated/dataModel'

// Types
export interface AppointmentData {
  _id: Id<'appointments'>
  patientId: Id<'users'>
  physiotherapistId: Id<'users'>
  startTime: number
  endTime: number
  serviceType: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled_by_patient' | 'cancelled_by_therapist' | 'no_show'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  appointmentType?: 'in-person' | 'telehealth'
  isPinned?: boolean
  colorCode?: string
  isRecurring?: boolean
  seriesId?: Id<'recurringSeries'>
  notesForPatient?: string
  notesForTherapist?: string
  selectedResources?: Id<'resources'>[]
  patient?: {
    firstName: string
    lastName: string
    imageUrl?: string
  }
}

export interface Provider {
  _id: Id<'users'>
  firstName: string
  lastName: string
  imageUrl?: string
  specializations?: string[]
}

export interface DayPilotEvent {
  id: string
  text: string
  start: string
  end: string
  resource?: string
  backColor: string
  borderColor: string
  fontColor: string
  barColor?: string
  barHeight?: number
  cssClass?: string
  html?: string
  tags?: {
    status: string
    priority?: string
    type?: string
    isPinned?: boolean
    isRecurring?: boolean
    seriesId?: string
    telehealth?: boolean
    patientName?: string
    serviceType?: string
    notes?: string
  }
  bubbleHtml?: string
  toolTip?: string
}

export interface DayPilotResource {
  id: string
  name: string
  avatar?: string
  tags?: {
    specializations?: string[]
  }
}

/**
 * Status color palette (pastel shades)
 */
const STATUS_COLORS = {
  scheduled: {
    back: '#E3F2FD',    // Light blue
    border: '#90CAF9',
    font: '#1565C0'
  },
  confirmed: {
    back: '#E8F5E9',    // Light green
    border: '#81C784',
    font: '#2E7D32'
  },
  completed: {
    back: '#F3E5F5',    // Light purple
    border: '#CE93D8',
    font: '#6A1B9A'
  },
  cancelled_by_patient: {
    back: '#FFEBEE',    // Light red
    border: '#EF9A9A',
    font: '#C62828'
  },
  cancelled_by_therapist: {
    back: '#FFF3E0',    // Light orange
    border: '#FFCC80',
    font: '#E65100'
  },
  no_show: {
    back: '#ECEFF1',    // Light gray
    border: '#B0BEC5',
    font: '#455A64'
  }
} as const

/**
 * Priority bar colors (left border indicator)
 */
const PRIORITY_COLORS = {
  urgent: '#D32F2F',   // Red
  high: '#F57C00',     // Orange
  medium: '#1976D2',   // Blue
  low: '#388E3C'       // Green
} as const

/**
 * Get status color scheme
 */
export function getStatusColor(status: AppointmentData['status']) {
  return STATUS_COLORS[status] || STATUS_COLORS.scheduled
}

/**
 * Get priority border color
 */
export function getPriorityColor(priority?: AppointmentData['priority']): string {
  if (!priority) return 'transparent'
  return PRIORITY_COLORS[priority]
}

/**
 * Format patient name
 */
function formatPatientName(appointment: AppointmentData): string {
  if (appointment.patient) {
    return `${appointment.patient.firstName} ${appointment.patient.lastName}`
  }
  return 'Patient'
}

/**
 * Format time for display
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

/**
 * Generate event bubble HTML (hover tooltip)
 */
function generateBubbleHtml(appointment: AppointmentData): string {
  const patientName = formatPatientName(appointment)
  const startTime = formatTime(appointment.startTime)
  const endTime = formatTime(appointment.endTime)
  const type = appointment.appointmentType || 'in-person'
  const typeIcon = type === 'telehealth' ? '📹' : '🏥'
  const priorityText = appointment.priority ? `Priority: ${appointment.priority.toUpperCase()}` : ''
  
  return `
    <div style="padding: 12px; min-width: 220px;">
      <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
        ${typeIcon} ${patientName}
      </div>
      <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
        <strong>Time:</strong> ${startTime} - ${endTime}
      </div>
      <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
        <strong>Service:</strong> ${appointment.serviceType}
      </div>
      <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
        <strong>Status:</strong> ${appointment.status.replace(/_/g, ' ').toUpperCase()}
      </div>
      ${priorityText ? `<div style="font-size: 12px; color: #666; margin-bottom: 4px;">${priorityText}</div>` : ''}
      ${appointment.isPinned ? '<div style="font-size: 12px; color: #F57C00; margin-top: 4px;">📌 Pinned</div>' : ''}
      ${appointment.isRecurring ? '<div style="font-size: 12px; color: #1976D2; margin-top: 4px;">🔄 Recurring</div>' : ''}
    </div>
  `
}

/**
 * Generate event card HTML
 */
function generateEventHtml(appointment: AppointmentData): string {
  const patientName = formatPatientName(appointment)
  const startTime = formatTime(appointment.startTime)
  const typeIcon = appointment.appointmentType === 'telehealth' ? '📹' : '🏥'
  const pinnedIcon = appointment.isPinned ? '<span style="position: absolute; top: 4px; right: 4px;">📌</span>' : ''
  const recurringIcon = appointment.isRecurring ? '<span style="position: absolute; bottom: 4px; right: 4px; font-size: 10px;">🔄</span>' : ''
  
  return `
    <div style="
      position: relative;
      padding: 8px;
      height: 100%;
      overflow: hidden;
      border-radius: 6px;
      font-size: 13px;
    ">
      ${pinnedIcon}
      ${recurringIcon}
      <div style="font-weight: 600; margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
        <span>${typeIcon}</span>
        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${patientName}</span>
      </div>
      <div style="font-size: 11px; opacity: 0.9;">
        ${startTime} • ${appointment.serviceType}
      </div>
    </div>
  `
}

/**
 * Convert appointments to DayPilot events
 */
export function appointmentsToDayPilotEvents(appointments: AppointmentData[]): DayPilotEvent[] {
  return appointments.map(appointment => {
    const statusColor = getStatusColor(appointment.status)
    const priorityColor = getPriorityColor(appointment.priority)
    
    return {
      id: appointment._id,
      text: formatPatientName(appointment),
      start: new Date(appointment.startTime).toISOString(),
      end: new Date(appointment.endTime).toISOString(),
      resource: appointment.physiotherapistId,
      backColor: appointment.colorCode || statusColor.back,
      borderColor: statusColor.border,
      fontColor: statusColor.font,
      barColor: priorityColor,
      barHeight: priorityColor !== 'transparent' ? 4 : 0,
      cssClass: `appointment-event status-${appointment.status}${appointment.isPinned ? ' pinned' : ''}${appointment.isRecurring ? ' recurring' : ''}`,
      html: generateEventHtml(appointment),
      bubbleHtml: generateBubbleHtml(appointment),
      toolTip: `${formatPatientName(appointment)} - ${appointment.serviceType}`,
      tags: {
        status: appointment.status,
        priority: appointment.priority,
        type: appointment.appointmentType,
        isPinned: appointment.isPinned,
        isRecurring: appointment.isRecurring,
        seriesId: appointment.seriesId,
        telehealth: appointment.appointmentType === 'telehealth',
        patientName: formatPatientName(appointment),
        serviceType: appointment.serviceType,
        notes: appointment.notesForTherapist
      }
    }
  })
}

/**
 * Convert providers to DayPilot resources
 */
export function providersToDayPilotResources(providers: Provider[]): DayPilotResource[] {
  return providers.map(provider => ({
    id: provider._id,
    name: `${provider.firstName} ${provider.lastName}`,
    avatar: provider.imageUrl,
    tags: {
      specializations: provider.specializations
    }
  }))
}

/**
 * Parse DayPilot event back to appointment update
 */
export function dayPilotEventToAppointmentUpdate(event: any) {
  return {
    startTime: new Date(event.start).getTime(),
    endTime: new Date(event.end).getTime(),
    ...(event.resource && { physiotherapistId: event.resource })
  }
}

/**
 * Validate appointment time slot
 */
export function validateTimeSlot(start: number, end: number): { valid: boolean; error?: string } {
  const duration = end - start
  const minDuration = 15 * 60 * 1000 // 15 minutes
  const maxDuration = 4 * 60 * 60 * 1000 // 4 hours
  
  if (start >= end) {
    return { valid: false, error: 'End time must be after start time' }
  }
  
  if (duration < minDuration) {
    return { valid: false, error: 'Appointment must be at least 15 minutes' }
  }
  
  if (duration > maxDuration) {
    return { valid: false, error: 'Appointment cannot exceed 4 hours' }
  }
  
  if (start < Date.now()) {
    return { valid: false, error: 'Cannot schedule appointments in the past' }
  }
  
  return { valid: true }
}

/**
 * Get business hours configuration for DayPilot
 */
export function getBusinessHoursConfig(startHour = 9, endHour = 17) {
  return {
    businessBeginsHour: startHour,
    businessEndsHour: endHour,
    showNonBusiness: true,
    nonBusinessBackColor: '#F5F5F5'
  }
}

/**
 * Get cell configuration (60px time slots)
 */
export function getCellConfig(cellDuration = 30) {
  return {
    cellDuration,        // minutes
    cellHeight: 60,      // pixels
    timeHeaderCellDuration: 60 // hour markers
  }
}

/**
 * Generate time slots for a given date
 */
export function generateTimeSlots(date: Date, interval = 30): { start: number; end: number; formatted: string }[] {
  const slots = []
  const startHour = 9
  const endHour = 17
  
  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += interval) {
      const slotStart = new Date(date)
      slotStart.setHours(hour, minute, 0, 0)
      
      const slotEnd = new Date(slotStart)
      slotEnd.setMinutes(slotEnd.getMinutes() + interval)
      
      slots.push({
        start: slotStart.getTime(),
        end: slotEnd.getTime(),
        formatted: `${formatTime(slotStart.getTime())} - ${formatTime(slotEnd.getTime())}`
      })
    }
  }
  
  return slots
}
