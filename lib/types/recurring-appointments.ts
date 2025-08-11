// Recurring Appointments Types
// Designed to avoid deep TypeScript instantiation issues

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly'

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6 // Sunday = 0, Monday = 1, etc.

// Simple recurrence rule structure
export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  interval: number // Every N days/weeks/months
  daysOfWeek?: DayOfWeek[] // For weekly recurrence
  endDate?: string // ISO date string
  maxOccurrences?: number // Alternative to endDate
}

// Recurring appointment series metadata
export interface RecurringSeries {
  _id: string
  id: string
  name: string
  description?: string
  recurrenceRule: RecurrenceRule
  frequency: RecurrenceFrequency
  interval: number
  daysOfWeek?: DayOfWeek[]
  endDate?: string
  maxOccurrences?: number
  createdAt: string
  updatedAt: string
  isActive: boolean
  
  // Appointment template properties
  patientId?: string
  physiotherapistId?: string
  clinicId?: string
  serviceType?: string
  duration?: number
  appointmentType?: 'in-person' | 'telehealth'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  notesForPatient?: string
  notesForTherapist?: string
}

// Individual appointment in a series
export interface SeriesAppointment {
  appointmentId: string
  seriesId: string
  instanceDate: string // ISO date string
  isException: boolean // true if modified from series template
  isCancelled: boolean
  originalStartTime?: number // If different from series template
  originalEndTime?: number // If different from series template
}

// Template for creating appointments in a series
export interface AppointmentTemplate {
  patientId: string
  physiotherapistId: string
  clinicId?: string
  serviceType: string
  duration: number // minutes
  appointmentType: 'in-person' | 'telehealth'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  notesForPatient?: string
  notesForTherapist?: string
}

// Options for editing a recurring series
export type SeriesEditMode = 'this-only' | 'this-and-future' | 'all-in-series'
export type SeriesUpdateMode = SeriesEditMode // Alias for backward compatibility

// Recurring appointment creation request
export interface CreateRecurringAppointmentRequest {
  template: AppointmentTemplate
  recurrenceRule: RecurrenceRule
  seriesName: string
  startDate: string // ISO date string
  startTime: string // HH:MM format
}

// Series management operations
export interface SeriesOperation {
  seriesId: string
  mode: SeriesEditMode
  fromDate?: string // For 'this-and-future' mode
  appointmentId?: string // For 'this-only' mode
}

// Utility type for series expansion
export interface SeriesExpansion {
  seriesId: string
  appointments: Array<{
    instanceDate: string
    startTime: number
    endTime: number
  }>
}

// Error types for recurring appointments
export type RecurringAppointmentError = 
  | 'INVALID_RECURRENCE_RULE'
  | 'SERIES_NOT_FOUND'
  | 'APPOINTMENT_NOT_IN_SERIES'
  | 'CONFLICTING_APPOINTMENTS'
  | 'INVALID_DATE_RANGE'

export interface RecurringAppointmentResult<T = unknown> {
  success: boolean
  data?: T
  error?: RecurringAppointmentError
  message?: string
}

// Additional types for hook compatibility
export interface CreateSeriesParams {
  // Series metadata
  name: string
  description?: string
  
  // Appointment template properties
  patientId: string
  physiotherapistId: string
  clinicId?: string
  serviceType: string
  duration: number
  appointmentType: 'in-person' | 'telehealth'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  notesForPatient?: string
  notesForTherapist?: string
  
  // Recurrence properties
  frequency: RecurrenceFrequency
  interval: number
  daysOfWeek?: DayOfWeek[]
  endDate?: string
  maxOccurrences?: number
  
  // Scheduling
  startDate: string
  startTime: string
}

export interface UpdateSeriesParams {
  seriesId: string
  updates: Partial<{
    name: string
    description: string
    recurrenceRule: RecurrenceRule
    isActive: boolean
  }>
  mode: SeriesEditMode
  fromDate?: string
}
