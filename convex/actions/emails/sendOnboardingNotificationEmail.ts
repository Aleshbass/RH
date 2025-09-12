"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Send onboarding completion notification email to admin (Internal Action)
 */
export const sendOnboardingNotificationEmail = internalAction({
  args: {
    adminEmail: v.string(),
    userName: v.string(),
    adminDashboardLink: v.string(),
    userRole: v.optional(v.string()),
    submittedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { adminEmail, userName, adminDashboardLink, userRole, submittedAt } = args;
    
    try {
      // Use the existing email service to send the admin approval required notification
      const result = await sendEmail({
        to: adminEmail,
        template: 'ADMIN_APPROVAL_REQUIRED',
        data: {
          userName,
          userRole,
          adminDashboardLink,
          submittedAt,
        },
      });

      if (result.success) {
        console.log(`Admin approval required email sent successfully to ${adminEmail}, messageId: ${result.messageId}`);
        return { success: true, messageId: result.messageId };
      } else {
        console.error(`Failed to send admin approval required email to ${adminEmail}:`, result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error(`Exception sending admin approval required email to ${adminEmail}:`, error);
      return { success: false, error: String(error) };
    }
  },
});
