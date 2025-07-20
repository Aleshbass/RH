"use node";

import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

export const completePatientOnboarding = action({
  args: {
    // We can add any specific args needed from the client here.
    // For now, it will get the user from the auth context.
  },
  returns: v.object({
    success: v.boolean(),
    userId: v.id("users"),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("User not authenticated.");
    }
    const { subject: clerkId, name, email } = identity;

    // 1. Sync user data with Clerk using function aliasing
    const storeUserFn: any = api.users.storeUserFromClerk;
    const userId: any = await ctx.runMutation(storeUserFn, {
      clerkId,
      email: email!,
      firstName: name || "New",
      lastName: "User",
    });

    // 2. Send notification to admins using function aliasing
    const createNotificationFn: any = api.notifications.create;
    await ctx.runMutation(createNotificationFn, {
      type: 'onboarding_complete',
      userId,
      priority: 'medium',
      payload: {
        title: 'New Patient Onboarding Complete',
        body: `${name || email} has completed their onboarding.`,
        data: {
          actionUrl: `/admin/users/${userId}`,
          entityType: 'user',
          entityId: userId
        }
      }
    });
    
    // We can return any data the client might need
    return { success: true, userId };
  },
}); 