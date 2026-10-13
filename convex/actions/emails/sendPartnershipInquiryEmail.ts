"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { sendEmail } from "../../../lib/email/emailService";
import { escapeHtml, plainSubject } from "../../helpers/escapeHtml";

/**
 * Admin notification for a partnership inquiry submitted from the public website.
 * Internal: scheduled by public.submitPartnershipInquiry for each admin user, so the
 * recipient always comes from the users table. The visitor's text is HTML-escaped.
 */
export const sendPartnershipInquiryEmail = internalAction({
  args: {
    adminEmail: v.string(),
    name: v.string(),
    email: v.string(),
    organization: v.string(),
    message: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      const result = await sendEmail({
        to: args.adminEmail,
        subject: plainSubject(`New Partnership Inquiry: ${args.organization}`),
        template: 'PARTNERSHIP_INQUIRY',
        data: {
          name: escapeHtml(args.name),
          email: escapeHtml(args.email),
          organization: escapeHtml(args.organization),
          message: escapeHtml(args.message),
        }
      });

      if (!result.success) {
        console.error("Failed to send partnership inquiry email:", result.error);
        return { success: false, error: result.error };
      }

      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error("Error in sendPartnershipInquiryEmail:", error);
      return { success: false, error: "Internal server error sending email" };
    }
  },
});
