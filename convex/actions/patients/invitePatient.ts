"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api } from "../../_generated/api";

// Define the return type for the invitation result
type InvitationResult = {
  success: boolean;
  invitationCode?: string;
  message?: string;
  emailSent?: boolean;
  emailError?: string;
};

/**
 * Create a new patient invitation and send notification
 * This action wraps the base createPatientInvitation mutation and sends email to patient
 */
export const createPatientInvitationWithNotification = action({
  args: {
    patientEmail: v.string(),
    patientName: v.optional(v.string()),
    notes: v.optional(v.string()),
    expirationDays: v.optional(v.number()),
    sendEmail: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    invitationCode: v.optional(v.string()),
    message: v.optional(v.string()),
    emailSent: v.optional(v.boolean()),
    emailError: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<InvitationResult> => {
    try {
      // Create the invitation using the base mutation
      const result: InvitationResult = await ctx.runMutation(api.patientInvitations.createPatientInvitation, {
        patientEmail: args.patientEmail,
        patientName: args.patientName,
        notes: args.notes,
        expirationDays: args.expirationDays,
      });
      
      if (!result.success || !result.invitationCode) {
        return result;
      }
      
      // Get the authenticated user (the physiotherapist)
      const user = await ctx.runQuery(api.users.getMyUser, {});
      if (!user) {
        return { success: false, message: "User not found" };
      }
      
      // Get Clerk identity for more complete name information
      const identity = await ctx.auth.getUserIdentity();
      
      // Send email to patient if requested
      let emailSent = false;
      let emailError: string | undefined;
      if (args.sendEmail !== false) { // Default to true
        // Try to get name from multiple sources
        let physiotherapistName = '';
        
        // First try database firstName/lastName
        if (user.firstName || user.lastName) {
          physiotherapistName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        }
        
        // If not available, try Clerk identity
        if (!physiotherapistName && identity) {
          physiotherapistName = identity.name || '';
        }
        
        // Final fallback to email or generic name
        if (!physiotherapistName) {
          physiotherapistName = user.email || 'Your Physiotherapist';
        }
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const invitationLink = `${baseUrl}/patient-invite/${result.invitationCode}`;
        const expiresAt = Date.now() + (args.expirationDays || 7) * 24 * 60 * 60 * 1000;
        
        // Send email using the dedicated email action
        try {
          const emailResult = await ctx.runAction(api.actions.emails.sendInvitationEmail.sendPatientInvitationEmail, {
            patientEmail: args.patientEmail,
            patientName: args.patientName,
            physiotherapistName,
            invitationCode: result.invitationCode,
            invitationLink,
            expiresAt,
          });
          emailSent = Boolean((emailResult as { success?: boolean }).success);
          if (!emailSent) {
            emailError = (emailResult as { error?: string }).error || 'Unknown email error';
          }
        } catch (emailError) {
          const err = emailError as Error;
          console.error('Failed to send invitation email:', err.message);
          emailSent = false;
          emailError = err.message;
        }
      }
      
      // Create notification for the physiotherapist
      await ctx.runMutation(api.notifications.create, {
          userId: user._id,
          type: 'invitation_created',
          priority: 'medium',
          payload: {
            title: 'Patient Invitation Sent',
            body: `Invitation sent to ${args.patientName || args.patientEmail}`,
            data: {
              entityId: result.invitationCode,
              entityType: 'invitation',
              actionUrl: '/dashboard/physiotherapist/patients',
              metadata: {
                patientEmail: args.patientEmail,
                patientName: args.patientName
              }
            }
          }
        });
      
      return { ...result, emailSent };
    } catch (error) {
      const err = error as Error;
      console.error('Error in createPatientInvitationWithNotification:', err.message);
      return {
        success: false,
        message: err.message || "Failed to create patient invitation",
      };
    }
  },
});
