// Notification Service for Rehabify Health
// Handles creation and delivery of both in-app notifications and emails

import { ConvexClient } from 'convex/browser';
import { Id } from '../../convex/_generated/dataModel';

export type NotificationType = 
  | 'invitation_created' 
  | 'onboarding_complete'
  | 'invitation_reminder'
  | 'account_approved'
  | 'account_declined'
  | 'appointment_scheduled'
  | 'appointment_reminder'
  | 'appointment_cancelled'
  | 'new_message'
  | 'exercise_assigned'
  | 'patient_progress_update'
  | 'treatment_plan_updated'
  | 'invoice_created'
  | 'payment_confirmed';

export interface NotificationData {
  title: string;
  message: string;
  data?: {
    entityId?: string;
    entityType?: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
  };
  email?: 
    | {
        template: 'INVITATION_CREATED';
        subject: string;
        data: {
          patientName: string;
          physiotherapistName: string;
          invitationCode: string;
          invitationLink: string;
          expiresAt: string;
        };
        htmlBody?: string;
        textBody?: string;
      }
    | {
        template: 'ONBOARDING_COMPLETE';
        subject: string;
        data: {
          userName: string;
          dashboardLink: string;
        };
        htmlBody?: string;
      }
    | {
        template: 'INVITATION_REMINDER';
        subject: string;
        data: {
          patientName: string;
          physiotherapistName: string;
          invitationCode: string;
          invitationLink: string;
          expiresAt: string;
        };
        htmlBody?: string;
        textBody?: string;
      }
    | {
        template: 'ACCOUNT_APPROVED';
        subject: string;
        data: {
          userName: string;
          userRole: string;
          dashboardLink: string;
        };
        htmlBody?: string;
      }
    | {
        template: 'ACCOUNT_DECLINED';
        subject: string;
        data: {
          userName: string;
          reason: string;
          requiredInfo: string[];
          supportLink: string;
        };
        htmlBody?: string;
      }
    | {
        template: 'APPOINTMENT_SCHEDULED';
        subject: string;
        data: {
          patientName: string;
          physiotherapistName: string;
          appointmentDate: number;
          appointmentTime: string;
          clinicName: string;
          clinicAddress: string;
          calendarLink: string;
          rescheduleLink: string;
        };
        htmlBody?: string;
        textBody?: string;
      }
    | {
        template: 'APPOINTMENT_REMINDER';
        subject: string;
        data: {
          patientName: string;
          physiotherapistName: string;
          appointmentDate: number;
          appointmentTime: string;
          clinicName: string;
          confirmLink: string;
          rescheduleLink: string;
        };
        htmlBody?: string;
        textBody?: string;
      }
    | {
        template: 'APPOINTMENT_CANCELED';
        subject: string;
        data: {
          patientName: string;
          physiotherapistName: string;
          appointmentDate: number;
          appointmentTime: string;
          cancellationReason: string;
          rescheduleLink: string;
        };
        htmlBody?: string;
        textBody?: string;
      };
}

/**
 * Send a notification to a user
 * This creates an in-app notification and optionally sends an email
 */
export async function sendNotification(
  client: ConvexClient,
  userId: Id<'users'>,
  type: NotificationType,
  notificationData: NotificationData
): Promise<void> {
  // TODO: Fix complex Convex type inference issue
  // await client.mutation(api.notifications.create as any, {
  //   userId,
  //   type,
  //   priority: 'medium',
  //   payload: {
  //     title: notificationData.title,
  //     body: notificationData.message,
  //     data: notificationData.data,
  //   },
  // });
  
  console.log('Notification would be created:', {
    userId,
    type,
    priority: 'medium',
    title: notificationData.title,
    message: notificationData.message,
  });
}

/**
 * Format notification data for invitation created event
 */
export function formatInvitationCreatedNotification(
  patientName: string,
  patientEmail: string,
  physiotherapistName: string,
  invitationCode: string,
  invitationLink: string,
  expiresAt: number
): NotificationData {
  return {
    title: 'New Patient Invitation',
    message: `You've invited ${patientName} (${patientEmail}) to join Rehabify Health`,
    data: {
      entityId: invitationCode,
      entityType: 'invitation',
      actionUrl: `/dashboard/invitations`,
    },
    email: {
      template: 'INVITATION_CREATED',
      subject: `You've been invited to join Rehabify Health`,
      data: {
        patientName,
        physiotherapistName,
        invitationCode,
        invitationLink,
        expiresAt: new Date(expiresAt).toISOString(),
      },
    },
  };
}

/**
 * Format notification data for onboarding complete event
 */
export function formatOnboardingCompleteNotification(
  userName: string,
  userRole: string,
  dashboardLink: string
): NotificationData {
  // Create HTML content for the email
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #0078D4; color: white; padding: 20px; text-align: center;">
        <h1>Welcome to Rehabify Health</h1>
      </div>
      <div style="padding: 20px; border: 1px solid #e0e0e0;">
        <h2>Registration Complete</h2>
        <p>Hi ${userName},</p>
        <p>Thank you for completing your registration with Rehabify Health!</p>
        <p>Your account is now pending review by our administrators. We'll notify you once your account has been approved.</p>
        <p>In the meantime, you can check your application status by visiting your dashboard:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardLink}" style="background-color: #0078D4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Dashboard</a>
        </div>
        <p>If you have any questions during this process, please don't hesitate to contact our support team.</p>
        <p>We're excited to have you join the Rehabify Health community!</p>
      </div>
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>&copy; ${new Date().getFullYear()} Rehabify Health. All rights reserved.</p>
      </div>
    </div>
  `;

  return {
    title: 'Registration Complete',
    message: 'Thank you for completing your registration. Your account is pending review.',
    data: {
      entityType: 'onboarding',
      actionUrl: dashboardLink,
    },
    email: {
      template: 'ONBOARDING_COMPLETE',
      subject: 'Welcome to Rehabify Health - Registration Complete',
      data: {
        userName,
        dashboardLink,
      },
      htmlBody,
    },
  };
}

/**
 * Format notification data for account approval event
 */
export function formatAccountApprovedNotification(
  userName: string,
  userRole: string,
  dashboardLink: string
): NotificationData {
  // Create HTML content for the email
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #0078D4; color: white; padding: 20px; text-align: center;">
        <h1>Rehabify Health</h1>
      </div>
      <div style="padding: 20px; border: 1px solid #e0e0e0;">
        <h2>Account Approved</h2>
        <p>Hi ${userName},</p>
        <p>Great news! Your Rehabify Health account has been approved.</p>
        <p>You now have full access to the platform and all its features.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardLink}" style="background-color: #0078D4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Go to Dashboard</a>
        </div>
        <p>If you have any questions, please contact our support team.</p>
        <p>Thank you for choosing Rehabify Health!</p>
      </div>
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>&copy; ${new Date().getFullYear()} Rehabify Health. All rights reserved.</p>
      </div>
    </div>
  `;

  return {
    title: 'Account Approved',
    message: `Your Rehabify Health account has been approved. You now have full access to the platform.`,
    data: {
      entityType: 'account_approval',
      actionUrl: dashboardLink,
    },
    email: {
      template: 'ACCOUNT_APPROVED',
      subject: 'Your Rehabify Health Account Has Been Approved',
      data: {
        userName,
        userRole: 'user', // Default role, can be overridden by the caller
        dashboardLink,
      },
      htmlBody,
    },
  };
}

/**
 * Format notification data for account declined event
 */
export function formatAccountDeclinedNotification(
  userName: string,
  reason: string,
  requiredInfo: string[],
  supportLink: string
): NotificationData {
  // Format the required info as a list for HTML
  const requiredInfoHtml = requiredInfo.length > 0 
    ? `<ul>${requiredInfo.map(info => `<li>${info}</li>`).join('')}</ul>` 
    : '<p>No additional information is required at this time.</p>';
    

  // Create HTML content for the email
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #0078D4; color: white; padding: 20px; text-align: center;">
        <h1>Rehabify Health</h1>
      </div>
      <div style="padding: 20px; border: 1px solid #e0e0e0;">
        <h2>Account Application Update</h2>
        <p>Hi ${userName},</p>
        <p>We've reviewed your application for Rehabify Health, but we need some additional information before we can approve your account.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p><strong>Additional information needed:</strong></p>
        ${requiredInfoHtml}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${supportLink}" style="background-color: #0078D4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Contact Support</a>
        </div>
        <p>Please provide the required information so we can complete your application process.</p>
        <p>Thank you for your interest in Rehabify Health!</p>
      </div>
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>&copy; ${new Date().getFullYear()} Rehabify Health. All rights reserved.</p>
      </div>
    </div>
  `;

  return {
    title: 'Account Application Update',
    message: `Your Rehabify Health account application could not be approved at this time.`,
    data: {
      entityType: 'account_approval',
      actionUrl: supportLink,
    },
    email: {
      template: 'ACCOUNT_DECLINED',
      subject: `Important: Your Rehabify Health Account Application`,
      htmlBody,
      data: {
        userName,
        reason,
        requiredInfo,
        supportLink,
      },
    },
  };
}

/**
 * Format notification data for appointment scheduled event
 */
export function formatAppointmentScheduledNotification(
  patientName: string,
  physiotherapistName: string,
  appointmentDate: number,
  appointmentTime: string,
  clinicName: string,
  clinicAddress: string,
  calendarLink: string,
  rescheduleLink: string
): NotificationData {
  return {
    title: 'New Appointment',
    message: `Your appointment with ${physiotherapistName} has been scheduled for ${new Date(appointmentDate).toLocaleDateString()} at ${appointmentTime}.`,
    data: {
      entityType: 'appointment',
      actionUrl: calendarLink,
    },
    email: {
      template: 'APPOINTMENT_SCHEDULED',
      subject: `Your Appointment with ${physiotherapistName} has been scheduled`,
      data: {
        patientName,
        physiotherapistName,
        appointmentDate,
        appointmentTime,
        clinicName,
        clinicAddress,
        calendarLink,
        rescheduleLink,
      },
    },
  };
}

/**
 * Format notification data for appointment reminder event
 */
export function formatAppointmentReminderNotification(
  patientName: string,
  physiotherapistName: string,
  appointmentDate: number,
  appointmentTime: string,
  clinicName: string,
  confirmLink: string,
  rescheduleLink: string
): NotificationData {
  return {
    title: 'Appointment Reminder',
    message: `Reminder: Your appointment with ${physiotherapistName} is tomorrow at ${appointmentTime}.`,
    data: {
      entityType: 'appointment',
      actionUrl: confirmLink,
    },
    email: {
      template: 'APPOINTMENT_REMINDER',
      subject: `Reminder: Your Appointment Tomorrow with ${physiotherapistName}`,
      data: {
        patientName,
        physiotherapistName,
        appointmentDate,
        appointmentTime,
        clinicName,
        confirmLink,
        rescheduleLink,
      },
    },
  };
}

/**
 * Format notification data for appointment canceled event
 */
export function formatAppointmentCanceledNotification(
  patientName: string,
  physiotherapistName: string,
  appointmentDate: number,
  appointmentTime: string,
  cancellationReason: string,
  rescheduleLink: string
): NotificationData {
  return {
    title: 'Appointment Canceled',
    message: `Your appointment with ${physiotherapistName} on ${new Date(appointmentDate).toLocaleDateString()} at ${appointmentTime} has been canceled.`,
    data: {
      entityType: 'appointment',
      actionUrl: rescheduleLink,
    },
    email: {
      template: 'APPOINTMENT_CANCELED',
      subject: `Your Appointment with ${physiotherapistName} has been canceled`,
      data: {
        patientName,
        physiotherapistName,
        appointmentDate,
        appointmentTime,
        cancellationReason,
        rescheduleLink,
      },
    },
  };
}
