// @ts-nocheck
"use node";

import { v } from "convex/values";
import { action, internalAction } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { sendEmail } from "../../../lib/email/emailService";
import { publicAppUrl } from "../../helpers/appUrl";

/**
 * Accept staff invitation with notification and logging
 */
export const acceptStaffInvitationWithNotification = action({
  args: {
    code: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      const appUrl = publicAppUrl();
      
      // Accept the invitation using the base mutation
      const result = await ctx.runMutation(api.clinics.acceptClinicInvitation, {
        code: args.code,
      }) as any; // Avoid deep type instantiation

      if (!result?.success) {
        return {
          success: false,
          message: result?.message || 'Failed to accept invitation',
        };
      }

      // Get invitation details for notification
      const invitation = await ctx.runQuery(api.clinics.getInvitationByCode, {
        code: args.code,
      });

      if (invitation) {
        // Send welcome email to the new staff member
        try {
          await sendEmail({
            to: invitation.inviteeEmail,
            template: 'ACCOUNT_APPROVED',
            data: {
              userName: invitation.inviteeName || 'Team Member',
              userRole: invitation.role.replace('_', ' '),
              clinicName: invitation.clinic?.name,
              // Everyone who joins a clinic team starts in that clinic's dashboard
              dashboardLink: `${appUrl}/dashboard/clinic`,
            },
          });
        } catch (emailError) {
          console.error('Failed to send welcome email:', emailError);
          // Don't fail the entire operation if email fails
        }

        // Notify the clinic owner that the invitation was accepted (owner email)
        try {
          const clinicOwner = await ctx.runQuery(api.users.getUserById, {
            userId: invitation.clinicOwnerId,
          });

          if (clinicOwner?.email) {
            const staffLink = `${appUrl}/dashboard/clinic/staff`;
            await ctx.runAction(internal.actions.emails.sendClinicStaffInviteOwnerAcceptedEmail.sendClinicStaffInviteOwnerAcceptedEmail, {
              to: clinicOwner.email,
              clinicOwnerName: `${clinicOwner.firstName || ''} ${clinicOwner.lastName || ''}`.trim() || clinicOwner.email,
              inviteeName: invitation.inviteeName || 'Team Member',
              clinicName: invitation.clinic?.name,
              staffLink,
              subject: `Staff Invitation Accepted`,
            });
          }
        } catch (ownerEmailErr) {
          console.error('Failed to send owner accepted notification email:', ownerEmailErr);
        }
      }

      return {
        success: true,
        message: 'Invitation accepted successfully! Welcome to the team.',
      };
    } catch (error) {
      console.error('Accept staff invitation error:', error);
      // Show the readable reason (wrong email, expired, already used...) instead of a generic failure
      return {
        success: false,
        message:
          typeof error?.data === 'string' ? error.data : 'Could not accept the invitation. Please try again.',
      };
    }
  },
});

/**
 * Decline staff invitation with notification and logging
 */
export const declineStaffInvitationWithNotification = action({
  args: {
    code: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      // Get invitation details before declining
      const invitation = await ctx.runQuery(api.clinics.getInvitationByCode, {
        code: args.code,
      });

      if (!invitation) {
        return {
          success: false,
          message: 'Invitation not found or already processed',
        };
      }

      // Decline the invitation using the base mutation
      const result = await ctx.runMutation(api.clinics.declineClinicInvitation, {
        code: args.code,
      }) as any; // Avoid deep type instantiation

      if (!result?.success) {
        return {
          success: false,
          message: result?.message || 'Failed to decline invitation',
        };
      }

      // Notify clinic owner about the decline (owner email)
      try {
        const clinicOwner = await ctx.runQuery(api.users.getUserById, {
          userId: invitation.clinicOwnerId,
        });

        if (clinicOwner?.email) {
          const appUrl = publicAppUrl();
          const staffLink = `${appUrl}/dashboard/clinic/staff`;
          await ctx.runAction(internal.actions.emails.sendClinicStaffInviteOwnerDeclinedEmail.sendClinicStaffInviteOwnerDeclinedEmail, {
            to: clinicOwner.email,
            clinicOwnerName: `${clinicOwner.firstName || ''} ${clinicOwner.lastName || ''}`.trim() || clinicOwner.email,
            inviteeName: invitation.inviteeName || 'Team Member',
            clinicName: invitation.clinic?.name,
            staffLink,
            subject: `Staff Invitation Declined`,
          });
        }
      } catch (emailError) {
        console.error('Failed to send owner decline notification email:', emailError);
        // Don't fail the entire operation if email fails
      }

      return {
        success: true,
        message: 'Invitation declined successfully.',
      };
    } catch (error) {
      console.error('Decline staff invitation error:', error);
      return {
        success: false,
        message: 'Failed to decline invitation. Please try again.',
      };
    }
  },
});

/**
 * Create staff member directly with welcome email
 */
export const createStaffDirectWithWelcome = internalAction({
  args: {
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    role: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    staffId: v.optional(v.id("users")),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      // Create staff member using the base mutation
      const result = await ctx.runMutation(api.clinics.createStaffDirect, args) as any;

      if (!result?.success || !result.staffId) {
        return {
          success: false,
          message: result?.message || 'Failed to create staff member',
        };
      }

      // Send welcome email
      try {
        const staffName = `${args.firstName || ''} ${args.lastName || ''}`.trim() || 'Team Member';
        
        await sendEmail({
          to: args.email,
          template: 'ACCOUNT_APPROVED',
          data: {
            userName: staffName,
            userRole: args.role.replace('_', ' '),
            dashboardLink: `${publicAppUrl()}/dashboard/${args.role === 'physiotherapist' ? 'physiotherapist' : 'clinic'}`,
          },
        });
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail the entire operation if email fails
      }

      return {
        success: true,
        staffId: result.staffId,
        message: 'Staff member created successfully! Welcome email sent.',
      };
    } catch (error) {
      console.error('Create staff direct error:', error);
      return {
        success: false,
        message: 'Failed to create staff member. Please try again.',
      };
    }
  },
});
