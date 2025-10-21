"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Send onboarding complete email to a patient
 */
export const sendPatientOnboardingCompleteEmail = internalAction({
  args: {
    patientEmail: v.string(),
    patientName: v.string(),
    dashboardLink: v.string(),
  },
  handler: async (ctx, args) => {
    const { patientEmail, patientName, dashboardLink } = args;

    try {
      const result = await sendEmail({
        to: patientEmail,
        template: "ONBOARDING_COMPLETE",
        data: {
          userName: patientName,
          dashboardLink,
        },
      });

      if (result.success) {
        console.log(
          `Patient onboarding complete email sent to ${patientEmail}, messageId: ${result.messageId}`
        );
        return { success: true, messageId: result.messageId } as const;
      }

      console.error(
        `Failed to send patient onboarding complete email to ${patientEmail}:`,
        result.error
      );
      return { success: false, error: result.error } as const;
    } catch (error) {
      console.error(
        `Exception sending patient onboarding complete email to ${patientEmail}:`,
        error
      );
      return { success: false, error: String(error) } as const;
    }
  },
});
