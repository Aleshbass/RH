// @ts-nocheck - Disable type checking due to deep type instantiation issues with Convex types

"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";

/**
 * Complete patient onboarding with invitation and send notifications
 * This action wraps the base completePatientOnboarding mutation and adds notification sending
 * to both the patient and their physiotherapist
 */
export const completePatientOnboardingWithNotification = action({
  args: {
    invitationCode: v.string(),
    patientData: v.object({
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
    }),
    sendEmail: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.optional(v.string()),
    patientId: v.optional(v.id("users")),
  }),
  handler: async (ctx, args): Promise<{ success: boolean; message?: string; patientId?: Id<"users"> }> => {
    try {
      const result: { success: boolean; message?: string; patientId?: Id<"users"> } = await ctx.runMutation(
        api.patientInvitations.completePatientOnboarding,
        {
          invitationCode: args.invitationCode,
          patientData: args.patientData,
        }
      );

      if (!result.success || !result.patientId) {
        return result;
      }

      const patientId = result.patientId;

      const invitationResult = await ctx.runQuery(api.patientInvitations.validateInvitationCode, {
        code: args.invitationCode,
      });

      if (!invitationResult.valid) {
        return { success: false, message: invitationResult.error };
      }

      const invitation = invitationResult.invitation;
      const physiotherapist = invitationResult.physiotherapist;

      if (!invitation) {
        return { success: false, message: "Invitation not found." };
      }

      const patientName = `${args.patientData.firstName} ${args.patientData.lastName}`.trim();

      // Send notification to patient
      await ctx.runMutation(api.notifications.create, {
        userId: patientId,
        type: "onboarding_complete",
        priority: "medium",
        payload: {
            title: "Welcome to Rehabify!",
            body: `Your onboarding is complete, ${patientName}. You can now access your patient dashboard.`,
            data: {
                entityType: "user",
                entityId: patientId,
                actionUrl: "/dashboard/patient",
            },
        }
      });

      if (physiotherapist) {
        const physiotherapistId = physiotherapist._id;

        // Create notification for the physiotherapist
        await ctx.runMutation(api.notifications.create, {
          userId: physiotherapistId,
          type: "patient_onboarded",
          priority: "medium",
          payload: {
            title: `${patientName} completed onboarding`,
            body: `Your patient ${patientName} has completed their account setup and is ready for treatment.`,
            data: {
              entityType: "patient_onboarding",
              entityId: patientId,
              actionUrl: `/dashboard/physiotherapist/patients`,
              metadata: {
                patientName,
              },
            },
          }
        });
      }

      return {
        success: true,
        message: "Patient onboarding completed successfully.",
        patientId: patientId,
      };
    } catch (error) {
      console.error("Error in completePatientOnboardingWithNotification:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "An error occurred while completing onboarding.",
      };
    }
  },
});
