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
  },
  handler: async (ctx, args) => {
    const { adminEmail, userName, adminDashboardLink } = args;
    
    try {
      // Use the existing email service to send the onboarding notification email
      const result = await sendEmail({
        to: adminEmail,
        template: 'ONBOARDING_COMPLETE',
        data: {
          userName,
          dashboardLink: adminDashboardLink,
        },
      });

      if (result.success) {
        console.log(`Onboarding notification email sent successfully to ${adminEmail}, messageId: ${result.messageId}`);
        return { success: true, messageId: result.messageId };
      } else {
        console.error(`Failed to send onboarding notification email to ${adminEmail}:`, result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error(`Exception sending onboarding notification email to ${adminEmail}:`, error);
      return { success: false, error: String(error) };
    }
  },
});
