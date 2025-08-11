"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

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
    try {
      const result = await sendEmail({
        to: args.inviteeEmail,
        template: 'CLINIC_STAFF_INVITE_CREATED',
        data: {
          inviteeName: args.inviteeName || args.inviteeEmail.split('@')[0] || 'Physiotherapist',
          clinicOwnerName: args.clinicOwnerName,
          clinicName: args.clinicName,
          invitationCode: args.invitationCode,
          invitationLink: args.invitationLink,
          expiresAt: new Date(args.expiresAt).toISOString(),
          message: args.message,
        },
      });
      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      };
    } catch (error) {
      console.error('Failed to send clinic staff invitation email:', error);
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
    try {
      const result = await sendEmail({
        to: args.inviteeEmail,
        template: 'CLINIC_STAFF_INVITE_REMINDER',
        data: {
          inviteeName: args.inviteeName || args.inviteeEmail.split('@')[0] || 'Physiotherapist',
          clinicOwnerName: args.clinicOwnerName,
          clinicName: args.clinicName,
          invitationCode: args.invitationCode,
          invitationLink: args.invitationLink,
          expiresAt: new Date(args.expiresAt).toISOString(),
        },
      });
      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      };
    } catch (error) {
      console.error('Failed to send clinic staff invitation reminder email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});
