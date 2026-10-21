// @ts-nocheck - Disable type checking due to deep type instantiation issues with Convex types

"use node";

import { ConvexError, v } from "convex/values";
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
      // Fetch invitation context BEFORE completing onboarding, so we can still read it even after status turns 'accepted'
      let physiotherapistIdForNotif: Id<"users"> | undefined = undefined;
      try {
        const invitationCtx: any = await ctx.runQuery(
          api.patientInvitations.getInvitationByCode,
          { code: args.invitationCode }
        );
        if (invitationCtx?.valid && invitationCtx?.physiotherapist?._id) {
          physiotherapistIdForNotif = invitationCtx.physiotherapist._id as Id<"users">;
        }
      } catch (_e) {
        // Ignore, we'll proceed without physio notification if unavailable
      }

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

      const patientName = `${args.patientData.firstName} ${args.patientData.lastName}`.trim();

      // Send notification to patient (in-app + email)
      // @ts-ignore - Convex deep type inference
      await ctx.runMutation(api.notifications.sendNotificationWithFallback, {
        userId: patientId,
        type: "onboarding_complete",
        title: "Welcome to Rehabify!",
        message: `Your onboarding is complete, ${patientName}. You can now access your patient dashboard.`,
        data: {
          entityType: "user",
          entityId: String(patientId),
          actionUrl: "/dashboard/patient",
          metadata: {
            role: "patient",
          },
        },
        sendEmail: true,
        retryOnFailure: true,
        maxRetries: 3,
      });

      if (physiotherapistIdForNotif) {
        const physiotherapistId = physiotherapistIdForNotif;

        // Notify the physiotherapist (in-app + email via fallback processor)
        // Use the consolidated sendNotificationWithFallback to also schedule email processing
        // @ts-ignore - Complex Convex type inference
        await ctx.runMutation(api.notifications.sendNotificationWithFallback, {
          userId: physiotherapistId,
          type: "patient_onboarded",
          title: `${patientName} completed onboarding`,
          message: `Your patient ${patientName} has completed their account setup and is ready for treatment.`,
          data: {
            entityType: "patient_onboarding",
            entityId: String(patientId),
            actionUrl: `/dashboard/physiotherapist/patients`,
            metadata: {
              patientName,
            },
          },
          sendEmail: true,
          retryOnFailure: true,
          maxRetries: 3,
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
        // ConvexError carries the user-facing reason in .data
        message:
          error instanceof ConvexError && typeof error.data === "string"
            ? error.data
            : error instanceof Error
              ? error.message
              : "An error occurred while completing onboarding.",
      };
    }
  },
});
