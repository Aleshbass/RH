"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { Resend } from 'resend';

/**
 * Send an invitation email to a physiotherapist for clinic staff invite
 */
export const sendClinicStaffInvitationEmail = action({
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
  handler: async (_ctx, args) => {
    console.log('[CLINIC EMAIL] Sending staff invitation email to:', args.inviteeEmail);
    console.log('[CLINIC EMAIL] Invitation code:', args.invitationCode);
    
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

      console.log('[CLINIC EMAIL] Initializing Resend client');
      const resend = new Resend(RESEND_API_KEY);
      
      const fromEmail = 'info@physioaroundme.com';
      const fromName = 'Rehabify Health';
      
      console.log('[CLINIC EMAIL] From:', `${fromName} <${fromEmail}>`);
      
      // Create QR code URL
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(args.invitationLink)}`;
      
      // Build email HTML
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Clinic Staff Invitation</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #10b981;">You've been invited to join ${args.clinicName || 'a clinic'}</h1>
            <p>Hello ${args.inviteeName || args.inviteeEmail.split('@')[0]},</p>
            <p>${args.clinicOwnerName} has invited you to join ${args.clinicName || 'their clinic'} as a physiotherapist on Rehabify Health.</p>
            ${args.message ? `<div style="background-color: #f9fafb; border-left: 4px solid #10b981; padding: 12px; margin: 20px 0;"><p style="margin: 0; font-style: italic;">"${args.message}"</p></div>` : ''}
            <div style="text-align: center; margin: 24px 0;">
              <p style="margin: 0 0 8px; font-weight: 600;">Scan to accept</p>
              <img src="${qrUrl}" alt="Invitation QR Code" width="240" height="240" style="display:inline-block; border: 8px solid #f3f4f6; border-radius: 12px;" />
            </div>
            <p style="text-align: center; margin: 12px 0; color: #555;">or</p>
            <div style="text-align: center; margin: 16px 0 28px;">
              <a href="${args.invitationLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                Accept Invitation
              </a>
            </div>
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px;">
              <p style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #374151;">Invitation Code:</p>
              <p style="margin: 0; font-family: 'Courier New', monospace; font-size: 18px; color: #10b981; letter-spacing: 2px;">${args.invitationCode}</p>
            </div>
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; margin-top: 12px; word-break: break-all;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #555;">Direct link:</p>
              <a href="${args.invitationLink}" style="color: #065f46; text-decoration: underline; font-size: 13px;">${args.invitationLink}</a>
            </div>
            <p style="margin-top: 20px; color: #6b7280;">This invitation will expire on <strong>${new Date(args.expiresAt).toLocaleDateString()}</strong>.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e5e5;">
            <p style="font-size: 12px; color: #9ca3af;">If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        </body>
        </html>
      `;
      
      console.log('[CLINIC EMAIL] Sending email via Resend API...');
      
      const { data, error } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [args.inviteeEmail],
        subject: `You've been invited to join ${args.clinicName || 'a clinic'} on Rehabify Health`,
        html: emailHtml,
      });
      
      if (error) {
        console.error('[CLINIC EMAIL] Resend API error:', error);
        return {
          success: false,
          error: error.message || 'Failed to send email',
        };
      }
      
      console.log('[CLINIC EMAIL] Email sent successfully!');
      console.log('[CLINIC EMAIL] Message ID:', data?.id);
      
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
export const sendClinicStaffInvitationReminderEmail = action({
  args: {
    inviteeEmail: v.string(),
    inviteeName: v.optional(v.string()),
    clinicOwnerName: v.string(),
    clinicName: v.optional(v.string()),
    invitationCode: v.string(),
    invitationLink: v.string(),
    expiresAt: v.number(),
  },
  handler: async (_ctx, args) => {
    console.log('[CLINIC EMAIL REMINDER] Sending reminder to:', args.inviteeEmail);
    
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
      
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(args.invitationLink)}`;
      
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Reminder: Clinic Staff Invitation</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #10b981;">Reminder: Join ${args.clinicName || 'the clinic'}</h1>
            <p>Hello ${args.inviteeName || args.inviteeEmail.split('@')[0]},</p>
            <p>This is a friendly reminder that ${args.clinicOwnerName} has invited you to join ${args.clinicName || 'their clinic'} as a physiotherapist on Rehabify Health.</p>
            <div style="text-align: center; margin: 24px 0;">
              <p style="margin: 0 0 8px; font-weight: 600;">Scan to accept</p>
              <img src="${qrUrl}" alt="Invitation QR Code" width="240" height="240" style="display:inline-block; border: 8px solid #f3f4f6; border-radius: 12px;" />
            </div>
            <p style="text-align: center; margin: 12px 0; color: #555;">or</p>
            <div style="text-align: center; margin: 16px 0 28px;">
              <a href="${args.invitationLink}" style="display: inline-block; background-color: #10b981; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                Accept Invitation
              </a>
            </div>
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px;">
              <p style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #374151;">Invitation Code:</p>
              <p style="margin: 0; font-family: 'Courier New', monospace; font-size: 18px; color: #10b981; letter-spacing: 2px;">${args.invitationCode}</p>
            </div>
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; margin-top: 12px; word-break: break-all;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #555;">Direct link:</p>
              <a href="${args.invitationLink}" style="color: #065f46; text-decoration: underline; font-size: 13px;">${args.invitationLink}</a>
            </div>
            <p style="margin-top: 20px; color: #6b7280;">This invitation will expire on <strong>${new Date(args.expiresAt).toLocaleDateString()}</strong>. Don't miss out!</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e5e5;">
            <p style="font-size: 12px; color: #9ca3af;">If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        </body>
        </html>
      `;
      
      const { data, error } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [args.inviteeEmail],
        subject: `Reminder: Join ${args.clinicName || 'the clinic'} on Rehabify Health`,
        html: emailHtml,
      });
      
      if (error) {
        console.error('[CLINIC EMAIL REMINDER] Resend API error:', error);
        return {
          success: false,
          error: error.message || 'Failed to send email',
        };
      }
      
      console.log('[CLINIC EMAIL REMINDER] Email sent successfully!');
      console.log('[CLINIC EMAIL REMINDER] Message ID:', data?.id);
      
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
