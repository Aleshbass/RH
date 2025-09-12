// @ts-nocheck
import { v } from "convex/values";
import { mutation, query, action } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

interface SyncOptions {
  userId: Id<"users">;
  calendarId: string;
  syncDirection: "bidirectional" | "torehabify" | "tocalendar";
  conflictResolution: "manual" | "calendar_wins" | "rehabify_wins";
}

interface WebhookPayload {
  resourceId: string;
  resourceUri: string;
  channelId: string;
  messageNumber: string;
  state: string;
}

// Sync calendar events
export const syncCalendarEvents = mutation({
  args: {
    userId: v.id("users"),
    calendarId: v.string(),
    syncDirection: v.union(v.literal("bidirectional"), v.literal("torehabify"), v.literal("tocalendar")),
    conflictResolution: v.union(v.literal("manual"), v.literal("calendar_wins"), v.literal("rehabify_wins")),
  },
  handler: async (ctx, args) => {
    // Fetch Google Calendar events via node action
    const calendar = await ctx.runAction(internal.calendar.nodeActions.getEvents, {
      userId: args.userId,
      calendarId: args.calendarId,
    });

    // Get local calendar events
    const localEvents = await ctx.db
      .query("calendarEvents")
      .filter((q) => q.eq(q.field("calendarId"), args.calendarId))
      .collect();

    const syncResults = [];

    // Process sync based on direction
    switch (args.syncDirection) {
      case "torehabify":
        syncResults.push(...await syncToRehabify(ctx, calendar, localEvents, args.calendarId));
        break;
      case "tocalendar":
        syncResults.push(...await syncToCalendar(ctx, calendar, localEvents, args.calendarId, args.userId));
        break;
      case "bidirectional":
        const toRehabify = await syncToRehabify(ctx, calendar, localEvents, args.calendarId);
        const toCalendar = await syncToCalendar(ctx, calendar, localEvents, args.calendarId, args.userId);
        syncResults.push(...toRehabify, ...toCalendar);
        break;
    }

    return {
      success: true,
      syncResults,
      conflicts: detectConflicts(calendar, localEvents),
    };
  },
});

// Lookup a calendar watch by channelId
export const getWatchByChannelId = query({
  args: { channelId: v.string() },
  handler: async (ctx, args) => {
    const watch = await ctx.db
      .query("calendarWatchChannels")
      .filter((q: any) => q.eq(q.field("channelId"), args.channelId))
      .first();
    return watch;
  },
});

// Sync Google Calendar events to Rehabify
async function syncToRehabify(ctx: any, calendarEvents: any[], localEvents: any[], calendarId: string) {
  const results = [];

  for (const googleEvent of calendarEvents) {
    const localEvent = localEvents.find(e => e.googleEventId === googleEvent.id);
    
    if (!localEvent) {
      // New event from Google Calendar
      const appointment = await findOrCreateAppointment(ctx, googleEvent);
      
      if (appointment) {
        await ctx.db.insert("calendarEvents", {
          appointmentId: appointment._id,
          googleEventId: googleEvent.id,
          googleMeetLink: googleEvent.hangoutLink,
          calendarId,
          syncedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        
        results.push({
          type: "created",
          eventId: googleEvent.id,
          action: "imported_from_calendar",
        });
      }
    } else {
      // Update existing event
      await ctx.db.patch(localEvent._id, {
        googleMeetLink: googleEvent.hangoutLink,
        updatedAt: Date.now(),
      });
      
      results.push({
        type: "updated",
        eventId: googleEvent.id,
        action: "synced_from_calendar",
      });
    }
  }

  return results;
}

// Sync Rehabify appointments to Google Calendar
async function syncToCalendar(ctx: any, calendarEvents: any[], localEvents: any[], calendarId: string, userId: Id<"users">) {
  const results = [];

  for (const localEvent of localEvents) {
    const googleEvent = calendarEvents.find(e => e.id === localEvent.googleEventId);
    
    if (!googleEvent) {
      // Event deleted from Google Calendar, recreate it
      const appointment = await ctx.db.get(localEvent.appointmentId);
      
      if (appointment) {
        const result = await ctx.runMutation(internal.calendar.service.createCalendarEvent, {
          userId,
          appointmentId: appointment._id,
          summary: `Physiotherapy Session - ${appointment.type}`,
          description: appointment.notes,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          attendees: [],
          calendarId,
        });
        
        results.push({
          type: "recreated",
          eventId: result.eventId,
          action: "synced_to_calendar",
        });
      }
    }
  }

  return results;
}

// Find or create appointment from Google Calendar event
async function findOrCreateAppointment(ctx: any, googleEvent: any) {
  // Try to find existing appointment by event ID or attendee emails
  const existingAppointment = await ctx.db
    .query("appointments")
    .filter((q) => q.eq(q.field("title"), googleEvent.summary))
    .first();

  if (existingAppointment) {
    return existingAppointment;
  }

  // Create new appointment if not found
  const startTime = new Date(googleEvent.start.dateTime || googleEvent.start.date).getTime();
  const endTime = new Date(googleEvent.end.dateTime || googleEvent.end.date).getTime();

  const appointmentId = await ctx.db.insert("appointments", {
    title: googleEvent.summary,
    description: googleEvent.description,
    startTime,
    endTime,
    status: "scheduled",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return await ctx.db.get(appointmentId);
}

// Detect conflicts between calendar and local events
function detectConflicts(calendarEvents: any[], localEvents: any[]) {
  const conflicts = [];

  for (const googleEvent of calendarEvents) {
    const localEvent = localEvents.find(e => e.googleEventId === googleEvent.id);
    
    if (localEvent) {
      const googleStart = new Date(googleEvent.start.dateTime || googleEvent.start.date).getTime();
      const googleEnd = new Date(googleEvent.end.dateTime || googleEvent.end.date).getTime();
      const localStart = localEvent.startTime;
      const localEnd = localEvent.endTime;

      if (googleStart !== localStart || googleEnd !== localEnd) {
        conflicts.push({
          type: "time_conflict",
          googleEventId: googleEvent.id,
          googleTime: { start: googleStart, end: googleEnd },
          localTime: { start: localStart, end: localEnd },
        });
      }
    }
  }

  return conflicts;
}

// Handle Google Calendar webhook
export const handleCalendarWebhook = action({
  args: {
    payload: v.object({
      resourceId: v.string(),
      resourceUri: v.string(),
      channelId: v.string(),
      messageNumber: v.string(),
      state: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const { payload } = args;

    // Verify webhook authenticity
    if (!verifyWebhookSignature(payload)) {
      throw new Error("Invalid webhook signature");
    }

    // Extract user and calendar info from webhook
    const channelId = payload.channelId;
    const [userId, calendarId] = channelId.split("_");

    // Trigger sync for affected calendar
    await ctx.runMutation(internal.calendar.sync.syncCalendarEvents, {
      userId: userId as Id<"users">,
      calendarId,
      syncDirection: "torehabify",
      conflictResolution: "manual",
    });

    return { success: true, message: "Webhook processed" };
  },
});

// Verify webhook signature
function verifyWebhookSignature(payload: any): boolean {
  // Implement webhook signature verification
  // This would typically involve checking the X-Goog-Channel-Token header
  return true; // Placeholder - implement actual verification
}

// Set up calendar watch
export const setupCalendarWatch = mutation({
  args: {
    userId: v.id("users"),
    calendarId: v.string(),
    webhookUrl: v.string(),
  },
  handler: async (ctx, args) => {
    // Set up push notifications using node action to include secure token
    const channelId = `${args.userId}_${args.calendarId}`;

    try {
      const { resourceId, expiration } = await ctx.runAction(
        internal.calendar.nodeActions.setupWatch,
        {
          userId: args.userId,
          calendarId: args.calendarId,
          webhookUrl: args.webhookUrl,
          channelId,
          token: process.env.WEBHOOK_SECRET,
          ttlSeconds: 86400, // 24 hours
        }
      );

      // Store watch channel info
      await ctx.db.insert("calendarWatchChannels", {
        userId: args.userId,
        calendarId: args.calendarId,
        channelId,
        webhookUrl: args.webhookUrl,
        resourceId,
        expiresAt: expiration,
        createdAt: Date.now(),
      });

      return { success: true, channelId };
    } catch (error) {
      console.error("Failed to setup calendar watch:", error);
      throw new Error("Failed to setup calendar watch");
    }
  },
});

// Renew calendar watch
export const renewCalendarWatch = mutation({
  args: {
    channelId: v.string(),
  },
  handler: async (ctx, args) => {
    const channel = await ctx.db
      .query("calendarWatchChannels")
      .filter((q) => q.eq(q.field("channelId"), args.channelId))
      .first();

    if (!channel || channel.expiresAt < Date.now()) {
      throw new Error("Watch channel not found or expired");
    }

    // Renew the watch using node action, then update existing record
    const { resourceId, expiration } = await ctx.runAction(
      internal.calendar.nodeActions.setupWatch,
      {
        userId: channel.userId,
        calendarId: channel.calendarId,
        webhookUrl: channel.webhookUrl,
        channelId: channel.channelId,
        token: process.env.WEBHOOK_SECRET,
        ttlSeconds: 86400,
      }
    );

    await ctx.db.patch(channel._id, {
      resourceId,
      expiresAt: expiration,
    });

    return { success: true };
  },
});
