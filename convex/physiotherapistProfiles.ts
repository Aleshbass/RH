import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Update video platform preference for physiotherapist
 */
export const updateVideoPlatformPreference = mutation({
  args: {
    platform: v.union(v.literal("stream"), v.literal("google_meet")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    if (user.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can set video platform preferences");
    }

    if (!user.physiotherapistProfileId) {
      throw new Error("Physiotherapist profile not found");
    }

    // Update the physiotherapist profile
    await ctx.db.patch(user.physiotherapistProfileId, {
      videoPlatformPreference: args.platform,
    });

    return {
      success: true,
      platform: args.platform,
    };
  },
});

/**
 * Get video platform preference for physiotherapist
 */
export const getVideoPlatformPreference = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "physiotherapist" || !user.physiotherapistProfileId) {
      return null;
    }

    const profile = await ctx.db.get(user.physiotherapistProfileId);
    return profile?.videoPlatformPreference || "stream";
  },
});
