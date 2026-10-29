// @ts-nocheck - Disable type checking due to deep type instantiation issues with Convex types
"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { publicAppUrl } from "../../helpers/appUrl";

// Define the return type for the invitation result
type InvitationResult = {
  success: boolean;
  invitationCode?: string;
  invitationId?: string;
  message?: string;
  /** Set when the email already belongs to a Rehabify patient record */
  existingPatientNumber?: string;
};

/** Email a pending invitation again (same link, expiry extended by 7 days). */
export const resendPatientInvitation = action({
  args: { invitationId: v.id("patientInvitations") },
  returns: v.object({ success: v.boolean(), message: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const invite = await ctx.runMutation(api.patientInvitations.preparePatientInvitationResend, {
      invitationId: args.invitationId,
    });
    const sent = await ctx.runAction(internal.actions.emails.sendInvitationEmail.sendPatientInvitationEmail, {
      patientEmail: invite.patientEmail,
      patientName: invite.patientName,
      physiotherapistName: invite.physiotherapistName,
      invitationCode: invite.code,
      invitationLink: `${publicAppUrl().replace(/\/$/, "")}/patient-invite/${invite.code}`,
      expiresAt: invite.expiresAt,
    });
    if (!sent?.success) {
      return { success: false, message: "The email couldn't be sent. Copy the link and send it to the patient instead." };
    }
    return { success: true };
  },
});

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
    source: v.optional(v.union(v.literal("referred"), v.literal("existing_patient"))),
    referredBy: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    invitationCode: v.optional(v.string()),
    invitationId: v.optional(v.string()),
    message: v.optional(v.string()),
    existingPatientNumber: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<InvitationResult> => {
    try {
      // Create the invitation using the base mutation
      const result: InvitationResult = await (ctx.runMutation as any)(api.patientInvitations.createPatientInvitation, {
        patientEmail: args.patientEmail,
        patientName: args.patientName,
        notes: args.notes,
        expirationDays: args.expirationDays,
        source: args.source,
        referredBy: args.referredBy,
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
        // Build invitation link using configured app URL; fallback to production domain
        const envBase = publicAppUrl();
        const baseUrl = envBase.replace(/\/$/, '');
        const invitationLink = `${baseUrl}/patient-invite/${result.invitationCode}`;
        const expiresAt = Date.now() + (args.expirationDays || 7) * 24 * 60 * 60 * 1000;
        
        // A clinic's clinician invites patients to the clinic: the email names it
        const access = (await (ctx.runQuery as any)(api.clinicTools.getMyClinicAccess, {})) as { mode?: string; clinicName?: string } | null;
        const clinicName = access?.mode === 'staff' ? access.clinicName : undefined;

        // Send email using the dedicated email action
        try {
          await ctx.runAction(internal.actions.emails.sendInvitationEmail.sendPatientInvitationEmail, {
            patientEmail: args.patientEmail,
            patientName: args.patientName,
            physiotherapistName,
            clinicName,
            invitationCode: result.invitationCode,
            invitationLink,
            expiresAt,
          });
        } catch (emailError) {
          console.error('Failed to send invitation email:', emailError);
          // Continue - invitation was created, just email failed
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
      
      return result;
    } catch (error) {
      console.error('Error in createPatientInvitationWithNotification:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to create patient invitation",
      };
    }
  },
});
