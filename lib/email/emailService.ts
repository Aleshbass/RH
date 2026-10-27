// Email service for Rehabify Health
// Integrated with Resend for email delivery
import { Resend } from 'resend';
import {
  SUPPORT_EMAIL,
  actions,
  bulletList,
  button,
  callout,
  checklist,
  details,
  greeting,
  heading,
  highlight,
  link,
  linkFallback,
  paragraph,
  quote,
  renderEmail,
  statusPill,
  steps,
} from './layout';

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
  | 'ADMIN_REFERRAL_CREATED'
  | 'PARTNER_NOTICE';

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

/** Generic partner notice (go-live, credential rotation). All fields are HTML-escaped. */
export interface PartnerNoticeData {
  badge: string;
  heading: string;
  subheading?: string;
  greetingName?: string;
  paragraphs: string[];
  calloutTitle?: string;
  calloutText?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Plain text footer; defaults to the partner operations footer (careers emails use their own). */
  footerNote?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Appointment dates in emails: Lagos time, since the sending server runs in UTC. */
function lagosEmailDate(value: string | number | Date, withTime = false): string {
  return new Date(value).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit', hour12: true } : {}),
  });
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
  | { to: string; subject?: string; template: 'ADMIN_REFERRAL_CREATED'; data: AdminReferralCreatedData }
  | { to: string; subject?: string; template: 'PARTNER_NOTICE'; data: PartnerNoticeData };

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

/** Time of day in Lagos, e.g. "10:30 am". */
function lagosEmailTime(value: string | number | Date): string {
  return new Date(value).toLocaleTimeString('en-NG', {
    timeZone: 'Africa/Lagos',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const struck = (html: string) => `<span style="color: #5f7f7b; text-decoration: line-through;">${html}</span>`;
const mailto = (address: string) => `<a href="mailto:${address}" style="color: #005b57; text-decoration: underline;">${address}</a>`;
const tel = (phone: string) => `<a href="tel:${phone}" style="color: #005b57; text-decoration: underline;">${phone}</a>`;
const priorityPill = (priority: string) => statusPill(priority, priority === 'urgent' ? 'danger' : 'brand');

/** Footer line and switches for mail that only reaches the Rehabify team. */
const INTERNAL = {
  signOff: false,
  safetyNote: false,
  footerNote: 'Internal notification for the Rehabify team.',
} as const;

const PARTNER_FOOTER = 'Rehabify Health Partner Operations &middot; <a href="mailto:partners@physioaroundme.com" style="color: #ffffff; text-decoration: underline;">partners@physioaroundme.com</a>';

/**
 * Generate content for different email templates
 */
export function getEmailContent(options: EmailOptions): { subject: string; body: string } {
  switch (options.template) {
    case 'PAYMENT_RECEIPT': {
      const d = options.data;
      const amountStr = (d.amount / 100).toLocaleString('en-NG', { style: 'currency', currency: d.currency });
      const isInternal = d.role === 'admin';
      const copy = d.role === 'patient'
        ? { eyebrow: 'Payment receipt', title: 'Your booking is confirmed', message: `Thank you for your payment! Your booking with <strong>${d.physiotherapistName}</strong> is confirmed.` }
        : d.role === 'physiotherapist'
          ? { eyebrow: 'Payment received', title: 'A booking has been paid', message: `Great news! <strong>${d.patientName}</strong> has paid for their booking with you.` }
          : { eyebrow: 'New payment', title: 'Marketplace payment processed', message: 'A new marketplace payment has been processed for a booking.' };

      return {
        subject: options.subject || (d.role === 'patient' ? `Payment Receipt: Booking Confirmation` : `New Payment Received: ${d.patientName}`),
        body: renderEmail({
          eyebrow: copy.eyebrow,
          tone: 'success',
          title: copy.title,
          // A physio's copy carries their payout (never what the patient paid), so it's labelled as such
          preheader: d.role === 'physiotherapist' ? `Your payout: ${amountStr}, paid after the session.` : `${amountStr} received for your Rehabify booking.`,
          body: [
            greeting(d.recipientName),
            paragraph(copy.message),
            highlight({ label: d.role === 'physiotherapist' ? 'Your payout' : 'Amount paid', value: amountStr, sub: lagosEmailDate(d.date, true) }),
            details([
              ['Reference', d.paymentReference],
              ['Patient', d.patientName],
              ['Patient email', d.patientEmail],
              ['Patient phone', d.patientPhone],
              ['Physiotherapist', d.physiotherapistName],
              ['Booking ID', d.bookingId],
            ]),
          ].join(''),
          ...(isInternal ? INTERNAL : { footerNote: 'You received this receipt because a payment was made for a booking on Rehabify.' }),
        }),
      };
    }

    case 'APPOINTMENT_REQUESTED': {
      const d = options.data;
      return {
        subject: options.subject || `New Appointment Request from ${d.patientName}`,
        body: renderEmail({
          eyebrow: 'New request',
          title: 'New appointment request',
          preheader: `${d.patientName} would like to book a session with you.`,
          body: [
            greeting(d.physiotherapistName),
            paragraph(`<strong>${d.patientName}</strong> would like to book a session with you.`),
            highlight({ label: 'Requested time', value: d.appointmentTime, sub: lagosEmailDate(d.appointmentDate) }),
            details([
              ['Clinic', d.clinicName],
              ['Address', d.clinicAddress],
            ]),
            actions(
              d.approveLink ? button('Approve request', d.approveLink) : '',
              button('View schedule', d.viewLink, d.approveLink ? 'secondary' : 'primary'),
            ),
          ].join(''),
        }),
      };
    }

    case 'PATIENT_ONBOARDED_PROVIDER': {
      const d = options.data;
      return {
        subject: options.subject || `New Patient Onboarded: ${d.patientName}`,
        body: renderEmail({
          eyebrow: 'New patient',
          tone: 'success',
          title: 'Your patient is all set',
          preheader: `${d.patientName} has finished onboarding.`,
          body: [
            greeting(d.physiotherapistName),
            paragraph(`<strong>${d.patientName}</strong> has finished onboarding and is now linked to your care team.`),
            paragraph('You can view their profile and assign a treatment plan whenever you are ready.'),
            actions(button('View patients', d.patientsLink)),
          ].join(''),
        }),
      };
    }

    case 'APPOINTMENT_CONFIRMED_PROVIDER': {
      const d = options.data;
      return {
        subject: options.subject || `Appointment Confirmed by ${d.patientName}`,
        body: renderEmail({
          eyebrow: 'Confirmed',
          tone: 'success',
          title: 'Appointment confirmed',
          preheader: `${d.patientName} confirmed their appointment.`,
          body: [
            greeting(d.physiotherapistName),
            paragraph(`<strong>${d.patientName}</strong> has confirmed their appointment with you.`),
            highlight({ label: 'Appointment', value: d.appointmentTime, sub: lagosEmailDate(d.appointmentDate) }),
            actions(button('View appointment', d.viewLink)),
          ].join(''),
        }),
      };
    }

    case 'APPOINTMENT_RESCHEDULED_PROVIDER':
    case 'APPOINTMENT_RESCHEDULED': {
      const d = options.data;
      const forProvider = options.template === 'APPOINTMENT_RESCHEDULED_PROVIDER';
      return {
        subject: options.subject || (forProvider ? `Appointment Rescheduled: ${d.patientName}` : `Your Appointment has been rescheduled`),
        body: renderEmail({
          eyebrow: 'Rescheduled',
          title: 'Appointment rescheduled',
          preheader: `New time: ${d.newTime}, ${lagosEmailDate(d.newDate)}.`,
          body: [
            greeting(forProvider ? d.physiotherapistName : d.patientName),
            paragraph(forProvider
              ? `Your appointment with <strong>${d.patientName}</strong> has moved to a new time.`
              : `Your appointment with <strong>${d.physiotherapistName}</strong> has moved to a new time.`),
            highlight({ label: 'New time', value: d.newTime, sub: lagosEmailDate(d.newDate) }),
            details([['Previous time', struck(`${lagosEmailDate(d.oldDate)} &middot; ${d.oldTime}`)]]),
            actions(button(forProvider ? 'View updated schedule' : 'View appointment', d.viewLink)),
          ].join(''),
        }),
      };
    }

    case 'APPOINTMENT_CANCELED_PROVIDER': {
      const d = options.data;
      return {
        subject: options.subject || `Appointment Canceled: ${d.patientName}`,
        body: renderEmail({
          eyebrow: 'Cancelled',
          tone: 'danger',
          title: 'Appointment cancelled',
          preheader: `Your appointment with ${d.patientName} was cancelled.`,
          body: [
            greeting(d.physiotherapistName),
            paragraph(`Your appointment with <strong>${d.patientName}</strong> has been cancelled.`),
            details([
              ['Date', lagosEmailDate(d.appointmentDate)],
              ['Time', d.appointmentTime],
              ['Reason', d.cancellationReason],
            ]),
            actions(button('View schedule', d.viewLink)),
          ].join(''),
        }),
      };
    }

    case 'VIDEO_CALL_INVITATION': {
      const d = options.data;
      return {
        subject: options.subject || `Video Call Invitation from ${d.physiotherapistName}`,
        body: renderEmail({
          eyebrow: 'Video call',
          title: 'You are invited to a video call',
          preheader: `${d.physiotherapistName} invited you to a secure video call.`,
          body: [
            greeting(d.patientName),
            paragraph(`<strong>${d.physiotherapistName}</strong> has invited you to a secure video call${d.callTitle ? `: <strong>${d.callTitle}</strong>` : ''}.`),
            d.scheduledAt ? highlight({ label: 'When', value: lagosEmailTime(d.scheduledAt), sub: `${lagosEmailDate(d.scheduledAt)} (Lagos time)` }) : '',
            d.message ? quote(d.message, d.physiotherapistName) : '',
            actions(button('Join video call', d.callLink)),
            callout('brand', 'Before you join', 'Find a quiet, well-lit spot and allow camera and microphone access when your browser asks.'),
            linkFallback(d.callLink),
          ].join(''),
        }),
      };
    }

    case 'INVITATION_CREATED':
    case 'INVITATION_REMINDER': {
      const d = options.data;
      const reminder = options.template === 'INVITATION_REMINDER';
      return {
        subject: reminder ? `Reminder: Complete Your Rehabify Health Registration` : `You've been invited to join Rehabify Health`,
        body: renderEmail({
          eyebrow: reminder ? 'Reminder' : 'Invitation',
          title: reminder ? 'Your invitation is waiting' : 'You are invited to Rehabify',
          preheader: `${d.physiotherapistName} invited you to join Rehabify Health.`,
          body: [
            greeting(d.patientName),
            paragraph(reminder
              ? `A friendly reminder that <strong>${d.physiotherapistName}</strong> has invited you to join Rehabify Health as their patient.`
              : `<strong>${d.physiotherapistName}</strong> has invited you to join Rehabify Health as their patient.`),
            highlight({ label: 'Your invitation code', value: d.invitationCode, mono: true, sub: `Expires ${lagosEmailDate(d.expiresAt)}` }),
            actions(button(reminder ? 'Complete registration now' : 'Complete registration', d.invitationLink)),
            paragraph('Questions? Contact your physiotherapist directly.', { muted: true, size: 15 }),
          ].join(''),
          footerNote: "You're receiving this because a physiotherapist invited you to Rehabify.",
        }),
      };
    }

    case 'ONBOARDING_COMPLETE': {
      const d = options.data;
      return {
        subject: `Welcome to Rehabify Health - Your Registration is Complete`,
        body: renderEmail({
          eyebrow: 'Welcome',
          tone: 'success',
          title: 'Welcome to Rehabify!',
          preheader: 'Your registration is complete.',
          body: [
            greeting(d.userName),
            paragraph('Your registration is complete, and we are so glad you are here.'),
            callout('brand', 'What happens next', 'Physiotherapist and clinic accounts are reviewed by our team first. If yours needs a review, we will email you as soon as it is approved.'),
            paragraph('In the meantime, take a look around your dashboard.'),
            actions(button('Go to dashboard', d.dashboardLink)),
          ].join(''),
        }),
      };
    }

    case 'ADMIN_APPROVAL_REQUIRED': {
      const d = options.data;
      return {
        subject: options.subject || `Action Required: New Onboarding Awaiting Approval`,
        body: renderEmail({
          eyebrow: 'Action required',
          tone: 'warning',
          title: 'New account awaiting approval',
          preheader: `${d.userName} is waiting for review.`,
          body: [
            paragraph('Hello team,'),
            paragraph(`<strong>${d.userName}</strong> has finished onboarding and is waiting for your review.`),
            details([
              ['Applicant', d.userName],
              ['Role', d.userRole],
              ['Submitted', d.submittedAt ? lagosEmailDate(d.submittedAt, true) : undefined],
            ]),
            actions(button('Review &amp; approve', d.adminDashboardLink)),
          ].join(''),
          ...INTERNAL,
        }),
      };
    }

    case 'CLINIC_STAFF_INVITE_CREATED':
    case 'CLINIC_STAFF_INVITE_REMINDER': {
      const d = options.data;
      const reminder = options.template === 'CLINIC_STAFF_INVITE_REMINDER';
      const message = 'message' in d ? d.message : undefined;
      return {
        subject: reminder
          ? `Reminder: Join ${d.clinicName || 'the clinic'} on Rehabify Health`
          : `You've been invited to join ${d.clinicName || 'a clinic'} on Rehabify Health`,
        body: renderEmail({
          eyebrow: reminder ? 'Reminder' : 'Team invitation',
          title: `Join ${d.clinicName || 'the team'} on Rehabify`,
          preheader: `${d.clinicOwnerName} invited you to join their clinic.`,
          body: [
            greeting(d.inviteeName),
            paragraph(`${reminder ? 'A friendly reminder that ' : ''}<strong>${d.clinicOwnerName}</strong> has invited you to join <strong>${d.clinicName || 'their clinic'}</strong> as a physiotherapist on Rehabify Health.`),
            message ? quote(message, d.clinicOwnerName) : '',
            highlight({ label: 'Invitation code', value: d.invitationCode, mono: true, sub: `Expires ${lagosEmailDate(d.expiresAt)}` }),
            actions(button('Accept invitation', d.invitationLink)),
          ].join(''),
          footerNote: "You're receiving this because a clinic invited you to its team on Rehabify.",
        }),
      };
    }

    case 'CLINIC_STAFF_INVITE_ACCEPTED_OWNER':
    case 'CLINIC_STAFF_INVITE_DECLINED_OWNER': {
      const d = options.data;
      const accepted = options.template === 'CLINIC_STAFF_INVITE_ACCEPTED_OWNER';
      return {
        subject: options.subject || (accepted ? `Staff Invitation Accepted` : `Staff Invitation Declined`),
        body: renderEmail({
          eyebrow: 'Team update',
          tone: accepted ? 'success' : 'brand',
          title: accepted ? 'Invitation accepted' : 'Invitation declined',
          preheader: `${d.inviteeName} ${accepted ? 'accepted' : 'declined'} your invitation.`,
          body: [
            greeting(d.clinicOwnerName),
            paragraph(`<strong>${d.inviteeName}</strong> has ${accepted ? 'accepted' : 'declined'} your invitation${d.clinicName ? ` to join <strong>${d.clinicName}</strong>` : ''}.`),
            paragraph(accepted
              ? 'They are now part of your team. You can manage your staff from your dashboard.'
              : 'You can send a new invitation from your staff dashboard whenever you like.'),
            actions(button(accepted ? 'View staff' : 'Go to staff', d.staffLink)),
          ].join(''),
        }),
      };
    }

    case 'ACCOUNT_APPROVED': {
      const d = options.data;
      return {
        subject: `🎉 Welcome to Rehabify Health - Your Account is Approved!`,
        body: renderEmail({
          eyebrow: 'Account approved',
          tone: 'success',
          title: 'You are in! Welcome to Rehabify',
          preheader: 'Your Rehabify Health account has been approved.',
          body: [
            greeting(d.userName),
            paragraph(`Congratulations! Your Rehabify Health account as a <strong>${d.userRole}</strong>${d.clinicName ? ` for <strong>${d.clinicName}</strong>` : ''} has been approved. You now have full access to the platform.`),
            heading('What you can do now'),
            checklist([
              '<strong>Patient management</strong>: invite and manage your patients',
              '<strong>Appointments</strong>: schedule and track sessions',
              '<strong>Video consultations</strong>: secure telehealth calls',
              '<strong>Treatment plans</strong>: create and assign exercise programmes',
            ]),
            actions(button('Open your dashboard', d.dashboardLink)),
            heading('Quick start'),
            steps([
              'Complete your professional profile',
              'Set your availability',
              'Invite your first patients',
              'Start your first session',
            ]),
            paragraph(`Need a hand getting started? ${link('Contact our support team', `mailto:${SUPPORT_EMAIL}`)}.`, { muted: true, size: 15 }),
          ].join(''),
          footerNote: "You're receiving this because your Rehabify Health account was approved.",
        }),
      };
    }

    case 'ACCOUNT_DECLINED': {
      const d = options.data;
      return {
        subject: `Important: Your Rehabify Health Account Application`,
        body: renderEmail({
          eyebrow: 'Action required',
          tone: 'warning',
          title: 'We need a little more information',
          preheader: 'We need a few more details before we can approve your account.',
          body: [
            greeting(d.userName),
            paragraph('Thank you for your interest in Rehabify Health. We have reviewed your application, but we need some additional information before we can approve your account.'),
            callout('danger', 'Reason', d.reason || 'Our team has found that additional information is needed.'),
            d.requiredInfo && d.requiredInfo.length > 0 ? heading('What we need from you') + bulletList(d.requiredInfo) : '',
            paragraph('Please contact our support team to resolve this or update your application details.'),
            actions(button('Contact support', d.supportLink, 'dark')),
          ].join(''),
        }),
      };
    }

    case 'APPOINTMENT_SCHEDULED': {
      const d = options.data;
      return {
        subject: `Your Appointment with ${d.physiotherapistName} has been scheduled`,
        body: renderEmail({
          eyebrow: 'Booked',
          tone: 'success',
          title: 'Your appointment is booked',
          preheader: `${d.appointmentTime}, ${lagosEmailDate(d.appointmentDate)} with ${d.physiotherapistName}.`,
          body: [
            greeting(d.patientName),
            paragraph(`Your appointment with <strong>${d.physiotherapistName}</strong> is all set.`),
            highlight({ label: 'Appointment', value: d.appointmentTime, sub: lagosEmailDate(d.appointmentDate) }),
            details([
              ['Physiotherapist', d.physiotherapistName],
              ['Location', d.clinicName || 'Online video call'],
              ['Address', d.clinicAddress],
            ]),
            paragraph(d.clinicAddress
              ? 'Please arrive 10 minutes before your appointment time.'
              : 'You can join the video call from your dashboard at the scheduled time.'),
            actions(button('View in dashboard', d.calendarLink), button('Reschedule', d.rescheduleLink, 'secondary')),
          ].join(''),
        }),
      };
    }

    case 'APPOINTMENT_REMINDER': {
      const d = options.data;
      return {
        subject: `Reminder: Your Appointment Tomorrow with ${d.physiotherapistName}`,
        body: renderEmail({
          eyebrow: 'Reminder',
          title: 'See you tomorrow',
          preheader: `Your appointment with ${d.physiotherapistName} is tomorrow at ${d.appointmentTime}.`,
          body: [
            greeting(d.patientName),
            paragraph('A friendly reminder that you have an appointment tomorrow.'),
            highlight({ label: 'Tomorrow', value: d.appointmentTime, sub: lagosEmailDate(d.appointmentDate) }),
            details([
              ['Physiotherapist', d.physiotherapistName],
              ['Location', d.clinicName],
            ]),
            paragraph('Please arrive 10 minutes before your appointment time.'),
            actions(button('Confirm attendance', d.confirmLink), button('Reschedule', d.rescheduleLink, 'secondary')),
          ].join(''),
        }),
      };
    }

    case 'APPOINTMENT_CANCELED': {
      const d = options.data;
      return {
        subject: `Your Appointment with ${d.physiotherapistName} has been canceled`,
        body: renderEmail({
          eyebrow: 'Cancelled',
          tone: 'danger',
          title: 'Your appointment was cancelled',
          preheader: `Your appointment with ${d.physiotherapistName} was cancelled.`,
          body: [
            greeting(d.patientName),
            paragraph(`Your appointment with <strong>${d.physiotherapistName}</strong> on <strong>${lagosEmailDate(d.appointmentDate)}</strong> at <strong>${d.appointmentTime}</strong> has been cancelled.`),
            d.cancellationReason ? callout('brand', 'Reason', d.cancellationReason) : '',
            paragraph('We are sorry for the change. Book a new time whenever suits you.'),
            actions(button('Reschedule appointment', d.rescheduleLink)),
            paragraph('Questions? Please contact the clinic directly.', { muted: true, size: 15 }),
          ].join(''),
        }),
      };
    }

    case 'GOOGLE_MEET_LINK': {
      const d = options.data;
      return {
        subject: options.subject || `Your Google Meet Link is Ready`,
        body: renderEmail({
          eyebrow: 'Video call',
          title: 'Your video call link is ready',
          preheader: `Join at ${lagosEmailTime(d.appointmentDate)}, ${lagosEmailDate(d.appointmentDate)}.`,
          body: [
            greeting(d.recipientName),
            paragraph('Your secure video consultation link is ready. Join at the scheduled time using the button below.'),
            highlight({ label: 'Scheduled for', value: lagosEmailTime(d.appointmentDate), sub: `${lagosEmailDate(d.appointmentDate)} (Lagos time)` }),
            actions(button('Join Google Meet', d.meetingLink), button('View in Google Calendar', d.calendarLink, 'secondary')),
            linkFallback(d.meetingLink),
          ].join(''),
          footerNote: 'This is an automated message, please do not reply directly to this email.',
        }),
      };
    }

    case 'PARTNERSHIP_INQUIRY': {
      const d = options.data;
      return {
        subject: options.subject || `New Partnership Inquiry: ${d.organization}`,
        body: renderEmail({
          eyebrow: 'Partnership inquiry',
          title: 'New partnership inquiry',
          preheader: `${d.organization} wants to partner with Rehabify.`,
          body: [
            paragraph(`Submitted through the Rehabify website by <strong>${d.name}</strong>.`),
            details([
              ['Organisation', d.organization],
              ['Contact name', d.name],
              ['Email', mailto(d.email)],
            ]),
            heading('Message'),
            quote(`<span style="white-space: pre-wrap;">${d.message}</span>`),
            actions(button('Open admin partnerships', 'https://physioaroundme.com/dashboard/admin/partnerships')),
          ].join(''),
          ...INTERNAL,
        }),
      };
    }

    case 'PARTNER_APPLICATION_SUBMITTED': {
      const d = options.data;
      return {
        subject: options.subject || `Action Required: New Partner Application - ${d.organizationName}`,
        body: renderEmail({
          eyebrow: 'Action required',
          tone: 'warning',
          title: 'New partner application',
          preheader: `${d.organizationName} applied to join the partner network.`,
          body: [
            paragraph('A new healthcare organisation has registered on the <strong>Rehabify Partner Portal</strong> and is waiting for review.'),
            details([
              ['Organisation', d.organizationName],
              ['Partner type', statusPill(d.organizationType)],
              ['Liaison contact', d.contactName],
              ['Official email', mailto(d.contactEmail)],
              ['Phone number', d.contactPhone],
              ['Coverage states', d.coverageStates && d.coverageStates.length > 0 ? d.coverageStates.join(', ') : undefined],
              ['Submitted', d.submittedAt ? lagosEmailDate(d.submittedAt, true) : undefined],
            ]),
            actions(button('Review application', d.reviewLink)),
          ].join(''),
          ...INTERNAL,
        }),
      };
    }

    case 'PARTNER_APPLICATION_APPROVED': {
      const d = options.data;
      return {
        subject: options.subject || `Welcome to Rehabify Health! Partnership Approved for ${d.organizationName}`,
        body: renderEmail({
          eyebrow: 'Approved',
          tone: 'success',
          title: 'Welcome to the partner network',
          preheader: `${d.organizationName} is now a Rehabify partner.`,
          body: [
            greeting(d.contactName || d.organizationName),
            paragraph(`We are delighted to confirm that <strong>${d.organizationName}</strong> is now an approved Rehabify partner.`),
            highlight({ label: 'Your partner code', value: d.partnerCode, mono: true, sub: 'Active and ready to use' }),
            heading('In your partner portal'),
            checklist([
              '<strong>Co-branded referral links</strong> with 30-day tracking',
              '<strong>Direct patient referrals</strong> with live treatment tracking',
              '<strong>REST API</strong> to send referrals from your EHR or app',
              '<strong>Settlement ledger</strong> with real-time reporting and CSV exports',
            ]),
            actions(button('Open your partner portal', d.portalLink)),
            paragraph(`Need help with your integration? Write to ${mailto('partners@physioaroundme.com')}.`, { muted: true, size: 15 }),
          ].join(''),
          footerNote: PARTNER_FOOTER,
        }),
      };
    }

    case 'PARTNER_APPLICATION_DECLINED': {
      const d = options.data;
      return {
        subject: options.subject || `Update regarding your Rehabify Health Partner Application`,
        body: renderEmail({
          eyebrow: 'Application update',
          tone: 'warning',
          title: 'An update on your application',
          preheader: `An update on the partner application for ${d.organizationName}.`,
          body: [
            greeting(d.contactName || d.organizationName),
            paragraph(`Thank you for applying to join the Rehabify partner network. After review by our clinical governance and compliance team, we are unable to approve <strong>${d.organizationName}</strong> at this time.`),
            callout('danger', 'Review finding', d.reason || 'We could not verify this application with the information currently provided.'),
            paragraph(`If you believe this was a mistake, or you have more licensing documents to share, write to ${mailto('partners@physioaroundme.com')}.`),
            actions(button('Contact support', d.supportLink, 'dark')),
          ].join(''),
          footerNote: PARTNER_FOOTER,
        }),
      };
    }

    case 'PARTNER_REFERRAL_CREATED': {
      const d = options.data;
      return {
        subject: options.subject || `New Patient Referral Received — ${d.trackingCode}`,
        body: renderEmail({
          eyebrow: 'Referral received',
          tone: 'success',
          title: 'Referral confirmed',
          preheader: `We received your referral for ${d.patientName}.`,
          body: [
            greeting(d.contactName || d.partnerName),
            paragraph('We have received your patient referral and our care team is already on it. Here are the details and next steps.'),
            highlight({ label: 'Tracking code', value: d.trackingCode, mono: true }),
            details([
              ['Patient', d.patientName],
              ['Condition', d.condition],
              ['Priority', priorityPill(d.priority)],
            ]),
            heading('Connect your patient with Joy'),
            paragraph('Share this link with your patient so they can chat with Joy, our care coordinator, on WhatsApp:'),
            actions(button('Chat with Joy on WhatsApp', d.whatsappIntakeUrl), button('Track referral status', d.trackingUrl, 'secondary')),
            paragraph(`Or call ${tel(d.whatsappPhone)}`, { muted: true, size: 15, center: true }),
          ].join(''),
          footerNote: PARTNER_FOOTER,
        }),
      };
    }

    case 'ADMIN_REFERRAL_CREATED': {
      const d = options.data;
      return {
        subject: options.subject || `🩺 New Partner Referral: ${d.patientName} (${d.trackingCode})`,
        body: renderEmail({
          eyebrow: 'Action required',
          tone: 'warning',
          title: 'New partner referral',
          preheader: `${d.partnerName} referred ${d.patientName}.`,
          body: [
            paragraph(`<strong>${d.partnerName}</strong> has referred a new patient. Please reach out to begin their care coordination.`),
            highlight({ label: 'Tracking code', value: d.trackingCode, mono: true }),
            details([
              ['Patient', d.patientName],
              ['Phone number', tel(d.patientPhone)],
              ['Email', d.patientEmail ? mailto(d.patientEmail) : undefined],
              ['Condition', d.condition],
              ['Referred by', d.partnerName],
              ['Priority', priorityPill(d.priority)],
              ['City', d.city],
              ['Recommended sessions', d.recommendedSessions ? String(d.recommendedSessions) : undefined],
            ]),
            actions(
              button('WhatsApp patient', d.whatsappIntakeUrl),
              button('Call patient', `tel:${d.patientPhone}`, 'secondary'),
              button('Open referrals dashboard', d.adminDashboardLink, 'dark'),
            ),
          ].join(''),
          ...INTERNAL,
        }),
      };
    }

    case 'PARTNER_NOTICE': {
      const d = options.data;
      const cta = d.ctaUrl && /^https:\/\//.test(d.ctaUrl)
        ? actions(button(escapeHtml(d.ctaLabel || "Open Partner Portal"), escapeHtml(d.ctaUrl)))
        : "";
      return {
        subject: options.subject || d.heading,
        body: renderEmail({
          eyebrow: escapeHtml(d.badge),
          title: escapeHtml(d.heading),
          preheader: d.subheading || d.heading,
          body: [
            d.subheading ? paragraph(escapeHtml(d.subheading), { muted: true, center: true }) : "",
            d.greetingName ? greeting(escapeHtml(d.greetingName)) : "",
            ...d.paragraphs.map((p) => paragraph(escapeHtml(p))),
            d.calloutText ? callout('brand', escapeHtml(d.calloutTitle || "Details"), escapeHtml(d.calloutText)) : "",
            cta,
          ].join(''),
          footerNote: d.footerNote ? escapeHtml(d.footerNote) : PARTNER_FOOTER,
        }),
      };
    }

    default:
      return {
        subject: 'Rehabify Health Notification',
        body: renderEmail({
          title: 'You have a new notification',
          body: paragraph('You have a new notification from Rehabify Health.'),
        }),
      };
  }
}
