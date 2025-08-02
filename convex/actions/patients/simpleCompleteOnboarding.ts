"use node";

import { action } from "../../_generated/server";
import { api } from "../../_generated/api";
import { v } from "convex/values";

// Explicitly define the validator for patient data to be reused.
const patientDataValidator = v.object({
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  phoneNumber: v.optional(v.string()),
  dateOfBirth: v.optional(v.string()),
  gender: v.optional(
    v.union(
      v.literal("male"),
      v.literal("female"),
      v.literal("other"),
      v.literal("prefer_not_to_say")
    )
  ),
  medicalHistory: v.optional(v.string()),
  emergencyContact: v.optional(v.string()),
});

/**
 * Simplified wrapper for completing patient onboarding.
 * This action calls the `completePatientOnboardingWithNotification` action and is intended
 * to be used from the client to avoid deep TypeScript type instantiation errors.
 */
export const simplifiedCompletePatientOnboarding = action({
  args: {
    invitationCode: v.string(),
    patientData: patientDataValidator,
    sendEmail: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Call the original, more complex action
    const result = await ctx.runAction(api.actions.patients.completeOnboarding.completePatientOnboardingWithNotification, {
      invitationCode: args.invitationCode,
      patientData: args.patientData,
      sendEmail: args.sendEmail,
    });

    // Return a simplified object to prevent type errors on the client
    return { success: result.success, patientId: result.patientId?.toString() };
  },
});
