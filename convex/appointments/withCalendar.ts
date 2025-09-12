import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { api } from "../_generated/api";

interface AppointmentWithCalendar {
  appointment: Doc<"appointments">;
  calendarEvent?: {
    googleEventId: string;
    googleMeetLink?: string;
  };
}

// Create appointment with Google Calendar integration
export const createAppointmentWithCalendar = mutation({
  args: {
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    startTime: v.number(),
    endTime: v.number(),
    type: v.string(),
    notes: v.optional(v.string()),
    createCalendarEvent: v.optional(v.boolean()),
    createMeetLink: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ appointmentId: Id<"appointments">; calendarEvent?: any }> => {
    // Create appointment
    const appointmentId = await ctx.db.insert("appointments", {
      patientId: args.patientId,
      physiotherapistId: args.physiotherapistId,
      startTime: args.startTime,
      endTime: args.endTime,
      serviceType: args.type,
      notesForPatient: args.notes,
      status: "scheduled",
    });

    let calendarEventData;

    // Create Google Calendar event if requested
    if (args.createCalendarEvent) {
      try {
        // Get user details
        const patient = await ctx.db.get(args.patientId);
        const physiotherapist = await ctx.db.get(args.physiotherapistId);

        if (!patient || !physiotherapist) {
          throw new Error("User not found");
        }

        // Create calendar event
        const calendarEvent = {
          summary: `Physiotherapy Session - ${args.type}`,
          description: args.notes || `Scheduled physiotherapy session`,
          startTime: args.startTime,
          endTime: args.endTime,
          attendees: [
            {
              email: patient.email,
              displayName: `${patient.firstName} ${patient.lastName}`,
            },
            {
              email: physiotherapist.email,
              displayName: `${physiotherapist.firstName} ${physiotherapist.lastName}`,
            },
          ],
        };

        const result = await ctx.scheduler.runAfter(0, api.calendar.nodeActions.createCalendarEvent, {
          userId: args.physiotherapistId,
          event: calendarEvent,
          createMeetLink: args.createMeetLink,
        });
        const calendarResult = result as unknown as { eventId: string; meetLink?: string };
        const { eventId, meetLink } = calendarResult;

        calendarEventData = {
          googleEventId: eventId,
          googleMeetLink: meetLink,
        };

      } catch (error) {
        console.error("Failed to create calendar event:", error);
        // Don't fail the appointment creation if calendar sync fails
      }
    }

    return {
      appointmentId,
      calendarEvent: calendarEventData,
    };
  },
});

// Update appointment with calendar sync
export const updateAppointmentWithCalendar = mutation({
  args: {
    appointmentId: v.id("appointments"),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    type: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId);
    
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Update appointment
    const updateData: any = {
      ...args,
    };
    
    // Ensure status is properly typed
    if (args.status) {
      const validStatuses = ["scheduled", "confirmed", "completed", "cancelled_by_patient", "cancelled_by_therapist", "no_show"] as const;
      if (validStatuses.includes(args.status as any)) {
        updateData.status = args.status as typeof validStatuses[number];
      }
    }
    
    await ctx.db.patch(args.appointmentId, updateData);

    // Update calendar event if exists
    const calendarEvent = await ctx.db
      .query("calendarEvents")
      .filter((q) => q.eq(q.field("appointmentId"), args.appointmentId))
      .first();

    if (calendarEvent) {
      try {
        const event = {
          summary: args.type ? `Physiotherapy Session - ${args.type}` : undefined,
          description: args.notes,
          startTime: args.startTime,
          endTime: args.endTime,
        };

        await ctx.scheduler.runAfter(0, api.calendar.nodeActions.updateCalendarEvent, {
          userId: appointment.physiotherapistId,
          eventId: calendarEvent.googleEventId,
          event: event,
        });
      } catch (error) {
        console.error("Failed to update calendar event:", error);
      }
    }

    return { success: true };
  },
});

// Cancel appointment with calendar sync
export const cancelAppointmentWithCalendar = mutation({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId);
    
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Update appointment status
    await ctx.db.patch(args.appointmentId, {
      status: "cancelled_by_therapist",
    });

    // Delete calendar event
    const calendarEvent = await ctx.db
      .query("calendarEvents")
      .filter((q) => q.eq(q.field("appointmentId"), args.appointmentId))
      .first();

    if (calendarEvent) {
      try {
        await ctx.scheduler.runAfter(0, api.calendar.nodeActions.deleteCalendarEvent, {
          userId: appointment.physiotherapistId,
          eventId: calendarEvent.googleEventId,
        });
      } catch (error) {
        console.error("Failed to delete calendar event:", error);
      }
    }

    return { success: true };
  },
});

// Get appointment with calendar details
export const getAppointmentWithCalendar = query({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId);
    
    if (!appointment) {
      return null;
    }

    const calendarEvent = await ctx.db
      .query("calendarEvents")
      .filter((q) => q.eq(q.field("appointmentId"), args.appointmentId))
      .first();

    return {
      appointment,
      calendarEvent: calendarEvent ? {
        googleEventId: calendarEvent.googleEventId,
        googleMeetLink: calendarEvent.googleMeetLink,
      } : undefined,
    };
  },
});

// Get appointments with calendar sync status
export const getAppointmentsWithCalendarSync = query({
  args: {
    userId: v.id("users"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let appointments = await ctx.db
      .query("appointments")
      .filter((q) => 
        q.or(
          q.eq(q.field("patientId"), args.userId),
          q.eq(q.field("physiotherapistId"), args.userId)
        )
      )
      .collect();

    // Filter by date range if provided
    if (args.startDate || args.endDate) {
      appointments = appointments.filter((apt) => {
        if (args.startDate && apt.startTime < args.startDate) return false;
        if (args.endDate && apt.endTime > args.endDate) return false;
        return true;
      });
    }

    // Get calendar events for these appointments
    const appointmentsWithCalendar = await Promise.all(
      appointments.map(async (appointment) => {
        const calendarEvent = await ctx.db
          .query("calendarEvents")
          .filter((q) => q.eq(q.field("appointmentId"), appointment._id))
          .first();

        return {
          appointment,
          calendarEvent: calendarEvent ? {
            googleEventId: calendarEvent.googleEventId,
            googleMeetLink: calendarEvent.googleMeetLink,
            syncedAt: calendarEvent.syncedAt,
          } : undefined,
        };
      })
    );

    return appointmentsWithCalendar;
  },
});
