// @ts-nocheck
"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api } from "../../_generated/api";
import { sendEmail } from "../../../lib/email/emailService";

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
              dashboardLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${invitation.role === 'physiotherapist' ? 'physiotherapist' : 'clinic'}`,
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
            const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://physioaroundme.com').replace(/\/$/, '');
            const staffLink = `${appUrl}/dashboard/clinic/staff`;
            await ctx.runAction((api as any).actions.emails.sendClinicStaffInviteOwnerAcceptedEmail, {
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
      return {
        success: false,
        message: 'Failed to accept invitation. Please try again.',
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
          const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://physioaroundme.com').replace(/\/$/, '');
          const staffLink = `${appUrl}/dashboard/clinic/staff`;
          await ctx.runAction((api as any).actions.emails.sendClinicStaffInviteOwnerDeclinedEmail, {
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
export const createStaffDirectWithWelcome = action({
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
            dashboardLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${args.role === 'physiotherapist' ? 'physiotherapist' : 'clinic'}`,
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
