"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api } from "../../_generated/api";
import { formatAccountDeclinedNotification } from "../../../lib/notifications/notificationService";

/**
 * Decline a user account and send notification
 * This action is called by an admin to decline a user account application with reason and required documents
 */
export const declineAccount = action({
  args: {
    statusId: v.id("accountApprovalStatus"),
    adminUserId: v.id("users"),
    reason: v.string(),
    requiredDocuments: v.optional(v.array(v.string())),
    sendEmail: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      const { statusId, adminUserId, reason, requiredDocuments } = args;
      
      // Get the convex clients
      const client = ctx.runMutation;
      const query = ctx.runQuery;
      
      // Verify admin exists
      const admin = await query(api.users.getUserById, { userId: adminUserId });
      if (!admin || admin.role !== "admin") {
        throw new Error("Unauthorized: Only admins can decline accounts");
      }
      
      // Get the status
      const status = await query(api.accountApproval.getStatusById, { statusId });
      if (!status) {
        throw new Error(`Account approval status with ID ${statusId} not found`);
      }
      
      // Get the user
      const user = await query(api.users.getUserById, { userId: status.userId });
      if (!user) {
        throw new Error(`User with ID ${status.userId} not found`);
      }
      
      // Update the status
      await client(api.accountApproval.updateStatus, {
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
      await client(api.notifications.create, {
        userId: status.userId,
        type: 'account_declined',
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data,
        sendEmail: args.sendEmail ?? true
      });
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "An error occurred while declining the account",
      };
    }
  },
});
