import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import duration from 'dayjs/plugin/duration'
import customParseFormat from 'dayjs/plugin/customParseFormat'

// Extend dayjs with plugins
dayjs.extend(relativeTime)
dayjs.extend(timezone)
dayjs.extend(utc)
dayjs.extend(duration)
dayjs.extend(customParseFormat)

export const dateUtils = {
  // Basic formatting
  format: (date: Date | string | number, format: string = 'YYYY-MM-DD') => {
    return dayjs(date).format(format)
  },

  // Common date formats for the platform
  formatAppointmentTime: (date: Date | string | number) => {
    return dayjs(date).format('h:mm A')
  },

  formatAppointmentDate: (date: Date | string | number) => {
    return dayjs(date).format('MMM D, YYYY')
  },

  formatFullDateTime: (date: Date | string | number) => {
    return dayjs(date).format('MMM D, YYYY [at] h:mm A')
  },

  // Relative time formatting
  formatRelative: (date: Date | string | number) => {
    return dayjs(date).fromNow()
  },

  formatRelativeTo: (date: Date | string | number, baseDate: Date | string | number) => {
    return dayjs(date).from(dayjs(baseDate))
  },

  // Date calculations
  addDays: (date: Date | string | number, days: number) => {
    return dayjs(date).add(days, 'day').toDate()
  },

  addMinutes: (date: Date | string | number, minutes: number) => {
    return dayjs(date).add(minutes, 'minute').toDate()
  },

  subtractDays: (date: Date | string | number, days: number) => {
    return dayjs(date).subtract(days, 'day').toDate()
  },

  // Duration calculations
  getDurationBetween: (start: Date | string | number, end: Date | string | number) => {
    const startDate = dayjs(start)
    const endDate = dayjs(end)
    const duration = dayjs.duration(endDate.diff(startDate))
    
    return {
      hours: duration.hours(),
      minutes: duration.minutes(),
      total: duration.asMinutes(),
      formatted: duration.humanize()
    }
  },

  // Business logic helpers
  isToday: (date: Date | string | number) => {
    return dayjs(date).isSame(dayjs(), 'day')
  },

  isTomorrow: (date: Date | string | number) => {
    return dayjs(date).isSame(dayjs().add(1, 'day'), 'day')
  },

  isThisWeek: (date: Date | string | number) => {
    return dayjs(date).isSame(dayjs(), 'week')
  },

  isPast: (date: Date | string | number) => {
    return dayjs(date).isBefore(dayjs())
  },

  isFuture: (date: Date | string | number) => {
    return dayjs(date).isAfter(dayjs())
  },

  // Appointment scheduling helpers
  getBusinessHours: () => ({
    start: '09:00',
    end: '17:00'
  }),

  generateTimeSlots: (startTime: string, endTime: string, intervalMinutes: number = 30) => {
    const slots = []
    let current = dayjs(`2024-01-01 ${startTime}`)
    const end = dayjs(`2024-01-01 ${endTime}`)

    while (current.isBefore(end)) {
      slots.push(current.format('HH:mm'))
      current = current.add(intervalMinutes, 'minute')
    }

    return slots
  },

  // Week/Month navigation for calendar
  getWeekRange: (date: Date | string | number) => {
    const start = dayjs(date).startOf('week')
    const end = dayjs(date).endOf('week')
    return { start: start.toDate(), end: end.toDate() }
  },

  getMonthRange: (date: Date | string | number) => {
    const start = dayjs(date).startOf('month')
    const end = dayjs(date).endOf('month')
    return { start: start.toDate(), end: end.toDate() }
  },

  // Timezone handling
  convertToTimezone: (date: Date | string | number, timezone: string) => {
    return dayjs(date).tz(timezone).toDate()
  },

  getUserTimezone: () => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  },

  // Validation
  isValidDate: (date: string | number | Date | null | undefined) => {
    return dayjs(date).isValid()
  },

  parseDate: (dateString: string, format?: string) => {
    if (format) {
      return dayjs(dateString, format).toDate()
    }
    return dayjs(dateString).toDate()
  }
}

export default dateUtils