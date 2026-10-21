"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Send decline email to a user (Internal Action)
 */
export const sendDeclineEmail = internalAction({
  args: {
    userEmail: v.string(),
    userName: v.string(),
    userRole: v.string(),
    reason: v.string(),
    supportLink: v.string(),
    requiredDocuments: v.optional(v.array(v.string())),
  },
  returns: v.object({
    success: v.boolean(),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { userEmail, userName, userRole, reason, supportLink, requiredDocuments } = args;
    
    try {
      // Use the existing email service to send the decline email
      const result = await sendEmail({
        to: userEmail,
        template: 'ACCOUNT_DECLINED',
        data: {
          userName,
          reason,
          supportLink,
          requiredInfo: requiredDocuments || [],
        },
      });

      if (result.success) {
        return { success: true, messageId: result.messageId };
      } else {
        console.error("Failed to send decline email:", result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error("Exception sending decline email:", error);
      return { success: false, error: String(error) };
    }
  },
}); 