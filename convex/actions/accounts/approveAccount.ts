"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

// Alias Convex mutation functions to prevent deep type instantiation
// @ts-expect-error TS deep instantiation workaround
const updateAccountStatus: any = api.accountApproval.updateStatus;
const createNotification: any = api.notifications.create;

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
    const { statusId, adminUserId, comments } = args;

    const result1 = await ctx.runMutation(updateAccountStatus, {
      statusId,
      status: "approved",
      reviewedBy: adminUserId,
      reviewedAt: Date.now(),
      comments,
    });

    const result2 = await ctx.runMutation(createNotification, {
      userId: adminUserId,
      type: "account_approved",
      payload: {
        title: "Account Approved",
        body: "The account has been approved successfully.",
        data: {},
        link: "/dashboard",
      },
      priority: "high",
    });

    return { success: true };
  },
});
