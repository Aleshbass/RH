"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api } from "../../_generated/api";
import { formatInvitationCreatedNotification } from "../../../lib/notifications/notificationService";

/**
 * Create a new patient invitation and send notification
 * This action wraps the base createPatientInvitation mutation and adds notification sending
 */
// Define the return type to avoid circular references
type InvitationResult = {
  success: boolean;
  invitationCode?: string;
  invitationId?: string;
  message?: string;
};

export const createPatientInvitationWithNotification = action({
  args: {
    patientEmail: v.optional(v.string()),
    patientName: v.optional(v.string()),
    notes: v.optional(v.string()),
    expirationDays: v.optional(v.number()),
    sendEmail: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<InvitationResult> => {
    try {
      // Get Convex clients
      const client = ctx.runMutation;
      const query = ctx.runQuery;
      
      // Create the invitation using the base mutation
      const result: InvitationResult = await client(api.patientInvitations.createPatientInvitation, args);
      
      if (!result.success || !result.invitationCode) {
        return result;
      }
      
      // Get the authenticated user (the physiotherapist)
      const user = await query(api.users.getMyUser, {});
      if (!user) {
        return result;
      }
      
      // Get the invitation details
      const invitation = await query(api.patientInvitations.validateInvitationCode, {
        code: result.invitationCode,
      });
      
      if (!invitation?.valid || !invitation?.invitation) {
        return result;
      }
      
      // Create notification for the physiotherapist
      if (user._id) {
        const invitationUrl = result.invitationCode ? 
          `/invitation/${result.invitationCode}` : 
          '/dashboard/physiotherapist/patients';
          
        const physiotherapistName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Physiotherapist';
        const patientName = args.patientName || args.patientEmail || 'Patient';
        
        // Format notification data with all required parameters
        const notificationData = formatInvitationCreatedNotification(
          patientName,
          args.patientEmail || '',
          physiotherapistName,
          result.invitationCode || '',
          invitationUrl,
          // Expiration date (default to 7 days from now if not specified)
          Date.now() + (args.expirationDays || 7) * 24 * 60 * 60 * 1000
        );
        
        // Send notification to the physiotherapist
        await client(api.notifications.create, {
          userId: user._id,
          type: 'invitation_created',
          title: notificationData.title,
          message: notificationData.message,
          data: {
            entityId: result.invitationCode,
            entityType: 'invitation',
            actionUrl: invitationUrl,
            metadata: {
              patientEmail: args.patientEmail,
              patientName: args.patientName
            }
          },
          sendEmail: args.sendEmail ?? false
        });
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "An error occurred while creating the patient invitation.",
      };
    }
  },
});
