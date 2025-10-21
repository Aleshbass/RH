// @ts-nocheck
/**
 * Marketplace Migration Scripts
 * One-time mutations to set up marketplace for existing users
 */

import { mutation, internalMutation } from "../_generated/server";

/**
 * Auto-enable marketplace for all approved physiotherapists
 * Run this once to migrate existing approved users to marketplace
 */
export const enableMarketplaceForApprovedPhysios = mutation({
  handler: async (ctx) => {
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

      // Only update if not already set
      if (profile.isAvailableOnMarketplace !== true) {
        await ctx.db.patch(profile._id, {
          isAvailableOnMarketplace: true,
          // Initialize marketplace fields if not present
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
      message: `Updated ${updated} profiles, skipped ${skipped}`,
    };
  },
});

/**
 * Initialize default marketplace settings for a single physiotherapist
 */
export const initializeMarketplaceProfile = internalMutation({
  handler: async (ctx, { userId }: { userId: string }) => {
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", userId as any))
      .first();

    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    // Check if approved
    const approval = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", userId as any))
      .first();

    const isApproved = approval?.status === "approved";

    await ctx.db.patch(profile._id, {
      isAvailableOnMarketplace: isApproved,
      profileViews: profile.profileViews || 0,
      bookingsThroughMarketplace: profile.bookingsThroughMarketplace || 0,
      totalMarketplaceEarnings: profile.totalMarketplaceEarnings || 0,
      averageRating: profile.averageRating || 0,
      reviewCount: profile.reviewCount || 0,
      verificationBadge: profile.verificationBadge || { status: "none" },
    });

    return { success: true, isApproved };
  },
});
