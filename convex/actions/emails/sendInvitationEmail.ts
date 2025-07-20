"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Send an invitation email to a patient
 * This action is specifically for sending emails and can be used by other actions
 */
export const sendPatientInvitationEmail = action({
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
      const result = await sendEmail({
        to: args.patientEmail,
        template: 'INVITATION_CREATED',
        data: {
          patientName: args.patientName || args.patientEmail.split('@')[0] || 'Patient',
          physiotherapistName: args.physiotherapistName,
          invitationCode: args.invitationCode,
          invitationLink: args.invitationLink,
          expiresAt: new Date(args.expiresAt).toISOString(),
        }
      });

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      };
    } catch (error) {
      console.error('Failed to send invitation email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});

/**
 * Send a reminder email for pending invitations
 */
export const sendInvitationReminderEmail = action({
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
      const result = await sendEmail({
        to: args.patientEmail,
        template: 'INVITATION_REMINDER',
        data: {
          patientName: args.patientName || args.patientEmail.split('@')[0] || 'Patient',
          physiotherapistName: args.physiotherapistName,
          invitationCode: args.invitationCode,
          invitationLink: args.invitationLink,
          expiresAt: new Date(args.expiresAt).toISOString(),
        }
      });

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      };
    } catch (error) {
      console.error('Failed to send reminder email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
}); 