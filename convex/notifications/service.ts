import { insertNotification } from "../helpers/pushNotify";
import { v } from "convex/values";
import { mutation, internalMutation, action, query, internalAction, internalQuery } from "../_generated/server";
import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { api } from "../_generated/api";

// Retry interval in milliseconds (default: 5 minutes)
const RETRY_INTERVAL = 5 * 60 * 1000;

// Notification types
const NotificationTypes = {
  // Appointment notifications
  APPOINTMENT_REMINDER: "appointment_reminder",
  APPOINTMENT_CANCELLED: "appointment_cancelled",
  APPOINTMENT_RESCHEDULED: "appointment_rescheduled",
  
  // Patient notifications
  NEW_PATIENT_ASSIGNMENT: "new_patient_assignment",
  SESSION_COMPLETED: "session_completed",
  
  // Billing notifications
  INVOICE_GENERATED: "invoice_generated",
  PAYMENT_RECEIVED: "payment_received",
  
  // Staff notifications
  STAFF_INVITATION: "staff_invitation",
  APPROVAL_REQUIRED: "approval_required",
  
  // System notifications
  SYSTEM_ALERT: "system_alert",
  MAINTENANCE_SCHEDULED: "maintenance_scheduled",
  
  // Communication notifications
  MESSAGE_RECEIVED: "message_received",
  VIDEO_CALL_STARTED: "video_call_started",
} as const;

type NotificationType = typeof NotificationTypes[keyof typeof NotificationTypes];

// Notification priorities
const NotificationPriorities = {
  URGENT: "urgent",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

type NotificationPriority = typeof NotificationPriorities[keyof typeof NotificationPriorities];

// Notification statuses
const NotificationStatuses = {
  PENDING: "pending",
  DELIVERED: "delivered",
  READ: "read",
  FAILED: "failed",
  RETRYING: "retrying",
} as const;

type NotificationStatus = typeof NotificationStatuses[keyof typeof NotificationStatuses];

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  link?: string;
}

/**
 * Send a notification with fallback and retry mechanisms
 */
export const sendNotificationWithFallback = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("invitation_created"),
      v.literal("onboarding_complete"),
      v.literal("patient_onboarded"),
      v.literal("invitation_reminder"),
      v.literal("account_approved"),
      v.literal("account_declined"),
      v.literal("appointment_scheduled"),
      v.literal("appointment_reminder"),
      v.literal("appointment_cancelled"),
      v.literal("message_received"),
      v.literal("treatment_updated"),
      v.literal("report_ready"),
      v.literal("system_maintenance"),
      v.literal("billing_reminder"),
      v.literal("session_notes_added"),
      v.literal("video_call_scheduled"),
      v.literal("video_call_started"),
      v.literal("video_call_reminder"),
      v.literal("video_call_missed"),
      v.literal("video_call_cancelled")
    ),
    title: v.string(),
    message: v.string(),
    data: v.optional(
      v.object({
        entityId: v.optional(v.string()),
        entityType: v.optional(v.string()),
        actionUrl: v.optional(v.string()),
        metadata: v.optional(v.any()),
      })
    ),
    sendEmail: v.optional(v.boolean()),
    retryOnFailure: v.boolean(),
    maxRetries: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args: {
    userId: Id<"users">,
    type: "invitation_created" | "onboarding_complete" | "patient_onboarded" | "invitation_reminder" | "account_approved" | "account_declined" | "appointment_scheduled" | "appointment_reminder" | "appointment_cancelled" | "message_received" | "treatment_updated" | "report_ready" | "system_maintenance" | "billing_reminder" | "session_notes_added" | "video_call_scheduled" | "video_call_started" | "video_call_reminder" | "video_call_missed" | "video_call_cancelled",
    title: string,
    message: string,
    data?: {
      entityId?: string,
      entityType?: string,
      actionUrl?: string,
      metadata?: any
    },
    sendEmail?: boolean,
    retryOnFailure: boolean,
    maxRetries?: number
  }): Promise<{ success: boolean; notificationId?: Id<"notifications">; isDuplicate?: boolean; error?: string }> => {
    const { userId, type, title, message, retryOnFailure } = args;
    const data = args.data || { entityId: undefined, entityType: undefined, actionUrl: undefined, metadata: undefined };
    const sendEmail = args.sendEmail === true;
    const maxRetries = args.maxRetries ?? 3;
    
    try {
      // Check for duplicates first (using a 5-minute window)
      const deduplicationWindowMs = 5 * 60 * 1000;
      const earliestTimestamp = Date.now() - deduplicationWindowMs;
      
      const recentNotifications = await ctx.db
        .query("notifications")
        .withIndex("by_created", (q) => 
          q.gte("createdAt", earliestTimestamp)
        )
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();
      
      // Check if there's a similar notification
      const duplicate = recentNotifications.find(notification => 
        notification.type === type &&
        notification.payload?.title === title &&
        notification.payload?.body === message &&
        // If entityId is provided, check that it matches too
        (data?.entityId ? notification.payload?.data?.entityId === data.entityId : true)
      );
      
      if (duplicate) {
        return { success: true, notificationId: duplicate._id, isDuplicate: true };
      }
      
      // Step 1: Create the notification in the database directly
      const notificationId: Id<"notifications"> = await insertNotification(ctx, {
        userId,
        type: type as any,
        priority: "medium",
        status: "pending",
        payload: {
          title,
          body: message,
          data: data || undefined,
        },
        createdAt: Date.now(),
      });
      
      // Add detailed logging
      
      // Step 2: If email notification is requested, schedule it using Convex scheduler
      if (sendEmail) {
        // Schedule email sending via the email routing module
        // @ts-ignore - Complex Convex type inference issue
        await ctx.scheduler.runAfter(0, internal.notifications.email.processEmailForNotification, {
          notificationId,
          retryOnFailure,
          maxRetries
        });
      }
      
      return { success: true, notificationId };
    } catch (error) {
      console.error("Failed to create notification:", error);
      
      // If retry is enabled, create a retry queue entry directly
      if (retryOnFailure) {
        try {
          await ctx.db.insert("notificationRetryQueue", {
            userId,
            type: type as any,
            title,
            message,
            data,
            sendEmail,
            retryCount: 0,
            maxRetries,
            nextRetryAt: Date.now() + RETRY_INTERVAL,
            createdAt: Date.now(),
            status: "pending",
          });
        } catch (retryError) {
          console.error("Failed to queue notification for retry:", retryError);
        }
      }
      
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Process email for a specific notification (internal function)
 */
export const processEmailForNotification = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    retryOnFailure: v.boolean(),
    maxRetries: v.number(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const { notificationId, retryOnFailure, maxRetries } = args;
    
    try {
      // Get the notification
      const notification = await ctx.db.get(notificationId);
      if (!notification) {
        throw new Error(`Notification with ID ${notificationId} not found`);
      }
      
      // Get user email
      const user = await ctx.db.get(notification.userId);
      if (!user) {
        throw new Error(`User with ID ${notification.userId} not found`);
      }
      
      // Send email if the notification includes email data
      if (notification.payload?.data?.metadata?.email) {
        const emailData = notification.payload.data.metadata.email;
        
        if (user && 'email' in user && user.email) {
          // Make sure emailData exists and has required fields
          const emailSubject = emailData?.subject || 'Notification from Rehabify Health';
          const emailHtmlBody = emailData?.htmlBody || `<p>${notification.payload?.body ?? ''}</p>`;
          const emailTextBody = emailData?.textBody;
          const emailTemplate = emailData?.template;
          
          // Send the email using Resend
          // @ts-ignore - Complex Convex type inference issue
          await ctx.runMutation(internal["notifications/email"].sendEmail, {
            to: user.email,
            subject: emailSubject,
            htmlBody: emailHtmlBody,
            textBody: emailTextBody,
            templateName: emailTemplate,
          });
          
          // Mark the notification as delivered
          await ctx.db.patch(notificationId, {
            deliveredAt: Date.now(),
          });
        } else {
          console.error(`Cannot send email: No email address found for user ${notification.userId}`);
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error(`Failed to process email for notification ${notificationId}:`, error);
      
      // If retry is enabled, queue the failed email
      if (retryOnFailure) {
        try {
          await ctx.db.insert("emailRetryQueue", {
            notificationId,
            retryCount: 0,
            maxRetries,
            nextRetryAt: Date.now() + RETRY_INTERVAL,
            createdAt: Date.now(),
            status: "pending",
          });
        } catch (retryError) {
          console.error("Failed to queue email for retry:", retryError);
        }
      }
      
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Test notification system - useful for debugging
 */
export const testNotification = internalAction({
  args: {
    userId: v.id("users"),
    includeEmail: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; result?: any; error?: string }> => {
    const { userId, includeEmail } = args;
    
    try {
      // Send a test notification using the public API since this is an action
      // @ts-ignore - Complex Convex type inference issue
      const result: any = await ctx.runMutation(api.notifications.sendNotificationWithFallback, {
        userId,
        type: "message_received",
        title: "Test Notification",
        message: "This is a test notification from the Rehabify Health system.",
        data: {
          entityType: "system_test",
          actionUrl: "/dashboard",
          metadata: includeEmail ? {
            email: {
              subject: "Test Email from Rehabify Health",
              htmlBody: "<h1>Test Email</h1><p>This is a test email from the Rehabify Health notification system.</p>",
              textBody: "This is a test email from the Rehabify Health notification system.",
              template: "test_notification"
            }
          } : undefined,
        },
        sendEmail: includeEmail || false,
        retryOnFailure: true,
        maxRetries: 3,
      });

      return { success: true, result };
    } catch (error) {
      console.error("Test notification failed:", error);
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Schedule automatic cleanup of retry queues
 * This should be called periodically (e.g., daily) via Convex scheduler
 */
export const scheduleCleanup = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      // Schedule cleanup to run every 24 hours
      await ctx.scheduler.runAt(
        new Date(Date.now() + 24 * 60 * 60 * 1000),
        internal.notifications.performScheduledCleanup
      );
      
      return { success: true };
    } catch (error) {
      console.error("Failed to schedule cleanup:", error);
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Internal function to perform scheduled cleanup
 */
export const performScheduledCleanup = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deletedCount: number }> => {
    // Perform cleanup of old retry queue entries (older than 7 days)
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    const oldNotificationRetries = await ctx.db
      .query("notificationRetryQueue")
      .filter((q) => q.lt(q.field("createdAt"), cutoffTime))
      .collect();
    
    const oldEmailRetries = await ctx.db
      .query("emailRetryQueue")
      .filter((q) => q.lt(q.field("createdAt"), cutoffTime))
      .collect();
    
    // Delete old entries
    for (const entry of oldNotificationRetries) {
      await ctx.db.delete(entry._id);
    }
    
    for (const entry of oldEmailRetries) {
      await ctx.db.delete(entry._id);
    }
    
    const deletedCount = oldNotificationRetries.length + oldEmailRetries.length;
    
    // Schedule next cleanup
    await ctx.scheduler.runAt(
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      internal.notifications.performScheduledCleanup
    );
    
    return { deletedCount };
  },
});

/**
 * Create a new notification
 */
export const createNotification = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.string(),
    priority: v.union(
      v.literal("urgent"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    payload: v.object({
      title: v.string(),
      body: v.string(),
      data: v.optional(v.any()),
      link: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { userId, type, priority, payload }) => {
    // Get user settings
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    if (!settings) {
      throw new Error("User settings not found");
    }

    // Check if the user has enabled this type of notification
    const isEnabled = settings.notifications.inApp.types.includes(type);
    if (!isEnabled) {
      return null;
    }

    // Create the notification
    const notification = {
      userId,
      type,
      priority,
      status: "pending" as const,
      payload,
      createdAt: Date.now(),
      readAt: undefined,
      deliveredAt: undefined,
      failedAt: undefined,
      retryCount: 0,
    };

    const notificationId = await insertNotification(ctx, notification);

    // Track the event
    await ctx.db.insert("analytics_events", {
      type: "notification_created",
      userId,
      metadata: {
        status: "success",
        details: {
          notificationId: String(notificationId),
          notificationType: type,
          priority,
        },
      },
      timestamp: Date.now(),
    });

    // Schedule delivery
    await ctx.scheduler.runAfter(0, internal.notifications.service.deliverNotification, {
      notificationId,
    });

    return notificationId;
  },
});

/**
 * Deliver a notification
 */
export const deliverNotification = internalMutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, { notificationId }) => {
    const notification = await ctx.db.get(notificationId);
    if (!notification) {
      throw new Error("Notification not found");
    }

          if ((notification.status || "pending") === "delivered" || (notification.status || "pending") === "read") {
      return;
    }

    try {
      // Get user settings
      const settings = await ctx.db
        .query("settings")
        .withIndex("by_user", q => q.eq("userId", notification.userId))
        .first();

      if (!settings) {
        throw new Error("User settings not found");
      }

      // Check Do Not Disturb
      if (settings.notifications.doNotDisturb.enabled) {
        const now = new Date();
        const currentTime = now.getHours() * 100 + now.getMinutes();
        const startTime = parseInt(settings.notifications.doNotDisturb.startTime.replace(":", ""));
        const endTime = parseInt(settings.notifications.doNotDisturb.endTime.replace(":", ""));

        if (currentTime >= startTime || currentTime <= endTime) {
          // Schedule retry for after DND period
          const retryAfter = endTime > currentTime ? endTime - currentTime : (2400 - currentTime) + endTime;
          await ctx.scheduler.runAfter(retryAfter * 60 * 1000, internal.notifications.service.deliverNotification, {
            notificationId,
          });
          return;
        }
      }

      // Attempt delivery
      let delivered = false;

      // Email delivery
      if (settings.notifications.email.enabled && settings.notifications.email.types.includes(notification.type)) {
        // TODO: Implement email delivery
        delivered = true;
      }

      // Push notification delivery
      if (settings.notifications.push.enabled && settings.notifications.push.types.includes(notification.type)) {
        // TODO: Implement push notification delivery
        delivered = true;
      }

      if (delivered) {
        await ctx.db.patch(notificationId, {
          status: "delivered",
          deliveredAt: Date.now(),
        });

        // Track successful delivery
        await ctx.db.insert("analytics_events", {
          type: "notification_delivered",
          userId: notification.userId,
          metadata: {
            status: "success",
            details: {
              notificationId: String(notificationId),
              notificationType: notification.type,
            },
          },
          timestamp: Date.now(),
        });
      } else {
        throw new Error("No delivery method available");
      }
    } catch (error) {
      const retryCount = (notification.retryCount || 0) + 1;
      const maxRetries = 3;

      if (retryCount <= maxRetries) {
        // Exponential backoff for retries
        const delay = Math.pow(2, retryCount) * 1000;
        await ctx.db.patch(notificationId, {
          status: "retrying",
          retryCount,
        });

        await ctx.scheduler.runAfter(delay, internal.notifications.service.deliverNotification, {
          notificationId,
        });
      } else {
        await ctx.db.patch(notificationId, {
          status: "failed",
          failedAt: Date.now(),
        });

        // Track failure
        await ctx.db.insert("analytics_events", {
          type: "notification_failed",
          userId: notification.userId,
          metadata: {
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
            details: {
              notificationId: String(notificationId),
              notificationType: notification.type,
            },
          },
          timestamp: Date.now(),
        });
      }
    }
  },
});

/**
 * Mark a notification as read
 */
export const markAsRead = internalMutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, { notificationId }) => {
    const notification = await ctx.db.get(notificationId);
    if (!notification) {
      throw new Error("Notification not found");
    }

    await ctx.db.patch(notificationId, {
      status: "read",
      readAt: Date.now(),
    });

    // Track the event
    await ctx.db.insert("analytics_events", {
      type: "notification_read",
      userId: notification.userId,
      metadata: {
        status: "success",
        details: { notificationType: notification.type },
      },
      timestamp: Date.now(),
    });
  },
});

/**
 * Get user notifications
 */
export const getUserNotifications = internalQuery({
  args: {
    userId: v.id("users"),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed"),
      v.literal("retrying"),
      v.literal("all")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, status = "all", limit = 50 }) => {
    let query = ctx.db
      .query("notifications")
      .withIndex("by_user", q => q.eq("userId", userId))
      .order("desc");

    if (status !== "all") {
      query = query.filter(q => q.eq(q.field("status"), status));
    }

    return await query.take(limit);
  },
});

/**
 * Get notification stats
 */
export const getNotificationStats = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const stats = {
      total: notifications.length,
      unread: notifications.filter(n => (n.status || "pending") !== "read").length,
      todayCount: notifications.filter(n => n.createdAt >= oneDayAgo).length,
      thisWeekCount: notifications.filter(n => n.createdAt >= oneWeekAgo).length,
      byType: {} as Record<string, number>,
      byPriority: {} as Record<NotificationPriority, number>,
    };

    // Count by type
    notifications.forEach(n => {
      stats.byType[n.type] = (stats.byType[n.type] || 0) + 1;
    });

    // Count by priority
    notifications.forEach(n => {
      const priority = n.priority || "medium"; // Default to medium if not set
      stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;
    });

    return stats;
  },
});

/**
 * Mark notifications as read
 */
export const markNotificationsAsRead = internalMutation({
  args: {
    notificationIds: v.array(v.id("notifications")),
  },
  handler: async (ctx, { notificationIds }) => {
    for (const id of notificationIds) {
      await ctx.db.patch(id, { 
        status: "read",
        readAt: Date.now()
      });
    }
    return notificationIds;
  },
});

/**
 * Delete notifications
 */
export const deleteNotifications = internalMutation({
  args: {
    notificationIds: v.array(v.id("notifications")),
  },
  handler: async (ctx, { notificationIds }) => {
    for (const id of notificationIds) {
      await ctx.db.delete(id);
    }
    return notificationIds;
  },
});

/**
 * Get notification preferences
 */
export const getNotificationPreferences = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    const settings = await ctx.db
      .query("settings")
      .filter(q => q.eq(q.field("userId"), userId))
      .first();

    return settings?.notifications || {
      email: {
        enabled: true,
        types: [],
        frequency: "immediate" as const,
      },
      push: {
        enabled: true,
        types: [],
      },
      inApp: {
        enabled: true,
        types: [],
        showBadge: true,
        playSound: true,
      },
      doNotDisturb: {
        enabled: false,
        startTime: "22:00",
        endTime: "08:00",
      },
    };
  },
});

/**
 * Update notification preferences
 */
export const updateNotificationPreferences = internalMutation({
  args: {
    userId: v.id("users"),
    preferences: v.object({
      email: v.object({
        enabled: v.boolean(),
        types: v.array(v.string()),
        frequency: v.union(v.literal("immediate"), v.literal("daily"), v.literal("weekly")),
      }),
      push: v.object({
        enabled: v.boolean(),
        types: v.array(v.string()),
      }),
      inApp: v.object({
        enabled: v.boolean(),
        types: v.array(v.string()),
        showBadge: v.boolean(),
        playSound: v.boolean(),
      }),
      doNotDisturb: v.object({
        enabled: v.boolean(),
        startTime: v.string(),
        endTime: v.string(),
      }),
    }),
  },
  handler: async (ctx, { userId, preferences }) => {
    const settings = await ctx.db
      .query("settings")
      .filter(q => q.eq(q.field("userId"), userId))
      .first();

    if (settings) {
      await ctx.db.patch(settings._id, {
        notifications: preferences,
      });
      return settings._id;
    }

    return await ctx.db.insert("settings", {
      userId,
      notifications: preferences,
      preferences: {
        theme: "light" as const,
        language: "en",
        timezone: "UTC",
        dateFormat: "MM/DD/YYYY" as const,
        timeFormat: "12h" as const,
      },
      privacy: {
        profileVisibility: "public" as const,
        shareAnalytics: true,
        dataRetention: {
          messageHistory: 365,
          activityLogs: 90,
        },
      },
    });
  },
}); 