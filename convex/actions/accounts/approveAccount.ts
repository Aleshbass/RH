"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

// Alias Convex mutation functions to prevent deep type instantiation
// @ts-expect-error TS deep instantiation workaround
const updateAccountStatus: any = api.accountApproval.updateStatus;
const createNotification: any = api.notifications.create;
const getAccountStatus: any = api.accountApproval.getStatusById;
const getUser: any = api.users.getUserById;

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
  handler: async (ctx, args) => {
    const { statusId, adminUserId, comments, sendEmail = true } = args;

    try {
      // Get the account status to find the user
      const accountStatus = await ctx.runQuery(getAccountStatus, { statusId });
      if (!accountStatus) {
        throw new Error("Account status not found");
      }

      // Get user details
      const user = await ctx.runQuery(getUser, { userId: accountStatus.userId });
      if (!user) {
        throw new Error("User not found");
      }

      // Update account status
      await ctx.runMutation(updateAccountStatus, {
        statusId,
        status: "approved",
        reviewedBy: adminUserId,
        reviewedAt: Date.now(),
        comments,
      });

      // Create notification for the approved user
      await ctx.runMutation(createNotification, {
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
      });

      // Send approval email if requested
      if (sendEmail && user.email) {
        const dashboardLink = user.role === 'clinic_owner' ? '/dashboard/clinic-owner' : 
                             user.role === 'physiotherapist' ? '/dashboard/physiotherapist' : 
                             '/dashboard';
        
        // @ts-expect-error TS deep instantiation workaround
        await ctx.runAction(internal.actions.emails.sendApprovalEmail, {
          userEmail: user.email,
          userName: `${user.firstName} ${user.lastName}`,
          userRole: user.role,
          dashboardLink,
          comments,
        });
      }

      return { success: true, message: "Account approved successfully" };
    } catch (error) {
      console.error("Error approving account:", error);
      return { success: false, error: String(error) };
    }
  },
});
