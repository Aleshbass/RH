// Email service for Rehabify Health
// Integrated with Resend for email delivery
import { Resend } from 'resend';

export type EmailTemplate =
  | 'INVITATION_CREATED'
  | 'ONBOARDING_COMPLETE'
  | 'ADMIN_APPROVAL_REQUIRED'
  | 'INVITATION_REMINDER'
  | 'ACCOUNT_APPROVED'
  | 'ACCOUNT_DECLINED'
  | 'APPOINTMENT_REQUESTED'
  | 'APPOINTMENT_CONFIRMED_PROVIDER'
  | 'APPOINTMENT_RESCHEDULED_PROVIDER'
  | 'APPOINTMENT_RESCHEDULED'
  | 'APPOINTMENT_CANCELED_PROVIDER'
  | 'APPOINTMENT_SCHEDULED'
  | 'APPOINTMENT_REMINDER'
  | 'APPOINTMENT_CANCELED'
  | 'CLINIC_STAFF_INVITE_CREATED'
  | 'CLINIC_STAFF_INVITE_REMINDER'
  | 'VIDEO_CALL_INVITATION'
  | 'PATIENT_ONBOARDED_PROVIDER'
  | 'CLINIC_STAFF_INVITE_ACCEPTED_OWNER'
  | 'CLINIC_STAFF_INVITE_DECLINED_OWNER'
  | 'GOOGLE_MEET_LINK';

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

export interface AdminApprovalRequiredData {
  userName: string; // The applicant's display name
  userRole?: string; // Physiotherapist or Clinic Owner
  adminDashboardLink: string; // Link to admin approval screen
  submittedAt?: string | number | Date;
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

export interface AppointmentRequestedData {
  patientName: string;
  physiotherapistName: string;
  appointmentDate: string | number | Date;
  appointmentTime: string;
  clinicName?: string;
  clinicAddress?: string;
  viewLink: string;
  approveLink?: string;
}

export interface AppointmentConfirmedProviderData {
  patientName: string;
  physiotherapistName: string;
  appointmentDate: string | number | Date;
  appointmentTime: string;
  viewLink: string;
}

export interface AppointmentRescheduledProviderData {
  patientName: string;
  physiotherapistName: string;
  oldDate: string | number | Date;
  oldTime: string;
  newDate: string | number | Date;
  newTime: string;
  viewLink: string;
}

export interface AppointmentRescheduledPatientData {
  patientName: string;
  physiotherapistName: string;
  oldDate: string | number | Date;
  oldTime: string;
  newDate: string | number | Date;
  newTime: string;
  viewLink: string;
}

export interface AppointmentCanceledProviderData {
  patientName: string;
  physiotherapistName: string;
  appointmentDate: string | number | Date;
  appointmentTime: string;
  cancellationReason?: string;
  viewLink: string;
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

export interface VideoCallInvitationData {
  patientName?: string;
  physiotherapistName: string;
  callTitle?: string;
  callLink: string;
  scheduledAt?: string | number | Date;
  message?: string;
}

export interface PatientOnboardedProviderData {
  patientName: string;
  physiotherapistName: string;
  patientsLink: string;
}

export interface ClinicStaffInviteOwnerNoticeData {
  clinicOwnerName: string;
  inviteeName: string;
  clinicName?: string;
  staffLink: string;
}

export interface GoogleMeetLinkData {
  recipientName: string;
  meetingLink: string;
  calendarLink: string;
  appointmentDate: string | number | Date;
}

// Discriminated union for EmailOptions
export type EmailOptions =
  | { to: string; subject?: string; template: 'INVITATION_CREATED'; data: InvitationCreatedData }
  | { to: string; subject?: string; template: 'ONBOARDING_COMPLETE'; data: OnboardingCompleteData }
  | { to: string; subject?: string; template: 'ADMIN_APPROVAL_REQUIRED'; data: AdminApprovalRequiredData }
  | { to: string; subject?: string; template: 'INVITATION_REMINDER'; data: InvitationReminderData }
  | { to: string; subject?: string; template: 'ACCOUNT_APPROVED'; data: AccountApprovedData }
  | { to: string; subject?: string; template: 'ACCOUNT_DECLINED'; data: AccountDeclinedData }
  | { to: string; subject?: string; template: 'APPOINTMENT_REQUESTED'; data: AppointmentRequestedData }
  | { to: string; subject?: string; template: 'APPOINTMENT_CONFIRMED_PROVIDER'; data: AppointmentConfirmedProviderData }
  | { to: string; subject?: string; template: 'APPOINTMENT_RESCHEDULED_PROVIDER'; data: AppointmentRescheduledProviderData }
  | { to: string; subject?: string; template: 'APPOINTMENT_RESCHEDULED'; data: AppointmentRescheduledPatientData }
  | { to: string; subject?: string; template: 'APPOINTMENT_CANCELED_PROVIDER'; data: AppointmentCanceledProviderData }
  | { to: string; subject?: string; template: 'APPOINTMENT_SCHEDULED'; data: AppointmentScheduledData }
  | { to: string; subject?: string; template: 'APPOINTMENT_REMINDER'; data: AppointmentReminderData }
  | { to: string; subject?: string; template: 'APPOINTMENT_CANCELED'; data: AppointmentCanceledData }
  | { to: string; subject?: string; template: 'CLINIC_STAFF_INVITE_CREATED'; data: ClinicStaffInvitationCreatedData }
  | { to: string; subject?: string; template: 'CLINIC_STAFF_INVITE_REMINDER'; data: ClinicStaffInvitationReminderData }
  | { to: string; subject?: string; template: 'VIDEO_CALL_INVITATION'; data: VideoCallInvitationData }
  | { to: string; subject?: string; template: 'PATIENT_ONBOARDED_PROVIDER'; data: PatientOnboardedProviderData }
  | { to: string; subject?: string; template: 'CLINIC_STAFF_INVITE_ACCEPTED_OWNER'; data: ClinicStaffInviteOwnerNoticeData }
  | { to: string; subject?: string; template: 'CLINIC_STAFF_INVITE_DECLINED_OWNER'; data: ClinicStaffInviteOwnerNoticeData }
  | { to: string; subject?: string; template: 'GOOGLE_MEET_LINK'; data: GoogleMeetLinkData };

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
    const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';
    const fromName = process.env.FROM_NAME || 'Rehabify Health';
    const { data: resendData, error } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
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
    case 'APPOINTMENT_REQUESTED':
      return {
        subject: options.subject || `New Appointment Request from ${options.data.patientName}`,
        body: `
          <h1>New Appointment Request</h1>
          <p>Hello ${options.data.physiotherapistName},</p>
          <p>${options.data.patientName} has requested an appointment.</p>
          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold;">Date: ${new Date(options.data.appointmentDate).toLocaleDateString()}</p>
            <p style="margin: 8px 0 0 0; font-weight: bold;">Time: ${options.data.appointmentTime}</p>
            ${options.data.clinicName ? `<p style="margin: 8px 0 0 0;">Clinic: ${options.data.clinicName}</p>` : ''}
            ${options.data.clinicAddress ? `<p style=\"margin: 8px 0 0 0;\">Address: ${options.data.clinicAddress}</p>` : ''}
          </div>
          <div style="margin: 20px 0;">
            ${options.data.approveLink ? `<a href="${options.data.approveLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-right: 12px;">Approve</a>` : ''}
            <a href="${options.data.viewLink}" style="display: inline-block; background-color: transparent; border: 1px solid #10b981; color: #10b981; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Schedule</a>
          </div>
        `
      };

    case 'PATIENT_ONBOARDED_PROVIDER':
      return {
        subject: options.subject || `New Patient Onboarded: ${options.data.patientName}`,
        body: `
          <h1>Patient Onboarding Complete</h1>
          <p>Hello ${options.data.physiotherapistName},</p>
          <p>Your patient <strong>${options.data.patientName}</strong> has completed onboarding and is now linked to your care team.</p>
          <p>You can view their profile and assign a treatment plan using the link below:</p>
          <a href="${options.data.patientsLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
            View Patients
          </a>
        `
      };
    case 'APPOINTMENT_CONFIRMED_PROVIDER':
      return {
        subject: options.subject || `Appointment Confirmed by ${options.data.patientName}`,
        body: `
          <h1>Appointment Confirmed</h1>
          <p>Hello ${options.data.physiotherapistName},</p>
          <p>${options.data.patientName} has confirmed their appointment.</p>
          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold;">Date: ${new Date(options.data.appointmentDate).toLocaleDateString()}</p>
            <p style="margin: 8px 0 0 0; font-weight: bold;">Time: ${options.data.appointmentTime}</p>
          </div>
          <a href="${options.data.viewLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Appointment</a>
        `
      };
    case 'APPOINTMENT_RESCHEDULED_PROVIDER':
      return {
        subject: options.subject || `Appointment Rescheduled: ${options.data.patientName}`,
        body: `
          <h1>Appointment Rescheduled</h1>
          <p>Hello ${options.data.physiotherapistName},</p>
          <p>The appointment with ${options.data.patientName} has been rescheduled.</p>
          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold;">Old Date: ${new Date(options.data.oldDate).toLocaleDateString()}</p>
            <p style="margin: 8px 0 0 0;">Old Time: ${options.data.oldTime}</p>
            <p style="margin: 12px 0 0 0; font-weight: bold;">New Date: ${new Date(options.data.newDate).toLocaleDateString()}</p>
            <p style="margin: 8px 0 0 0;">New Time: ${options.data.newTime}</p>
          </div>
          <a href="${options.data.viewLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Updated Schedule</a>
        `
      };
    case 'APPOINTMENT_RESCHEDULED':
      return {
        subject: options.subject || `Your Appointment has been rescheduled`,
        body: `
          <h1>Appointment Rescheduled</h1>
          <p>Hello ${options.data.patientName},</p>
          <p>Your appointment with ${options.data.physiotherapistName} has been rescheduled.</p>
          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold;">Old Date: ${new Date(options.data.oldDate).toLocaleDateString()}</p>
            <p style="margin: 8px 0 0 0;">Old Time: ${options.data.oldTime}</p>
            <p style="margin: 12px 0 0 0; font-weight: bold;">New Date: ${new Date(options.data.newDate).toLocaleDateString()}</p>
            <p style="margin: 8px 0 0 0;">New Time: ${options.data.newTime}</p>
          </div>
          <a href="${options.data.viewLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Appointment</a>
        `
      };
    case 'APPOINTMENT_CANCELED_PROVIDER':
      return {
        subject: options.subject || `Appointment Canceled: ${options.data.patientName}`,
        body: `
          <h1>Appointment Canceled</h1>
          <p>Hello ${options.data.physiotherapistName},</p>
          <p>The appointment with ${options.data.patientName} has been canceled.</p>
          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold;">Date: ${new Date(options.data.appointmentDate).toLocaleDateString()}</p>
            <p style="margin: 8px 0 0 0; font-weight: bold;">Time: ${options.data.appointmentTime}</p>
          </div>
          ${options.data.cancellationReason ? `<p><strong>Reason:</strong> ${options.data.cancellationReason}</p>` : ''}
          <a href="${options.data.viewLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Schedule</a>
        `
      };
    case 'VIDEO_CALL_INVITATION':
      return {
        subject: options.subject || `Video Call Invitation from ${options.data.physiotherapistName}`,
        body: `
          <h1>Video Call Invitation</h1>
          <p>Hello ${options.data.patientName || 'there'},</p>
          <p>${options.data.physiotherapistName} has invited you to a secure video call${options.data.callTitle ? `: <strong>${options.data.callTitle}</strong>` : ''}.</p>
          ${options.data.scheduledAt ? `<p><strong>When:</strong> ${new Date(options.data.scheduledAt).toLocaleString()}</p>` : ''}
          ${options.data.message ? `<p>${options.data.message}</p>` : ''}
          <p>Click the button below to join at the scheduled time:</p>
          <a href="${options.data.callLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
            Join Video Call
          </a>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <div style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 14px; word-break: break-all;">
            ${options.data.callLink}
          </div>
        `
      }
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

    case 'ADMIN_APPROVAL_REQUIRED':
      return {
        subject: options.subject || `Action Required: New Onboarding Awaiting Approval`,
        body: `
          <h1>Approval Required</h1>
          <p>Hello Admin,</p>
          <p><strong>${options.data.userName}</strong>${options.data.userRole ? ` (<em>${options.data.userRole}</em>)` : ''} has completed onboarding and is awaiting your review.</p>
          ${options.data.submittedAt ? `<p>Submitted: ${new Date(options.data.submittedAt).toLocaleString()}</p>` : ''}
          <p>Please review their details and approve or decline the application.</p>
          <a href="${options.data.adminDashboardLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
            Review & Approve
          </a>
          <p>If you have any questions, please contact support.</p>
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

    case 'CLINIC_STAFF_INVITE_ACCEPTED_OWNER':
      return {
        subject: options.subject || `Staff Invitation Accepted`,
        body: `
          <h1>Staff Invitation Accepted</h1>
          <p>Hello ${options.data.clinicOwnerName},</p>
          <p><strong>${options.data.inviteeName}</strong> has accepted your invitation${options.data.clinicName ? ` to join <strong>${options.data.clinicName}</strong>` : ''}.</p>
          <p>You can manage your team from the staff dashboard:</p>
          <a href="${options.data.staffLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
            View Staff
          </a>
        `
      };

    case 'CLINIC_STAFF_INVITE_DECLINED_OWNER':
      return {
        subject: options.subject || `Staff Invitation Declined`,
        body: `
          <h1>Staff Invitation Declined</h1>
          <p>Hello ${options.data.clinicOwnerName},</p>
          <p><strong>${options.data.inviteeName}</strong> has declined your invitation${options.data.clinicName ? ` to join <strong>${options.data.clinicName}</strong>` : ''}.</p>
          <p>You can send a new invite from your staff dashboard:</p>
          <a href="${options.data.staffLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
            Go to Staff
          </a>
        `
      };

    case 'ACCOUNT_APPROVED':
      return {
        subject: `Your Rehabify Health Account is Approved!`,
        body: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
            <!-- Header with Logo -->
            <div style="background-color: #ffffff; padding: 24px; text-align: center; border-bottom: 1px solid #f3f4f6;">
              <img src="https://res.cloudinary.com/dubeogufg/image/upload/v1764254773/MainRehabify_xfzfil.png" alt="Rehabify Health" style="height: 40px; width: auto;" />
            </div>
            
            <!-- Content -->
            <div style="padding: 32px 24px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background-color: #d1fae5; border-radius: 50%; margin-bottom: 16px;">
                  <span style="font-size: 32px;">🎉</span>
                </div>
                <h1 style="color: #065f46; font-size: 24px; font-weight: 700; margin: 0;">Account Approved!</h1>
              </div>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">Hello ${options.data.userName},</p>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                Great news! Your Rehabify Health account as a <strong>${options.data.userRole}</strong> ${options.data.clinicName ? `for <strong>${options.data.clinicName}</strong>` : ''} has been approved.
              </p>

              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0; color: #166534; font-size: 15px; line-height: 1.5;">
                  You now have full access to the platform. You can manage your profile, connect with patients, and start using all our features immediately.
                </p>
              </div>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 32px;">
                <a href="${options.data.dashboardLink}" style="display: inline-block; background-color: #059669; color: white; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; box-shadow: 0 4px 6px rgba(5, 150, 105, 0.2); transition: background-color 0.2s;">
                  Go to Dashboard
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; text-align: center;">
                If you have any questions, feel free to reply to this email.
              </p>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #f3f4f6;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                &copy; ${new Date().getFullYear()} Rehabify Health. All rights reserved.
              </p>
            </div>
          </div>
        `
      };

    case 'ACCOUNT_DECLINED':
      return {
        subject: `Important: Your Rehabify Health Account Application`,
        body: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
            <!-- Header with Logo -->
            <div style="background-color: #ffffff; padding: 24px; text-align: center; border-bottom: 1px solid #f3f4f6;">
              <img src="https://res.cloudinary.com/dubeogufg/image/upload/v1764254773/MainRehabify_xfzfil.png" alt="Rehabify Health" style="height: 40px; width: auto;" />
            </div>
            
            <!-- Content -->
            <div style="padding: 32px 24px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background-color: #fee2e2; border-radius: 50%; margin-bottom: 16px;">
                  <span style="font-size: 32px;">⚠️</span>
                </div>
                <h1 style="color: #991b1b; font-size: 24px; font-weight: 700; margin: 0;">Action Required</h1>
              </div>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">Hello ${options.data.userName},</p>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                Thank you for your interest in Rehabify Health. We have reviewed your application, but we need some additional information before we can approve your account.
              </p>

              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <h3 style="color: #991b1b; font-size: 16px; font-weight: 600; margin-top: 0; margin-bottom: 8px;">Reason for decline:</h3>
                <p style="margin: 0; color: #7f1d1d; font-size: 15px; line-height: 1.5;">
                  ${options.data.reason || 'Our administration team has determined that additional information is needed.'}
                </p>
                ${options.data.requiredInfo && options.data.requiredInfo.length > 0 ? `
                  <div style="margin-top: 16px;">
                    <p style="margin: 0 0 8px 0; color: #991b1b; font-size: 14px; font-weight: 600;">Required Information:</p>
                    <ul style="margin: 0; padding-left: 20px; color: #7f1d1d; font-size: 14px;">
                      ${options.data.requiredInfo.map((info: string) => `<li>${info}</li>`).join('')}
                    </ul>
                  </div>
                ` : ''}
              </div>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                Please contact our support team to resolve this issue or update your application details.
              </p>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 32px;">
                <a href="${options.data.supportLink}" style="display: inline-block; background-color: #4b5563; color: white; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; box-shadow: 0 4px 6px rgba(75, 85, 99, 0.2); transition: background-color 0.2s;">
                  Contact Support
                </a>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #f3f4f6;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                &copy; ${new Date().getFullYear()} Rehabify Health. All rights reserved.
              </p>
            </div>
          </div>
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
              View in Dashboard
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

    case 'GOOGLE_MEET_LINK':
      return {
        subject: options.subject || `Your Google Meet Link is Ready`,
        body: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
            <!-- Header with Logo -->
            <div style="background-color: #ffffff; padding: 24px; text-align: center; border-bottom: 1px solid #f3f4f6;">
              <img src="https://res.cloudinary.com/dubeogufg/image/upload/v1764254773/MainRehabify_xfzfil.png" alt="Rehabify Health" style="height: 40px; width: auto;" />
            </div>
            
            <!-- Content -->
            <div style="padding: 32px 24px;">
              <h1 style="color: #111827; font-size: 24px; font-weight: 600; margin-top: 0; margin-bottom: 16px; text-align: center;">Video Call Ready</h1>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">Hello ${options.data.recipientName},</p>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
                Your secure video consultation link has been generated. You can join the call at the scheduled time using the button below.
              </p>
              
              <!-- Meeting Details Box -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0; color: #6b7280; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Scheduled for</p>
                <p style="margin: 8px 0 0 0; color: #111827; font-size: 18px; font-weight: 600;">
                  ${new Date(options.data.appointmentDate).toLocaleString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })}
                </p>
              </div>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 32px;">
                <a href="${options.data.meetingLink}" style="display: inline-block; background-color: #059669; color: white; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; box-shadow: 0 4px 6px rgba(5, 150, 105, 0.2);">
                  Join Google Meet
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; text-align: center; margin-bottom: 8px;">
                Or copy and paste this link:
              </p>
              <div style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #4b5563; word-break: break-all; text-align: center; margin-bottom: 24px;">
                ${options.data.meetingLink}
              </div>
              
              <div style="text-align: center;">
                <a href="${options.data.calendarLink}" style="color: #059669; text-decoration: none; font-size: 14px; font-weight: 500;">
                  View in Google Calendar &rarr;
                </a>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #f3f4f6;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                &copy; ${new Date().getFullYear()} Rehabify Health. All rights reserved.
              </p>
              <p style="color: #9ca3af; font-size: 12px; margin: 8px 0 0 0;">
                This is an automated message, please do not reply directly to this email.
              </p>
            </div>
          </div>
        `
      };

    default:
      return {
        subject: 'Rehabify Health Notification',
        body: `<p>You have a new notification from Rehabify Health.</p>`
      };
  }
}
