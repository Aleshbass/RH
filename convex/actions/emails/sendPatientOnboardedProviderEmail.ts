"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { sendEmail } from "../../../lib/email/emailService";

/**
 * Send an email to the physiotherapist when a patient completes onboarding
 */
export const sendPatientOnboardedProviderEmail = internalAction({
  args: {
    providerEmail: v.string(),
    providerName: v.string(),
    patientName: v.string(),
    patientsLink: v.string(),
  },
  handler: async (ctx, args) => {
    const { providerEmail, providerName, patientName, patientsLink } = args;

    try {
      const result = await sendEmail({
        to: providerEmail,
        template: "PATIENT_ONBOARDED_PROVIDER",
        data: {
          physiotherapistName: providerName,
          patientName,
          patientsLink,
        },
      });

      if (result.success) {
        return { success: true, messageId: result.messageId } as const;
      }

      console.error(
        "Failed to send patient onboarded provider email:",
        result.error
      );
      return { success: false, error: result.error } as const;
    } catch (error) {
      console.error(
        "Exception sending patient onboarded provider email:",
        error
      );
      return { success: false, error: String(error) } as const;
    }
  },
});
