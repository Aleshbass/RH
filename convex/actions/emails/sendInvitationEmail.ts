"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { Resend } from 'resend';
import { escapeHtml } from "../../helpers/escapeHtml";

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
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Invitation to Rehabify Health</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #10b981;">You're invited to Rehabify Health</h1>
            <p>Hello ${escapeHtml(args.patientName || args.patientEmail.split('@')[0] || 'there')},</p>
            <p>${escapeHtml(args.physiotherapistName)} has invited you to join Rehabify Health as their patient.</p>
            <div style="text-align: center; margin: 24px 0;">
              <p style="margin: 0 0 8px; font-weight: 600;">Scan to begin</p>
              <img src="${qrUrl}" alt="Invitation QR Code" width="240" height="240" style="display:inline-block; border: 8px solid #f3f4f6; border-radius: 12px;" />
            </div>
            <p style="text-align: center; margin: 12px 0; color: #555;">or</p>
            <div style="text-align: center; margin: 16px 0 28px;">
              <a href="${escapeHtml(normalizedInvitationLink)}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
                Complete Registration
              </a>
            </div>
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; word-break: break-all;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #555;">Direct link:</p>
              <a href="${escapeHtml(normalizedInvitationLink)}" style="color: #065f46; text-decoration: underline;">${escapeHtml(normalizedInvitationLink)}</a>
            </div>
            <p style="margin-top: 16px;">This invitation will expire on ${new Date(args.expiresAt).toLocaleDateString()}.</p>
            <p>If you have any questions, please contact your physiotherapist directly.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e5e5;">
            <p style="font-size: 12px; color: #666;">If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        </body>
        </html>
      `;
      
      
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
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Reminder: Complete Your Registration</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #10b981;">Reminder: Your Invitation is Waiting</h1>
            <p>Hello ${escapeHtml(args.patientName || args.patientEmail.split('@')[0] || 'there')},</p>
            <p>This is a friendly reminder that ${escapeHtml(args.physiotherapistName)} has invited you to join Rehabify Health as their patient.</p>
            <div style="text-align: center; margin: 24px 0;">
              <p style="margin: 0 0 8px; font-weight: 600;">Scan to continue</p>
              <img src="${reminderQrUrl}" alt="Invitation QR Code" width="240" height="240" style="display:inline-block; border: 8px solid #f3f4f6; border-radius: 12px;" />
            </div>
            <p style="text-align: center; margin: 12px 0; color: #555;">or</p>
            <div style="text-align: center; margin: 16px 0 28px;">
              <a href="${escapeHtml(normalizedInvitationLink)}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
                Complete Registration Now
              </a>
            </div>
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; word-break: break-all;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #555;">Direct link:</p>
              <a href="${escapeHtml(normalizedInvitationLink)}" style="color: #065f46; text-decoration: underline;">${escapeHtml(normalizedInvitationLink)}</a>
            </div>
            <p style="margin-top: 16px;">This invitation will expire on ${new Date(args.expiresAt).toLocaleDateString()}.</p>
          </div>
        </body>
        </html>
      `;
      
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