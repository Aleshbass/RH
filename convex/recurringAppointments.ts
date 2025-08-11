import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { Id } from './_generated/dataModel'

// Utility functions for date handling
function parseTime(timeString: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeString.split(':').map(Number)
  return { hours, minutes }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7)
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

function getNextOccurrence(
  currentDate: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  interval: number,
  daysOfWeek?: number[]
): Date {
  switch (frequency) {
    case 'daily':
      return addDays(currentDate, interval)
    
    case 'weekly':
      if (daysOfWeek && daysOfWeek.length > 0) {
        // Find next occurrence on specified days of week
        const nextWeek = addWeeks(currentDate, interval)
        const currentDay = nextWeek.getDay()
        
        // Find the next day in the daysOfWeek array
        const sortedDays = [...daysOfWeek].sort((a, b) => a - b)
        let nextDay = sortedDays.find(day => day >= currentDay)
        
        if (!nextDay) {
          // If no day found this week, take first day of next week
          nextDay = sortedDays[0]
          nextWeek.setDate(nextWeek.getDate() + 7)
        }
        
        const daysToAdd = nextDay - currentDay
        return addDays(nextWeek, daysToAdd)
      }
      return addWeeks(currentDate, interval)
    
    case 'monthly':
      return addMonths(currentDate, interval)
    
    default:
      return addDays(currentDate, 1)
  }
}

// Create a recurring appointment series
export const createRecurringSeries = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    patientId: v.id('users'),
    physiotherapistId: v.id('users'),
    clinicId: v.optional(v.id('clinics')),
    serviceType: v.string(),
    duration: v.number(),
    appointmentType: v.union(v.literal('in-person'), v.literal('telehealth')),
    priority: v.optional(v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent')
    )),
    notesForPatient: v.optional(v.string()),
    notesForTherapist: v.optional(v.string()),
    frequency: v.union(v.literal('daily'), v.literal('weekly'), v.literal('monthly')),
    interval: v.number(),
    daysOfWeek: v.optional(v.array(v.number())),
    endDate: v.optional(v.string()),
    maxOccurrences: v.optional(v.number()),
    startDate: v.string(),
    startTime: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    
    // Create the recurring series
    const seriesId = await ctx.db.insert('recurringSeries', {
      ...args,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })

    // Generate initial appointments for the series
    await generateSeriesAppointments(ctx, seriesId)

    return { seriesId, success: true }
  },
})

// Generate appointments for a recurring series
async function generateSeriesAppointments(ctx: any, seriesId: Id<'recurringSeries'>) {
  const series = await ctx.db.get(seriesId)
  if (!series) return

  const startDate = new Date(series.startDate)
  const { hours, minutes } = parseTime(series.startTime)
  
  let currentDate = new Date(startDate)
  currentDate.setHours(hours, minutes, 0, 0)
  
  const endDate = series.endDate ? new Date(series.endDate) : null
  const maxOccurrences = series.maxOccurrences || 52 // Default to 1 year
  
  let occurrenceCount = 0
  const appointments = []

  while (occurrenceCount < maxOccurrences) {
    // Check if we've reached the end date
    if (endDate && currentDate > endDate) break

    // Check for existing exceptions
    const exception = await ctx.db
      .query('seriesExceptions')
      .withIndex('by_series_id', (q: any) => q.eq('seriesId', seriesId))
      .filter((q: any) => q.eq(q.field('instanceDate'), currentDate.toISOString().split('T')[0]))
      .first()

    if (!exception) {
      // Create appointment for this occurrence
      const startTime = currentDate.getTime()
      const endTime = startTime + (series.duration * 60 * 1000)

      appointments.push({
        patientId: series.patientId,
        physiotherapistId: series.physiotherapistId,
        clinicId: series.clinicId,
        startTime,
        endTime,
        serviceType: series.serviceType,
        status: 'scheduled' as const,
        notesForPatient: series.notesForPatient,
        notesForTherapist: series.notesForTherapist,
        seriesId,
        isRecurring: true,
        instanceDate: currentDate.toISOString().split('T')[0],
        isException: false,
      })
    }

    // Move to next occurrence
    currentDate = getNextOccurrence(
      currentDate,
      series.frequency,
      series.interval,
      series.daysOfWeek
    )
    occurrenceCount++
  }

  // Insert all appointments
  for (const appointment of appointments) {
    await ctx.db.insert('appointments', appointment)
  }
}

// Get recurring series for a user
export const getRecurringSeries = query({
  args: {
    userId: v.id('users'),
    role: v.union(v.literal('patient'), v.literal('physiotherapist')),
  },
  handler: async (ctx, args) => {
    const field = args.role === 'patient' ? 'patientId' : 'physiotherapistId'
    
    return await ctx.db
      .query('recurringSeries')
      .withIndex(`by_${args.role}_id` as any, (q: any) => q.eq(field, args.userId))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect()
  },
})

// Get appointments for a recurring series
export const getSeriesAppointments = query({
  args: {
    seriesId: v.id('recurringSeries'),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query('appointments')
      .withIndex('by_series_id', (q: any) => q.eq('seriesId', args.seriesId))

    const appointments = await query.collect()

    // Filter by date range if provided
    if (args.startDate || args.endDate) {
      const startTime = args.startDate ? new Date(args.startDate).getTime() : 0
      const endTime = args.endDate ? new Date(args.endDate).getTime() : Date.now() + (365 * 24 * 60 * 60 * 1000)

      return appointments.filter(apt => 
        apt.startTime >= startTime && apt.startTime <= endTime
      )
    }

    return appointments
  },
})

// Update a single appointment in a series
export const updateSeriesAppointment = mutation({
  args: {
    appointmentId: v.id('appointments'),
    updates: v.object({
      startTime: v.optional(v.number()),
      endTime: v.optional(v.number()),
      status: v.optional(v.union(
        v.literal('scheduled'),
        v.literal('confirmed'),
        v.literal('completed'),
        v.literal('cancelled_by_patient'),
        v.literal('cancelled_by_therapist'),
        v.literal('no_show')
      )),
      notesForPatient: v.optional(v.string()),
      notesForTherapist: v.optional(v.string()),
      cancellationReason: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId)
    if (!appointment || !appointment.seriesId) {
      throw new Error('Appointment not found or not part of a series')
    }

    // Mark as exception if modifying time or other core properties
    const isException = !!(args.updates.startTime || args.updates.endTime)

    await ctx.db.patch(args.appointmentId, {
      ...args.updates,
      isException,
    })

    return { success: true }
  },
})

// Cancel a single appointment in a series
export const cancelSeriesAppointment = mutation({
  args: {
    appointmentId: v.id('appointments'),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId)
    if (!appointment || !appointment.seriesId) {
      throw new Error('Appointment not found or not part of a series')
    }

    // Update appointment status
    await ctx.db.patch(args.appointmentId, {
      status: 'cancelled_by_therapist',
      cancellationReason: args.reason,
      isException: true,
    })

    // Create exception record
    await ctx.db.insert('seriesExceptions', {
      seriesId: appointment.seriesId,
      instanceDate: appointment.instanceDate || '',
      exceptionType: 'cancelled',
      reason: args.reason,
      createdAt: Date.now(),
    })

    return { success: true }
  },
})

// Update entire recurring series
export const updateRecurringSeries = mutation({
  args: {
    seriesId: v.id('recurringSeries'),
    updates: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      serviceType: v.optional(v.string()),
      duration: v.optional(v.number()),
      priority: v.optional(v.union(
        v.literal('low'),
        v.literal('medium'),
        v.literal('high'),
        v.literal('urgent')
      )),
      notesForPatient: v.optional(v.string()),
      notesForTherapist: v.optional(v.string()),
      frequency: v.optional(v.union(v.literal('daily'), v.literal('weekly'), v.literal('monthly'))),
      interval: v.optional(v.number()),
      daysOfWeek: v.optional(v.array(v.number())),
      endDate: v.optional(v.string()),
      maxOccurrences: v.optional(v.number()),
    }),
    mode: v.union(v.literal('this-and-future'), v.literal('all-in-series')),
    fromDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const series = await ctx.db.get(args.seriesId)
    if (!series) {
      throw new Error('Series not found')
    }

    // Update the series
    await ctx.db.patch(args.seriesId, {
      ...args.updates,
      updatedAt: Date.now(),
    })

    // If updating recurrence rules, regenerate future appointments
    if (args.updates.frequency || args.updates.interval || args.updates.daysOfWeek) {
      if (args.mode === 'all-in-series') {
        // Delete all future appointments and regenerate
        const appointments = await ctx.db
          .query('appointments')
          .withIndex('by_series_id', (q: any) => q.eq('seriesId', args.seriesId))
          .filter((q: any) => q.gte(q.field('startTime'), Date.now()))
          .collect()

        for (const apt of appointments) {
          await ctx.db.delete(apt._id)
        }

        await generateSeriesAppointments(ctx, args.seriesId)
      } else if (args.mode === 'this-and-future' && args.fromDate) {
        // Delete appointments from specified date forward and regenerate
        const fromTime = new Date(args.fromDate).getTime()
        const appointments = await ctx.db
          .query('appointments')
          .withIndex('by_series_id', (q: any) => q.eq('seriesId', args.seriesId))
          .filter((q: any) => q.gte(q.field('startTime'), fromTime))
          .collect()

        for (const apt of appointments) {
          await ctx.db.delete(apt._id)
        }

        await generateSeriesAppointments(ctx, args.seriesId)
      }
    }

    return { success: true }
  },
})

// Delete/deactivate a recurring series
export const deleteRecurringSeries = mutation({
  args: {
    seriesId: v.id('recurringSeries'),
    mode: v.union(v.literal('this-and-future'), v.literal('all-in-series')),
    fromDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.mode === 'all-in-series') {
      // Deactivate the series
      await ctx.db.patch(args.seriesId, {
        isActive: false,
        updatedAt: Date.now(),
      })

      // Cancel all future appointments
      const appointments = await ctx.db
        .query('appointments')
        .withIndex('by_series_id', (q: any) => q.eq('seriesId', args.seriesId))
        .filter((q: any) => q.gte(q.field('startTime'), Date.now()))
        .collect()

      for (const apt of appointments) {
        await ctx.db.patch(apt._id, {
          status: 'cancelled_by_therapist',
          cancellationReason: 'Series cancelled',
        })
      }
    } else if (args.mode === 'this-and-future' && args.fromDate) {
      // Cancel appointments from specified date forward
      const fromTime = new Date(args.fromDate).getTime()
      const appointments = await ctx.db
        .query('appointments')
        .withIndex('by_series_id', (q: any) => q.eq('seriesId', args.seriesId))
        .filter((q: any) => q.gte(q.field('startTime'), fromTime))
        .collect()

      for (const apt of appointments) {
        await ctx.db.patch(apt._id, {
          status: 'cancelled_by_therapist',
          cancellationReason: 'Series cancelled from this date',
        })
      }

      // Update series end date
      const previousDay = new Date(fromTime - 24 * 60 * 60 * 1000)
      await ctx.db.patch(args.seriesId, {
        endDate: previousDay.toISOString().split('T')[0],
        updatedAt: Date.now(),
      })
    }

    return { success: true }
  },
})
