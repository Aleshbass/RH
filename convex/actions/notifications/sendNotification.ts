// @ts-nocheck
// TypeScript TS2589 errors due to deep Convex generic inference - disabling type checking

"use node";

import { action, internalAction } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { v } from "convex/values";
import { Id } from "../../_generated/dataModel";

// Placeholder for NotificationData type if not defined elsewhere
// interface NotificationData {
//   title: string;
//   message: string;
//   type: string; // e.g., 'ACCOUNT_APPROVED', 'NEW_MESSAGE'
//   userId: Id<"users">;
//   actionUrl?: string;
//   email?: {
//     subject: string;
//     htmlBody: string;
//     textBody: string;
//     templateName?: string; // Optional: for specific email templates
//   };
// }

interface ActionResult {
  success: boolean;
  notificationId?: Id<"notifications">;
  error?: string;
}

export const sendNotificationWithFallback = internalAction({
  args: { 
    // Define args based on your actual requirements
    userId: v.id("users"), 
    title: v.string(), 
    message: v.string(), 
    type: v.string(),
    actionUrl: v.optional(v.string()),
    sendEmail: v.optional(v.boolean()),
    retryOnFailure: v.optional(v.boolean()),
    maxRetries: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ActionResult> => {
    // Placeholder implementation
    try {
      // Call the public 'create' mutation from convex/notifications.ts
      const result = await ctx.runMutation(api.notifications.create, {
        userId: args.userId,
        type: args.type,
        priority: "medium",
        payload: {
          title: args.title,
          body: args.message,
          data: {
            actionUrl: args.actionUrl, // Pass actionUrl within the data object
          },
        },
      });
      
      const notificationId = result.notificationId;

      if (args.sendEmail) {
        // Example: Schedule email sending via the email routing module
        // @ts-ignore - Complex Convex type inference issue
        await ctx.scheduler.runAfter(0, internal.notifications.email.processEmailForNotification, {
          notificationId,
          retryOnFailure: args.retryOnFailure ?? false, // Default to false
          maxRetries: args.maxRetries ?? 3 // Default to 3 retries
        });
      }
      return { success: true, notificationId };
    } catch (error) {
      console.error("Error in sendNotificationWithFallback:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});

export const sendFormattedNotification = internalAction({
  args: { 
    // Define args based on your actual requirements
    userId: v.id("users"), 
    data: v.any(), // This would be your specific notification data structure
    sendEmail: v.optional(v.boolean()),
    retryOnFailure: v.optional(v.boolean()),
    maxRetries: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ActionResult> => {
    // Placeholder implementation - you'll need to adapt this to your actual formatting logic
    // This is a simplified example. You'd typically call a formatting function from your notificationService
    const { userId, data, sendEmail, retryOnFailure, maxRetries } = args;
    
    // Assume data contains title, message, type, actionUrl etc.
    // This is where you would integrate with your notificationService.ts formatting functions
    const title = data.title || "Notification";
    const message = data.message || "You have a new notification.";
    const type = data.type || "GENERAL";
    const actionUrl = data.actionUrl;

    try {
      const result = await ctx.runMutation(api.notifications.create, {
        userId: args.userId, // Use args.userId directly
        type: type,          // Extracted from args.data
        priority: "medium",
        payload: {
          title: title,        // Extracted from args.data
          body: message,       // Extracted from args.data
          data: {
            actionUrl: actionUrl, // Extracted from args.data
          },
        },
      });
      
      const notificationId = result.notificationId;

      if (sendEmail) {
        // @ts-ignore - Complex Convex type inference issue
        await ctx.scheduler.runAfter(0, internal.notifications.email.processEmailForNotification, {
          notificationId,
          retryOnFailure: retryOnFailure ?? false, // Default to false
          maxRetries: maxRetries ?? 3 // Default to 3 retries
        });
      }
      return { success: true, notificationId };
    } catch (error) {
      console.error("Error in sendFormattedNotification:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});
