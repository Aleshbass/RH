"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Notify clinic owner when a staff invitation is declined.
 */
export const sendClinicStaffInviteOwnerDeclinedEmail = action({
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
        subject: args.subject,
        template: 'CLINIC_STAFF_INVITE_DECLINED_OWNER',
        data: {
          clinicOwnerName: args.clinicOwnerName,
          inviteeName: args.inviteeName,
          clinicName: args.clinicName,
          staffLink: args.staffLink,
        },
      });
      return { success: result.success, messageId: result.messageId, error: result.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  },
});
