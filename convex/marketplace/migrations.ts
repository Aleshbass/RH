// @ts-nocheck
/**
 * Marketplace Migration Scripts
 * Sets isAvailableOnMarketplace = true for all physiotherapist profiles
 */

import { mutation, internalMutation } from "../_generated/server";

/**
 * Enable marketplace for all physiotherapist profiles in the database.
 * Strictly sets isAvailableOnMarketplace = true on existing profiles.
 */
export const enableMarketplaceForAllPhysios = mutation({
  handler: async (ctx) => {
    const allProfiles = await ctx.db.query("physiotherapistProfiles").collect();

    let updated = 0;
    let alreadyEnabled = 0;

    for (const profile of allProfiles) {
      const needsUpdate =
        profile.isAvailableOnMarketplace !== true ||
        profile.offersInPersonSessions !== true ||
        profile.offersOnlineSessions !== true;

      if (needsUpdate) {
        await ctx.db.patch(profile._id, {
          isAvailableOnMarketplace: true,
          offersInPersonSessions: true,
          offersOnlineSessions: true,
          profileViews: profile.profileViews || 0,
          bookingsThroughMarketplace: profile.bookingsThroughMarketplace || 0,
          totalMarketplaceEarnings: profile.totalMarketplaceEarnings || 0,
          averageRating: profile.averageRating || 0,
          reviewCount: profile.reviewCount || 0,
          verificationBadge: profile.verificationBadge || { status: "none" },
        });
        updated++;
      } else {
        alreadyEnabled++;
      }
    }

    return {
      success: true,
      totalProfiles: allProfiles.length,
      updated,
      alreadyEnabled,
      message: `Updated ${updated} profiles to availability defaults (${alreadyEnabled} were already up to date).`,
    };
  },
});

/**
 * Explicit mutation name for backfilling physio availability defaults
 */
export const backfillPhysioDefaults = enableMarketplaceForAllPhysios;

/**
 * Backwards-compatible alias for admin dashboard migration button
 */
export const enableMarketplaceForApprovedPhysios = enableMarketplaceForAllPhysios;

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
