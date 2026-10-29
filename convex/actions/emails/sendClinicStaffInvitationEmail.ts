"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { Resend } from 'resend';
import { escapeHtml, plainSubject } from "../../helpers/escapeHtml";
import { actions, button, emailDate, greeting, highlight, linkFallback, paragraph, quote, renderEmail } from "../../../lib/email/layout";
import { qrBlock } from "./qrImage";

/**
 * Clinic staff invitation emails. Internal actions: they are only run by the
 * clinic invitation actions after the invitation was created/loaded for the signed-in
 * clinic owner, so they cannot be used from a browser to mail arbitrary addresses.
 * All interpolated text is HTML-escaped.
 */

/**
 * Send an invitation email to a physiotherapist for clinic staff invite
 */
export const sendClinicStaffInvitationEmail = internalAction({
  args: {
    inviteeEmail: v.string(),
    inviteeName: v.optional(v.string()),
    clinicOwnerName: v.string(),
    clinicName: v.optional(v.string()),
    invitationCode: v.string(),
    invitationLink: v.string(),
    expiresAt: v.number(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {

    try {
      // Check for Resend API key
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (!RESEND_API_KEY) {
        console.error('[CLINIC EMAIL] RESEND_API_KEY not found in environment');
        return {
          success: false,
          error: 'Email service not configured. RESEND_API_KEY missing.',
        };
      }

      const resend = new Resend(RESEND_API_KEY);

      const fromEmail = 'info@physioaroundme.com';
      const fromName = 'Rehabify Health';


      // Made here and stored with us: the link carries the invite's secret code
      const qr = await qrBlock(ctx, args.invitationLink, 'Or scan to accept', escapeHtml);

      const clinicName = args.clinicName ? escapeHtml(args.clinicName) : undefined;
      const greetingName = escapeHtml(args.inviteeName || args.inviteeEmail.split('@')[0]);
      const ownerName = escapeHtml(args.clinicOwnerName);
      const link = escapeHtml(args.invitationLink);

      // Build email HTML
      const emailHtml = renderEmail({
        eyebrow: 'Team invitation',
        title: `Join ${clinicName || 'the team'} on Rehabify`,
        preheader: `${args.clinicOwnerName} invited you to join their clinic on Rehabify Health.`,
        body: [
          greeting(greetingName),
          paragraph(`<strong>${ownerName}</strong> has invited you to join <strong>${clinicName || 'their clinic'}</strong> as a physiotherapist on Rehabify Health.`),
          args.message ? quote(escapeHtml(args.message), ownerName) : '',
          highlight({ label: 'Invitation code', value: escapeHtml(args.invitationCode), mono: true, sub: `Expires ${emailDate(args.expiresAt)}` }),
          actions(button('Accept invitation', link)),
          qr,
          linkFallback(link),
        ].join(''),
        footerNote: "If you didn't expect this invitation, you can safely ignore this email.",
      });


      const { data, error } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [args.inviteeEmail],
        subject: plainSubject(`You've been invited to join ${args.clinicName || 'a clinic'} on Rehabify Health`),
        html: emailHtml,
      });

      if (error) {
        console.error('[CLINIC EMAIL] Resend API error:', error);
        return {
          success: false,
          error: error.message || 'Failed to send email',
        };
      }


      return {
        success: true,
        messageId: data?.id,
      };
    } catch (error) {
      console.error('[CLINIC EMAIL] Exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});

/**
 * Send a reminder email for clinic staff invitations
 */
export const sendClinicStaffInvitationReminderEmail = internalAction({
  args: {
    inviteeEmail: v.string(),
    inviteeName: v.optional(v.string()),
    clinicOwnerName: v.string(),
    clinicName: v.optional(v.string()),
    invitationCode: v.string(),
    invitationLink: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {

    try {
      // Check for Resend API key
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (!RESEND_API_KEY) {
        console.error('[CLINIC EMAIL REMINDER] RESEND_API_KEY not found');
        return {
          success: false,
          error: 'Email service not configured',
        };
      }

      const resend = new Resend(RESEND_API_KEY);
      const fromEmail = 'info@physioaroundme.com';
      const fromName = 'Rehabify Health';

      const qr = await qrBlock(ctx, args.invitationLink, 'Or scan to accept', escapeHtml);

      const clinicName = args.clinicName ? escapeHtml(args.clinicName) : undefined;
      const greetingName = escapeHtml(args.inviteeName || args.inviteeEmail.split('@')[0]);
      const ownerName = escapeHtml(args.clinicOwnerName);
      const link = escapeHtml(args.invitationLink);

      const emailHtml = renderEmail({
        eyebrow: 'Reminder',
        title: `Join ${clinicName || 'the team'} on Rehabify`,
        preheader: `Your invitation from ${args.clinicOwnerName} is still waiting.`,
        body: [
          greeting(greetingName),
          paragraph(`A friendly reminder that <strong>${ownerName}</strong> has invited you to join <strong>${clinicName || 'their clinic'}</strong> as a physiotherapist on Rehabify Health.`),
          highlight({ label: 'Invitation code', value: escapeHtml(args.invitationCode), mono: true, sub: `Expires ${emailDate(args.expiresAt)}` }),
          actions(button('Accept invitation', link)),
          qr,
          linkFallback(link),
        ].join(''),
        footerNote: "If you didn't expect this invitation, you can safely ignore this email.",
      });

      const { data, error } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [args.inviteeEmail],
        subject: plainSubject(`Reminder: Join ${args.clinicName || 'the clinic'} on Rehabify Health`),
        html: emailHtml,
      });

      if (error) {
        console.error('[CLINIC EMAIL REMINDER] Resend API error:', error);
        return {
          success: false,
          error: error.message || 'Failed to send email',
        };
      }


      return {
        success: true,
        messageId: data?.id,
      };
    } catch (error) {
      console.error('[CLINIC EMAIL REMINDER] Exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});
