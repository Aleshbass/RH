import { mutation, query, action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";

/**
 * Trigger to process notification retry queue
 * This should be called from a cron job or manually when needed
 */
export const triggerRetryProcessing = internalAction({
  args: {},
  handler: async (ctx): Promise<{ success: boolean, message: string }> => {
    try {
      // Get the current time
      const now = Date.now();
      
      // Process pending notification retries
      await ctx.runMutation(api.notifications.processRetryQueuesWithRateLimit, {
        batchSize: 10
      });
      
      return { success: true, message: "Retry processing completed successfully" };
    } catch (error) {
      console.error("Error processing retries:", error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : "Unknown error processing retries" 
      };
    }
  }
});

/**
 * Get retry queue statistics
 */
export const getRetryQueueStats = query({
  args: {
    currentTime: v.number(),
  },
  handler: async (ctx, args) => {
    const notificationStats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };
    
    const emailStats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };
    
    // Get notification retry queue stats
    const notificationRetries = await ctx.db.query("notificationRetryQueue").collect();
    for (const retry of notificationRetries) {
      notificationStats[retry.status as keyof typeof notificationStats]++;
    }
    
    // Get email retry queue stats
    const emailRetries = await ctx.db.query("emailRetryQueue").collect();
    for (const retry of emailRetries) {
      emailStats[retry.status as keyof typeof emailStats]++;
    }
    
    return {
      notifications: notificationStats,
      emails: emailStats,
      totalRetries: notificationRetries.length + emailRetries.length,
    };
  },
});
