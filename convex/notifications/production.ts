import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { action, mutation, query, internalMutation, internalQuery, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Production Notification System Health Check
 */
export const healthCheck = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Check notification processing health
    const recentNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_created", (q) => q.gte("createdAt", oneHourAgo))
      .collect();

    const recentFailures = recentNotifications.filter(n => n.status === "failed");
    const recentRetries = recentNotifications.filter(n => n.status === "retrying");
    const recentDelivered = recentNotifications.filter(n => n.status === "delivered");

    // Check retry queue health
    const pendingRetries = await ctx.db
      .query("notificationRetryQueue")
      .filter(q => q.eq(q.field("status"), "pending"))
      .collect();

    const stuckRetries = pendingRetries.filter(retry => 
      retry.nextRetryAt < now && retry.retryCount >= retry.maxRetries
    );

    // Check email service configuration
    const emailConfigured = !!process.env.RESEND_API_KEY;
    const baseUrlConfigured = !!process.env.NEXT_PUBLIC_APP_URL;

    // Performance metrics
    const avgDeliveryTime = recentDelivered.length > 0 
      ? recentDelivered.reduce((sum, n) => sum + ((n.deliveredAt || n.createdAt) - n.createdAt), 0) / recentDelivered.length
      : 0;

    return {
      status: recentFailures.length < 5 && stuckRetries.length === 0 ? "healthy" : "degraded",
      timestamp: now,
      metrics: {
        recentNotifications: {
          total: recentNotifications.length,
          delivered: recentDelivered.length,
          failed: recentFailures.length,
          retrying: recentRetries.length,
          deliveryRate: recentNotifications.length > 0 
            ? Math.round((recentDelivered.length / recentNotifications.length) * 100) 
            : 100,
        },
        retryQueue: {
          pendingRetries: pendingRetries.length,
          stuckRetries: stuckRetries.length,
        },
        performance: {
          avgDeliveryTimeMs: Math.round(avgDeliveryTime),
        },
        configuration: {
          emailConfigured,
          baseUrlConfigured,
        },
      },
      recommendations: [
        ...(recentFailures.length > 5 ? ["High failure rate detected - check email service"] : []),
        ...(stuckRetries.length > 0 ? ["Stuck retries detected - manual intervention required"] : []),
        ...(!emailConfigured ? ["RESEND_API_KEY not configured"] : []),
        ...(!baseUrlConfigured ? ["NEXT_PUBLIC_APP_URL not configured"] : []),
      ],
    };
  },
});

/**
 * Test notification system (Admin only)
 */
export const testNotificationSystem = internalAction({
  args: {
    testUserEmail: v.string(),
    testTypes: v.array(v.union(
      v.literal("approval"), 
      v.literal("decline"),
      v.literal("all")
    )),
  },
  returns: v.object({
    success: v.boolean(),
    timestamp: v.number(),
    results: v.array(v.any()),
    summary: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    timestamp: number;
    results: any[];
    summary: string;
  }> => {
    const results = [];

    // Test approval notification
    if (args.testTypes.includes("approval") || args.testTypes.includes("all")) {
      try {
        // Create a test user temporarily
        const testUserId: Id<"users"> = await ctx.runMutation(internal.users.createTestUser, {
          email: args.testUserEmail,
          role: "physiotherapist",
        });

        const approvalResult: any = await ctx.runAction(internal.notifications.email.sendApprovalNotificationWithEmail, {
          userId: testUserId,
          comments: "This is a test approval notification from the system health check.",
        });

        results.push({
          type: "approval",
          success: approvalResult.success,
          message: approvalResult.success ? "Approval notification sent successfully" : approvalResult.error,
        });

        // Clean up test user
        await ctx.runMutation(internal.users.deleteTestUser, {
          userId: testUserId,
        });
      } catch (error) {
        results.push({
          type: "approval",
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Test decline notification
    if (args.testTypes.includes("decline") || args.testTypes.includes("all")) {
      try {
        // Create a test user temporarily
        const testUserId: Id<"users"> = await ctx.runMutation(internal.users.createTestUser, {
          email: args.testUserEmail,
          role: "clinic_owner",
        });

        const declineResult: any = await ctx.runAction(internal.notifications.email.sendDeclineNotificationWithEmail, {
          userId: testUserId,
          reason: "This is a test decline notification. Missing required documentation for testing purposes.",
        });

        results.push({
          type: "decline",
          success: declineResult.success,
          message: declineResult.success ? "Decline notification sent successfully" : declineResult.error,
        });

        // Clean up test user
        await ctx.runMutation(internal.users.deleteTestUser, {
          userId: testUserId,
        });
      } catch (error) {
        results.push({
          type: "decline",
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const overallSuccess: boolean = results.every((r: any) => r.success);
    
    return {
      success: overallSuccess,
      timestamp: Date.now(),
      results,
      summary: `${results.filter(r => r.success).length}/${results.length} tests passed`,
    };
  },
});

/**
 * Get detailed notification analytics
 */
export const getNotificationAnalytics = internalQuery({
  args: {
    timeRange: v.optional(v.union(
      v.literal("hour"),
      v.literal("day"), 
      v.literal("week"),
      v.literal("month")
    )),
  },
  handler: async (ctx, args) => {
    const timeRange = args.timeRange || "day";
    const now = Date.now();
    
    const timeMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };

    const startTime = now - timeMs[timeRange];

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_created", (q) => q.gte("createdAt", startTime))
      .collect();

    // Group by type
    const byType = notifications.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Group by status
    const byStatus = notifications.reduce((acc, n) => {
      acc[n.status || "pending"] = (acc[n.status || "pending"] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Group by hour for trending
    const byHour = notifications.reduce((acc, n) => {
      const hour = new Date(n.createdAt).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    // Calculate success rate
    const delivered = byStatus.delivered || 0;
    const failed = byStatus.failed || 0;
    const total = notifications.length;
    const successRate = total > 0 ? Math.round((delivered / total) * 100) : 100;

    // Email-specific metrics
    const emailNotifications = notifications.filter(n => 
      ["account_approved", "account_declined"].includes(n.type)
    );
    const emailSuccessRate = emailNotifications.length > 0 
      ? Math.round((emailNotifications.filter(n => n.status === "delivered").length / emailNotifications.length) * 100)
      : 100;

    return {
      timeRange,
      period: `Last ${timeRange}`,
      total: notifications.length,
      successRate,
      emailSuccessRate,
      breakdown: {
        byType,
        byStatus,
        byHour,
      },
      performance: {
        avgDeliveryTime: notifications
          .filter(n => n.deliveredAt)
          .reduce((sum, n) => sum + ((n.deliveredAt! - n.createdAt) / notifications.length), 0),
      },
    };
  },
});

/**
 * Clean up old notifications (Admin utility)
 */
export const cleanupOldNotifications = internalMutation({
  args: {
    olderThanDays: v.number(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - (args.olderThanDays * 24 * 60 * 60 * 1000);
    
    const oldNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_created", (q) => q.lt("createdAt", cutoffTime))
      .collect();

    if (args.dryRun) {
      return {
        wouldDelete: oldNotifications.length,
        oldestNotification: oldNotifications.length > 0 
          ? new Date(Math.min(...oldNotifications.map(n => n.createdAt))).toISOString()
          : null,
        newestInRange: oldNotifications.length > 0
          ? new Date(Math.max(...oldNotifications.map(n => n.createdAt))).toISOString()
          : null,
      };
    }

    // Delete old notifications
    for (const notification of oldNotifications) {
      await ctx.db.delete(notification._id);
    }

    return {
      deleted: oldNotifications.length,
      cutoffDate: new Date(cutoffTime).toISOString(),
    };
  },
});

/**
 * Retry failed notifications (Admin utility)
 */
export const retryFailedNotifications = internalMutation({
  args: {
    notificationIds: v.optional(v.array(v.id("notifications"))),
    olderThanMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let notificationsToRetry;

    if (args.notificationIds) {
      // Retry specific notifications
      notificationsToRetry = await Promise.all(
        // Explicit element type: inferring it here trips TypeScript's instantiation depth limit
        args.notificationIds.map((id): Promise<Doc<"notifications"> | null> => ctx.db.get(id))
      ).then(results => results.filter(Boolean));
    } else {
      // Retry failed notifications older than specified minutes
      const cutoffTime = Date.now() - ((args.olderThanMinutes || 30) * 60 * 1000);
      notificationsToRetry = await ctx.db
        .query("notifications")
        .filter(q => 
          q.and(
            q.eq(q.field("status"), "failed"),
            q.lt(q.field("createdAt"), cutoffTime)
          )
        )
        .collect();
    }

    const retryResults = [];

    for (const notification of notificationsToRetry) {
      if (!notification) continue;
      
      try {
        // Reset notification status and schedule retry
        await ctx.db.patch(notification._id, {
          status: "pending",
          retryCount: 0,
          failedAt: undefined,
        });

        // Schedule delivery
        await ctx.scheduler.runAfter(0, internal.notifications.service.deliverNotification, {
          notificationId: notification._id,
        });

        retryResults.push({
          notificationId: notification._id,
          success: true,
        });
      } catch (error) {
        retryResults.push({
          notificationId: notification._id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      attempted: notificationsToRetry.length,
      successful: retryResults.filter(r => r.success).length,
      failed: retryResults.filter(r => !r.success).length,
      results: retryResults,
    };
  },
}); 