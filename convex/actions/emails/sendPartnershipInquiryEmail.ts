"use node";

import { action } from "../../_generated/server";
import { v } from "convex/values";
import { sendEmail } from "../../../lib/email/emailService";

export const sendPartnershipInquiryEmail = action({
  args: {
    adminEmail: v.string(),
    name: v.string(),
    email: v.string(),
    organization: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const result = await sendEmail({
        to: args.adminEmail,
        template: 'PARTNERSHIP_INQUIRY',
        data: {
          name: args.name,
          email: args.email,
          organization: args.organization,
          message: args.message,
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
