"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Send approval email to a user (Internal Action)
 */
export const sendApprovalEmail = internalAction({
  args: {
    userEmail: v.string(),
    userName: v.string(),
    userRole: v.string(),
    dashboardLink: v.string(),
    comments: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { userEmail, userName, userRole, dashboardLink, comments } = args;
    
    try {
      // Use the existing email service to send the approval email
      const result = await sendEmail({
        to: userEmail,
        template: 'ACCOUNT_APPROVED',
        data: {
          userName,
          userRole,
          dashboardLink,
          clinicName: undefined, // Optional field
        },
      });

      if (result.success) {
        return { success: true, messageId: result.messageId };
      } else {
        console.error("Failed to send approval email:", result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error("Exception sending approval email:", error);
      return { success: false, error: String(error) };
    }
  },
}); 