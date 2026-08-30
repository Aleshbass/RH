// @ts-nocheck
/**
 * Marketplace Migration Scripts
 * Mutations to enable and configure marketplace for all physiotherapists
 */

import { mutation, internalMutation } from "../_generated/server";

/**
 * Auto-enable marketplace for ALL physiotherapists in the database.
 * 1. Finds all users with role == "physiotherapist"
 * 2. Auto-creates physiotherapistProfiles if missing
 * 3. Sets isAvailableOnMarketplace = true
 * 4. Auto-generates unique bookingSlug if missing
 * 5. Approves accountApprovalStatus if missing or not approved
 */
export const enableMarketplaceForAllPhysios = mutation({
  handler: async (ctx) => {
    const physioUsers = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "physiotherapist"))
      .collect();

    let updated = 0;
    let created = 0;
    let approved = 0;

    for (const user of physioUsers) {
      // 1. Check / ensure accountApprovalStatus is approved
      const approval = await ctx.db
        .query("accountApprovalStatus")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .first();

      if (!approval) {
        await ctx.db.insert("accountApprovalStatus", {
          userId: user._id,
          status: "approved",
          submittedAt: Date.now(),
          reviewedAt: Date.now(),
          comments: "Auto-approved via marketplace migration purge",
        });
        approved++;
      } else if (approval.status !== "approved") {
        await ctx.db.patch(approval._id, {
          status: "approved",
          reviewedAt: Date.now(),
          comments: "Auto-approved via marketplace migration purge",
        });
        approved++;
      }

      // 2. Check / ensure physiotherapistProfiles
      let profile = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .first();

      // Generate base slug from name
      const baseSlug = `${user.firstName || ""}-${user.lastName || ""}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "physio";

      if (!profile) {
        // Find unique slug
        let slug = baseSlug;
        let attempt = 0;
        while (attempt < 10) {
          const existing = await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_bookingSlug", (q) => q.eq("bookingSlug", slug))
            .first();
          if (!existing) break;
          attempt++;
          slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
        }

        const newProfileId = await ctx.db.insert("physiotherapistProfiles", {
          userId: user._id,
          bio: "",
          specializations: [],
          yearsOfExperience: 0,
          isAvailableOnMarketplace: true,
          bookingSlug: slug,
          profileViews: 0,
          bookingsThroughMarketplace: 0,
          totalMarketplaceEarnings: 0,
          averageRating: 0,
          reviewCount: 0,
          verificationBadge: { status: "none" },
        });

        // Link back to user
        await ctx.db.patch(user._id, {
          physiotherapistProfileId: newProfileId,
        });

        created++;
      } else {
        const patches: Record<string, any> = {
          isAvailableOnMarketplace: true,
        };

        if (!profile.bookingSlug) {
          let slug = baseSlug;
          let attempt = 0;
          while (attempt < 10) {
            const existing = await ctx.db
              .query("physiotherapistProfiles")
              .withIndex("by_bookingSlug", (q) => q.eq("bookingSlug", slug))
              .first();
            if (!existing) break;
            attempt++;
            slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
          }
          patches.bookingSlug = slug;
        }

        if (profile.isAvailableOnMarketplace !== true || !profile.bookingSlug) {
          await ctx.db.patch(profile._id, patches);
          updated++;
        }
      }
    }

    // Also ensure all standalone physiotherapistProfiles have marketplace enabled
    const allProfiles = await ctx.db.query("physiotherapistProfiles").collect();
    for (const profile of allProfiles) {
      if (profile.isAvailableOnMarketplace !== true) {
        await ctx.db.patch(profile._id, { isAvailableOnMarketplace: true });
        updated++;
      }
    }

    return {
      success: true,
      totalUsers: physioUsers.length,
      updated,
      created,
      approved,
      message: `Successfully processed ${physioUsers.length} physiotherapists: ${created} profiles created, ${updated} profiles enabled, ${approved} accounts approved.`,
    };
  },
});

/**
 * Backwards-compatible alias for admin dashboard button
 */
export const enableMarketplaceForApprovedPhysios = enableMarketplaceForAllPhysios;

/**
 * Initialize default marketplace settings for a single physiotherapist
 */
export const initializeMarketplaceProfile = internalMutation({
  handler: async (ctx, { userId }: { userId: string }) => {
    let profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", userId as any))
      .first();

    const user = await ctx.db.get(userId as any);

    const baseSlug = user
      ? `${user.firstName || ""}-${user.lastName || ""}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") || "physio"
      : "physio";

    if (!profile) {
      if (user) {
        const newProfileId = await ctx.db.insert("physiotherapistProfiles", {
          userId: user._id,
          bio: "",
          specializations: [],
          yearsOfExperience: 0,
          isAvailableOnMarketplace: true,
          bookingSlug: baseSlug,
          profileViews: 0,
          bookingsThroughMarketplace: 0,
          totalMarketplaceEarnings: 0,
          averageRating: 0,
          reviewCount: 0,
          verificationBadge: { status: "none" },
        });

        await ctx.db.patch(user._id, {
          physiotherapistProfileId: newProfileId,
        });
      }
      return { success: true, created: true };
    }

    await ctx.db.patch(profile._id, {
      isAvailableOnMarketplace: true,
      bookingSlug: profile.bookingSlug || baseSlug,
      profileViews: profile.profileViews || 0,
      bookingsThroughMarketplace: profile.bookingsThroughMarketplace || 0,
      totalMarketplaceEarnings: profile.totalMarketplaceEarnings || 0,
      averageRating: profile.averageRating || 0,
      reviewCount: profile.reviewCount || 0,
      verificationBadge: profile.verificationBadge || { status: "none" },
    });

    return { success: true, isApproved: true };
  },
});
