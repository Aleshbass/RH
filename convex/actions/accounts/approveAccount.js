"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api, internal } from "../../_generated/api";

/**
 * Approve a user account and send notification
 */
export const approveAccount = action({
  args: {
    statusId: v.id("accountApprovalStatus"),
    adminUserId: v.id("users"),
    comments: v.optional(v.string()),
    sendEmail: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { statusId, adminUserId, comments, sendEmail = true } = args;

    try {
      // Get account status and user
      const result = await ctx.runQuery(
        api.accountApproval.getStatusAndUser,
        { statusId }
      );
      const accountStatus = result.status;
      const user = result.user;
      if (!accountStatus) {
        throw new Error("Account status not found");
      }
      if (!user) {
        throw new Error("User not found");
      }

      // Update account status
      await ctx.runMutation(
        api.accountApproval.updateStatus,
        {
          statusId,
          status: "approved",
          reviewedBy: adminUserId,
          reviewedAt: Date.now(),
          comments,
        }
      );

      // Create notification for the approved user
      await ctx.runMutation(
        api.notifications.create,
        {
          userId: accountStatus.userId,
          type: "account_approved",
          payload: {
            title: "Account Approved",
            body: "Your account has been approved! You can now access your dashboard.",
            data: {
              entityId: statusId,
              entityType: "account_approval",
              actionUrl: "/dashboard",
              metadata: {
                approvedBy: adminUserId,
                comments: comments || ""
              }
            }
          },
          priority: "high",
        }
      );

      // Send approval email if requested
      if (sendEmail && user.email) {
        const dashboardLink = user.role === 'clinic_owner' ? '/dashboard/clinic' : 
                             user.role === 'physiotherapist' ? '/dashboard/physiotherapist' : 
                             '/dashboard';
        
        // Send approval email
        await ctx.runAction(internal.actions.emails.sendApprovalEmail, {
          userEmail: user.email,
          userName: `${user.firstName} ${user.lastName}`.trim() || user.email,
          userRole: user.role,
          dashboardLink,
          comments: args.comments,
        });
      }

      return { success: true, message: "Account approved successfully" };
    } catch (error) {
      console.error("Error approving account:", error);
      return { success: false, error: String(error) };
    }
  },
});
