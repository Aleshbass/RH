"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { Resend } from 'resend';
import { escapeHtml } from "../../helpers/escapeHtml";
import { actions, button, emailDate, greeting, linkFallback, paragraph, renderEmail } from "../../../lib/email/layout";
import { qrBlock } from "./qrImage";

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
    /** Their clinic, when the physio works for one: the patient is joining that clinic */
    clinicName: v.optional(v.string()),
    invitationCode: v.string(),
    invitationLink: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const inviter = args.clinicName?.trim()
      ? `${args.physiotherapistName} at ${args.clinicName.trim()}`
      : args.physiotherapistName;
    
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

      // The QR is made here and stored with us: the link carries the invite's secret code
      const qr = await qrBlock(ctx, normalizedInvitationLink, 'Or scan to begin', escapeHtml);
      const link = escapeHtml(normalizedInvitationLink);
      const emailHtml = renderEmail({
        eyebrow: 'Invitation',
        title: args.clinicName?.trim() ? `${escapeHtml(args.clinicName.trim())} invited you` : `${escapeHtml(args.physiotherapistName)} invited you`,
        preheader: `${inviter} invited you to your patient portal on Rehabify Health.`,
        body: [
          greeting(escapeHtml(args.patientName || args.patientEmail.split('@')[0] || 'there')),
          paragraph(`<strong>${escapeHtml(inviter)}</strong> has invited you to your patient portal on Rehabify Health: your appointments, home exercises and messages with them in one place.`),
          actions(button('Open your patient portal', link)),
          qr,
          linkFallback(link),
          paragraph(`This invitation expires on <strong>${emailDate(args.expiresAt)}</strong>. If you have any questions, please contact your physiotherapist directly.`, { muted: true, size: 15 }),
        ].join(''),
        footerNote: "If you didn't expect this invitation, you can safely ignore this email.",
      });
      
      
      const { data, error } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [args.patientEmail],
        subject: `${inviter} invited you to your patient portal`,
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

      const qr = await qrBlock(ctx, normalizedInvitationLink, 'Or scan to continue', escapeHtml);
      const link = escapeHtml(normalizedInvitationLink);
      const emailHtml = renderEmail({
        eyebrow: 'Reminder',
        title: 'Your invitation is waiting',
        preheader: `${args.physiotherapistName} is waiting for you on Rehabify Health.`,
        body: [
          greeting(escapeHtml(args.patientName || args.patientEmail.split('@')[0] || 'there')),
          paragraph(`A friendly reminder that <strong>${escapeHtml(args.physiotherapistName)}</strong> has invited you to join Rehabify Health as their patient.`),
          actions(button('Complete registration now', link)),
          qr,
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