// Email service for Rehabify Health
// Integrated with Resend for email delivery
import { Resend } from 'resend';

export type EmailTemplate = 
  | 'INVITATION_CREATED' 
  | 'ONBOARDING_COMPLETE'
  | 'INVITATION_REMINDER'
  | 'ACCOUNT_APPROVED'
  | 'ACCOUNT_DECLINED'
  | 'APPOINTMENT_SCHEDULED'
  | 'APPOINTMENT_REMINDER'
  | 'APPOINTMENT_CANCELED'
  | 'CLINIC_STAFF_INVITE_CREATED'
  | 'CLINIC_STAFF_INVITE_REMINDER';

// Data interfaces for each email template
export interface InvitationCreatedData {
  patientName?: string;
  physiotherapistName: string;
  invitationCode: string;
  invitationLink: string;
  expiresAt: string | number | Date;
}

export interface OnboardingCompleteData {
  userName: string;
  dashboardLink: string;
}

export interface InvitationReminderData {
  patientName?: string;
  physiotherapistName: string;
  invitationCode: string;
  invitationLink: string;
  expiresAt: string | number | Date;
}

export interface ClinicStaffInvitationCreatedData {
  inviteeName?: string;
  clinicOwnerName: string;
  clinicName?: string;
  invitationCode: string;
  invitationLink: string;
  expiresAt: string | number | Date;
  message?: string;
}

export interface ClinicStaffInvitationReminderData {
  inviteeName?: string;
  clinicOwnerName: string;
  clinicName?: string;
  invitationCode: string;
  invitationLink: string;
  expiresAt: string | number | Date;
}

export interface AccountApprovedData {
  userName: string;
  userRole: string;
  clinicName?: string;
  dashboardLink: string;
}

export interface AccountDeclinedData {
  userName: string;
  reason: string;
  requiredInfo?: string[];
  supportLink: string;
}

export interface AppointmentScheduledData {
  patientName: string;
  physiotherapistName: string;
  appointmentDate: string | number | Date;
  appointmentTime: string;
  clinicName: string;
  clinicAddress: string;
  calendarLink: string;
  rescheduleLink: string;
}

export interface AppointmentReminderData {
  patientName: string;
  physiotherapistName: string;
  appointmentDate: string | number | Date;
  appointmentTime: string;
  clinicName: string;
  confirmLink: string;
  rescheduleLink: string;
}

export interface AppointmentCanceledData {
  patientName: string;
  physiotherapistName: string;
  appointmentDate: string | number | Date;
  appointmentTime: string;
  cancellationReason?: string;
  rescheduleLink: string;
}

// Discriminated union for EmailOptions
export type EmailOptions = 
  | { to: string; subject?: string; template: 'INVITATION_CREATED'; data: InvitationCreatedData }
  | { to: string; subject?: string; template: 'ONBOARDING_COMPLETE'; data: OnboardingCompleteData }
  | { to: string; subject?: string; template: 'INVITATION_REMINDER'; data: InvitationReminderData }
  | { to: string; subject?: string; template: 'ACCOUNT_APPROVED'; data: AccountApprovedData }
  | { to: string; subject?: string; template: 'ACCOUNT_DECLINED'; data: AccountDeclinedData }
  | { to: string; subject?: string; template: 'APPOINTMENT_SCHEDULED'; data: AppointmentScheduledData }
  | { to: string; subject?: string; template: 'APPOINTMENT_REMINDER'; data: AppointmentReminderData }
  | { to: string; subject?: string; template: 'APPOINTMENT_CANCELED'; data: AppointmentCanceledData }
  | { to: string; subject?: string; template: 'CLINIC_STAFF_INVITE_CREATED'; data: ClinicStaffInvitationCreatedData }
  | { to: string; subject?: string; template: 'CLINIC_STAFF_INVITE_REMINDER'; data: ClinicStaffInvitationReminderData };

/**
 * Send an email using the specified template and data
 * Uses Resend for email delivery
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { subject: finalSubject, body: emailBody } = getEmailContent(options);

  console.log(`[EMAIL SERVICE] Sending email to ${options.to}`);
  console.log(`[EMAIL SERVICE] Subject: ${options.subject || finalSubject}`);
  console.log(`[EMAIL SERVICE] Template: ${options.template}`);
  
  // Check if we have the Resend API key
  if (!process.env.RESEND_API_KEY) {
    console.error('[EMAIL SERVICE] RESEND_API_KEY not configured');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data: resendData, error } = await resend.emails.send({
      from: 'Rehabify Health <noreply@rehabifyhealth.com>',
      to: [options.to],
      subject: options.subject || finalSubject,
      html: emailBody,
    });
    
    if (error) {
      console.error('[EMAIL SERVICE] Error sending email:', error);
      return { success: false, error: error.message };
    }
    
    console.log(`[EMAIL SERVICE] Email sent successfully to ${options.to}, messageId: ${resendData?.id}`);
    return { success: true, messageId: resendData?.id };
  } catch (e: unknown) {
    const errMessage = e instanceof Error ? e.message : String(e);
    console.error('[EMAIL SERVICE] Exception sending email:', errMessage);
    return { success: false, error: errMessage };
  }
}

/**
 * Generate content for different email templates
 */
export function getEmailContent(options: EmailOptions): { subject: string; body: string } {
  switch (options.template) {
    case 'INVITATION_CREATED':
      return {
        subject: `You've been invited to join Rehabify Health`,
        body: `
          <h1>You've been invited to Rehabify Health</h1>
          <p>Hello ${options.data.patientName || 'there'},</p>
          <p>${options.data.physiotherapistName} has invited you to join Rehabify Health as their patient.</p>
          <p>Use the following invitation code to complete your registration:</p>
          <div style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 18px; text-align: center; margin: 20px 0;">
            ${options.data.invitationCode}
          </div>
          <p>Or click the link below to start your onboarding process:</p>
          <a href="${options.data.invitationLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
            Complete Registration
          </a>
          <p>This invitation will expire on ${new Date(options.data.expiresAt).toLocaleDateString()}.</p>
          <p>If you have any questions, please contact your physiotherapist directly.</p>
        `
      };
    
    case 'ONBOARDING_COMPLETE':
      return {
        subject: `Welcome to Rehabify Health - Your Registration is Complete`,
        body: `
          <h1>Welcome to Rehabify Health!</h1>
          <p>Hello ${options.data.userName},</p>
          <p>Your registration is now complete.</p>
          <p>Your account is currently under review by our administration team. You will receive another notification once your account has been approved.</p>
          <p>While you wait for approval, you can familiarize yourself with the platform by exploring the available features.</p>
          <a href="${options.data.dashboardLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
            Go to Dashboard
          </a>
          <p>We're excited to have you as part of our community!</p>
        `
      };
      
    case 'INVITATION_REMINDER':
      return {
        subject: `Reminder: Complete Your Rehabify Health Registration`,
        body: `
          <h1>Reminder: Your Invitation is Waiting</h1>
          <p>Hello ${options.data.patientName || 'there'},</p>
          <p>This is a friendly reminder that ${options.data.physiotherapistName} has invited you to join Rehabify Health as their patient.</p>
          <p>Your invitation code is:</p>
          <div style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 18px; text-align: center; margin: 20px 0;">
            ${options.data.invitationCode}
          </div>
          <p>You can complete your registration by clicking the link below:</p>
          <a href="${options.data.invitationLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
            Complete Registration Now
          </a>
          <p>This invitation will expire on ${new Date(options.data.expiresAt).toLocaleDateString()}. Don't miss out!</p>
        `
      };

    case 'CLINIC_STAFF_INVITE_CREATED':
      return {
        subject: `You've been invited to join ${options.data.clinicName || 'a clinic'} on Rehabify Health`,
        body: `
          <h1>Clinic Staff Invitation</h1>
          <p>Hello ${options.data.inviteeName || 'there'},</p>
          <p>${options.data.clinicOwnerName} has invited you to join ${options.data.clinicName || 'their clinic'} as a physiotherapist on Rehabify Health.</p>
          ${'message' in options.data && options.data.message ? `<p><em>Personal message:</em> ${options.data.message}</p>` : ''}
          <p>Use the following invitation code to accept the invitation:</p>
          <div style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 18px; text-align: center; margin: 20px 0;">
            ${options.data.invitationCode}
          </div>
          <p>Or click the link below to accept:</p>
          <a href="${options.data.invitationLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
            Accept Invitation
          </a>
          <p>This invitation will expire on ${new Date(options.data.expiresAt).toLocaleDateString()}.</p>
        `
      };

    case 'CLINIC_STAFF_INVITE_REMINDER':
      return {
        subject: `Reminder: Join ${options.data.clinicName || 'the clinic'} on Rehabify Health`,
        body: `
          <h1>Reminder: Clinic Staff Invitation</h1>
          <p>Hello ${options.data.inviteeName || 'there'},</p>
          <p>This is a friendly reminder that ${options.data.clinicOwnerName} has invited you to join ${options.data.clinicName || 'their clinic'} as a physiotherapist on Rehabify Health.</p>
          <p>Your invitation code is:</p>
          <div style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 18px; text-align: center; margin: 20px 0;">
            ${options.data.invitationCode}
          </div>
          <p>You can accept the invitation by clicking the link below:</p>
          <a href="${options.data.invitationLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
            Accept Invitation
          </a>
          <p>This invitation will expire on ${new Date(options.data.expiresAt).toLocaleDateString()}.</p>
        `
      };
    
    case 'ACCOUNT_APPROVED':
      return {
        subject: `Your Rehabify Health Account is Approved!`,
        body: `
          <h1>Account Approved!</h1>
          <p>Hello ${options.data.userName},</p>
          <p>Great news! Your Rehabify Health account as a ${options.data.userRole} ${options.data.clinicName ? `for ${options.data.clinicName}` : ''} has been approved.</p>
          <p>You can now log in and access all the features available to you:</p>
          <a href="${options.data.dashboardLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
            Log In to Your Account
          </a>
        `
      };
    
    case 'ACCOUNT_DECLINED':
      return {
        subject: `Important: Your Rehabify Health Account Application`,
        body: `
          <h1>Account Application Update</h1>
          <p>Hello ${options.data.userName},</p>
          <p>We regret to inform you that your Rehabify Health account application could not be approved at this time.</p>
          <p>Reason: ${options.data.reason || 'Our administration team has determined that additional information is needed.'}</p>
          <p>To resolve this issue, please contact our support team or update your application with the following information:</p>
          <ul>
            ${options.data.requiredInfo ? options.data.requiredInfo.map((info: string) => `<li>${info}</li>`).join('') : '<li>Additional verification documents</li>'}
          </ul>
          <a href="${options.data.supportLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
            Contact Support
          </a>
        `
      };
    
    case 'APPOINTMENT_SCHEDULED':
      return {
        subject: `Your Appointment with ${options.data.physiotherapistName} has been scheduled`,
        body: `
          <h1>Appointment Confirmed</h1>
          <p>Hello ${options.data.patientName},</p>
          <p>Your appointment with ${options.data.physiotherapistName} has been scheduled for:</p>
          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold;">Date: ${new Date(options.data.appointmentDate).toLocaleDateString()}</p>
            <p style="margin: 8px 0 0 0; font-weight: bold;">Time: ${options.data.appointmentTime}</p>
            <p style="margin: 8px 0 0 0;">Location: ${options.data.clinicName}</p>
            <p style="margin: 8px 0 0 0;">Address: ${options.data.clinicAddress}</p>
          </div>
          <p>Please arrive 10 minutes before your scheduled appointment time.</p>
          <div style="margin: 20px 0;">
            <a href="${options.data.calendarLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-right: 12px;">
              Add to Calendar
            </a>
            <a href="${options.data.rescheduleLink}" style="display: inline-block; background-color: transparent; border: 1px solid #10b981; color: #10b981; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
              Reschedule
            </a>
          </div>
        `
      };
    
    case 'APPOINTMENT_REMINDER':
      return {
        subject: `Reminder: Your Appointment Tomorrow with ${options.data.physiotherapistName}`,
        body: `
          <h1>Appointment Reminder</h1>
          <p>Hello ${options.data.patientName},</p>
          <p>This is a friendly reminder that you have an appointment scheduled for tomorrow:</p>
          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold;">Date: ${new Date(options.data.appointmentDate).toLocaleDateString()}</p>
            <p style="margin: 8px 0 0 0; font-weight: bold;">Time: ${options.data.appointmentTime}</p>
            <p style="margin: 8px 0 0 0;">Physiotherapist: ${options.data.physiotherapistName}</p>
            <p style="margin: 8px 0 0 0;">Location: ${options.data.clinicName}</p>
          </div>
          <p>Please arrive 10 minutes before your scheduled appointment time.</p>
          <div style="margin: 20px 0;">
            <a href="${options.data.confirmLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-right: 12px;">
              Confirm Attendance
            </a>
            <a href="${options.data.rescheduleLink}" style="display: inline-block; background-color: transparent; border: 1px solid #10b981; color: #10b981; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
              Reschedule
            </a>
          </div>
        `
      };
    
    case 'APPOINTMENT_CANCELED':
      return {
        subject: `Your Appointment with ${options.data.physiotherapistName} has been canceled`,
        body: `
          <h1>Appointment Canceled</h1>
          <p>Hello ${options.data.patientName},</p>
          <p>We're writing to inform you that your appointment scheduled for ${new Date(options.data.appointmentDate).toLocaleDateString()} at ${options.data.appointmentTime} with ${options.data.physiotherapistName} has been canceled.</p>
          <p>${options.data.cancellationReason ? `Reason: ${options.data.cancellationReason}` : ''}</p>
          <p>Please use the link below to reschedule at your convenience:</p>
          <a href="${options.data.rescheduleLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
            Reschedule Appointment
          </a>
          <p>If you have any questions, please contact the clinic directly.</p>
        `
      };
      
    default:
      return {
        subject: 'Rehabify Health Notification',
        body: `<p>You have a new notification from Rehabify Health.</p>`
      };
  }
}
