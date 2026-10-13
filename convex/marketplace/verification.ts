// @ts-nocheck
/**
 * Verification Badge Purchase & Management
 * Handles subscription tiers: monthly, 12-month, yearly
 *
 * A purchase is only activated from Paystack-verified evidence: either the
 * verifyVerificationPayment action (re-verifies the reference with Paystack's API) or the
 * signed charge webhook (recordVerificationPaystackWebhook). The completion itself is an
 * internal, idempotent mutation.
 */

import { v } from "convex/values";
import { mutation, action, internalMutation, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { verifyPaystackSignature } from "../helpers/paystackSignature";

type BadgeTier = "monthly" | "12_month" | "yearly";

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

// Paystack reference created by VerificationBadgeWidget: VERIFICATION_<transactionId>_<timestamp>
const VERIFICATION_REFERENCE = /^VERIFICATION_([A-Za-z0-9]+)_\d+$/;

type VerificationCompletion =
  | { success: true; alreadyCompleted?: boolean; userId: Id<"users">; tier: BadgeTier; expiresAt?: number }
  | { success: false; reason: string };

/**
 * Applies Paystack-verified payment evidence to a pending verification-badge transaction.
 * The transaction is taken from the (Paystack-confirmed) reference, never from client
 * metadata, and the paid amount/currency must cover the transaction. Idempotent: a
 * repeated webhook or verify call for the same reference returns success without
 * extending the badge or emailing again.
 */
async function completeVerificationPaymentCore(
  ctx: MutationCtx,
  reference: string,
  paid: { amountKobo: number; currency: string }
): Promise<VerificationCompletion> {
  const match = VERIFICATION_REFERENCE.exec(reference);
  if (!match) return { success: false, reason: "invalid_reference" };
  const transactionId = ctx.db.normalizeId("marketplaceTransactions", match[1]);
  if (!transactionId) return { success: false, reason: "transaction_not_found" };
  const transaction = await ctx.db.get(transactionId);
  if (!transaction || transaction.type !== "verification_badge" || !transaction.badgeTier) {
    return { success: false, reason: "transaction_not_found" };
  }
  const tier = transaction.badgeTier;

  if (transaction.status === "completed") {
    if (transaction.paymentReference === reference) {
      return { success: true, alreadyCompleted: true, userId: transaction.userId, tier };
    }
    // A second, different payment for an already-activated transaction: keep a record
    // so it can be reconciled/refunded, but do not extend the badge twice.
    await ctx.db.insert("systemLogs", {
      action: "verification_badge_duplicate_payment",
      type: "marketplace",
      timestamp: Date.now(),
      userId: transaction.userId,
      targetEntityId: String(transactionId),
      targetEntityType: "marketplace_transaction",
      details: { paymentReference: reference, amountKobo: paid.amountKobo, currency: paid.currency },
    });
    return { success: false, reason: "transaction_already_completed" };
  }
  if (transaction.status !== "pending") return { success: false, reason: `transaction_${transaction.status}` };

  const reused = await ctx.db
    .query("marketplaceTransactions")
    .withIndex("by_payment_reference", (q) => q.eq("paymentReference", reference))
    .first();
  if (reused && reused._id !== transactionId) return { success: false, reason: "reference_already_used" };

  if (paid.currency !== (transaction.currency || "NGN")) return { success: false, reason: "currency_mismatch" };
  if (!Number.isFinite(paid.amountKobo) || paid.amountKobo < transaction.amount) {
    return { success: false, reason: "amount_mismatch" };
  }

  const profile = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", transaction.userId))
    .first();
  if (!profile) return { success: false, reason: "profile_not_found" };

  const now = Date.now();
  const durationDays = VERIFICATION_DURATION[tier];
  const expiresAt = now + durationDays * 24 * 60 * 60 * 1000;

  await ctx.db.patch(transactionId, {
    status: "completed",
    paymentReference: reference,
    paymentMethod: "paystack",
    updatedAt: now,
    completedAt: now,
  });

  // Update profile with verification badge
  await ctx.db.patch(profile._id, {
    verificationBadge: {
      status: "verified",
      tier,
      paidAt: now,
      expiresAt,
      verificationFee: transaction.amount,
      autoRenew: false, // Can be enabled later
    },
  });

  // Log successful activation (schema-compliant)
  await ctx.db.insert("systemLogs", {
    action: "verification_badge_activated",
    type: "marketplace",
    timestamp: now,
    userId: transaction.userId,
    targetEntityId: String(profile._id),
    targetEntityType: "physiotherapist_profile",
    details: {
      tier,
      transactionId: String(transactionId),
      paymentReference: reference,
    },
  });

  // Confirmation email to the physiotherapist's own address (from the users table)
  const user = await ctx.db.get(transaction.userId);
  if (user?.email) {
    const userName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || undefined;
    await ctx.scheduler.runAfter(0, internal.actions.emails.sendVerificationBadgeEmail.sendVerificationBadgeConfirmation, {
      userEmail: user.email,
      userName,
      tier,
      amount: paid.amountKobo,
      expiresAt,
      paymentReference: reference,
    });
  }

  return { success: true, userId: transaction.userId, tier, expiresAt };
}

async function fetchPaystackTransaction(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("Payment service not configured");
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.status || !data.data) return null;
  return data.data as { status: string; amount: number; currency: string; reference: string };
}

/** Applies Paystack-verified evidence to a verification-badge transaction (internal). */
export const completeVerifiedVerificationPayment = internalMutation({
  args: { reference: v.string(), amountKobo: v.number(), currency: v.string() },
  handler: async (ctx, args): Promise<VerificationCompletion> =>
    completeVerificationPaymentCore(ctx, args.reference, { amountKobo: args.amountKobo, currency: args.currency }),
});

/**
 * Called by /api/payments/verify after checkout: re-verifies the reference with Paystack
 * server-side (status, amount, currency) and activates the badge it paid for.
 * Safe to call repeatedly and without auth: only a genuinely paid reference has any effect.
 */
export const verifyVerificationPayment = action({
  args: { reference: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; status: string; tier?: BadgeTier; expiresAt?: number }> => {
    const reference = args.reference.trim();
    if (!VERIFICATION_REFERENCE.test(reference)) return { success: false, status: "invalid_reference" };
    const tx = await fetchPaystackTransaction(reference);
    if (!tx) return { success: false, status: "not_found" };
    if (tx.status !== "success") return { success: false, status: tx.status };
    if (tx.reference !== reference) return { success: false, status: "reference_mismatch" };
    const result: VerificationCompletion = await ctx.runMutation(
      internal.marketplace.verification.completeVerifiedVerificationPayment,
      { reference, amountKobo: Number(tx.amount) || 0, currency: String(tx.currency || "") }
    );
    if (!result.success) return { success: false, status: result.reason };
    return { success: true, status: "success", tier: result.tier, expiresAt: result.expiresAt };
  },
});

/**
 * Paystack charge webhook for verification-badge payments (VERIFICATION_ references).
 * The HMAC-SHA512 signature is verified here, inside Convex, before anything else, so
 * this public entry point cannot be used to fake a payment.
 */
export const recordVerificationPaystackWebhook = mutation({
  args: { rawBody: v.string(), signature: v.string() },
  handler: async (ctx, args) => {
    if (!(await verifyPaystackSignature(args.rawBody, args.signature))) {
      throw new Error("Invalid Paystack webhook signature");
    }
    let payload: any;
    try {
      payload = JSON.parse(args.rawBody);
    } catch {
      throw new Error("Invalid webhook payload");
    }
    const data = payload?.data ?? {};
    const reference = typeof data.reference === "string" ? data.reference : "";
    if (!reference.startsWith("VERIFICATION_")) return { handled: false };
    if (payload.event !== "charge.success") return { handled: false };
    if (data.status !== undefined && data.status !== "success") {
      return { handled: true, success: false, reason: `charge_${data.status}` };
    }
    const result = await completeVerificationPaymentCore(ctx, reference, {
      amountKobo: Number(data.amount) || 0,
      currency: typeof data.currency === "string" ? data.currency : "",
    });
    return { handled: true, ...result };
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
