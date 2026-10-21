// @ts-nocheck
"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { publicAppUrl } from "../../helpers/appUrl";

/**
 * Base URL for the invitation link. The browser sends its own origin, but only our app
 * host (or localhost while developing) is accepted, so a link in an email sent from our
 * domain can never point somewhere else.
 */
function invitationBaseUrl(origin?: string): string {
  const appBase = publicAppUrl().replace(/\/$/, '');
  if (!origin) return appBase;
  try {
    const url = new URL(origin);
    const appHost = new URL(appBase).hostname;
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if ((url.protocol === 'https:' && url.hostname === appHost) || isLocal) return url.origin;
  } catch {
    // fall through to the configured app URL
  }
  return appBase;
}

/**
 * Create a clinic staff invitation, send email, and create a notification
 */
export const createClinicStaffInvitationWithNotification = action({
  args: {
    inviteeEmail: v.string(),
    inviteeName: v.optional(v.string()),
    message: v.optional(v.string()),
    expirationDays: v.optional(v.number()),
    sendEmail: v.optional(v.boolean()),
    origin: v.optional(v.string()),
    staffType: v.optional(v.union(v.literal("clinician"), v.literal("front_desk"))),
    clinicRoleId: v.optional(v.id("clinicRoles")),
  },
  returns: v.object({
    success: v.boolean(),
    code: v.optional(v.string()),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      // Create the invitation using the base mutation
      let result;
      try {
        result = await ctx.runMutation(api.clinics.invitePhysiotherapist, {
          inviteeEmail: args.inviteeEmail,
          inviteeName: args.inviteeName,
          message: args.message,
          staffType: args.staffType,
          clinicRoleId: args.clinicRoleId,
        }) as { success: boolean; invitationId?: string; code?: string; message?: string };
      } catch (mutationError) {
        // Return the readable reason (ConvexError data) rather than a generic failure
        return {
          success: false,
          message:
            typeof mutationError?.data === 'string'
              ? mutationError.data
              : mutationError instanceof Error ? mutationError.message : 'Failed to create invitation',
        };
      }

      if (!result?.success || !result.code) {
        return {
          success: false,
          message: result?.message || 'Failed to create invitation',
        };
      }

      // Get the authenticated user (clinic owner)
      const user = await ctx.runQuery(api.users.getMyUser, {});
      const identity = await ctx.auth.getUserIdentity();

      // Derive clinic owner name
      let clinicOwnerName = '';
      if (user?.firstName || user?.lastName) {
        clinicOwnerName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
      }
      if (!clinicOwnerName && identity) {
        clinicOwnerName = identity.name || '';
      }
      if (!clinicOwnerName) {
        clinicOwnerName = user?.email || 'Clinic Owner';
      }

      // Fetch invitation details to get expiresAt and clinic info
      let expiresAt = Date.now() + ((args.expirationDays || 7) * 24 * 60 * 60 * 1000);
      let clinicName: string | undefined = undefined;
      try {
        const invitation = await ctx.runQuery(api.clinics.getInvitationByCode, { code: result.code });
        if (invitation) {
          expiresAt = invitation.expiresAt;
          clinicName = invitation.clinic?.name;
        }
      } catch (e) {
        // ignore and use defaults
      }

      // Send email if requested (default true)
      if (args.sendEmail !== false) {
        const baseUrl = invitationBaseUrl(args.origin);
        const invitationLink = `${baseUrl}/staff-invite/${result.code}`;

        try {
          await ctx.runAction(
            internal.actions.emails.sendClinicStaffInvitationEmail.sendClinicStaffInvitationEmail,
            {
              inviteeEmail: args.inviteeEmail,
              inviteeName: args.inviteeName,
              clinicOwnerName,
              clinicName,
              invitationCode: result.code,
              invitationLink,
              expiresAt,
              message: args.message,
            }
          );
        } catch (emailError) {
          console.error('Failed to send clinic staff invitation email:', emailError);
        }
      }


      try {
        if (user?._id) {
          await ctx.runMutation(api.notifications.create, {
            userId: user._id,
            type: 'invitation_created',
            priority: 'medium',
            payload: {
              title: 'Staff Invitation Sent',
              body: `Invitation sent to ${args.inviteeName || args.inviteeEmail}`,
              data: {
                entityId: result.code,
                entityType: 'clinic_staff_invitation',
                actionUrl: '/dashboard/clinic/staff',
                metadata: {
                  inviteeEmail: args.inviteeEmail,
                  inviteeName: args.inviteeName,
                }
              }
            }
          });
        }
      } catch (notifError) {
        console.error('Failed to create notification for clinic owner:', notifError);
      }

      return {
        success: true,
        code: result.code,
        message: result.message,
      };
    } catch (error) {
      console.error('Error in createClinicStaffInvitationWithNotification:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create clinic staff invitation',
      };
    }
  }
});

/**
 * Resend a pending clinic staff invitation (sends reminder email)
 */
export const resendClinicStaffInvitation = action({
  args: {
    inviteeEmail: v.string(),
    inviteeName: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    code: v.optional(v.string()),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      // Get current user for display name
      const user = await ctx.runQuery(api.users.getMyUser, {});
      const identity = await ctx.auth.getUserIdentity();
      let clinicOwnerName = '';
      if (user?.firstName || user?.lastName) {
        clinicOwnerName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
      }
      if (!clinicOwnerName && identity) {
        clinicOwnerName = identity.name || '';
      }
      if (!clinicOwnerName) {
        clinicOwnerName = user?.email || 'Clinic Owner';
      }

      // Find existing pending invitation for this email
      const invitations = await ctx.runQuery(api.clinics.getClinicInvitations, {});
      const invitation = (invitations || []).find(
        (i: any) =>
          i?.status === 'pending' &&
          typeof i?.inviteeEmail === 'string' &&
          i.inviteeEmail.toLowerCase() === args.inviteeEmail.toLowerCase()
      );

      if (!invitation) {
        return {
          success: false,
          message: 'No pending invitation found for this email.',
        };
      }

      // Resending renews the link for another 7 days, so an invite that lapsed works again
      const { expiresAt } = await ctx.runMutation(api.clinics.extendClinicStaffInvitation, {
        invitationId: invitation._id,
      });
      const fullInvitation = await ctx.runQuery(api.clinics.getInvitationByCode, { code: invitation.code });
      const clinicName = fullInvitation?.clinic?.name as string | undefined;

      // Use env-based domain for staff invitation reminder links
      const envBase = publicAppUrl();
      const baseUrl = envBase.replace(/\/$/, '');
      const invitationLink = `${baseUrl}/staff-invite/${invitation.code}`;

      // Send reminder email (to the address stored on the clinic's own invitation)
      await ctx.runAction(
        internal.actions.emails.sendClinicStaffInvitationEmail.sendClinicStaffInvitationReminderEmail,
        {
          inviteeEmail: invitation.inviteeEmail,
          inviteeName: args.inviteeName ?? invitation.inviteeName,
          clinicOwnerName,
          clinicName,
          invitationCode: invitation.code,
          invitationLink,
          expiresAt,
        }
      );

      return {
        success: true,
        code: invitation.code,
        message: 'Invitation reminder sent',
      };
    } catch (error) {
      console.error('Error in resendClinicStaffInvitation:', error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Failed to resend clinic staff invitation',
      };
    }
  },
});
