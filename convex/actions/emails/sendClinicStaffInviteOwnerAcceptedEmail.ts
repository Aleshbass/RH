"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";
import { escapeHtml, escapeOptional, plainSubject } from "../../helpers/escapeHtml";

/**
 * Notify clinic owner when a staff invitation is accepted.
 * Internal: run by acceptStaffInvitationWithNotification with the owner's address from the DB.
 */
export const sendClinicStaffInviteOwnerAcceptedEmail = internalAction({
  args: {
    to: v.string(),
    clinicOwnerName: v.string(),
    inviteeName: v.string(),
    clinicName: v.optional(v.string()),
    staffLink: v.string(),
    subject: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    try {
      const result = await sendEmail({
        to: args.to,
        subject: args.subject ? plainSubject(args.subject) : undefined,
        template: 'CLINIC_STAFF_INVITE_ACCEPTED_OWNER',
        data: {
          clinicOwnerName: escapeHtml(args.clinicOwnerName),
          inviteeName: escapeHtml(args.inviteeName),
          clinicName: escapeOptional(args.clinicName),
          staffLink: args.staffLink,
        },
      });
      return { success: result.success, messageId: result.messageId, error: result.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  },
});
