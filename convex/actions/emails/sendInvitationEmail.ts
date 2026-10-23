"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { Resend } from 'resend';
import { escapeHtml } from "../../helpers/escapeHtml";
import { actions, button, emailDate, greeting, linkFallback, paragraph, qrCode, renderEmail } from "../../../lib/email/layout";

/**
 * Patient invitation emails. These are internal actions: they are run by
 * createPatientInvitationWithNotification (after the signed-in physiotherapist created
 * the invitation) and by the invitation-reminder cron, never directly from a browser.
 * Names are HTML-escaped before being placed in the template.
 */

/**
 * Send an invitation email to a patient
 * This action is specifically for sending emails and can be used by other actions
 */
export const sendPatientInvitationEmail = internalAction({
  args: {
    patientEmail: v.string(),
    patientName: v.optional(v.string()),
    physiotherapistName: v.string(),
    invitationCode: v.string(),
    invitationLink: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    
    try {
      // Check for Resend API key
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (!RESEND_API_KEY) {
        console.error('[EMAIL ACTION] RESEND_API_KEY not found in environment variables');
        return {
          success: false,
          error: 'Email service not configured. RESEND_API_KEY missing.',
        };
      }

      const resend = new Resend(RESEND_API_KEY);
      
      // Use your verified domain email
      const fromEmail = 'info@physioaroundme.com';
      const fromName = process.env.FROM_NAME || 'Rehabify Health';
      
      
      // Normalize invitation link to production domain regardless of input
      const PRODUCTION_BASE = 'https://physioaroundme.com';
      let normalizedInvitationLink = args.invitationLink;
      try {
        const u = new URL(args.invitationLink);
        u.protocol = 'https:';
        u.host = 'physioaroundme.com';
        normalizedInvitationLink = u.toString();
      } catch (_e) {
        // Fallback if the provided link isn't a full URL
        normalizedInvitationLink = `${PRODUCTION_BASE}/patient-invite/${args.invitationCode}`;
      }

      // Create QR code URL (external service) and email HTML content
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
        normalizedInvitationLink
      )}`;
      const link = escapeHtml(normalizedInvitationLink);
      const emailHtml = renderEmail({
        eyebrow: 'Invitation',
        title: 'You are invited to Rehabify',
        preheader: `${args.physiotherapistName} invited you to join Rehabify Health.`,
        body: [
          greeting(escapeHtml(args.patientName || args.patientEmail.split('@')[0] || 'there')),
          paragraph(`<strong>${escapeHtml(args.physiotherapistName)}</strong> has invited you to join Rehabify Health as their patient.`),
          actions(button('Complete registration', link)),
          qrCode(escapeHtml(qrUrl), 'Or scan to begin'),
          linkFallback(link),
          paragraph(`This invitation expires on <strong>${emailDate(args.expiresAt)}</strong>. If you have any questions, please contact your physiotherapist directly.`, { muted: true, size: 15 }),
        ].join(''),
        footerNote: "If you didn't expect this invitation, you can safely ignore this email.",
      });
      
      
      const { data, error } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [args.patientEmail],
        subject: `You've been invited to join Rehabify Health`,
        html: emailHtml,
      });
      
      if (error) {
        console.error('[EMAIL ACTION] Resend API error:', error);
        return {
          success: false,
          error: error.message || 'Failed to send email',
        };
      }
      
      
      return {
        success: true,
        messageId: data?.id,
        error: undefined,
      };
    } catch (error) {
      console.error('[EMAIL ACTION] Exception occurred:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});

/**
 * Preview-only utility action: normalize a patient invitation link to production domain
 * Does NOT send an email. Useful for tests to ensure no localhost links remain.
 * Internal (run it with `npx convex run`), so it is not part of the public API.
 */
export const previewNormalizedPatientInvitationLink = internalAction({
  args: {
    invitationLink: v.string(),
    invitationCode: v.string(),
  },
  returns: v.object({
    normalizedLink: v.string(),
    isProduction: v.boolean(),
  }),
  handler: async (_ctx, args) => {
    const PRODUCTION_BASE = 'https://physioaroundme.com';
    let normalizedLink = args.invitationLink;
    try {
      const u = new URL(args.invitationLink);
      u.protocol = 'https:';
      u.host = 'physioaroundme.com';
      normalizedLink = u.toString();
    } catch (_e) {
      normalizedLink = `${PRODUCTION_BASE}/patient-invite/${args.invitationCode}`;
    }

    const isProduction = normalizedLink.startsWith(PRODUCTION_BASE);
    return { normalizedLink, isProduction };
  }
});

/**
 * Send a reminder email for pending invitations
 */
export const sendInvitationReminderEmail = internalAction({
  args: {
    patientEmail: v.string(),
    patientName: v.optional(v.string()),
    physiotherapistName: v.string(),
    invitationCode: v.string(),
    invitationLink: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    
    try {
      // Check for Resend API key
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (!RESEND_API_KEY) {
        console.error('[EMAIL ACTION] RESEND_API_KEY not found');
        return {
          success: false,
          error: 'Email service not configured',
        };
      }

      const resend = new Resend(RESEND_API_KEY);
      const fromEmail = 'info@physioaroundme.com';
      const fromName = 'Rehabify Health';
      
      // Normalize invitation link for reminder as well
      const PRODUCTION_BASE = 'https://physioaroundme.com';
      let normalizedInvitationLink = args.invitationLink;
      try {
        const u = new URL(args.invitationLink);
        u.protocol = 'https:';
        u.host = 'physioaroundme.com';
        normalizedInvitationLink = u.toString();
      } catch (_e) {
        normalizedInvitationLink = `${PRODUCTION_BASE}/patient-invite/${args.invitationCode}`;
      }

      const reminderQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
        normalizedInvitationLink
      )}`;
      const link = escapeHtml(normalizedInvitationLink);
      const emailHtml = renderEmail({
        eyebrow: 'Reminder',
        title: 'Your invitation is waiting',
        preheader: `${args.physiotherapistName} is waiting for you on Rehabify Health.`,
        body: [
          greeting(escapeHtml(args.patientName || args.patientEmail.split('@')[0] || 'there')),
          paragraph(`A friendly reminder that <strong>${escapeHtml(args.physiotherapistName)}</strong> has invited you to join Rehabify Health as their patient.`),
          actions(button('Complete registration now', link)),
          qrCode(escapeHtml(reminderQrUrl), 'Or scan to continue'),
          linkFallback(link),
          paragraph(`This invitation expires on <strong>${emailDate(args.expiresAt)}</strong>.`, { muted: true, size: 15 }),
        ].join(''),
        footerNote: "If you didn't expect this invitation, you can safely ignore this email.",
      });
      
      const { data, error } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [args.patientEmail],
        subject: 'Reminder: Complete Your Rehabify Health Registration',
        html: emailHtml,
      });
      
      if (error) {
        console.error('[EMAIL ACTION] Resend API error:', error);
        return {
          success: false,
          error: error.message || 'Failed to send email',
        };
      }
      
      return {
        success: true,
        messageId: data?.id,
        error: undefined,
      };
    } catch (error) {
      console.error('[EMAIL ACTION] Exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
}); 