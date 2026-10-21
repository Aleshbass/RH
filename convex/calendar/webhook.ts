import { v } from "convex/values";
import { httpAction } from "../_generated/server";
import { api } from "../_generated/api";

export const calendarWebhook = httpAction(async (ctx, request) => {
  // Verify webhook request
  const headers = request.headers;
  const token = headers.get("X-Goog-Channel-Token");
  const channelId = headers.get("X-Goog-Channel-ID");
  const resourceId = headers.get("X-Goog-Resource-ID");
  const resourceState = headers.get("X-Goog-Resource-State");
  const messageNumber = headers.get("X-Goog-Message-Number");

  if (!channelId || !resourceId) {
    return new Response("Missing required headers", { status: 400 });
  }

  // Optional token verification (recommended): ensure the channel token matches our secret
  const expectedToken = process.env.WEBHOOK_SECRET;
  if (expectedToken && token !== expectedToken) {
    return new Response("Invalid webhook token", { status: 401 });
  }

  // Validate the channel exists and matches resource
  const watch = await ctx.runQuery(api.calendar.sync.getWatchByChannelId, {
    channelId,
  });

  if (!watch) {
    return new Response("Unknown channel", { status: 404 });
  }

  if (watch.resourceId && watch.resourceId !== resourceId) {
    return new Response("Mismatched resource", { status: 409 });
  }

  // Handle different resource states
  switch (resourceState) {
    case "sync":
      // Initial sync notification
      break;
    
    case "exists":
      // Calendar event changed
      
      // Trigger sync
      await ctx.runMutation(api.calendar.sync.syncCalendarEvents, {
        userId: watch.userId as any,
        calendarId: watch.calendarId,
        syncDirection: "torehabify",
        conflictResolution: "manual",
      });
      break;
    
    case "not_exists":
      // Calendar event deleted
      break;
    
    default:
  }

  return new Response("OK", { status: 200 });
});

// Health check endpoint
export const webhookHealth = httpAction(async (ctx, request) => {
  return new Response("OK", { status: 200 });
});

