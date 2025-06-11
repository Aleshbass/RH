"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { formatOnboardingCompleteNotification } from "../../../lib/notifications/notificationService";

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
      gender: v.optional(v.union(
        v.literal("male"),
        v.literal("female"),
        v.literal("other"),
        v.literal("prefer_not_to_say")
      )),
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
  handler: async (ctx, args): Promise<{success: boolean; message?: string; patientId?: Id<"users">}> => {
    try {
      // Get the Convex clients
      const client = ctx.runMutation;
      const query = ctx.runQuery;
      
      // Complete the patient onboarding using the base mutation
      const result = await client(api.patientInvitations.completePatientOnboarding, {
        invitationCode: args.invitationCode,
        patientData: args.patientData,
      });
      
      if (!result.success) {
        return result;
      }
      
      // Get details about the invitation and physiotherapist
      const invitationResult = await query(api.patientInvitations.validateInvitationCode, {
        code: args.invitationCode
      });
      
      if (!invitationResult?.valid || !invitationResult?.invitation) {
        return {
          ...result,
          patientId: undefined
        };
      }
      
      // Get the authenticated user (the patient)
      const user = await query(api.users.getMyUser, {});
      if (!user) {
        return {
          ...result,
          patientId: undefined
        };
      }
      
      // Create notification for the patient
      const patientName = `${args.patientData.firstName} ${args.patientData.lastName}`.trim();
      const dashboardLink = '/dashboard/patient';
      
      // Format notification data
      const patientNotification = formatOnboardingCompleteNotification(
        patientName,
        'patient',
        dashboardLink
      );
      
      // Send notification to patient
      await client(api.notifications.create, {
        userId: user._id,
        type: 'onboarding_complete',
        title: patientNotification.title,
        message: patientNotification.message,
        data: patientNotification.data,
        sendEmail: args.sendEmail ?? true
      });
      
      // Get the full invitation with all fields (the validation endpoint returns a simplified view)
      const fullInvitation = await query(api.patientInvitations.getInvitationByCode, {
        code: args.invitationCode
      });
      
      // If we have a valid physiotherapist ID from the full invitation, notify them too
      if (fullInvitation && fullInvitation.physiotherapistId) {
        const physiotherapistId = fullInvitation.physiotherapistId;
        
        // Get physiotherapist details
        const physio = await query(api.users.getUserById, { userId: physiotherapistId });
        const physioName = physio ? `${physio.firstName || ''} ${physio.lastName || ''}`.trim() : 'Your physiotherapist';
        
        // Create notification for the physiotherapist
        await client(api.notifications.create, {
          userId: physiotherapistId,
          type: 'patient_onboarded',
          title: `${patientName} completed onboarding`,
          message: `Your patient ${patientName} has completed their account setup and is ready for treatment.`,
          data: {
            entityType: 'patient_onboarding',
            entityId: user._id.toString(), // Convert ID to string
            actionUrl: `/dashboard/physiotherapist/patients`,
            metadata: {
              patientName
            }
          },
          sendEmail: args.sendEmail ?? true
        });
      }
      
      return {
        success: true,
        message: "Patient onboarding completed successfully.",
        patientId: user._id
      };
      
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "An error occurred while completing onboarding.",
      };
    }
  }
});
