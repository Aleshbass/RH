// @ts-nocheck
import { v } from "convex/values";
import { action, mutation, query } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

interface CalendarServiceConfig {
  userId: Id<"users">;
  calendarId?: string;
}

interface CreateEventOptions {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  createMeetLink?: boolean;
}

// Get user's calendars (cached from last sync)
export const getCalendars = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Check if user has calendar credentials
    const credentials = await ctx.db
      .query("googleCalendarCredentials")
      .filter((q: any) => q.eq(q.field("userId"), args.userId))
      .first();

    if (!credentials) {
      return [];
    }

    // Return cached calendar data or empty array if not synced yet
    const cachedCalendars = await ctx.db
      .query("userCalendars")
      .filter((q: any) => q.eq(q.field("userId"), args.userId))
      .collect();

    return cachedCalendars.map((cal: any) => ({
      id: cal.calendarId,
      summary: cal.summary,
      primary: cal.primary || false,
      accessRole: cal.accessRole,
      backgroundColor: cal.backgroundColor,
      foregroundColor: cal.foregroundColor,
    }));
  },
});

// Sync user's calendars from Google (Action performs external fetch, persists via mutation)
export const syncCalendars = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    try {
      // Delegate Google API calls to Node action to avoid Node-only imports here
      const remoteItems: any[] = await ctx.runAction(
        internal.calendar.nodeActions.listCalendars,
        { userId: args.userId }
      );

      const items = (remoteItems || []).map((c: any) => ({
        id: c.id,
        summary: c.summary,
        primary: !!c.primary,
        accessRole: c.accessRole,
        backgroundColor: c.backgroundColor,
        foregroundColor: c.foregroundColor,
      }));

      await ctx.runMutation(internal.calendar.service.replaceCalendarsCache, {
        userId: args.userId,
        items,
      });

      return { success: true, count: items.length };
    } catch (error) {
      console.error("Failed to sync calendars:", error);
      return { success: false, count: 0, error: "Sync failed" };
    }
  },
});

// Internal mutation to replace cached calendars
export const replaceCalendarsCache = mutation({
  args: {
    userId: v.id("users"),
    items: v.array(v.object({
      id: v.string(),
      summary: v.string(),
      primary: v.optional(v.boolean()),
      accessRole: v.string(),
      backgroundColor: v.optional(v.string()),
      foregroundColor: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userCalendars")
      .filter((q: any) => q.eq(q.field("userId"), args.userId))
      .collect();

    for (const cal of existing) {
      await ctx.db.delete(cal._id);
    }

    for (const item of args.items) {
      await ctx.db.insert("userCalendars", {
        userId: args.userId,
        calendarId: item.id,
        summary: item.summary,
        primary: item.primary || false,
        accessRole: item.accessRole,
        backgroundColor: item.backgroundColor,
        foregroundColor: item.foregroundColor,
        syncedAt: Date.now(),
      });
    }
  },
});

// Create calendar event
export const createCalendarEvent = mutation({
  args: {
    userId: v.id("users"),
    appointmentId: v.id("appointments"),
    summary: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    attendees: v.optional(v.array(v.object({
      email: v.string(),
      displayName: v.optional(v.string()),
    }))),
    createMeetLink: v.optional(v.boolean()),
    calendarId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const created: any = await ctx.runAction(
        internal.calendar.nodeActions.createEvent,
        {
          userId: args.userId,
          appointmentId: args.appointmentId,
          summary: args.summary,
          description: args.description,
          startTime: args.startTime,
          endTime: args.endTime,
          attendees: args.attendees,
          createMeetLink: args.createMeetLink,
          calendarId: args.calendarId,
          timeZone: "Africa/Lagos",
        }
      );

      // Store calendar event link
      await ctx.db.insert("calendarEvents", {
        appointmentId: args.appointmentId,
        googleEventId: created.id!,
        googleMeetLink: created.hangoutLink,
        calendarId: args.calendarId || "primary",
        userId: args.userId,
        syncedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return {
        success: true,
        eventId: created.id!,
        meetLink: created.hangoutLink,
      };
    } catch (error) {
      console.error("Failed to create calendar event:", error);
      throw new Error("Failed to create Google Calendar event");
    }
  },
});

// Update calendar event
export const updateCalendarEvent = mutation({
  args: {
    eventId: v.string(),
    userId: v.id("users"),
    summary: v.optional(v.string()),
    description: v.optional(v.string()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    attendees: v.optional(v.array(v.object({
      email: v.string(),
      displayName: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runAction(internal.calendar.nodeActions.updateEvent, {
        userId: args.userId,
        eventId: args.eventId,
        calendarId: "primary",
        summary: args.summary,
        description: args.description,
        startTime: args.startTime,
        endTime: args.endTime,
        attendees: args.attendees,
        timeZone: undefined,
      });

      return { success: true };
    } catch (error) {
      console.error("Failed to update calendar event:", error);
      throw new Error("Failed to update Google Calendar event");
    }
  },
});

// Delete calendar event
export const deleteCalendarEvent = mutation({
  args: {
    eventId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runAction(internal.calendar.nodeActions.deleteEvent, {
        userId: args.userId,
        eventId: args.eventId,
        calendarId: "primary",
      });

      // Remove from our database
      const calendarEvent = await ctx.db
        .query("calendarEvents")
        .filter((q) => q.eq(q.field("googleEventId"), args.eventId))
        .first();

      if (calendarEvent) {
        await ctx.db.delete(calendarEvent._id);
      }

      return { success: true };
    } catch (error) {
      console.error("Failed to delete calendar event:", error);
      throw new Error("Failed to delete Google Calendar event");
    }
  },
});

// Get calendar events for date range
export const getCalendarEvents = query({
  args: {
    userId: v.id("users"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    calendarId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const items: any[] = await ctx.runAction(
        internal.calendar.nodeActions.getEvents,
        {
          userId: args.userId,
          startDate: args.startDate,
          endDate: args.endDate,
          calendarId: args.calendarId,
        }
      );

      return (
        items?.map((event: any) => ({
          id: event.id!,
          summary: event.summary || "Untitled Event",
          description: event.description,
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          hangoutLink: event.hangoutLink,
          attendees: event.attendees,
          status: event.status,
        })) || []
      );
    } catch (error) {
      console.error("Failed to fetch calendar events:", error);
      throw new Error("Failed to fetch Google Calendar events");
    }
  },
});
