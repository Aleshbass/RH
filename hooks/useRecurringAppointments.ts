// @ts-nocheck
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { toast } from 'sonner'
import { 
  RecurringSeries, 
  RecurrenceRule, 
  SeriesUpdateMode,
  CreateSeriesParams,
  UpdateSeriesParams 
} from '@/lib/types/recurring-appointments'

export interface UseRecurringAppointmentsProps {
  userId: Id<'users'>
  role: 'patient' | 'physiotherapist'
}

export function useRecurringAppointments({ userId, role }: UseRecurringAppointmentsProps) {
  // Queries
  const recurringSeries = useQuery(api.recurringAppointments.getRecurringSeries, {
    userId,
    role,
  })

  // Mutations
  const createSeriesMutation = useMutation(api.recurringAppointments.createRecurringSeries)
  const updateSeriesMutation = useMutation(api.recurringAppointments.updateRecurringSeries)
  const deleteSeriesMutation = useMutation(api.recurringAppointments.deleteRecurringSeries)
  const updateAppointmentMutation = useMutation(api.recurringAppointments.updateSeriesAppointment)
  const cancelAppointmentMutation = useMutation(api.recurringAppointments.cancelSeriesAppointment)

  // Create recurring series
  const createRecurringSeries = async (params: CreateSeriesParams) => {
    try {
      const result = await createSeriesMutation(params)
      toast.success('Recurring appointment series created successfully')
      return result
    } catch (error) {
      console.error('Failed to create recurring series:', error)
      toast.error('Failed to create recurring appointment series')
      throw error
    }
  }

  // Update recurring series
  const updateRecurringSeries = async (
    seriesId: Id<'recurringSeries'>,
    updates: UpdateSeriesParams,
    mode: SeriesUpdateMode,
    fromDate?: string
  ) => {
    try {
      await updateSeriesMutation({
        seriesId,
        updates,
        mode,
        fromDate,
      })
      
      const modeText = mode === 'all-in-series' ? 'entire series' : 'this and future appointments'
      toast.success(`Updated ${modeText} successfully`)
    } catch (error) {
      console.error('Failed to update recurring series:', error)
      toast.error('Failed to update recurring appointment series')
      throw error
    }
  }

  // Delete recurring series
  const deleteRecurringSeries = async (
    seriesId: Id<'recurringSeries'>,
    mode: SeriesUpdateMode,
    fromDate?: string
  ) => {
    try {
      await deleteSeriesMutation({
        seriesId,
        mode,
        fromDate,
      })
      
      const modeText = mode === 'all-in-series' ? 'entire series' : 'appointments from selected date'
      toast.success(`Cancelled ${modeText} successfully`)
    } catch (error) {
      console.error('Failed to delete recurring series:', error)
      toast.error('Failed to cancel recurring appointment series')
      throw error
    }
  }

  // Update single appointment in series
  const updateSeriesAppointment = async (
    appointmentId: Id<'appointments'>,
    updates: {
      startTime?: number
      endTime?: number
      status?: 'scheduled' | 'confirmed' | 'completed' | 'cancelled_by_patient' | 'cancelled_by_therapist' | 'no_show'
      notesForPatient?: string
      notesForTherapist?: string
      cancellationReason?: string
    }
  ) => {
    try {
      await updateAppointmentMutation({
        appointmentId,
        updates,
      })
      toast.success('Appointment updated successfully')
    } catch (error) {
      console.error('Failed to update appointment:', error)
      toast.error('Failed to update appointment')
      throw error
    }
  }

  // Cancel single appointment in series
  const cancelSeriesAppointment = async (
    appointmentId: Id<'appointments'>,
    reason?: string
  ) => {
    try {
      await cancelAppointmentMutation({
        appointmentId,
        reason,
      })
      toast.success('Appointment cancelled successfully')
    } catch (error) {
      console.error('Failed to cancel appointment:', error)
      toast.error('Failed to cancel appointment')
      throw error
    }
  }

  return {
    // Data
    recurringSeries,
    
    // Actions
    createRecurringSeries,
    updateRecurringSeries,
    deleteRecurringSeries,
    updateSeriesAppointment,
    cancelSeriesAppointment,
    
    // Loading states
    isCreating: createSeriesMutation.isPending,
    isUpdating: updateSeriesMutation.isPending,
    isDeleting: deleteSeriesMutation.isPending,
  }
}

export interface UseSeriesAppointmentsProps {
  seriesId: Id<'recurringSeries'>
  startDate?: string
  endDate?: string
}

export function useSeriesAppointments({ seriesId, startDate, endDate }: UseSeriesAppointmentsProps) {
  const appointments = useQuery(api.recurringAppointments.getSeriesAppointments, {
    seriesId,
    startDate,
    endDate,
  })

  return {
    appointments,
    isLoading: appointments === undefined,
  }
}

// Utility functions for working with recurring appointments
export const recurringAppointmentUtils = {
  // Generate human-readable recurrence description
  getRecurrenceDescription: (rule: RecurrenceRule): string => {
    const { frequency, interval, daysOfWeek, endDate, maxOccurrences } = rule
    
    let description = ''
    
    // Frequency and interval
    if (interval === 1) {
      switch (frequency) {
        case 'daily':
          description = 'Daily'
          break
        case 'weekly':
          description = 'Weekly'
          break
        case 'monthly':
          description = 'Monthly'
          break
      }
    } else {
      switch (frequency) {
        case 'daily':
          description = `Every ${interval} days`
          break
        case 'weekly':
          description = `Every ${interval} weeks`
          break
        case 'monthly':
          description = `Every ${interval} months`
          break
      }
    }
    
    // Days of week for weekly recurrence
    if (frequency === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const selectedDays = daysOfWeek.map(day => dayNames[day]).join(', ')
      description += ` on ${selectedDays}`
    }
    
    // End condition
    if (endDate) {
      description += ` until ${new Date(endDate).toLocaleDateString()}`
    } else if (maxOccurrences) {
      description += ` for ${maxOccurrences} occurrences`
    }
    
    return description
  },

  // Check if a date falls on specified days of week
  isOnValidDayOfWeek: (date: Date, daysOfWeek?: number[]): boolean => {
    if (!daysOfWeek || daysOfWeek.length === 0) return true
    return daysOfWeek.includes(date.getDay())
  },

  // Calculate next occurrence date
  getNextOccurrenceDate: (
    currentDate: Date,
    frequency: 'daily' | 'weekly' | 'monthly',
    interval: number,
    daysOfWeek?: number[]
  ): Date => {
    const nextDate = new Date(currentDate)
    
    switch (frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + interval)
        break
      
      case 'weekly':
        if (daysOfWeek && daysOfWeek.length > 0) {
          // Find next valid day of week
          const currentDay = nextDate.getDay()
          const sortedDays = [...daysOfWeek].sort((a, b) => a - b)
          
          let nextDay = sortedDays.find(day => day > currentDay)
          if (!nextDay) {
            // Move to next week and take first day
            nextDay = sortedDays[0]
            nextDate.setDate(nextDate.getDate() + (7 * interval))
          }
          
          const daysToAdd = nextDay - currentDay
          nextDate.setDate(nextDate.getDate() + daysToAdd)
        } else {
          nextDate.setDate(nextDate.getDate() + (7 * interval))
        }
        break
      
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + interval)
        break
    }
    
    return nextDate
  },

  // Validate recurrence rule
  validateRecurrenceRule: (rule: RecurrenceRule): string[] => {
    const errors: string[] = []
    
    if (rule.interval < 1) {
      errors.push('Interval must be at least 1')
    }
    
    if (rule.frequency === 'weekly' && rule.daysOfWeek) {
      const invalidDays = rule.daysOfWeek.filter(day => day < 0 || day > 6)
      if (invalidDays.length > 0) {
        errors.push('Days of week must be between 0 (Sunday) and 6 (Saturday)')
      }
    }
    
    if (rule.endDate && rule.maxOccurrences) {
      errors.push('Cannot specify both end date and maximum occurrences')
    }
    
    if (rule.endDate) {
      const endDate = new Date(rule.endDate)
      if (endDate <= new Date()) {
        errors.push('End date must be in the future')
      }
    }
    
    if (rule.maxOccurrences && rule.maxOccurrences < 1) {
      errors.push('Maximum occurrences must be at least 1')
    }
    
    return errors
  },

  // Format series for display
  formatSeriesForCalendar: (series: RecurringSeries) => {
    return {
      id: series._id,
      title: series.name,
      description: series.description,
      recurrenceDescription: recurringAppointmentUtils.getRecurrenceDescription({
        frequency: series.frequency,
        interval: series.interval,
        daysOfWeek: series.daysOfWeek,
        endDate: series.endDate,
        maxOccurrences: series.maxOccurrences,
      }),
      isRecurring: true,
      seriesId: series._id,
    }
  },
}
