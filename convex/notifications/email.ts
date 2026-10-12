// @ts-nocheck


import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { action, internalAction, internalMutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { NotificationType, NotificationPriority, NotificationPayload } from "../../types/notifications";
import { publicAppUrl } from "../helpers/appUrl";

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
            dashboardLink: `${publicAppUrl()}/dashboard/${user.role === "physiotherapist" ? "physiotherapist"
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
            reason: (notification.payload?.data as any)?.metadata?.reason || "Application requirements not met",
            supportLink: `${publicAppUrl()}/support`,
            requiredDocuments: ((notification.payload?.data as any)?.metadata?.requiredDocuments as string[] | undefined) || (
              user.role === "physiotherapist"
                ? ["Valid Professional License", "Certification Documents", "Updated Contact Information"]
                : user.role === "clinic_owner"
                  ? ["Business Registration", "Professional Credentials", "Clinic Documentation"]
                  : ["Required Documentation"]
            ),
          });
          break;

        case "onboarding_complete": {
          // Send a welcome/confirmation email to the user who completed onboarding
          const appUrl = publicAppUrl();
          const dashboardPath = user.role === "patient"
            ? "/dashboard/patient"
            : user.role === "physiotherapist"
              ? "/dashboard/physiotherapist"
              : user.role === "clinic_owner"
                ? "/dashboard/clinic"
                : "/dashboard";

          const dashboardLink = `${appUrl}${dashboardPath}`;

          emailResult = await (ctx.runAction as any)((internal as any)["actions/emails/sendPatientOnboardingCompleteEmail"], {
            patientEmail: user.email,
            patientName: displayName,
            dashboardLink,
          });
          break;
        }

        case "appointment_cancelled": {
          // Optional routing: attempt to use dedicated actions for cancellation emails
          const md = (notification.payload?.data as any)?.metadata || {};
          const appUrl = publicAppUrl();

          // Compute best-effort fields
          const appointmentDate = md.appointmentDate || Date.now();
          const appointmentTime = md.appointmentTime || new Date(appointmentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const cancellationReason = md.cancellationReason;

          if (user.role === "patient") {
            const physiotherapistName = md.physiotherapistName || "your physiotherapist";
            const rescheduleLink = md.rescheduleLink || `${appUrl}/dashboard/patient/appointments`;

            emailResult = await (ctx.runAction as any)((internal as any)["actions/emails/sendAppointmentCanceledPatientEmail"], {
              to: user.email,
              patientName: displayName,
              physiotherapistName,
              appointmentDate,
              appointmentTime,
              cancellationReason,
              rescheduleLink,
            });
          } else if (user.role === "physiotherapist") {
            const patientName = md.patientName || "your patient";
            const physiotherapistName = displayName || "Physiotherapist";
            const viewLink = md.viewLink || `${appUrl}/dashboard/physiotherapist/appointments`;

            emailResult = await (ctx.runAction as any)((internal as any)["actions/emails/sendAppointmentCanceledProviderEmail"], {
              to: user.email,
              patientName,
              physiotherapistName,
              appointmentDate,
              appointmentTime,
              cancellationReason,
              viewLink,
            });
          } else {
            // For other roles, skip with a no-op success to avoid noise
            console.log(`Skipping email for appointment_cancelled for role ${user.role}`);
            return { success: true, message: "No email routing for this role" } as any;
          }

          break;
        }

        case "appointment_reminder": {
          const md = (notification.payload?.data as any)?.metadata || {};
          const appUrl = publicAppUrl();

          const patientName = displayName;
          const physiotherapistName = md.physiotherapistName || "your physiotherapist";
          const appointmentDate = md.appointmentDate || Date.now();
          const appointmentTime = md.appointmentTime || new Date(appointmentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const clinicName = md.clinicName || "Rehabify Health";
          const confirmLink = md.confirmLink || `${appUrl}/dashboard/patient/appointments`;
          const rescheduleLink = md.rescheduleLink || `${appUrl}/dashboard/patient/appointments`;

          // Skip sending reminder if appointment has already passed
          if (appointmentDate < Date.now()) {
            console.log(`Skipping appointment reminder - appointment ${notification.payload?.data?.appointmentId} has already passed`);
            return { success: true, message: "Appointment has already passed, skipping reminder" } as any;
          }

          emailResult = await (ctx.runAction as any)((internal as any)["actions/emails/sendAppointmentReminderEmail"], {
            to: user.email,
            patientName,
            physiotherapistName,
            appointmentDate,
            appointmentTime,
            clinicName,
            confirmLink,
            rescheduleLink,
          });
          break;
        }

        case "patient_onboarded": {
          const patientName = (notification.payload?.data as any)?.metadata?.patientName || "New patient";
          const appUrl = publicAppUrl();
          const patientsLink = `${appUrl}/dashboard/physiotherapist/patients`;
          // Send email to physiotherapist using dedicated action
          emailResult = await (ctx.runAction as any)((internal as any)["actions/emails/sendPatientOnboardedProviderEmail"], {
            providerEmail: user.email,
            providerName: displayName,
            patientName,
            patientsLink,
          });
          break;
        }

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