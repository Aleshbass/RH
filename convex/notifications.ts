import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx, DatabaseReader } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getUserByIdOrThrow } from "./users";
import { internal } from "./_generated/api";
import { Resend } from 'resend';

// Initialize Resend with your API key from environment variables
const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
  console.warn("RESEND_API_KEY environment variable is not set. Email sending will be disabled.");
}
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Retry interval in milliseconds (default: 5 minutes)
const RETRY_INTERVAL = 5 * 60 * 1000;

/**
 * Create a new notification for a user
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    type: v.string(), 
    title: v.string(),
    message: v.string(),
    read: v.optional(v.boolean()),
    data: v.optional(v.object({
      entityId: v.optional(v.string()),
      entityType: v.optional(v.string()),
      actionUrl: v.optional(v.string()),
      metadata: v.optional(v.any()),
    })),
    sendEmail: v.optional(v.boolean()),
    // Add deduplication window parameter
    deduplicationWindowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    await getUserByIdOrThrow(ctx, args.userId);
    
    // Set default deduplication window (5 minutes)
    const deduplicationWindowMs = args.deduplicationWindowMs ?? 5 * 60 * 1000;
    const earliestTimestamp = Date.now() - deduplicationWindowMs;
    
    // Check for duplicate notifications within the time window
    if (deduplicationWindowMs > 0) {
      const recentNotifications = await ctx.db
        .query("notifications")
        .withIndex("by_user_and_created", (q) => 
          q.eq("userId", args.userId).gte("createdAt", earliestTimestamp)
        )
        .collect();
      
      // Check if there's a similar notification
      const duplicate = recentNotifications.find(notification => 
        notification.type === args.type &&
        notification.title === args.title &&
        notification.message === args.message &&
        // If entityId is provided, check that it matches too
        (args.data?.entityId ? notification.data?.entityId === args.data.entityId : true)
      );
      
      if (duplicate) {
        console.log(`Duplicate notification prevented for user ${args.userId}, type: ${args.type}`);
        return duplicate._id; // Return existing notification ID
      }
    }

    // No duplicate found, create new notification
    const notificationId = await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type as any, // Type will be validated by the schema
      title: args.title,
      message: args.message,
      read: args.read ?? false,
      createdAt: Date.now(),
      data: args.data ?? undefined,
      emailSent: false, // Will be updated after email is sent
    });

    return notificationId;
  },
});

/**
 * Get notifications for a user
 */
export const getByUserId = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    includeRead: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    await getUserByIdOrThrow(ctx, args.userId);

    const limit = args.limit ?? 20;
    const includeRead = args.includeRead ?? false;

    let notifications;
    
    if (includeRead) {
      // Get all notifications regardless of read status
      notifications = await ctx.db
        .query("notifications")
        .withIndex("by_user_and_created", (q) => q.eq("userId", args.userId))
        .order("desc") // Most recent first
        .take(limit);
    } else {
      // Get only unread notifications
      notifications = await ctx.db
        .query("notifications")
        .withIndex("by_user_and_read", (q) => 
          q.eq("userId", args.userId).eq("read", false)
        )
        .order("desc") // Most recent first
        .take(limit);
    }

    return notifications;
  },
});

/**
 * Get the count of unread notifications for a user
 */
export const getUnreadCount = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    await getUserByIdOrThrow(ctx, args.userId);

    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) => 
        q.eq("userId", args.userId).eq("read", false)
      )
      .collect();

    return unreadNotifications.length;
  },
});

/**
 * Mark a notification as read
 */
export const markAsRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    
    if (!notification) {
      throw new Error(`Notification with ID ${args.notificationId} not found`);
    }

    await ctx.db.patch(args.notificationId, {
      read: true,
    });

    return true;
  },
});

/**
 * Mark all notifications for a user as read
 */
export const markAllAsRead = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    await getUserByIdOrThrow(ctx, args.userId);

    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) => 
        q.eq("userId", args.userId).eq("read", false)
      )
      .collect();

    // Update each notification
    for (const notification of unreadNotifications) {
      await ctx.db.patch(notification._id, {
        read: true,
      });
    }

    return unreadNotifications.length;
  },
});

/**
 * Mark a notification as having its email sent
 */
export const markEmailSent = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    
    if (!notification) {
      throw new Error(`Notification with ID ${args.notificationId} not found`);
    }

    await ctx.db.patch(args.notificationId, {
      emailSent: true,
    });

    return true;
  },
});

/**
 * Delete a notification
 */
export const deleteNotification = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    
    if (!notification) {
      throw new Error(`Notification with ID ${args.notificationId} not found`);
    }

    await ctx.db.delete(args.notificationId);

    return true;
  },
});

/**
 * Queue a failed notification for retry
 */
export const queueFailedNotification = mutation({
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
export const queueFailedEmail = mutation({
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
 * Process notification retry queue
 * This processes pending notification retries that are due for retry
 */
export const processNotificationRetryQueue = mutation({
  args: {
    currentTime: v.number(),
  },
  handler: async (ctx, args) => {
    const { currentTime } = args;
    let processedCount = 0;
    
    // Process notification retries first
    const pendingNotificationRetries = await ctx.db
      .query("notificationRetryQueue")
      .withIndex("by_status_and_next_retry", (q) =>
        q.eq("status", "pending").lte("nextRetryAt", currentTime)
      )
      .take(20); // Process in batches to avoid timeouts
    
    // Process each notification retry
    for (const retry of pendingNotificationRetries) {
      // Mark as processing
      await ctx.db.patch(retry._id, {
        status: "processing",
      });
      
      try {
        // Create a valid notification type from the stored string
        const validType = (
          retry.type === "invitation_created" || 
          retry.type === "onboarding_complete" || 
          retry.type === "invitation_reminder" || 
          retry.type === "account_approved" || 
          retry.type === "account_declined" || 
          retry.type === "appointment_scheduled" || 
          retry.type === "appointment_reminder" || 
          retry.type === "appointment_canceled" || 
          retry.type === "new_message" || 
          retry.type === "exercise_assigned" || 
          retry.type === "patient_progress_update" || 
          retry.type === "treatment_plan_updated"
        ) ? retry.type : "new_message";
        
        const notificationId = await ctx.db.insert("notifications", {
          userId: retry.userId,
          type: validType,
          title: retry.title,
          message: retry.message,
          data: retry.data,
          read: false,
          emailSent: false,
          createdAt: Date.now(),
        });
        
        // If email is required, attempt to send it
        if (retry.sendEmail) {
          // Get user email
          const user = await ctx.db.get(retry.userId);
          if (!user) {
            throw new Error(`User with ID ${retry.userId} not found`);
          }
          
          try {
            // Send email if the notification includes email data
            if (retry.data.metadata?.email) {
              const emailData = retry.data.metadata.email;
              
              // For now just log the email
              console.log(`[Retry Queue] Would send email to ${user.email} with template ${emailData.template}`);
              
              // Mark as sent
              await ctx.db.patch(notificationId, { emailSent: true });
            }
            
            // Mark retry as completed
            await ctx.db.patch(retry._id, {
              status: "completed",
            });
          } catch (emailError) {
            console.error("Failed to send email in retry queue:", emailError);
            
            // Queue the email for retry
            await ctx.db.insert("emailRetryQueue", {
              notificationId,
              retryCount: 0,
              maxRetries: retry.maxRetries,
              nextRetryAt: Date.now() + 5 * 60 * 1000, // 5 minutes
              createdAt: Date.now(),
              status: "pending",
            });
            
            // Mark this notification retry as completed since we created the notification
            // but queue the email separately
            await ctx.db.patch(retry._id, {
              status: "completed",
            });
          }
        } else {
          // No email required, mark as completed
          await ctx.db.patch(retry._id, {
            status: "completed",
          });
        }
      } catch (error) {
        console.error("Failed to process notification retry:", error);
        
        // Increment retry count
        const newRetryCount = retry.retryCount + 1;
        
        if (newRetryCount >= retry.maxRetries) {
          // Max retries reached, mark as failed
          await ctx.db.patch(retry._id, {
            status: "failed",
            retryCount: newRetryCount,
          });
        } else {
          // Schedule next retry with exponential backoff
          const backoffMinutes = Math.pow(2, newRetryCount);
          const nextRetryAt = Date.now() + backoffMinutes * 60 * 1000;
          
          await ctx.db.patch(retry._id, {
            status: "pending",
            retryCount: newRetryCount,
            nextRetryAt,
          });
        }
      }
      
      processedCount++;
    }
    
    // Process email retries next
    const pendingEmailRetries = await ctx.db
      .query("emailRetryQueue")
      .withIndex("by_status_and_next_retry", (q) =>
        q.eq("status", "pending").lte("nextRetryAt", currentTime)
      )
      .take(20); // Process in batches to avoid timeouts
    
    // Process each email retry
    for (const retry of pendingEmailRetries) {
      // Mark as processing
      await ctx.db.patch(retry._id, {
        status: "processing",
      });
      
      try {
        // Get the notification
        const notification = await ctx.db.get(retry.notificationId);
        if (!notification) {
          // Notification no longer exists, mark as failed
          await ctx.db.patch(retry._id, {
            status: "failed",
          });
          continue;
        }
        
        // Get the user
        const user = await ctx.db.get(notification.userId);
        if (!user) {
          // User no longer exists, mark as failed
          await ctx.db.patch(retry._id, {
            status: "failed",
          });
          continue;
        }
        
        // Get the email data
        const emailData = notification.data?.metadata?.email;
        if (!emailData) {
          // No email data, mark as failed
          await ctx.db.patch(retry._id, {
            status: "failed",
          });
          continue;
        }
        
        if (user && 'email' in user && user.email) {
          // Make sure emailData exists and has required fields
          const emailSubject = emailData?.subject || 'Notification from Rehabify Health';
          const notificationMessage = notification.message || 'Notification from Rehabify Health';
          const emailHtmlBody = emailData?.htmlBody || `<p>${notificationMessage}</p>`;
          const emailTextBody = emailData?.textBody;
          const emailTemplate = emailData?.template;
          
          // Send the email using Resend
          await ctx.runMutation(internal.notifications.sendEmail, {
            to: user.email,
            subject: emailSubject,
            htmlBody: emailHtmlBody,
            textBody: emailTextBody,
            templateName: emailTemplate,
          });
          
          // Mark notification as email sent
          await ctx.db.patch(notification._id, {
            emailSent: true,
          });
        } else {
          console.error(`Cannot send email: No email address found for user ${notification.userId}`);
          // Mark as failed since we can't send without an email
          await ctx.db.patch(retry._id, {
            status: "failed",
          });
          continue;
        }
        
        // Mark retry as completed
        await ctx.db.patch(retry._id, {
          status: "completed",
        });
      } catch (error) {
        console.error("Failed to process email retry:", error);
        
        // Increment retry count
        const newRetryCount = retry.retryCount + 1;
        
        if (newRetryCount >= retry.maxRetries) {
          // Max retries reached, mark as failed
          await ctx.db.patch(retry._id, {
            status: "failed",
            retryCount: newRetryCount,
          });
        } else {
          // Schedule next retry with exponential backoff
          const backoffMinutes = Math.pow(2, newRetryCount);
          const nextRetryAt = Date.now() + backoffMinutes * 60 * 1000;
          
          await ctx.db.patch(retry._id, {
            status: "pending",
            retryCount: newRetryCount,
            nextRetryAt,
          });
        }
      }
      
      processedCount++;
    }
    
    return processedCount;
  },
});

/**
 * Send a notification with fallback and retry mechanisms
 */
export const sendNotificationWithFallback = mutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("invitation_created"),
      v.literal("onboarding_complete"),
      v.literal("invitation_reminder"),
      v.literal("account_approved"),
      v.literal("account_declined"),
      v.literal("appointment_scheduled"),
      v.literal("appointment_reminder"),
      v.literal("appointment_canceled"),
      v.literal("new_message"),
      v.literal("exercise_assigned"),
      v.literal("patient_progress_update"),
      v.literal("treatment_plan_updated")
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
    type: "invitation_created" | "onboarding_complete" | "invitation_reminder" | "account_approved" | "account_declined" | "appointment_scheduled" | "appointment_reminder" | "appointment_canceled" | "new_message" | "exercise_assigned" | "patient_progress_update" | "treatment_plan_updated",
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
  }) => {
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
        .withIndex("by_user_and_created", (q) => 
          q.eq("userId", userId).gte("createdAt", earliestTimestamp)
        )
        .collect();
      
      // Check if there's a similar notification
      const duplicate = recentNotifications.find(notification => 
        notification.type === type &&
        notification.title === title &&
        notification.message === message &&
        // If entityId is provided, check that it matches too
        (data?.entityId ? notification.data?.entityId === data.entityId : true)
      );
      
      if (duplicate) {
        console.log(`Duplicate notification prevented in sendNotificationWithFallback for user ${userId}, type: ${type}`);
        return { success: true, notificationId: duplicate._id, isDuplicate: true };
      }
      
      // Step 1: Create the notification in the database
      const notificationId = await ctx.db.insert("notifications", {
        userId,
        type,
        title,
        message,
        data: data || {},
        read: false,
        emailSent: false,
        createdAt: Date.now(),
      });
      
      // Add detailed logging
      console.log(`Notification created: ID=${notificationId}, Type=${type}, User=${userId}`);
      
      // Step 2: If email notification is requested, schedule it using Convex scheduler
      if (sendEmail) {
        // Schedule email sending as a separate operation
        await ctx.scheduler.runAfter(0, internal.notifications.processEmailForNotification, {
          notificationId,
          retryOnFailure,
          maxRetries
        });
      }
      
      return { success: true, notificationId };
    } catch (error) {
      console.error("Failed to create notification:", error);
      
      // If retry is enabled, queue the failed notification
      if (retryOnFailure) {
        await ctx.db.insert("notificationRetryQueue", {
          userId,
          type,
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
        
        console.log(`Notification queued for retry: User=${userId}, Type=${type}`);
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
  handler: async (ctx, args) => {
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
      if (notification.data?.metadata?.email) {
        const emailData = notification.data.metadata.email;
        
        if (user && 'email' in user && user.email) {
          // Make sure emailData exists and has required fields
          const emailSubject = emailData?.subject || 'Notification from Rehabify Health';
          const emailHtmlBody = emailData?.htmlBody || `<p>${notification.message}</p>`;
          const emailTextBody = emailData?.textBody;
          const emailTemplate = emailData?.template;
          
          // Send the email using Resend
          await ctx.runMutation(internal.notifications.sendEmail, {
            to: user.email,
            subject: emailSubject,
            htmlBody: emailHtmlBody,
            textBody: emailTextBody,
            templateName: emailTemplate,
          });
          
          // Mark the notification as email sent
          await ctx.db.patch(notificationId, { emailSent: true });
          console.log(`Email sent successfully for notification ${notificationId} to ${user.email}`);
        } else {
          console.error(`Cannot send email: No email address found for user ${notification.userId}`);
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error(`Failed to process email for notification ${notificationId}:`, error);
      
      // If retry is enabled, queue the failed email
      if (retryOnFailure) {
        await ctx.db.insert("emailRetryQueue", {
          notificationId,
          retryCount: 0,
          maxRetries,
          nextRetryAt: Date.now() + RETRY_INTERVAL,
          createdAt: Date.now(),
          status: "pending",
        });
        console.log(`Email queued for retry: NotificationID=${notificationId}`);
      }
      
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Send an email via the Resend service
 */
export const sendEmail = internalMutation({
  args: {
    to: v.string(),
    subject: v.string(),
    htmlBody: v.string(),
    textBody: v.optional(v.string()),
    from: v.optional(v.string()),
    templateName: v.optional(v.string()), // For logging/tracking only
  },
  handler: async (ctx, args) => {
    if (!resend) {
      console.error("Resend client is not initialized. RESEND_API_KEY might be missing.");
      throw new ConvexError("Resend client not initialized. Cannot send email.");
    }

    const fromAddress = args.from || process.env.RESEND_DEFAULT_FROM_EMAIL || "onboarding@resend.dev";

    try {
      // Log attempt for debugging
      console.log(`Attempting to send email to ${args.to} ${args.templateName ? `with template ${args.templateName}` : ''}`);
      
      const { data, error } = await resend.emails.send({
        from: fromAddress,
        to: args.to,
        subject: args.subject,
        html: args.htmlBody,
        text: args.textBody
      });

      if (error) {
        console.error("Resend API Error:", error);
        throw new ConvexError(`Failed to send email via Resend: ${error.message}`);
      }

      console.log(`Email sent successfully to ${args.to}. Resend ID: ${data?.id}`);
      return { success: true, messageId: data?.id };

    } catch (error) {
      console.error("Error in sendEmail mutation:", error);
      // Ensure the error is re-thrown so the retry mechanism can catch it
      if (error instanceof ConvexError) {
        throw error;
      }
      throw new ConvexError(error instanceof Error ? error.message : "An unknown error occurred while sending email.");
    }
  },
});