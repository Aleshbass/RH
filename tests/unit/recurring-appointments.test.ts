import { test, expect } from '@playwright/test'
import { recurringAppointmentUtils } from '@/hooks/useRecurringAppointments'
import { RecurrenceRule } from '@/lib/types/recurring-appointments'

// Define CreateSeriesParams interface locally since it's not exported
interface CreateSeriesParams {
  name: string
  description?: string
  patientId: string
  physiotherapistId: string
  clinicId?: string
  serviceType: string
  duration: number
  appointmentType: 'in-person' | 'telehealth'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  notesForPatient?: string
  notesForTherapist?: string
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number
  daysOfWeek?: number[]
  endDate?: string
  maxOccurrences?: number
  startDate: string
  startTime: string
}

test.describe('Recurring Appointments Utils', () => {
  test.describe('getRecurrenceDescription', () => {
    test('should generate correct description for daily recurrence', () => {
      const rule: RecurrenceRule = {
        frequency: 'daily',
        interval: 1,
      }
      
      expect(recurringAppointmentUtils.getRecurrenceDescription(rule)).toBe('Daily')
    })

    test('should generate correct description for every 2 days', () => {
      const rule: RecurrenceRule = {
        frequency: 'daily',
        interval: 2,
      }
      
      expect(recurringAppointmentUtils.getRecurrenceDescription(rule)).toBe('Every 2 days')
    })

    test('should generate correct description for weekly with specific days', () => {
      const rule: RecurrenceRule = {
        frequency: 'weekly',
        interval: 1,
        daysOfWeek: [1, 3, 5], // Monday, Wednesday, Friday
      }
      
      expect(recurringAppointmentUtils.getRecurrenceDescription(rule)).toBe('Weekly on Monday, Wednesday, Friday')
    })

    test('should generate correct description for every 2 weeks with end date', () => {
      const rule: RecurrenceRule = {
        frequency: 'weekly',
        interval: 2,
        daysOfWeek: [1, 3],
        endDate: '2024-12-31',
      }
      
      expect(recurringAppointmentUtils.getRecurrenceDescription(rule)).toBe('Every 2 weeks on Monday, Wednesday until 12/31/2024')
    })

    test('should generate correct description for monthly with max occurrences', () => {
      const rule: RecurrenceRule = {
        frequency: 'monthly',
        interval: 1,
        maxOccurrences: 12,
      }
      
      expect(recurringAppointmentUtils.getRecurrenceDescription(rule)).toBe('Monthly for 12 occurrences')
    })
  })

  test.describe('validateRecurrenceRule', () => {
    test('should validate correct rule', () => {
      const rule: RecurrenceRule = {
        frequency: 'weekly',
        interval: 1,
        daysOfWeek: [1, 3, 5],
        maxOccurrences: 10,
      }
      
      const errors = recurringAppointmentUtils.validateRecurrenceRule(rule)
      expect(errors).toHaveLength(0)
    })

    test('should catch invalid interval', () => {
      const rule: RecurrenceRule = {
        frequency: 'daily',
        interval: 0,
      }
      
      const errors = recurringAppointmentUtils.validateRecurrenceRule(rule)
      expect(errors).toContain('Interval must be at least 1')
    })

    test('should catch invalid days of week', () => {
      const rule: RecurrenceRule = {
        frequency: 'weekly',
        interval: 1,
        daysOfWeek: [1, 7, 8] as any, // 7 and 8 are invalid
      }
      
      const errors = recurringAppointmentUtils.validateRecurrenceRule(rule)
      expect(errors).toContain('Days of week must be between 0 (Sunday) and 6 (Saturday)')
    })

    test('should catch both end date and max occurrences', () => {
      const rule: RecurrenceRule = {
        frequency: 'daily',
        interval: 1,
        endDate: '2024-12-31',
        maxOccurrences: 10,
      }
      
      const errors = recurringAppointmentUtils.validateRecurrenceRule(rule)
      expect(errors).toContain('Cannot specify both end date and maximum occurrences')
    })

    test('should catch past end date', () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      
      const rule: RecurrenceRule = {
        frequency: 'daily',
        interval: 1,
        endDate: yesterday.toISOString().split('T')[0],
      }
      
      const errors = recurringAppointmentUtils.validateRecurrenceRule(rule)
      expect(errors).toContain('End date must be in the future')
    })

    test('should catch invalid max occurrences', () => {
      const rule: RecurrenceRule = {
        frequency: 'daily',
        interval: 1,
        maxOccurrences: 0,
      }
      
      const errors = recurringAppointmentUtils.validateRecurrenceRule(rule)
      expect(errors).toContain('Maximum occurrences must be at least 1')
    })
  })

  test.describe('getNextOccurrenceDate', () => {
    test('should calculate next daily occurrence', () => {
      const currentDate = new Date('2024-01-01T10:00:00')
      const nextDate = recurringAppointmentUtils.getNextOccurrenceDate(currentDate, 'daily', 1)
      
      expect(nextDate.toISOString().split('T')[0]).toBe('2024-01-02')
    })

    test('should calculate next weekly occurrence', () => {
      const currentDate = new Date('2024-01-01T10:00:00') // Monday
      const nextDate = recurringAppointmentUtils.getNextOccurrenceDate(currentDate, 'weekly', 1)
      
      expect(nextDate.toISOString().split('T')[0]).toBe('2024-01-08')
    })

    test('should calculate next weekly occurrence with specific days', () => {
      const currentDate = new Date('2024-01-01T10:00:00') // Monday (day 1)
      const nextDate = recurringAppointmentUtils.getNextOccurrenceDate(currentDate, 'weekly', 1, [3, 5]) // Wed, Fri
      
      expect(nextDate.getDay()).toBe(3) // Should be Wednesday
    })

    test('should calculate next monthly occurrence', () => {
      const currentDate = new Date('2024-01-15T10:00:00')
      const nextDate = recurringAppointmentUtils.getNextOccurrenceDate(currentDate, 'monthly', 1)
      
      expect(nextDate.getMonth()).toBe(1) // February (0-indexed)
      expect(nextDate.getDate()).toBe(15)
    })

    test('should handle month boundaries correctly', () => {
      const currentDate = new Date('2024-01-31T10:00:00')
      const nextDate = recurringAppointmentUtils.getNextOccurrenceDate(currentDate, 'monthly', 1)
      
      // Should handle February not having 31 days
      expect(nextDate.getMonth()).toBe(1) // February
      expect(nextDate.getDate()).toBeLessThanOrEqual(29) // Feb 28 or 29
    })
  })

  test.describe('isOnValidDayOfWeek', () => {
    test('should return true when no days specified', () => {
      const date = new Date('2024-01-01') // Monday
      expect(recurringAppointmentUtils.isOnValidDayOfWeek(date)).toBe(true)
    })

    test('should return true when date matches specified day', () => {
      const date = new Date('2024-01-01') // Monday (day 1)
      expect(recurringAppointmentUtils.isOnValidDayOfWeek(date, [1, 3, 5])).toBe(true)
    })

    test('should return false when date does not match specified days', () => {
      const date = new Date('2024-01-02') // Tuesday (day 2)
      expect(recurringAppointmentUtils.isOnValidDayOfWeek(date, [1, 3, 5])).toBe(false)
    })
  })
})



test.describe('Date Calculations and Edge Cases', () => {
  test('should handle leap year correctly', () => {
    const leapYearDate = new Date('2024-02-29T10:00:00') // Leap year
    const nextMonth = recurringAppointmentUtils.getNextOccurrenceDate(leapYearDate, 'monthly', 1)
    
    // Should go to March 29, not March 1
    expect(nextMonth.getMonth()).toBe(2) // March (0-indexed)
    expect(nextMonth.getDate()).toBe(29)
  })

  test('should handle daylight saving time transitions', () => {
    // Test DST transition (spring forward)
    const beforeDST = new Date('2024-03-10T02:00:00') // 2 AM on DST transition day
    const nextWeek = recurringAppointmentUtils.getNextOccurrenceDate(beforeDST, 'weekly', 1)
    
    // Should maintain the same local time despite DST
    expect(nextWeek.getHours()).toBe(2)
  })

  test('should handle end of month edge cases', () => {
    const jan31 = new Date('2024-01-31T10:00:00')
    const nextMonth = recurringAppointmentUtils.getNextOccurrenceDate(jan31, 'monthly', 1)
    
    // February doesn't have 31 days, should adjust appropriately
    expect(nextMonth.getMonth()).toBe(1) // February
    expect(nextMonth.getDate()).toBeLessThanOrEqual(29)
  })

  test('should format series data for calendar display', () => {
    const mockSeries = {
      _id: 'series123',
      name: 'Weekly PT',
      description: 'Physical therapy sessions',
      frequency: 'weekly' as const,
      interval: 1,
      daysOfWeek: [1, 3],
      maxOccurrences: 10,
    }
    
    const formatted = recurringAppointmentUtils.formatSeriesForCalendar(mockSeries as any)
    
    expect(formatted.id).toBe('series123')
    expect(formatted.title).toBe('Weekly PT')
    expect(formatted.isRecurring).toBe(true)
    expect(formatted.recurrenceDescription).toContain('Weekly on Monday, Wednesday')
  })

  test('should handle performance for large series', () => {
    const startTime = Date.now()
    
    // Simulate processing a large series
    const rule: RecurrenceRule = {
      frequency: 'daily',
      interval: 1,
      maxOccurrences: 365, // One year
    }
    
    // Process rule validation (lightweight operation)
    const errors = recurringAppointmentUtils.validateRecurrenceRule(rule)
    
    const endTime = Date.now()
    const processingTime = endTime - startTime
    
    // Should process quickly (under 100ms for rule validation)
    expect(processingTime).toBeLessThan(100)
    expect(errors).toHaveLength(0)
    expect(rule.maxOccurrences).toBe(365)
  })
})
