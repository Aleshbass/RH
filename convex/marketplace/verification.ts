// @ts-nocheck
/**
 * Verification Badge Purchase & Management
 * Handles subscription tiers: monthly, 12-month, yearly
 */

import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";

// Verification badge pricing in Naira (converted to kobo)
const VERIFICATION_PRICING = {
  monthly: 3000 * 100, // ₦3,000 in kobo
  "12_month": 30000 * 100, // ₦30,000 in kobo (₦2,500/month)
  yearly: 36000 * 100, // ₦36,000 in kobo (₦3,000/month)
};

// Duration in days
const VERIFICATION_DURATION = {
  monthly: 30,
  "12_month": 365,
  yearly: 365,
};

/**
 * Purchase verification badge
 */
export const purchaseVerificationBadge = mutation({
  args: {
    tier: v.union(
      v.literal("monthly"),
      v.literal("12_month"),
      v.literal("yearly")
    ),
    autoRenew: v.optional(v.boolean()),
  },
  
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("You must be logged in to purchase verification badge");
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    
    if (!user || user.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can purchase verification badges");
    }
    
    // Check if approved
    const approvalStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();
    
    if (!approvalStatus || approvalStatus.status !== "approved") {
      throw new Error(
        "Your account must be approved before purchasing verification badge"
      );
    }
    
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();
    
    if (!profile) {
      throw new Error("Profile not found");
    }
    
    // Calculate pricing
    const amount = VERIFICATION_PRICING[args.tier];
    const durationDays = VERIFICATION_DURATION[args.tier];
    const expiresAt = Date.now() + durationDays * 24 * 60 * 60 * 1000;
    
    // Create transaction record
    const transactionId = await ctx.db.insert("marketplaceTransactions", {
      userId: user._id,
      type: "verification_badge",
      badgeTier: args.tier,
      amount,
      currency: "NGN",
      status: "pending",
      description: `Verification badge purchase - ${args.tier} tier`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    return {
      transactionId,
      amount: amount / 100, // Return in Naira
      tier: args.tier,
      durationDays,
      expiresAt,
    };
  },
});

/**
 * Complete verification badge purchase after payment
 */
export const completeVerificationPurchase = mutation({
  args: {
    transactionId: v.id("marketplaceTransactions"),
    paymentReference: v.string(),
  },
  
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) {
      throw new Error("Transaction not found");
    }
    
    if (transaction.type !== "verification_badge") {
      throw new Error("Invalid transaction type");
    }
    
    // Update transaction
    await ctx.db.patch(args.transactionId, {
      status: "completed",
      paymentReference: args.paymentReference,
      updatedAt: Date.now(),
      completedAt: Date.now(),
    });
    
    // Get physiotherapist profile
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", transaction.userId))
      .first();
    
    if (!profile) {
      throw new Error("Profile not found");
    }
    
    // Calculate expiration
    const durationDays = VERIFICATION_DURATION[transaction.badgeTier!];
    const expiresAt = Date.now() + durationDays * 24 * 60 * 60 * 1000;
    
    // Update profile with verification badge
    await ctx.db.patch(profile._id, {
      verificationBadge: {
        status: "verified",
        tier: transaction.badgeTier!,
        paidAt: Date.now(),
        expiresAt,
        verificationFee: transaction.amount,
        autoRenew: false, // Can be enabled later
      },
    });
    
    // Log successful activation (schema-compliant)
    await ctx.db.insert("systemLogs", {
      action: "verification_badge_activated",
      type: "marketplace",
      timestamp: Date.now(),
      userId: transaction.userId,
      targetEntityId: String(profile._id),
      targetEntityType: "physiotherapist_profile",
      details: {
        tier: transaction.badgeTier!,
        transactionId: String(args.transactionId),
        paymentReference: args.paymentReference,
      },
    });
    
    return { 
      success: true,
      userId: transaction.userId,
      tier: transaction.badgeTier!,
      expiresAt,
    };
  },
});

/**
 * Renew verification badge
 */
export const renewVerificationBadge = mutation({
  args: {
    tier: v.optional(
      v.union(
        v.literal("monthly"),
        v.literal("12_month"),
        v.literal("yearly")
      )
    ), // If not provided, use current tier
  },
  
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    
    if (!user || user.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can renew verification badges");
    }
    
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();
    
    if (!profile) {
      throw new Error("Profile not found");
    }
    
    const currentBadge = profile.verificationBadge;
    if (!currentBadge || currentBadge.status === "none") {
      throw new Error("No existing verification badge to renew");
    }
    
    // Use current tier if not specified
    const tier = args.tier || currentBadge.tier || "monthly";
    
    // Calculate pricing
    const amount = VERIFICATION_PRICING[tier];
    const durationDays = VERIFICATION_DURATION[tier];
    
    // If current badge hasn't expired, extend from expiration date
    // Otherwise, extend from now
    const startDate =
      currentBadge.expiresAt && currentBadge.expiresAt > Date.now()
        ? currentBadge.expiresAt
        : Date.now();
    
    const expiresAt = startDate + durationDays * 24 * 60 * 60 * 1000;
    
    // Create transaction
    const transactionId = await ctx.db.insert("marketplaceTransactions", {
      userId: user._id,
      type: "verification_badge",
      badgeTier: tier,
      amount,
      currency: "NGN",
      status: "pending",
      description: `Verification badge renewal - ${tier} tier`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    return {
      transactionId,
      amount: amount / 100,
      tier,
      durationDays,
      expiresAt,
    };
  },
});

/**
 * Check verification badge status
 * Returns status and days until expiration
 */
export const checkVerificationStatus = mutation({
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
    
    const badge = profile.verificationBadge;
    
    if (!badge || badge.status === "none") {
      return {
        hasVerification: false,
        status: "none",
      };
    }
    
    const now = Date.now();
    const isExpired = badge.expiresAt ? badge.expiresAt < now : false;
    const daysUntilExpiration = badge.expiresAt
      ? Math.ceil((badge.expiresAt - now) / (24 * 60 * 60 * 1000))
      : null;
    
    // Auto-expire if needed
    if (isExpired && badge.status !== "none") {
      await ctx.db.patch(profile._id, {
        verificationBadge: {
          ...badge,
          status: "none",
        },
      });
      
      return {
        hasVerification: false,
        status: "expired",
        expiredAt: badge.expiresAt,
      };
    }
    
    return {
      hasVerification: true,
      status: badge.status,
      tier: badge.tier,
      paidAt: badge.paidAt,
      expiresAt: badge.expiresAt,
      daysUntilExpiration,
      isExpiringSoon: daysUntilExpiration !== null && daysUntilExpiration <= 7,
      autoRenew: badge.autoRenew || false,
    };
  },
});
