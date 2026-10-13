"use node"

import { v } from "convex/values";
import { action, internalAction } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { formatAccountDeclinedNotification } from "../../../lib/notifications/notificationService";
import type { ActionCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";



/**
 * Decline a user account and send notification
 * This action is called by an admin to decline a user account application with reason and required documents
 */
export const declineAccount = internalAction({
  args: {
    statusId: v.id("accountApprovalStatus"),
    adminUserId: v.id("users"),
    reason: v.string(),
    requiredDocuments: v.optional(v.array(v.string())),
    sendEmail: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      const { statusId, adminUserId, reason, requiredDocuments } = args;
      
      // Verify admin exists
      const admin = await ctx.runQuery(api.users.getUserById as any, { userId: adminUserId }) as {
        _id: Id<"users">; clerkId: string; email?: string; firstName?: string; lastName?: string; role?: "physiotherapist" | "clinic_owner" | "patient" | "family_member" | "admin"; onboarded: boolean;
      } | null;
      if (!admin || admin.role !== "admin") {
        throw new Error("Unauthorized: Only admins can decline accounts");
      }
      
      // Get the status
      const status = await ctx.runQuery(api.accountApproval.getStatusById as any, { statusId }) as {
        _id: Id<"accountApprovalStatus">; userId: Id<"users">; status: "pending_review" | "approved" | "declined"; submittedAt: number; reviewedAt?: number; reviewedBy?: Id<"users">; comments?: string;
      } | null;
      if (!status) {
        throw new Error(`Account approval status with ID ${statusId} not found`);
      }
      
      // Get the user
      const user = await ctx.runQuery(api.users.getUserById as any, { userId: status.userId }) as {
        _id: Id<"users">; clerkId: string; email?: string; firstName?: string; lastName?: string; role?: "physiotherapist" | "clinic_owner" | "patient" | "family_member" | "admin"; onboarded: boolean;
      } | null;
      if (!user) {
        throw new Error(`User with ID ${status.userId} not found`);
      }
      
      // Update the status
      await ctx.runMutation(api.accountApproval.updateStatus, {
        statusId,
        status: "declined",
        reviewedBy: adminUserId,
        reviewedAt: Date.now(),
        comments: reason,
        requiredDocuments,
      });
      
      // Support link for declined users
      const supportLink = "/support/account";
      
      // Create notification for the user
      const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User';
      
      const notificationData = formatAccountDeclinedNotification(
        userName,
        reason,
        requiredDocuments || [],
        supportLink
      );
      
      // Send notification
      await ctx.runMutation(api.notifications.create, {
        userId: status.userId,
        type: 'account_declined',
        priority: 'high',
        payload: {
          title: notificationData.title,
          body: notificationData.message,
          data: notificationData.data,
        },
      });
      
      // Send decline email if requested
      if (args.sendEmail !== false && user.email) {
        // Send email
        await ctx.runAction(internal.actions.emails.sendDeclineEmail as any, {
          userEmail: user.email!,
          userName,
          userRole: user.role!,
          reason,
          supportLink,
          requiredDocuments: requiredDocuments || [],
        }) as { success: boolean; messageId?: string; error?: string };
      }
      
      return { success: true, message: "Account declined successfully" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "An error occurred while declining the account",
      };
    }
  },
});
