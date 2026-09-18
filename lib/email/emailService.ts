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
  | 'GOOGLE_MEET_LINK'
  | 'PARTNERSHIP_INQUIRY'
  | 'PAYMENT_RECEIPT'
  | 'PARTNER_APPLICATION_SUBMITTED'
  | 'PARTNER_APPLICATION_APPROVED'
  | 'PARTNER_APPLICATION_DECLINED'
  | 'PARTNER_REFERRAL_CREATED'
  | 'ADMIN_REFERRAL_CREATED';

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

export interface PartnershipInquiryData {
  name: string;
  email: string;
  organization: string;
  message: string;
}

export interface PaymentReceiptData {
  recipientName: string;
  patientName: string;
  physiotherapistName: string;
  amount: number;
  currency: string;
  paymentReference: string;
  date: string | number | Date;
  bookingId: string;
  patientEmail: string;
  patientPhone?: string;
  role: 'patient' | 'physiotherapist' | 'admin';
}

export interface PartnerApplicationSubmittedData {
  organizationName: string;
  organizationType: string;
  contactName?: string;
  contactEmail: string;
  contactPhone?: string;
  coverageStates?: string[];
  reviewLink: string;
  submittedAt?: string | number | Date;
}

export interface PartnerApplicationApprovedData {
  organizationName: string;
  partnerCode: string;
  contactName?: string;
  dashboardLink: string;
  portalLink: string;
  approvedBy?: string;
}

export interface PartnerApplicationDeclinedData {
  organizationName: string;
  contactName?: string;
  reason?: string;
  supportLink: string;
}

export interface PartnerReferralCreatedData {
  partnerName: string;
  contactName?: string;
  patientName: string;
  trackingCode: string;
  trackingUrl: string;
  whatsappIntakeUrl: string;
  whatsappPhone: string;
  condition: string;
  priority: string;
  createdAt: string | number | Date;
}

export interface AdminReferralCreatedData {
  partnerName: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  trackingCode: string;
  trackingUrl: string;
  whatsappIntakeUrl: string;
  whatsappPhone: string;
  condition: string;
  priority: string;
  city?: string;
  recommendedSessions?: number;
  adminDashboardLink: string;
  createdAt: string | number | Date;
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
  | { to: string; subject?: string; template: 'GOOGLE_MEET_LINK'; data: GoogleMeetLinkData }
  | { to: string; subject?: string; template: 'PARTNERSHIP_INQUIRY'; data: PartnershipInquiryData }
  | { to: string; subject?: string; template: 'PAYMENT_RECEIPT'; data: PaymentReceiptData }
  | { to: string; subject?: string; template: 'PARTNER_APPLICATION_SUBMITTED'; data: PartnerApplicationSubmittedData }
  | { to: string; subject?: string; template: 'PARTNER_APPLICATION_APPROVED'; data: PartnerApplicationApprovedData }
  | { to: string; subject?: string; template: 'PARTNER_APPLICATION_DECLINED'; data: PartnerApplicationDeclinedData }
  | { to: string; subject?: string; template: 'PARTNER_REFERRAL_CREATED'; data: PartnerReferralCreatedData }
  | { to: string; subject?: string; template: 'ADMIN_REFERRAL_CREATED'; data: AdminReferralCreatedData };

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
    case 'PAYMENT_RECEIPT': {
      const amountStr = (options.data.amount / 100).toLocaleString('en-NG', { style: 'currency', currency: options.data.currency });
      let receiptMessage = '';
      if (options.data.role === 'patient') {
        receiptMessage = `Thank you for your payment! Your booking with ${options.data.physiotherapistName} has been confirmed.`;
      } else if (options.data.role === 'physiotherapist') {
        receiptMessage = `Great news! ${options.data.patientName} has paid for their booking.`;
      } else {
        receiptMessage = `A new marketplace payment has been successfully processed for a booking.`;
      }

      const phoneRow = options.data.patientPhone ? `<p style="margin: 8px 0 0 0;"><strong>Patient Phone:</strong> ${options.data.patientPhone}</p>` : '';

      return {
        subject: options.subject || (options.data.role === 'patient' ? `Payment Receipt: Booking Confirmation` : `New Payment Received: ${options.data.patientName}`),
        body: `
          <h1>Payment Receipt</h1>
          <p>Hello ${options.data.recipientName},</p>
          <p>${receiptMessage}</p>
          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold; font-size: 18px;">Amount: ${amountStr}</p>
            <p style="margin: 12px 0 0 0;"><strong>Date:</strong> ${new Date(options.data.date).toLocaleString()}</p>
            <p style="margin: 8px 0 0 0;"><strong>Reference:</strong> ${options.data.paymentReference}</p>
            <p style="margin: 8px 0 0 0;"><strong>Patient Name:</strong> ${options.data.patientName}</p>
            <p style="margin: 8px 0 0 0;"><strong>Patient Email:</strong> ${options.data.patientEmail}</p>
            ${phoneRow}
            <p style="margin: 8px 0 0 0;"><strong>Physiotherapist:</strong> ${options.data.physiotherapistName}</p>
            <p style="margin: 8px 0 0 0;"><strong>Booking ID:</strong> ${options.data.bookingId}</p>
          </div>
        `
      };
    }

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
        subject: `🎉 Welcome to Rehabify Health - Your Account is Approved!`,
        body: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
            
            <!-- Gradient Header with Logo -->
            <div style="background: linear-gradient(135deg, #005b57 0%, #00857f 50%, #00a89d 100%); padding: 40px 24px; text-align: center;">
              <img src="https://res.cloudinary.com/dubeogufg/image/upload/v1764254773/MainRehabify_xfzfil.png" alt="Rehabify Health" style="height: 50px; width: auto; margin-bottom: 20px;" />
              <div style="background-color: rgba(255,255,255,0.15); backdrop-filter: blur(10px); border-radius: 100px; padding: 12px 24px; display: inline-block; margin-bottom: 16px;">
                <span style="font-size: 28px;">🎉</span>
              </div>
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">Welcome to Rehabify Health!</h1>
              <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 12px 0 0 0;">Your account has been approved</p>
            </div>
            
            <!-- Main Content -->
            <div style="padding: 40px 32px;">
              
              <!-- Personalized Greeting -->
              <p style="color: #1f2937; font-size: 18px; line-height: 1.6; margin: 0 0 16px 0;">
                Hello <strong>${options.data.userName}</strong>,
              </p>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
                Congratulations! Your Rehabify Health account as a <strong style="color: #005b57;">${options.data.userRole}</strong>${options.data.clinicName ? ` for <strong style="color: #005b57;">${options.data.clinicName}</strong>` : ''} has been approved by our team. You now have full access to our comprehensive healthcare platform.
              </p>

              <!-- Success Message Box -->
              <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 1px solid #a7f3d0; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                <div style="display: flex; align-items: flex-start;">
                  <span style="font-size: 24px; margin-right: 12px;">✅</span>
                  <div>
                    <p style="margin: 0; color: #065f46; font-size: 16px; font-weight: 600; line-height: 1.5;">
                      You're all set!
                    </p>
                    <p style="margin: 8px 0 0 0; color: #047857; font-size: 14px; line-height: 1.5;">
                      Your dashboard is ready and you can start connecting with patients immediately.
                    </p>
                  </div>
                </div>
              </div>

              <!-- Feature Highlights -->
              <div style="margin-bottom: 32px;">
                <h2 style="color: #1f2937; font-size: 18px; font-weight: 600; margin: 0 0 20px 0; text-align: center;">
                  🚀 What You Can Do Now
                </h2>
                
                <table style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                  <tr>
                    <td style="background-color: #f8fafc; border-radius: 10px; padding: 16px; width: 50%; vertical-align: top;">
                      <div style="text-align: center;">
                        <span style="font-size: 28px; display: block; margin-bottom: 8px;">👥</span>
                        <p style="margin: 0; color: #1f2937; font-size: 14px; font-weight: 600;">Patient Management</p>
                        <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px;">Invite & manage patients</p>
                      </div>
                    </td>
                    <td style="width: 12px;"></td>
                    <td style="background-color: #f8fafc; border-radius: 10px; padding: 16px; width: 50%; vertical-align: top;">
                      <div style="text-align: center;">
                        <span style="font-size: 28px; display: block; margin-bottom: 8px;">📅</span>
                        <p style="margin: 0; color: #1f2937; font-size: 14px; font-weight: 600;">Appointments</p>
                        <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px;">Schedule & track sessions</p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f8fafc; border-radius: 10px; padding: 16px; width: 50%; vertical-align: top;">
                      <div style="text-align: center;">
                        <span style="font-size: 28px; display: block; margin-bottom: 8px;">📹</span>
                        <p style="margin: 0; color: #1f2937; font-size: 14px; font-weight: 600;">Video Consultations</p>
                        <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px;">Secure telehealth calls</p>
                      </div>
                    </td>
                    <td style="width: 12px;"></td>
                    <td style="background-color: #f8fafc; border-radius: 10px; padding: 16px; width: 50%; vertical-align: top;">
                      <div style="text-align: center;">
                        <span style="font-size: 28px; display: block; margin-bottom: 8px;">📋</span>
                        <p style="margin: 0; color: #1f2937; font-size: 14px; font-weight: 600;">Treatment Plans</p>
                        <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px;">Create & assign plans</p>
                      </div>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- Primary CTA Button -->
              <div style="text-align: center; margin-bottom: 32px;">
                <a href="${options.data.dashboardLink}" style="display: inline-block; background: linear-gradient(135deg, #005b57 0%, #00857f 100%); color: white; font-weight: 600; padding: 16px 48px; border-radius: 12px; text-decoration: none; font-size: 16px; box-shadow: 0 8px 20px rgba(0, 91, 87, 0.3); transition: all 0.3s ease;">
                  🚀 Access Your Dashboard
                </a>
              </div>

              <!-- Quick Start Guide -->
              <div style="background-color: #fefce8; border: 1px solid #fde047; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <h3 style="color: #854d0e; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">
                  ⚡ Quick Start Guide
                </h3>
                <ol style="margin: 0; padding-left: 20px; color: #713f12;">
                  <li style="margin-bottom: 8px; font-size: 14px; line-height: 1.5;">Complete your professional profile</li>
                  <li style="margin-bottom: 8px; font-size: 14px; line-height: 1.5;">Set up your availability schedule</li>
                  <li style="margin-bottom: 8px; font-size: 14px; line-height: 1.5;">Invite your first patients</li>
                  <li style="margin-bottom: 0; font-size: 14px; line-height: 1.5;">Start your telehealth journey!</li>
                </ol>
              </div>
              
              <!-- Support Section -->
              <div style="text-align: center; padding: 20px; background-color: #f9fafb; border-radius: 12px;">
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0;">
                  Need help getting started?
                </p>
                <a href="mailto:support@physioaroundme.com" style="color: #005b57; font-size: 14px; font-weight: 500; text-decoration: none;">
                  Contact our support team →
                </a>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); padding: 32px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <img src="https://res.cloudinary.com/dubeogufg/image/upload/v1764254773/MainRehabify_xfzfil.png" alt="Rehabify Health" style="height: 28px; width: auto; margin-bottom: 16px; opacity: 0.7;" />
              <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px 0;">
                You're receiving this email because your Rehabify Health account was approved.
              </p>
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                &copy; ${new Date().getFullYear()} Rehabify Health. All rights reserved.
              </p>
              <div style="margin-top: 16px;">
                <a href="https://physioaroundme.com" style="color: #6b7280; font-size: 12px; text-decoration: none; margin: 0 8px;">Website</a>
                <span style="color: #d1d5db;">•</span>
                <a href="https://physioaroundme.com/privacy" style="color: #6b7280; font-size: 12px; text-decoration: none; margin: 0 8px;">Privacy</a>
                <span style="color: #d1d5db;">•</span>
                <a href="mailto:support@physioaroundme.com" style="color: #6b7280; font-size: 12px; text-decoration: none; margin: 0 8px;">Support</a>
              </div>
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
            <p style="margin: 8px 0 0 0;">Location: ${options.data.clinicName || 'Online Video Call'}</p>
            ${options.data.clinicAddress ? `<p style="margin: 8px 0 0 0;">Address: ${options.data.clinicAddress}</p>` : ''}
          </div>
          <p>${options.data.clinicAddress ? 'Please arrive 10 minutes before your scheduled appointment time.' : 'Click the button below to join the video call at the scheduled time.'}</p>
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

    case 'PARTNERSHIP_INQUIRY':
      return {
        subject: options.subject || `New Partnership Inquiry: ${options.data.organization}`,
        body: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
            <div style="background: linear-gradient(135deg, #002e2c 0%, #005b57 100%); padding: 32px 24px; text-align: center;">
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0;">New Partnership Inquiry</h1>
              <p style="color: rgba(255,255,255,0.85); font-size: 14px; margin: 8px 0 0 0;">Submitted via Rehabify Health Website</p>
            </div>
            <div style="padding: 32px 24px;">
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;"><strong>Organization:</strong> ${options.data.organization}</p>
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;"><strong>Contact Name:</strong> ${options.data.name}</p>
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;"><strong>Email:</strong> <a href="mailto:${options.data.email}" style="color: #005b57;">${options.data.email}</a></p>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; color: #374151;">Message:</p>
                  <p style="margin: 0; font-size: 14px; color: #4b5563; white-space: pre-wrap;">${options.data.message}</p>
                </div>
              </div>
              <div style="text-align: center;">
                <a href="https://physioaroundme.com/dashboard/admin/partnerships" style="display: inline-block; background-color: #005b57; color: white; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 14px;">
                  Open Admin Partnerships
                </a>
              </div>
            </div>
          </div>
        `
      };

    case 'PARTNER_APPLICATION_SUBMITTED':
      return {
        subject: options.subject || `Action Required: New Partner Application - ${options.data.organizationName}`,
        body: `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #f5f5f7; margin: 0; padding: 24px 8px; table-layout: fixed; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <tr>
              <td align="center" style="padding: 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 18px; border: 1px solid #e5e5ea; box-shadow: 0 8px 30px rgba(0,0,0,0.05); overflow: hidden; table-layout: fixed;">
                  
                  <!-- Header with Cloudinary Hosted Logo -->
                  <tr>
                    <td align="center" style="padding: 36px 24px 24px 24px; border-bottom: 1px solid #f2f2f7;">
                      <img src="https://res.cloudinary.com/dubeogufg/image/upload/v1764254773/MainRehabify_xfzfil.png" alt="Rehabify Health" style="height: 40px; width: auto; display: block; margin: 0 auto 18px auto;" />
                      <div style="display: inline-block; background-color: #f2f2f7; color: #1d1d1f; border-radius: 9999px; padding: 5px 14px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 12px;">
                        Partner Network Operations
                      </div>
                      <h1 style="color: #1d1d1f; font-size: 23px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 6px 0;">New Partner Application</h1>
                      <p style="color: #86868b; font-size: 14px; margin: 0; line-height: 1.4;">Clinical credentialing & governance review required</p>
                    </td>
                  </tr>

                  <!-- Body Content -->
                  <tr>
                    <td style="padding: 28px 24px;">
                      <p style="color: #1d1d1f; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
                        A new healthcare organization has registered on the <strong>Rehabify Partner Portal</strong> and is awaiting clinical authorization:
                      </p>

                      <!-- Inset Grouped Detail Card (Fully Contained & Immune to Overflow) -->
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 100%; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #fbfbfd; border: 1px solid #e5e5ea; border-radius: 14px; margin-bottom: 28px;">
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f4; text-align: left;">
                            <div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; line-height: 1.2;">
                              Organization
                            </div>
                            <div style="color: #1d1d1f; font-size: 15px; font-weight: 600; line-height: 1.4; word-break: break-word; overflow-wrap: break-word;">
                              ${options.data.organizationName}
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f4; text-align: left;">
                            <div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; line-height: 1.2;">
                              Partner Type
                            </div>
                            <div>
                              <span style="display: inline-block; background-color: #e6f4f1; color: #005b57; font-weight: 600; font-size: 11px; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.04em;">
                                ${options.data.organizationType}
                              </span>
                            </div>
                          </td>
                        </tr>
                        ${options.data.contactName ? `
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f4; text-align: left;">
                            <div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; line-height: 1.2;">
                              Liaison Contact
                            </div>
                            <div style="color: #1d1d1f; font-size: 14px; font-weight: 500; line-height: 1.4; word-break: break-word; overflow-wrap: break-word;">
                              ${options.data.contactName}
                            </div>
                          </td>
                        </tr>` : ''}
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: ${options.data.contactPhone || (options.data.coverageStates && options.data.coverageStates.length > 0) ? '1px solid #f0f0f4' : 'none'}; text-align: left;">
                            <div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; line-height: 1.2;">
                              Official Email
                            </div>
                            <div style="color: #1d1d1f; font-size: 14px; line-height: 1.4; word-break: break-all; overflow-wrap: break-word;">
                              <a href="mailto:${options.data.contactEmail}" style="color: #0066cc; text-decoration: none; font-size: 14px; font-weight: 500; word-break: break-all;">
                                ${options.data.contactEmail}
                              </a>
                            </div>
                          </td>
                        </tr>
                        ${options.data.contactPhone ? `
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: ${options.data.coverageStates && options.data.coverageStates.length > 0 ? '1px solid #f0f0f4' : 'none'}; text-align: left;">
                            <div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; line-height: 1.2;">
                              Phone Number
                            </div>
                            <div style="color: #1d1d1f; font-size: 14px; font-weight: 500; line-height: 1.4; word-break: break-word; overflow-wrap: break-word;">
                              ${options.data.contactPhone}
                            </div>
                          </td>
                        </tr>` : ''}
                        ${options.data.coverageStates && options.data.coverageStates.length > 0 ? `
                        <tr>
                          <td style="padding: 14px 18px; text-align: left;">
                            <div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; line-height: 1.2;">
                              Coverage States
                            </div>
                            <div style="color: #1d1d1f; font-size: 14px; font-weight: 500; line-height: 1.4; word-break: break-word; overflow-wrap: break-word;">
                              ${options.data.coverageStates.join(', ')}
                            </div>
                          </td>
                        </tr>` : ''}
                      </table>

                      <!-- Apple-style Primary Button -->
                      <div style="text-align: center; margin: 28px 0 12px 0;">
                        <a href="${options.data.reviewLink}" style="display: inline-block; background-color: #004D4A; color: #ffffff; font-size: 15px; font-weight: 600; padding: 14px 34px; border-radius: 9999px; text-decoration: none; letter-spacing: -0.01em; box-shadow: 0 4px 14px rgba(0,77,74,0.22);">
                          Review & Approve Application →
                        </a>
                      </div>
                    </td>
                  </tr>

                  <!-- Refined Apple Minimalist Footer -->
                  <tr>
                    <td align="center" style="background-color: #fafafc; padding: 24px; border-top: 1px solid #f2f2f7;">
                      <p style="color: #86868b; font-size: 12px; margin: 0 0 6px 0; line-height: 1.4;">
                        Rehabify Health Clinical Operations · Licensed MRTBN Digital Health Network
                      </p>
                      <p style="color: #86868b; font-size: 12px; margin: 0 0 6px 0;">
                        Liaison: <a href="mailto:partners@physioaroundme.com" style="color: #0066cc; text-decoration: none;">partners@physioaroundme.com</a>
                      </p>
                      <p style="color: #c7c7cc; font-size: 11px; margin: 0;">
                        &copy; ${new Date().getFullYear()} Rehabify Health Inc. All rights reserved.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        `
      };

    case 'PARTNER_APPLICATION_APPROVED':
      return {
        subject: options.subject || `Welcome to Rehabify Health! Partnership Approved for ${options.data.organizationName}`,
        body: `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #f5f5f7; margin: 0; padding: 24px 8px; table-layout: fixed; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <tr>
              <td align="center" style="padding: 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 18px; border: 1px solid #e5e5ea; box-shadow: 0 8px 30px rgba(0,0,0,0.05); overflow: hidden; table-layout: fixed;">
                  
                  <!-- Header with Cloudinary Hosted Logo -->
                  <tr>
                    <td align="center" style="padding: 36px 24px 24px 24px; border-bottom: 1px solid #f2f2f7;">
                      <img src="https://res.cloudinary.com/dubeogufg/image/upload/v1764254773/MainRehabify_xfzfil.png" alt="Rehabify Health" style="height: 40px; width: auto; display: block; margin: 0 auto 18px auto;" />
                      <div style="display: inline-block; background-color: #d1fae5; color: #065f46; border-radius: 9999px; padding: 5px 14px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 12px;">
                        ✓ Organization Approved & Verified
                      </div>
                      <h1 style="color: #1d1d1f; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 6px 0;">Welcome to Rehabify Health</h1>
                      <p style="color: #86868b; font-size: 14px; margin: 0; line-height: 1.4;">Your partner integration is provisioned and ready</p>
                    </td>
                  </tr>

                  <!-- Body Content -->
                  <tr>
                    <td style="padding: 28px 24px;">
                      <p style="color: #1d1d1f; font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
                        Hello <strong>${options.data.contactName || options.data.organizationName}</strong>,
                      </p>

                      <p style="color: #48484a; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                        We are delighted to confirm that your partnership registration for <strong>${options.data.organizationName}</strong> has been authorized by Rehabify Health.
                      </p>

                      <!-- Credentials Callout Table -->
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px; overflow: hidden; margin-bottom: 28px;">
                        <tr>
                          <td style="padding: 18px 20px; word-break: break-word;">
                            <div style="color: #166534; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px;">
                              Assigned Partner Credentials
                            </div>
                            <div style="margin-bottom: 8px; font-size: 14px; color: #14532d;">
                              <span style="color: #4ade80;">•</span> <strong>Partner Code:</strong> <code style="background-color: #ffffff; color: #166534; padding: 3px 10px; border-radius: 6px; font-family: SFMono-Regular, Consolas, monospace; font-size: 13px; font-weight: 700; border: 1px solid #bbf7d0;">${options.data.partnerCode}</code>
                            </div>
                            <div style="font-size: 14px; color: #14532d;">
                              <span style="color: #4ade80;">•</span> <strong>Status:</strong> <span style="font-weight: 600; color: #15803d;">Active & Fully Provisioned</span>
                            </div>
                          </td>
                        </tr>
                      </table>

                      <!-- Feature Highlights -->
                      <div style="margin-bottom: 28px;">
                        <h4 style="color: #1d1d1f; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">Available In Your Portal:</h4>
                        <div style="font-size: 13px; color: #48484a; line-height: 1.8;">
                          <div style="padding: 4px 0;"><strong style="color: #1d1d1f;">🔗 Co-Branded Referral Links:</strong> Create custom links with automated 30-day cookie tracking.</div>
                          <div style="padding: 4px 0;"><strong style="color: #1d1d1f;">🩺 Direct Patient Triage:</strong> Submit patient referrals with live treatment tracking.</div>
                          <div style="padding: 4px 0;"><strong style="color: #1d1d1f;">⚡ Developer REST API:</strong> Integrate patient referrals directly with your EHR or mobile app.</div>
                          <div style="padding: 4px 0;"><strong style="color: #1d1d1f;">📊 Settlement Ledger:</strong> Transparent real-time reporting and CSV financial exports.</div>
                        </div>
                      </div>

                      <!-- Apple-style Primary Button -->
                      <div style="text-align: center; margin: 32px 0 12px 0;">
                        <a href="${options.data.portalLink}" style="display: inline-block; background-color: #004D4A; color: #ffffff; font-size: 15px; font-weight: 600; padding: 14px 38px; border-radius: 9999px; text-decoration: none; letter-spacing: -0.01em; box-shadow: 0 4px 14px rgba(0,77,74,0.25);">
                          Access Your Partner Portal →
                        </a>
                      </div>
                    </td>
                  </tr>

                  <!-- Refined Apple Minimalist Footer -->
                  <tr>
                    <td align="center" style="background-color: #fafafc; padding: 24px; border-top: 1px solid #f2f2f7;">
                      <p style="color: #86868b; font-size: 13px; margin: 0 0 8px 0;">
                        Need integration assistance? Contact our engineering team at <a href="mailto:partners@physioaroundme.com" style="color: #0066cc; text-decoration: none; font-weight: 500;">partners@physioaroundme.com</a>
                      </p>
                      <p style="color: #c7c7cc; font-size: 11px; margin: 0;">
                        &copy; ${new Date().getFullYear()} Rehabify Health Inc. · Licensed MRTBN Healthcare Network
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        `
      };

    case 'PARTNER_APPLICATION_DECLINED':
      return {
        subject: options.subject || `Update regarding your Rehabify Health Partner Application`,
        body: `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #f5f5f7; margin: 0; padding: 24px 8px; table-layout: fixed; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <tr>
              <td align="center" style="padding: 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 18px; border: 1px solid #e5e5ea; box-shadow: 0 8px 30px rgba(0,0,0,0.05); overflow: hidden; table-layout: fixed;">
                  
                  <!-- Header with Cloudinary Hosted Logo -->
                  <tr>
                    <td align="center" style="padding: 36px 24px 24px 24px; border-bottom: 1px solid #f2f2f7;">
                      <img src="https://res.cloudinary.com/dubeogufg/image/upload/v1764254773/MainRehabify_xfzfil.png" alt="Rehabify Health" style="height: 40px; width: auto; display: block; margin: 0 auto 18px auto;" />
                      <div style="display: inline-block; background-color: #fee2e2; color: #991b1b; border-radius: 9999px; padding: 5px 14px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 12px;">
                        Application Status Update
                      </div>
                      <h1 style="color: #1d1d1f; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 6px 0;">Partner Application Review</h1>
                      <p style="color: #86868b; font-size: 14px; margin: 0; line-height: 1.4;">${options.data.organizationName}</p>
                    </td>
                  </tr>

                  <!-- Body Content -->
                  <tr>
                    <td style="padding: 28px 24px;">
                      <p style="color: #1d1d1f; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">
                        Hello <strong>${options.data.contactName || options.data.organizationName}</strong>,
                      </p>

                      <p style="color: #48484a; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                        Thank you for submitting an application to join the Rehabify Partner Network. Following review by our clinical governance and compliance team, we are unable to approve this registration at this time.
                      </p>

                      <!-- Status Callout Table -->
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 14px; overflow: hidden; margin-bottom: 24px;">
                        <tr>
                          <td style="padding: 18px 20px; word-break: break-word;">
                            <div style="color: #991b1b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
                              Review Finding
                            </div>
                            <p style="margin: 0; color: #7f1d1d; font-size: 14px; line-height: 1.5;">
                              ${options.data.reason || 'Our clinical governance committee could not verify this application with the information currently provided.'}
                            </p>
                          </td>
                        </tr>
                      </table>

                      <p style="color: #48484a; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                        If you believe this determination was made in error or have supplemental licensing documents to submit, please reach out directly to <a href="mailto:partners@physioaroundme.com" style="color: #0066cc; text-decoration: none; font-weight: 500;">partners@physioaroundme.com</a>:
                      </p>

                      <!-- Apple-style Secondary Button -->
                      <div style="text-align: center; margin: 24px 0 12px 0;">
                        <a href="${options.data.supportLink}" style="display: inline-block; background-color: #1d1d1f; color: #ffffff; font-size: 14px; font-weight: 600; padding: 13px 32px; border-radius: 9999px; text-decoration: none; letter-spacing: -0.01em;">
                          Contact Clinical Support →
                        </a>
                      </div>
                    </td>
                  </tr>

                  <!-- Refined Apple Minimalist Footer -->
                  <tr>
                    <td align="center" style="background-color: #fafafc; padding: 24px; border-top: 1px solid #f2f2f7;">
                      <p style="color: #86868b; font-size: 12px; margin: 0;">
                        &copy; ${new Date().getFullYear()} Rehabify Health Clinical Governance · Licensed MRTBN Network
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        `
      };

    case 'PARTNER_REFERRAL_CREATED':
      return {
        subject: options.subject || `New Patient Referral Received — ${options.data.trackingCode}`,
        body: `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #f5f5f7; margin: 0; padding: 24px 8px; table-layout: fixed; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <tr>
              <td align="center" style="padding: 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 18px; border: 1px solid #e5e5ea; box-shadow: 0 8px 30px rgba(0,0,0,0.05); overflow: hidden; table-layout: fixed;">
                  <tr>
                    <td align="center" style="padding: 36px 24px 24px 24px; border-bottom: 1px solid #f2f2f7;">
                      <img src="https://res.cloudinary.com/dubeogufg/image/upload/v1764254773/MainRehabify_xfzfil.png" alt="Rehabify Health" style="height: 40px; width: auto; display: block; margin: 0 auto 18px auto;" />
                      <div style="display: inline-block; background-color: #dbeafe; color: #1e40af; border-radius: 9999px; padding: 5px 14px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 12px;">New Patient Referral</div>
                      <h1 style="color: #1d1d1f; font-size: 23px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 6px 0;">Referral Confirmed</h1>
                      <p style="color: #86868b; font-size: 14px; margin: 0;">Your patient referral has been received by Rehabify Health</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 28px 24px;">
                      <p style="color: #1d1d1f; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
                        Hello <strong>${options.data.contactName || options.data.partnerName}</strong>,
                      </p>
                      <p style="color: #48484a; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                        We've received your patient referral and our care coordination team is now processing it. Below are the details and next steps for connecting your patient with physiotherapy care.
                      </p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #fbfbfd; border: 1px solid #e5e5ea; border-radius: 14px; margin-bottom: 24px;">
                        <tr><td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f4;"><div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Tracking Code</div><div style="font-family: SFMono-Regular, Consolas, monospace; color: #005b57; font-size: 18px; font-weight: 700;">${options.data.trackingCode}</div></td></tr>
                        <tr><td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f4;"><div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Patient</div><div style="color: #1d1d1f; font-size: 14px; font-weight: 500;">${options.data.patientName}</div></td></tr>
                        <tr><td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f4;"><div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Condition</div><div style="color: #1d1d1f; font-size: 14px;">${options.data.condition}</div></td></tr>
                        <tr><td style="padding: 14px 18px;"><div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Priority</div><div><span style="display: inline-block; background-color: ${options.data.priority === 'urgent' ? '#fee2e2' : '#e6f4f1'}; color: ${options.data.priority === 'urgent' ? '#991b1b' : '#005b57'}; font-weight: 600; font-size: 11px; padding: 4px 10px; border-radius: 6px; text-transform: uppercase;">${options.data.priority}</span></div></td></tr>
                      </table>
                      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                        <h3 style="color: #166534; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">📱 Patient WhatsApp Intake</h3>
                        <p style="color: #14532d; font-size: 13px; margin: 0 0 12px 0;">Share this link with your patient so they can connect directly with our care coordinator Joy via WhatsApp:</p>
                        <div style="text-align: center;">
                          <a href="${options.data.whatsappIntakeUrl}" style="display: inline-block; background-color: #25D366; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 9999px; text-decoration: none;">Chat with Joy on WhatsApp →</a>
                        </div>
                        <p style="color: #6b7280; font-size: 12px; margin: 12px 0 0 0; text-align: center;">Or call: <a href="tel:${options.data.whatsappPhone}" style="color: #005b57; font-weight: 500;">${options.data.whatsappPhone}</a></p>
                      </div>
                      <div style="text-align: center; margin: 28px 0 12px 0;">
                        <a href="${options.data.trackingUrl}" style="display: inline-block; background-color: #004D4A; color: #ffffff; font-size: 15px; font-weight: 600; padding: 14px 34px; border-radius: 9999px; text-decoration: none; box-shadow: 0 4px 14px rgba(0,77,74,0.22);">Track Referral Status →</a>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="background-color: #fafafc; padding: 24px; border-top: 1px solid #f2f2f7;">
                      <p style="color: #86868b; font-size: 12px; margin: 0 0 6px 0;">Rehabify Health · Licensed MRTBN Digital Health Network</p>
                      <p style="color: #c7c7cc; font-size: 11px; margin: 0;">&copy; ${new Date().getFullYear()} Rehabify Health Inc. All rights reserved.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        `
      };

    case 'ADMIN_REFERRAL_CREATED':
      return {
        subject: options.subject || `🩺 New Partner Referral: ${options.data.patientName} (${options.data.trackingCode})`,
        body: `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #f5f5f7; margin: 0; padding: 24px 8px; table-layout: fixed; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <tr>
              <td align="center" style="padding: 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 18px; border: 1px solid #e5e5ea; box-shadow: 0 8px 30px rgba(0,0,0,0.05); overflow: hidden; table-layout: fixed;">
                  <tr>
                    <td align="center" style="padding: 36px 24px 24px 24px; border-bottom: 1px solid #f2f2f7;">
                      <img src="https://res.cloudinary.com/dubeogufg/image/upload/v1764254773/MainRehabify_xfzfil.png" alt="Rehabify Health" style="height: 40px; width: auto; display: block; margin: 0 auto 18px auto;" />
                      <div style="display: inline-block; background-color: #fef3c7; color: #92400e; border-radius: 9999px; padding: 5px 14px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 12px;">Action Required</div>
                      <h1 style="color: #1d1d1f; font-size: 23px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 6px 0;">New Partner Referral</h1>
                      <p style="color: #86868b; font-size: 14px; margin: 0;">A patient has been referred via the Partner API and needs follow-up</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 28px 24px;">
                      <p style="color: #1d1d1f; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">Hello Admin,</p>
                      <p style="color: #48484a; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                        <strong>${options.data.partnerName}</strong> has referred a new patient. Please reach out to the patient to begin their care coordination.
                      </p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #fbfbfd; border: 1px solid #e5e5ea; border-radius: 14px; margin-bottom: 24px;">
                        <tr><td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f4;"><div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Tracking Code</div><div style="font-family: SFMono-Regular, Consolas, monospace; color: #005b57; font-size: 18px; font-weight: 700;">${options.data.trackingCode}</div></td></tr>
                        <tr><td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f4;"><div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Patient Name</div><div style="color: #1d1d1f; font-size: 14px; font-weight: 500;">${options.data.patientName}</div></td></tr>
                        <tr><td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f4;"><div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Phone Number</div><div style="color: #1d1d1f; font-size: 14px;"><a href="tel:${options.data.patientPhone}" style="color: #005b57; text-decoration: none; font-weight: 500;">${options.data.patientPhone}</a></div></td></tr>
                        ${options.data.patientEmail ? `<tr><td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f4;"><div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Email</div><div style="color: #1d1d1f; font-size: 14px;"><a href="mailto:${options.data.patientEmail}" style="color: #0066cc; text-decoration: none;">${options.data.patientEmail}</a></div></td></tr>` : ''}
                        <tr><td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f4;"><div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Condition</div><div style="color: #1d1d1f; font-size: 14px;">${options.data.condition}</div></td></tr>
                        <tr><td style="padding: 14px 18px; border-bottom: 1px solid #f0f0f4;"><div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Referred By</div><div style="color: #1d1d1f; font-size: 14px; font-weight: 500;">${options.data.partnerName}</div></td></tr>
                        <tr><td style="padding: 14px 18px;"><div style="color: #86868b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Priority</div><div><span style="display: inline-block; background-color: ${options.data.priority === 'urgent' ? '#fee2e2' : '#e6f4f1'}; color: ${options.data.priority === 'urgent' ? '#991b1b' : '#005b57'}; font-weight: 600; font-size: 11px; padding: 4px 10px; border-radius: 6px; text-transform: uppercase;">${options.data.priority}</span> ${options.data.city ? `<span style="margin-left: 8px; color: #6b7280; font-size: 12px;">📍 ${options.data.city}</span>` : ''} ${options.data.recommendedSessions ? `<span style="margin-left: 8px; color: #6b7280; font-size: 12px;">📋 ${options.data.recommendedSessions} sessions</span>` : ''}</div></td></tr>
                      </table>
                      <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                        <h3 style="color: #1e40af; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">📞 Reach Out to the Patient</h3>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                          <div style="margin-bottom: 8px;"><a href="${options.data.whatsappIntakeUrl}" style="display: inline-block; background-color: #25D366; color: #ffffff; font-size: 13px; font-weight: 600; padding: 10px 20px; border-radius: 9999px; text-decoration: none;">💬 WhatsApp Patient</a></div>
                          <div style="margin-bottom: 8px;"><a href="tel:${options.data.patientPhone}" style="display: inline-block; background-color: #005b57; color: #ffffff; font-size: 13px; font-weight: 600; padding: 10px 20px; border-radius: 9999px; text-decoration: none;">📞 Call Patient</a></div>
                        </div>
                      </div>
                      <div style="text-align: center; margin: 28px 0 12px 0;">
                        <a href="${options.data.adminDashboardLink}" style="display: inline-block; background-color: #004D4A; color: #ffffff; font-size: 15px; font-weight: 600; padding: 14px 34px; border-radius: 9999px; text-decoration: none; box-shadow: 0 4px 14px rgba(0,77,74,0.22);">Open Admin Referrals Dashboard →</a>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="background-color: #fafafc; padding: 24px; border-top: 1px solid #f2f2f7;">
                      <p style="color: #86868b; font-size: 12px; margin: 0 0 6px 0;">Rehabify Health Clinical Operations</p>
                      <p style="color: #c7c7cc; font-size: 11px; margin: 0;">&copy; ${new Date().getFullYear()} Rehabify Health Inc. All rights reserved.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        `
      };

    default:
      return {
        subject: 'Rehabify Health Notification',
        body: `<p>You have a new notification from Rehabify Health.</p>`
      };
  }
}
