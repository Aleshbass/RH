// @ts-nocheck


import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { action, internalAction, internalMutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { NotificationType, NotificationPriority, NotificationPayload } from "../../types/notifications";

// Email templates
const EMAIL_TEMPLATES = {
  INVITATION_CREATED: "invitation_created",
  ONBOARDING_COMPLETE: "onboarding_complete",
  INVITATION_REMINDER: "invitation_reminder",
  ACCOUNT_APPROVED: "account_approved",
  ACCOUNT_DECLINED: "account_declined",
  APPOINTMENT_SCHEDULED: "appointment_scheduled",
  APPOINTMENT_REMINDER: "appointment_reminder",
  APPOINTMENT_CANCELLED: "appointment_cancelled",
  NEW_MESSAGE: "message_received",
  TREATMENT_UPDATED: "treatment_plan_updated",
  REPORT_READY: "report_ready",
  SYSTEM_MAINTENANCE: "system_maintenance",
  BILLING_REMINDER: "billing_reminder",
  SESSION_NOTES_ADDED: "session_notes_added",
  VIDEO_CALL_SCHEDULED: "video_call_scheduled",
  VIDEO_CALL_STARTED: "video_call_started",
  VIDEO_CALL_REMINDER: "video_call_reminder",
  VIDEO_CALL_MISSED: "video_call_missed",
  VIDEO_CALL_CANCELLED: "video_call_cancelled",
} as const;

type EmailTemplate = typeof EMAIL_TEMPLATES[keyof typeof EMAIL_TEMPLATES];

interface EmailData {
  subject: string;
  htmlBody: string;
  textBody?: string;
  templateName?: EmailTemplate;
  data?: Record<string, any>;
}

/**
 * Process email for a notification (Internal Action)
 * This integrates with the existing notification system
 */
export const processEmailForNotification = internalAction({
  args: {
    notificationId: v.id("notifications"),
    retryOnFailure: v.boolean(),
    maxRetries: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      // Use loose typing to avoid excessive generic depth
      const notification = await (ctx.runQuery as any)(api.notifications.core.getNotificationById, {
        notificationId: args.notificationId,
      });

      if (!notification) {
        console.error(`Notification ${args.notificationId} not found`);
        return { success: false, error: "Notification not found" };
      }

      // Get user details
      const user = await ctx.runQuery(api.users.getUserById, {
        userId: notification.userId,
      });

      if (!user) {
        console.error(`User ${notification.userId} not found`);
        return { success: false, error: "User not found" };
      }

      if (!user.email) {
        console.error(`User ${notification.userId} has no email address`);
        return { success: false, error: "User has no email address" };
      }

      // Construct a user-friendly display name
      const displayName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'User';

      // Route to appropriate email service based on notification type
      let emailResult: { success: boolean; error?: string; messageId?: string } = {
        success: false,
        error: "Unknown notification type",
      };

      switch (notification.type) {
        case "account_approved":
          // Use loose typing for dynamic function reference
          emailResult = await (ctx.runAction as any)((internal as any)["actions/emails/sendApprovalEmail"], {
            userEmail: user.email,
            userName: displayName,
            userRole: user.role === "physiotherapist" ? "Physiotherapist" 
                    : user.role === "clinic_owner" ? "Clinic Owner" 
                    : "User",
            dashboardLink: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.rehabifyhealth.com'}/dashboard/${
              user.role === "physiotherapist" ? "physiotherapist" 
              : user.role === "clinic_owner" ? "clinic" 
              : "patient"
            }`,
          });
          break;

        case "account_declined":
          // Use loose typing for dynamic function reference
          emailResult = await (ctx.runAction as any)((internal as any)["actions/emails/sendDeclineEmail"], {
            userEmail: user.email,
            userName: displayName,
            reason: notification.payload?.data?.reason || "Application requirements not met",
            supportLink: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.rehabifyhealth.com'}/support`,
            requiredDocuments: user.role === "physiotherapist" 
              ? ["Valid Professional License", "Certification Documents", "Updated Contact Information"]
              : user.role === "clinic_owner"
              ? ["Business Registration", "Professional Credentials", "Clinic Documentation"]
              : ["Required Documentation"],
          });
          break;

        // Add other notification types as needed
        default:
          console.log(`Email not configured for notification type: ${notification.type}`);
          return { success: true, message: "Email not configured for this notification type" };
      }

      // Update notification status based on email result
      if (emailResult.success) {
        await ctx.runMutation(api.notifications.core.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "delivered",
          deliveredAt: Date.now(),
        });
        
        console.log(`Email sent successfully for notification ${args.notificationId}`);
        return { success: true, messageId: emailResult.messageId || undefined };
      } else {
        console.error(`Email failed for notification ${args.notificationId}:`, emailResult.error);
        
        // Handle retry logic if enabled
        if (args.retryOnFailure) {
          await ctx.runMutation(api.notifications.retry.scheduleNotificationRetry, {
            notificationId: args.notificationId,
            maxRetries: args.maxRetries,
            error: emailResult.error || "Email sending failed",
          });
        }
        
        return { success: false, error: emailResult.error };
      }
    } catch (error) {
      console.error(`Error processing email for notification ${args.notificationId}:`, error);
      
      // Handle retry logic if enabled
      if (args.retryOnFailure) {
        await ctx.runMutation(api.notifications.retry.scheduleNotificationRetry, {
          notificationId: args.notificationId,
          maxRetries: args.maxRetries,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
      
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

/**
 * Send approval notification with email (Public API)
 */
export const sendApprovalNotificationWithEmail = internalAction({
  args: {
    userId: v.id("users"),
    comments: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    notificationId: v.optional(v.id("notifications")),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    error?: string;
    notificationId?: Id<"notifications">;
  }> => {
    try {
      // Create the notification
      const notificationResult = await ctx.runMutation(api.notifications.service.sendNotificationWithFallback, {
        userId: args.userId,
        type: "account_approved",
        title: "Account Approved",
        message: "Your Rehabify Health account has been approved! You can now access all platform features.",
        data: {
          entityType: "account_approval",
          actionUrl: "/dashboard",
          metadata: {
            comments: args.comments,
            approvedAt: Date.now(),
          },
        },
        sendEmail: true,
        retryOnFailure: true,
        maxRetries: 3,
      });

      return notificationResult;
    } catch (error) {
      console.error("Failed to send approval notification:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

/**
 * Send decline notification with email (Public API)
 */
export const sendDeclineNotificationWithEmail = internalAction({
  args: {
    userId: v.id("users"),
    reason: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    notificationId: v.optional(v.id("notifications")),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    error?: string;
    notificationId?: Id<"notifications">;
  }> => {
    try {
      // Create the notification
      const notificationResult = await ctx.runMutation(api.notifications.service.sendNotificationWithFallback, {
        userId: args.userId,
        type: "account_declined",
        title: "Account Application Update",
        message: "Your account application requires additional information. Please review the requirements and resubmit.",
        data: {
          entityType: "account_decline",
          actionUrl: "/support",
          metadata: {
            reason: args.reason,
            declinedAt: Date.now(),
          },
        },
        sendEmail: true,
        retryOnFailure: true,
        maxRetries: 3,
      });

      return notificationResult;
    } catch (error) {
      console.error("Failed to send decline notification:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

/**
 * Format email data based on notification type
 */
async function formatEmailData(notification: {
  type: NotificationType;
  payload: NotificationPayload;
}): Promise<EmailData> {
  const { type, payload } = notification;

  // Default email data
  const emailData: EmailData = {
    subject: payload.title,
    htmlBody: payload.body,
    textBody: payload.body,
  };

  // Add template-specific formatting
  switch (type) {
    case "invitation_created":
      emailData.templateName = EMAIL_TEMPLATES.INVITATION_CREATED;
      emailData.data = payload.data;
      break;

    case "onboarding_complete":
      emailData.templateName = EMAIL_TEMPLATES.ONBOARDING_COMPLETE;
      emailData.data = payload.data;
      break;

    case "appointment_scheduled":
      emailData.templateName = EMAIL_TEMPLATES.APPOINTMENT_SCHEDULED;
      emailData.data = payload.data;
      break;

    // Add more cases as needed...

    default:
      // Use default formatting
      break;
  }

  return emailData;
} 