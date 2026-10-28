import { insertNotification } from "../helpers/pushNotify";
import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";

// Retry interval in milliseconds (default: 5 minutes)
const RETRY_INTERVAL = 5 * 60 * 1000;

// Cleanup intervals
const CLEANUP_COMPLETED_AFTER_DAYS = 7; // Delete completed retry entries after 7 days
const CLEANUP_FAILED_AFTER_DAYS = 30; // Delete failed retry entries after 30 days

/**
 * Queue a failed notification for retry
 */
export const queueFailedNotification = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.string(), 
    title: v.string(),
    message: v.string(),
    data: v.object({
      entityId: v.optional(v.string()),
      entityType: v.optional(v.string()),
      actionUrl: v.optional(v.string()),
      metadata: v.optional(v.any()),
    }),
    sendEmail: v.boolean(),
    retryCount: v.number(),
    maxRetries: v.number(),
  },
  handler: async (ctx, args) => {
    const failedQueueId = await ctx.db.insert("notificationRetryQueue", {
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      data: args.data,
      sendEmail: args.sendEmail,
      retryCount: args.retryCount,
      maxRetries: args.maxRetries,
      nextRetryAt: Date.now() + RETRY_INTERVAL,
      createdAt: Date.now(),
      status: "pending",
    });

    return failedQueueId;
  },
});

/**
 * Queue a failed email for retry
 */
export const queueFailedEmail = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    retryCount: v.number(),
    maxRetries: v.number(),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    
    if (!notification) {
      throw new Error(`Notification with ID ${args.notificationId} not found`);
    }

    const failedEmailId = await ctx.db.insert("emailRetryQueue", {
      notificationId: args.notificationId,
      retryCount: args.retryCount,
      maxRetries: args.maxRetries,
      nextRetryAt: Date.now() + RETRY_INTERVAL,
      createdAt: Date.now(),
      status: "pending",
    });

    return failedEmailId;
  },
});

/**
 * Schedule notification retry (Internal Mutation)
 */
export const scheduleNotificationRetry = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    maxRetries: v.number(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      throw new Error("Notification not found");
    }

    const retryCount = (notification.retryCount || 0) + 1;

    if (retryCount <= args.maxRetries) {
      // Exponential backoff for retries
      const delay = Math.pow(2, retryCount) * 1000;
      await ctx.db.patch(args.notificationId, {
        status: "retrying",
        retryCount,
      });

      // Schedule retry using the existing notification system
      await ctx.scheduler.runAfter(delay, internal.notifications.service.deliverNotification, {
        notificationId: args.notificationId,
      });
    } else {
      await ctx.db.patch(args.notificationId, {
        status: "failed",
        failedAt: Date.now(),
      });
    }

    return true;
  },
});

/**
 * Process a single notification retry
 */
export const processSingleNotificationRetry = internalMutation({
  args: {
    retryId: v.id("notificationRetryQueue"),
  },
  handler: async (ctx, args) => {
    const retry = await ctx.db.get(args.retryId);
    if (!retry) return;
    
    // Mark as processing
    await ctx.db.patch(args.retryId, { status: "processing" });
    
    try {
      // Create the notification directly in the database to avoid type instantiation issues
      const notificationId: any = await insertNotification(ctx, {
        userId: retry.userId,
        type: retry.type,
        priority: 'medium',
        status: 'pending',
        payload: {
          title: retry.title,
          body: retry.message,
          data: retry.data,
        },
        createdAt: Date.now(),
        readAt: undefined,
        deliveredAt: undefined,
        failedAt: undefined,
        retryCount: 0,
      });
      
      // If email is required, schedule it
      if (retry.sendEmail) {
        // Email processing would be handled here when email service is implemented
      }
      
      // Mark as completed
      await ctx.db.patch(args.retryId, { status: "completed" });
      
    } catch (error) {
      // Handle failure
      const newRetryCount = retry.retryCount + 1;
      
      if (newRetryCount >= retry.maxRetries) {
        await ctx.db.patch(args.retryId, {
          status: "failed",
          retryCount: newRetryCount,
        });
      } else {
        // Exponential backoff
        const backoffMinutes = Math.min(Math.pow(2, newRetryCount), 60); // Max 1 hour
        const nextRetryAt = Date.now() + backoffMinutes * 60 * 1000;
        
        await ctx.db.patch(args.retryId, {
          status: "pending",
          retryCount: newRetryCount,
          nextRetryAt,
        });
      }
      
      throw error;
    }
  },
});

/**
 * Process a single email retry
 */
export const processSingleEmailRetry = internalMutation({
  args: {
    retryId: v.id("emailRetryQueue"),
  },
  handler: async (ctx, args) => {
    const retry = await ctx.db.get(args.retryId);
    if (!retry) return;
    
    // Mark as processing
    await ctx.db.patch(args.retryId, { status: "processing" });
    
    try {
      // Process the email via the email routing module (an action, so it is scheduled:
      // mutations cannot run actions directly)
      await ctx.scheduler.runAfter(0, internal.notifications.email.processEmailForNotification, {
        notificationId: retry.notificationId,
        retryOnFailure: false, // Don't create recursive retries
        maxRetries: 1,
      });
      
      // Mark as completed
      await ctx.db.patch(args.retryId, { status: "completed" });
      
    } catch (error) {
      // Handle failure
      const newRetryCount = retry.retryCount + 1;
      
      if (newRetryCount >= retry.maxRetries) {
        await ctx.db.patch(args.retryId, {
          status: "failed",
          retryCount: newRetryCount,
        });
      } else {
        // Exponential backoff
        const backoffMinutes = Math.min(Math.pow(2, newRetryCount), 60); // Max 1 hour
        const nextRetryAt = Date.now() + backoffMinutes * 60 * 1000;
        
        await ctx.db.patch(args.retryId, {
          status: "pending",
          retryCount: newRetryCount,
          nextRetryAt,
        });
      }
      
      throw error;
    }
  },
});

/**
 * Process retry queues with better error handling and rate limiting
 */
export const processRetryQueuesWithRateLimit = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    currentTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 10; // Smaller batch size to prevent timeouts
    const currentTime = args.currentTime ?? Date.now();
    
    let processedCount = 0;
    let errorCount = 0;
    
    try {
      // Process notification retries
      const pendingNotificationRetries = await ctx.db
        .query("notificationRetryQueue")
        .withIndex("by_status_and_next_retry", (q) =>
          q.eq("status", "pending").lte("nextRetryAt", currentTime)
        )
        .take(batchSize);
      
      for (const retry of pendingNotificationRetries) {
        try {
          const result: any = await ctx.runMutation(internal.notifications.retry.processSingleNotificationRetry, {
            retryId: retry._id
          });
          processedCount++;
        } catch (error) {
          console.error(`Failed to process notification retry ${retry._id}:`, error);
          errorCount++;
        }
      }
      
      // Process email retries
      const pendingEmailRetries = await ctx.db
        .query("emailRetryQueue")
        .withIndex("by_status_and_next_retry", (q) =>
          q.eq("status", "pending").lte("nextRetryAt", currentTime)
        )
        .take(batchSize);
      
      for (const retry of pendingEmailRetries) {
        try {
          const result: any = await ctx.runMutation(internal.notifications.retry.processSingleEmailRetry, {
            retryId: retry._id
          });
          processedCount++;
        } catch (error) {
          console.error(`Failed to process email retry ${retry._id}:`, error);
          errorCount++;
        }
      }
      
    } catch (error) {
      console.error("Error in processRetryQueuesWithRateLimit:", error);
      errorCount++;
    }
    
    return { 
      processedCount, 
      errorCount, 
      success: errorCount === 0 
    };
  },
});

/**
 * Clean up old retry queue entries to prevent database overflow
 */
export const cleanupRetryQueues = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const completedCleanupThreshold = now - (CLEANUP_COMPLETED_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const failedCleanupThreshold = now - (CLEANUP_FAILED_AFTER_DAYS * 24 * 60 * 60 * 1000);
    
    let totalDeleted = 0;
    
    // Clean up completed notification retries older than 7 days
    const completedNotificationRetries = await ctx.db
      .query("notificationRetryQueue")
      .withIndex("by_status_and_next_retry", (q) =>
        q.eq("status", "completed")
      )
      .filter((q) => q.lt(q.field("createdAt"), completedCleanupThreshold))
      .take(100); // Process in batches

    for (const retry of completedNotificationRetries) {
      await ctx.db.delete(retry._id);
      totalDeleted++;
    }

    // Clean up failed notification retries older than 30 days
    const failedNotificationRetries = await ctx.db
      .query("notificationRetryQueue")
      .withIndex("by_status_and_next_retry", (q) =>
        q.eq("status", "failed")
      )
      .filter((q) => q.lt(q.field("createdAt"), failedCleanupThreshold))
      .take(100); // Process in batches

    for (const retry of failedNotificationRetries) {
      await ctx.db.delete(retry._id);
      totalDeleted++;
    }

    // Clean up completed email retries older than 7 days
    const completedEmailRetries = await ctx.db
      .query("emailRetryQueue")
      .withIndex("by_status_and_next_retry", (q) =>
        q.eq("status", "completed")
      )
      .filter((q) => q.lt(q.field("createdAt"), completedCleanupThreshold))
      .take(100); // Process in batches

    for (const retry of completedEmailRetries) {
      await ctx.db.delete(retry._id);
      totalDeleted++;
    }

    // Clean up failed email retries older than 30 days
    const failedEmailRetries = await ctx.db
      .query("emailRetryQueue")
      .withIndex("by_status_and_next_retry", (q) =>
        q.eq("status", "failed")
      )
      .filter((q) => q.lt(q.field("createdAt"), failedCleanupThreshold))
      .take(100); // Process in batches

    for (const retry of failedEmailRetries) {
      await ctx.db.delete(retry._id);
      totalDeleted++;
    }

    return { deletedCount: totalDeleted };
  },
});

/**
 * Get retry queue statistics for monitoring
 */
export const getRetryQueueStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    
    // Get notification retry queue stats
    const notificationStats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      overdue: 0, // Should have been processed but weren't
    };

    const notificationRetries = await ctx.db
      .query("notificationRetryQueue")
      .collect();

    for (const retry of notificationRetries) {
      notificationStats[retry.status]++;
      if (retry.status === "pending" && retry.nextRetryAt < now) {
        notificationStats.overdue++;
      }
    }

    // Get email retry queue stats
    const emailStats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      overdue: 0,
    };

    const emailRetries = await ctx.db
      .query("emailRetryQueue")
      .collect();

    for (const retry of emailRetries) {
      emailStats[retry.status]++;
      if (retry.status === "pending" && retry.nextRetryAt < now) {
        emailStats.overdue++;
      }
    }

    return {
      notificationRetryQueue: notificationStats,
      emailRetryQueue: emailStats,
      totalNotifications: await ctx.db.query("notifications").collect().then(n => n.length),
      lastCleanup: now, // This would need to be stored separately for real tracking
    };
  },
}); 