// @ts-nocheck
/**
 * Marketplace Profile Settings
 * Mutations for physiotherapists to manage their marketplace presence
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

/**
 * Update marketplace settings for a physiotherapist
 * Only accessible by approved physiotherapists
 */
export const updateMarketplaceSettings = mutation({
  args: {
    isAvailableOnMarketplace: v.optional(v.boolean()),
    hourlyRate: v.optional(v.number()), // in kobo
    initialConsultRate: v.optional(v.number()), // in kobo
    virtualConsultationRate: v.optional(v.number()), // in kobo (default ₦6,000)
    inPersonConsultationRate: v.optional(v.number()), // in kobo (default ₦10,000)
    packageDiscountPercent: v.optional(v.number()), // 5-15%
    packageRates: v.optional(
      v.array(
        v.object({
          sessions: v.number(),
          price: v.number(), // in kobo
          description: v.optional(v.string()),
        })
      )
    ),
    location: v.optional(v.string()),
    offersOnlineSessions: v.optional(v.boolean()),
    offersInPersonSessions: v.optional(v.boolean()),
    bio: v.optional(v.string()),
    specializations: v.optional(v.array(v.string())),
  },

  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can update marketplace settings");
    }

    // Check if approved
    const approvalStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    if (!approvalStatus || approvalStatus.status !== "approved") {
      throw new Error(
        "Your account must be approved before you can access marketplace settings"
      );
    }

    // Get profile
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    if (!profile) {
      throw new Error("Physiotherapist profile not found");
    }

    // Update profile
    const updates: any = {};

    if (args.isAvailableOnMarketplace !== undefined) {
      updates.isAvailableOnMarketplace = args.isAvailableOnMarketplace;
    }
    if (args.hourlyRate !== undefined) {
      updates.hourlyRate = args.hourlyRate;
    }
    if (args.initialConsultRate !== undefined) {
      updates.initialConsultRate = args.initialConsultRate;
    }
    if (args.virtualConsultationRate !== undefined) {
      updates.virtualConsultationRate = args.virtualConsultationRate;
    }
    if (args.inPersonConsultationRate !== undefined) {
      updates.inPersonConsultationRate = args.inPersonConsultationRate;
    }
    if (args.packageDiscountPercent !== undefined) {
      // Clamp to 5-15% range
      updates.packageDiscountPercent = Math.max(5, Math.min(15, args.packageDiscountPercent));
    }
    if (args.packageRates !== undefined) {
      updates.packageRates = args.packageRates;
    }
    if (args.location !== undefined) {
      updates.location = args.location;
    }
    if (args.offersOnlineSessions !== undefined) {
      updates.offersOnlineSessions = args.offersOnlineSessions;
    }
    if (args.offersInPersonSessions !== undefined) {
      updates.offersInPersonSessions = args.offersInPersonSessions;
    }
    if (args.bio !== undefined) {
      updates.bio = args.bio;
    }
    if (args.specializations !== undefined) {
      updates.specializations = args.specializations;
    }

    await ctx.db.patch(profile._id, updates);

    return { success: true };
  },
});

/**
 * Get current physiotherapist's marketplace settings
 */
export const getMyMarketplaceSettings = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "physiotherapist") {
      return null;
    }

    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    if (!profile) {
      return null;
    }

    // Check approval status
    const approvalStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    // Get stats
    const totalBookings = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id))
      .collect();

    const reviews = await ctx.db
      .query("marketplaceReviews")
      .withIndex("by_physiotherapist", (q) =>
        q.eq("physiotherapistId", user._id)
      )
      .collect();

    return {
      userId: user._id,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      imageUrl: user.imageUrl,

      // Settings
      isAvailableOnMarketplace: profile.isAvailableOnMarketplace || false,
      hourlyRate: profile.hourlyRate ? profile.hourlyRate / 100 : 0,
      initialConsultRate: profile.initialConsultRate
        ? profile.initialConsultRate / 100
        : 0,
      virtualConsultationRate: profile.virtualConsultationRate
        ? profile.virtualConsultationRate / 100
        : 6000,
      inPersonConsultationRate: profile.inPersonConsultationRate
        ? profile.inPersonConsultationRate / 100
        : 10000,
      packageDiscountPercent: (profile as any).packageDiscountPercent || 0,
      packageRates: (profile.packageRates || []).map((pkg) => ({
        ...pkg,
        price: pkg.price / 100,
      })),
      location: profile.location,
      offersOnlineSessions: profile.offersOnlineSessions || false,
      offersInPersonSessions: profile.offersInPersonSessions || false,
      bio: profile.bio,
      specializations: profile.specializations || [],
      yearsOfExperience: profile.yearsOfExperience || 0,

      // Verification
      verificationBadge: profile.verificationBadge || { status: "none" },

      // Stats
      profileViews: profile.profileViews || 0,
      bookingsThroughMarketplace: totalBookings.length,
      totalMarketplaceEarnings:
        (profile.totalMarketplaceEarnings || 0) / 100,
      averageRating: profile.averageRating || 0,
      reviewCount: reviews.length,

      // Approval
      isApproved: approvalStatus?.status === "approved",
      approvalStatus: approvalStatus?.status,
    };
  },
});

/**
 * Toggle marketplace availability (quick on/off)
 */
export const toggleMarketplaceAvailability = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can toggle marketplace");
    }

    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    if (!profile) {
      throw new Error("Profile not found");
    }

    const newStatus = !profile.isAvailableOnMarketplace;

    await ctx.db.patch(profile._id, {
      isAvailableOnMarketplace: newStatus,
    });

    return { success: true, isAvailable: newStatus };
  },
});
