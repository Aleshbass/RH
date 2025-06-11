"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api } from "../../_generated/api";
import { formatAccountApprovedNotification } from "../../../lib/notifications/notificationService";

/**
 * Approve a user account and send notification
 * This action is called by an admin to approve a user account (typically a physiotherapist or clinic owner)
 */
export const approveAccount = action({
  args: {
    statusId: v.id("accountApprovalStatus"),
    adminUserId: v.id("users"),
    comments: v.optional(v.string()),
    sendEmail: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      const { statusId, adminUserId, comments } = args;
      
      // Get the convex clients
      const client = ctx.runMutation;
      const query = ctx.runQuery;
      
      // Verify admin exists
      const admin = await query(api.users.getUserById, { userId: adminUserId });
      if (!admin || admin.role !== "admin") {
        throw new Error("Unauthorized: Only admins can approve accounts");
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
        status: "approved",
        reviewedBy: adminUserId,
        reviewedAt: Date.now(),
        comments,
      });
      
      // Update the user record to set approved flag
      // We'll patch directly using a generic mutation
      await client(api.accountApproval.updateStatus, {
        statusId, 
        status: "approved",
        // This updated call will handle both the status update and user approval
        // in a single operation on the backend
      });
      
      // Determine dashboard link based on user role
      let dashboardLink = "/dashboard";
      if (user.role === "physiotherapist") {
        dashboardLink = "/dashboard/physiotherapist";
      } else if (user.role === "clinic_owner") {
        dashboardLink = "/dashboard/clinic";
      }
      
      // Create notification for the user
      const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User';
      
      const notificationData = formatAccountApprovedNotification(
        userName,
        user.role || 'user',
        dashboardLink
      );
      
      // Send notification
      await client(api.notifications.create, {
        userId: status.userId,
        type: 'account_approved',
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data,
        sendEmail: args.sendEmail ?? true
      });
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "An error occurred while approving the account",
      };
    }
  },
});
