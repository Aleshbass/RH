// @ts-nocheck
/**
 * Quick enable marketplace for approved physiotherapists
 * Simple public mutation approach
 */

import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { ensureUserRole } from "../auth";

export const enableAllApprovedPhysios = mutation({
  handler: async (ctx) => {
    // Changes every approved physiotherapist's marketplace profile: admins only.
    await ensureUserRole(ctx, ["admin"]);
    // Get all approved physiotherapists
    const approvals = await ctx.db
      .query("accountApprovalStatus")
      .filter((q) => q.eq(q.field("status"), "approved"))
      .collect();
    
    let updated = 0;
    let skipped = 0;

    for (const approval of approvals) {
      // Get user to verify they're a physiotherapist
      const user = await ctx.db.get(approval.userId);
      if (!user || user.role !== "physiotherapist") {
        skipped++;
        continue;
      }

      // Get their profile
      const profile = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", approval.userId))
        .first();

      if (!profile) {
        skipped++;
        continue;
      }

      // Only update if not already enabled
      if (profile.isAvailableOnMarketplace !== true) {
        await ctx.db.patch(profile._id, {
          isAvailableOnMarketplace: true,
          profileViews: profile.profileViews || 0,
          bookingsThroughMarketplace: profile.bookingsThroughMarketplace || 0,
          totalMarketplaceEarnings: profile.totalMarketplaceEarnings || 0,
          averageRating: profile.averageRating || 0,
          reviewCount: profile.reviewCount || 0,
          verificationBadge: profile.verificationBadge || { status: "none" },
        });
        updated++;
      } else {
        skipped++;
      }
    }

    return {
      success: true,
      updated,
      skipped,
      message: `Enabled ${updated} profiles, skipped ${skipped}`,
    };
  },
});

export const enableSingleProfile = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    // Get user to verify they're a physiotherapist
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "physiotherapist") {
      return { success: false };
    }

    // Get their profile
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    if (!profile) {
      return { success: false };
    }

    // Update profile
    await ctx.db.patch(profile._id, {
      isAvailableOnMarketplace: true,
      profileViews: profile.profileViews || 0,
      bookingsThroughMarketplace: profile.bookingsThroughMarketplace || 0,
      totalMarketplaceEarnings: profile.totalMarketplaceEarnings || 0,
      averageRating: profile.averageRating || 0,
      reviewCount: profile.reviewCount || 0,
      verificationBadge: profile.verificationBadge || { status: "none" },
    });

    return { success: true };
  },
});
