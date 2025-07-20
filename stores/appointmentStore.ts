import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { Id } from '@/convex/_generated/dataModel'

// Types
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled_by_patient' | 'cancelled_by_therapist' | 'no_show'

export interface Appointment {
  _id: Id<"appointments">
  patientId: Id<"users">
  physiotherapistId: Id<"users">
  clinicId?: Id<"clinics">
  startTime: number
  endTime: number
  serviceType: string
  status: AppointmentStatus
  notesForPatient?: string
  notesForTherapist?: string
  cancellationReason?: string
  reminderSent?: boolean
  createdAt: number
  updatedAt: number
  patient?: {
    _id: Id<"users">
    firstName?: string
    lastName?: string
    email?: string
    imageUrl?: string
    phoneNumber?: string
  }
}

export interface AppointmentFilters {
  status: AppointmentStatus | 'all'
  dateRange: {
    start: number
    end: number
  }
  patientId?: Id<"users">
  physiotherapistId?: Id<"users">
  serviceType?: string
}

export interface CalendarView {
  mode: 'week' | 'day' | 'month'
  currentDate: Date
  selectedDate?: Date
  timeSlots: {
    start: string // "09:00"
    end: string   // "17:00"
    interval: number // 30 minutes
  }
}

export interface AppointmentStats {
  totalAppointments: number
  todaysAppointments: number
  thisWeekAppointments: number
  completedThisMonth: number
  cancelledThisMonth: number
  noShowsThisMonth: number
  averageDuration: number
  nextAppointment?: Appointment
}

// Store interface
interface AppointmentState {
  // Data
  appointments: Appointment[]
  selectedAppointment: Appointment | null
  appointmentStats: AppointmentStats | null
  
  // Filters and view
  filters: AppointmentFilters
  calendarView: CalendarView
  
  // UI State
  isCreatingAppointment: boolean
  isEditingAppointment: boolean
  selectedTimeSlot?: {
    date: Date
    startTime: string
    endTime: string
  }
  
  // Loading states
  isLoadingAppointments: boolean
  isLoadingStats: boolean
  isCreatingNew: boolean
  isUpdating: boolean
  
  // Actions - Data Management
  setAppointments: (appointments: Appointment[]) => void
  setSelectedAppointment: (appointment: Appointment | null) => void
  setAppointmentStats: (stats: AppointmentStats) => void
  
  // Actions - Appointment CRUD
  addAppointment: (appointment: Appointment) => void
  updateAppointment: (id: Id<"appointments">, updates: Partial<Appointment>) => void
  removeAppointment: (id: Id<"appointments">) => void
  
  // Actions - Scheduling
  scheduleAppointment: (data: {
    patientId: Id<"users">
    startTime: number
    endTime: number
    serviceType: string
    notesForPatient?: string
  }) => void
  rescheduleAppointment: (id: Id<"appointments">, newStartTime: number, newEndTime: number) => void
  cancelAppointment: (id: Id<"appointments">, reason: string, cancelledBy: 'patient' | 'therapist') => void
  confirmAppointment: (id: Id<"appointments">) => void
  markAsCompleted: (id: Id<"appointments">, notes?: string) => void
  markAsNoShow: (id: Id<"appointments">) => void
  
  // Actions - Filters and View
  setStatusFilter: (status: AppointmentStatus | 'all') => void
  setDateRange: (start: number, end: number) => void
  setPatientFilter: (patientId: Id<"users"> | undefined) => void
  setServiceTypeFilter: (serviceType: string | undefined) => void
  resetFilters: () => void
  
  // Actions - Calendar View
  setCalendarMode: (mode: 'week' | 'day' | 'month') => void
  setCurrentDate: (date: Date) => void
  setSelectedDate: (date: Date | undefined) => void
  navigateToToday: () => void
  navigateToPrevious: () => void
  navigateToNext: () => void
  
  // Actions - UI State
  startCreatingAppointment: (timeSlot?: { date: Date; startTime: string; endTime: string }) => void
  stopCreatingAppointment: () => void
  startEditingAppointment: (appointment: Appointment) => void
  stopEditingAppointment: () => void
  
  // Actions - Loading States
  setLoadingAppointments: (loading: boolean) => void
  setLoadingStats: (loading: boolean) => void
  setCreatingNew: (creating: boolean) => void
  setUpdating: (updating: boolean) => void
  
  // Computed Properties
  filteredAppointments: Appointment[]
  todaysAppointments: Appointment[]
  upcomingAppointments: Appointment[]
  availableTimeSlots: { date: Date; startTime: string; endTime: string }[]
  hasConflicts: (startTime: number, endTime: number, excludeId?: Id<"appointments">) => boolean
  
  // Reset
  reset: () => void
}

const defaultFilters: AppointmentFilters = {
  status: 'all',
  dateRange: {
    start: new Date().setHours(0, 0, 0, 0),
    end: new Date().setHours(23, 59, 59, 999)
  }
}

const defaultCalendarView: CalendarView = {
  mode: 'week',
  currentDate: new Date(),
  timeSlots: {
    start: '09:00',
    end: '17:00',
    interval: 30
  }
}

export const useAppointmentStore = create<AppointmentState>()(
  persist(
    immer((set, get) => ({
      // Initial state
      appointments: [],
      selectedAppointment: null,
      appointmentStats: null,
      filters: defaultFilters,
      calendarView: defaultCalendarView,
      isCreatingAppointment: false,
      isEditingAppointment: false,
      selectedTimeSlot: undefined,
      isLoadingAppointments: false,
      isLoadingStats: false,
      isCreatingNew: false,
      isUpdating: false,

      // Data Management
      setAppointments: (appointments) => set((state) => {
        state.appointments = appointments
      }),

      setSelectedAppointment: (appointment) => set((state) => {
        state.selectedAppointment = appointment
      }),

      setAppointmentStats: (stats) => set((state) => {
        state.appointmentStats = stats
      }),

      // Appointment CRUD
      addAppointment: (appointment) => set((state) => {
        state.appointments.push(appointment)
      }),

      updateAppointment: (id, updates) => set((state) => {
        const index = state.appointments.findIndex(apt => apt._id === id)
        if (index !== -1) {
          Object.assign(state.appointments[index], updates)
        }
        if (state.selectedAppointment?._id === id) {
          Object.assign(state.selectedAppointment, updates)
        }
      }),

      removeAppointment: (id) => set((state) => {
        state.appointments = state.appointments.filter(apt => apt._id !== id)
        if (state.selectedAppointment?._id === id) {
          state.selectedAppointment = null
        }
      }),

      // Scheduling Actions
      scheduleAppointment: (data) => set((state) => {
        // This would typically call a Convex mutation
        // For now, we just update the UI state
        state.isCreatingNew = true
      }),

      rescheduleAppointment: (id, newStartTime, newEndTime) => set((state) => {
        const index = state.appointments.findIndex(apt => apt._id === id)
        if (index !== -1) {
          state.appointments[index].startTime = newStartTime
          state.appointments[index].endTime = newEndTime
          state.appointments[index].updatedAt = Date.now()
        }
      }),

      cancelAppointment: (id, reason, cancelledBy) => set((state) => {
        const index = state.appointments.findIndex(apt => apt._id === id)
        if (index !== -1) {
          state.appointments[index].status = cancelledBy === 'patient' ? 'cancelled_by_patient' : 'cancelled_by_therapist'
          state.appointments[index].cancellationReason = reason
          state.appointments[index].updatedAt = Date.now()
        }
      }),

      confirmAppointment: (id) => set((state) => {
        const index = state.appointments.findIndex(apt => apt._id === id)
        if (index !== -1) {
          state.appointments[index].status = 'confirmed'
          state.appointments[index].updatedAt = Date.now()
        }
      }),

      markAsCompleted: (id, notes) => set((state) => {
        const index = state.appointments.findIndex(apt => apt._id === id)
        if (index !== -1) {
          state.appointments[index].status = 'completed'
          if (notes) {
            state.appointments[index].notesForTherapist = notes
          }
          state.appointments[index].updatedAt = Date.now()
        }
      }),

      markAsNoShow: (id) => set((state) => {
        const index = state.appointments.findIndex(apt => apt._id === id)
        if (index !== -1) {
          state.appointments[index].status = 'no_show'
          state.appointments[index].updatedAt = Date.now()
        }
      }),

      // Filters and View
      setStatusFilter: (status) => set((state) => {
        state.filters.status = status
      }),

      setDateRange: (start, end) => set((state) => {
        state.filters.dateRange = { start, end }
      }),

      setPatientFilter: (patientId) => set((state) => {
        state.filters.patientId = patientId
      }),

      setServiceTypeFilter: (serviceType) => set((state) => {
        state.filters.serviceType = serviceType
      }),

      resetFilters: () => set((state) => {
        state.filters = { ...defaultFilters }
      }),

      // Calendar View
      setCalendarMode: (mode) => set((state) => {
        state.calendarView.mode = mode
      }),

      setCurrentDate: (date) => set((state) => {
        state.calendarView.currentDate = date
      }),

      setSelectedDate: (date) => set((state) => {
        state.calendarView.selectedDate = date
      }),

      navigateToToday: () => set((state) => {
        state.calendarView.currentDate = new Date()
      }),

      navigateToPrevious: () => set((state) => {
        const { mode, currentDate } = state.calendarView
        const newDate = new Date(currentDate)
        
        switch (mode) {
          case 'day':
            newDate.setDate(newDate.getDate() - 1)
            break
          case 'week':
            newDate.setDate(newDate.getDate() - 7)
            break
          case 'month':
            newDate.setMonth(newDate.getMonth() - 1)
            break
        }
        
        state.calendarView.currentDate = newDate
      }),

      navigateToNext: () => set((state) => {
        const { mode, currentDate } = state.calendarView
        const newDate = new Date(currentDate)
        
        switch (mode) {
          case 'day':
            newDate.setDate(newDate.getDate() + 1)
            break
          case 'week':
            newDate.setDate(newDate.getDate() + 7)
            break
          case 'month':
            newDate.setMonth(newDate.getMonth() + 1)
            break
        }
        
        state.calendarView.currentDate = newDate
      }),

      // UI State
      startCreatingAppointment: (timeSlot) => set((state) => {
        state.isCreatingAppointment = true
        state.selectedTimeSlot = timeSlot
      }),

      stopCreatingAppointment: () => set((state) => {
        state.isCreatingAppointment = false
        state.selectedTimeSlot = undefined
      }),

      startEditingAppointment: (appointment) => set((state) => {
        state.isEditingAppointment = true
        state.selectedAppointment = appointment
      }),

      stopEditingAppointment: () => set((state) => {
        state.isEditingAppointment = false
        state.selectedAppointment = null
      }),

      // Loading States
      setLoadingAppointments: (loading) => set((state) => {
        state.isLoadingAppointments = loading
      }),

      setLoadingStats: (loading) => set((state) => {
        state.isLoadingStats = loading
      }),

      setCreatingNew: (creating) => set((state) => {
        state.isCreatingNew = creating
      }),

      setUpdating: (updating) => set((state) => {
        state.isUpdating = updating
      }),

      // Computed Properties
      get filteredAppointments() {
        const { appointments, filters } = get()
        let filtered = [...appointments]

        // Status filter
        if (filters.status !== 'all') {
          filtered = filtered.filter(apt => apt.status === filters.status)
        }

        // Date range filter
        filtered = filtered.filter(apt => 
          apt.startTime >= filters.dateRange.start && 
          apt.startTime <= filters.dateRange.end
        )

        // Patient filter
        if (filters.patientId) {
          filtered = filtered.filter(apt => apt.patientId === filters.patientId)
        }

        // Service type filter
        if (filters.serviceType) {
          filtered = filtered.filter(apt => apt.serviceType === filters.serviceType)
        }

        return filtered.sort((a, b) => a.startTime - b.startTime)
      },

      get todaysAppointments() {
        const today = new Date()
        const startOfDay = new Date(today.setHours(0, 0, 0, 0)).getTime()
        const endOfDay = new Date(today.setHours(23, 59, 59, 999)).getTime()
        
        return get().appointments.filter(apt => 
          apt.startTime >= startOfDay && apt.startTime <= endOfDay
        ).sort((a, b) => a.startTime - b.startTime)
      },

      get upcomingAppointments() {
        const now = Date.now()
        return get().appointments.filter(apt => 
          apt.startTime > now && 
          (apt.status === 'scheduled' || apt.status === 'confirmed')
        ).sort((a, b) => a.startTime - b.startTime).slice(0, 5)
      },

      get availableTimeSlots() {
        // This would calculate available time slots based on working hours and existing appointments
        // For now, return empty array - would be implemented based on business logic
        return []
      },

      hasConflicts: (startTime, endTime, excludeId) => {
        const { appointments } = get()
        return appointments.some(apt => {
          if (excludeId && apt._id === excludeId) return false
          if (apt.status === 'cancelled_by_patient' || apt.status === 'cancelled_by_therapist') return false
          
          return (
            (startTime >= apt.startTime && startTime < apt.endTime) ||
            (endTime > apt.startTime && endTime <= apt.endTime) ||
            (startTime <= apt.startTime && endTime >= apt.endTime)
          )
        })
      },

      reset: () => set((state) => {
        state.appointments = []
        state.selectedAppointment = null
        state.appointmentStats = null
        state.filters = { ...defaultFilters }
        state.calendarView = { ...defaultCalendarView }
        state.isCreatingAppointment = false
        state.isEditingAppointment = false
        state.selectedTimeSlot = undefined
        state.isLoadingAppointments = false
        state.isLoadingStats = false
        state.isCreatingNew = false
        state.isUpdating = false
      }),
    })),
    {
      name: 'appointment-store',
      partialize: (state) => ({
        filters: state.filters,
        calendarView: {
          mode: state.calendarView.mode,
          timeSlots: state.calendarView.timeSlots
        },
      }),
    }
  )
) 