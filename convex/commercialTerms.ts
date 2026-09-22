import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ─── Admin: Setup or update a commercial contract ─────────────

export const upsertPartnerContract = mutation({
  args: {
    partnerId: v.string(),
    contractNumber: v.string(),
    paymentTermsDays: v.optional(v.number()),
    payoutCurrency: v.optional(v.string()),
    modelType: v.union(
      v.literal("fixed_per_patient"),
      v.literal("percentage_revenue_share"),
      v.literal("tiered_volume"),
      v.literal("hybrid")
    ),
    baseFeePerBooking: v.optional(v.number()), // in kobo
    revenueSharePercent: v.optional(v.number()), // e.g. 15
    activationBonusPerPatient: v.optional(v.number()), // in kobo
    vatApplicable: v.optional(v.boolean()),
    withholdingTaxPercent: v.optional(v.number()), // e.g. 5
    notes: v.optional(v.string()),
    tiers: v.optional(
      v.array(
        v.object({
          tierName: v.string(),
          minReferrals: v.number(),
          maxReferrals: v.optional(v.number()),
          feePerReferral: v.optional(v.number()),
          revenueSharePercent: v.optional(v.number()),
          bonusAmount: v.optional(v.number()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if an active contract already exists for this partner
    const existing = await ctx.db
      .query("partnerContracts")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    let contractId: Id<"partnerContracts">;

    if (existing) {
      await ctx.db.patch(existing._id, {
        contractNumber: args.contractNumber,
        modelType: args.modelType,
        paymentTermsDays: args.paymentTermsDays ?? existing.paymentTermsDays,
        payoutCurrency: args.payoutCurrency ?? existing.payoutCurrency,
        baseFeePerBooking: args.baseFeePerBooking,
        revenueSharePercent: args.revenueSharePercent,
        activationBonusPerPatient: args.activationBonusPerPatient,
        vatApplicable: args.vatApplicable ?? existing.vatApplicable,
        withholdingTaxPercent: args.withholdingTaxPercent ?? existing.withholdingTaxPercent,
        notes: args.notes,
        updatedAt: now,
      });
      contractId = existing._id;
    } else {
      contractId = await ctx.db.insert("partnerContracts", {
        partnerId: args.partnerId,
        contractNumber: args.contractNumber,
        status: "active",
        effectiveFrom: now,
        paymentTermsDays: args.paymentTermsDays ?? 30,
        payoutCurrency: args.payoutCurrency ?? "NGN",
        modelType: args.modelType,
        baseFeePerBooking: args.baseFeePerBooking ?? 500000, // default ₦5,000
        revenueSharePercent: args.revenueSharePercent ?? 15, // default 15%
        activationBonusPerPatient: args.activationBonusPerPatient ?? 200000, // default ₦2,000
        vatApplicable: args.vatApplicable ?? false,
        withholdingTaxPercent: args.withholdingTaxPercent ?? 5, // default 5%
        notes: args.notes,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Insert or replace tiers if provided
    if (args.tiers && args.tiers.length > 0) {
      // Clear old tiers for this partner
      const oldTiers = await ctx.db
        .query("partnerCommissionTiers")
        .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerId))
        .collect();

      for (const t of oldTiers) {
        await ctx.db.delete(t._id);
      }

      for (const tier of args.tiers) {
        await ctx.db.insert("partnerCommissionTiers", {
          contractId,
          partnerId: args.partnerId,
          tierName: tier.tierName,
          minReferrals: tier.minReferrals,
          maxReferrals: tier.maxReferrals,
          feePerReferral: tier.feePerReferral,
          revenueSharePercent: tier.revenueSharePercent,
          bonusAmount: tier.bonusAmount,
          createdAt: now,
        });
      }
    }

    return { contractId, status: "active" };
  },
});

// ─── Query: Get active contract and tiers ──────────────────────

export const getActivePartnerContract = query({
  args: {
    partnerId: v.string(),
  },
  handler: async (ctx, args) => {
    let contract = await ctx.db
      .query("partnerContracts")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    // Default fallback contract if none configured yet
    if (!contract) {
      return {
        isDefault: true,
        contractNumber: `CTR-${args.partnerId.toUpperCase()}-STD`,
        partnerId: args.partnerId,
        status: "active" as const,
        effectiveFrom: Date.now(),
        paymentTermsDays: 30,
        payoutCurrency: "NGN",
        modelType: "hybrid" as const,
        baseFeePerBooking: 500000, // ₦5,000
        revenueSharePercent: 15, // 15%
        activationBonusPerPatient: 200000, // ₦2,000
        vatApplicable: false,
        withholdingTaxPercent: 5,
        tiers: [
          { tierName: "Starter (1-10 referrals)", minReferrals: 1, maxReferrals: 10, feePerReferral: 500000, revenueSharePercent: 15 },
          { tierName: "Growth (11-30 referrals)", minReferrals: 11, maxReferrals: 30, feePerReferral: 750000, revenueSharePercent: 18 },
          { tierName: "Enterprise (31+ referrals)", minReferrals: 31, maxReferrals: undefined, feePerReferral: 1000000, revenueSharePercent: 20 },
        ],
      };
    }

    const tiers = await ctx.db
      .query("partnerCommissionTiers")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerId))
      .collect();

    return {
      ...contract,
      isDefault: false,
      tiers: tiers.sort((a, b) => a.minReferrals - b.minReferrals),
    };
  },
});

// ─── Mutation: Calculate and record referral commission ───────

export const calculateAndRecordCommission = mutation({
  args: {
    referralId: v.id("inboundReferrals"),
    eventType: v.union(
      v.literal("booking_confirmed"),
      v.literal("session_attended"),
      v.literal("treatment_completed"),
      v.literal("activation_bonus")
    ),
    grossAmountKobo: v.optional(v.number()), // Patient payment or session cost
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const referral = await ctx.db.get(args.referralId);
    if (!referral || !referral.partnerId) {
      return null;
    }

    const partnerId = referral.partnerId;

    // Check if commission already recorded for this referral + eventType
    const existing = await ctx.db
      .query("partnerCommissions")
      .withIndex("by_referral_id", (q) => q.eq("referralId", args.referralId))
      .filter((q) => q.eq(q.field("eventType"), args.eventType))
      .first();

    if (existing) {
      return { commissionId: existing._id, alreadyRecorded: true, netPayable: existing.netPayable };
    }

    // Get active contract
    const contract = await ctx.db
      .query("partnerContracts")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", partnerId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    const grossAmount = args.grossAmountKobo || 2500000; // default ₦25,000 session price

    let commissionRate = 15;
    let commissionAmount = 0;

    const baseFee = contract?.baseFeePerBooking ?? 500000; // ₦5,000
    const revShare = contract?.revenueSharePercent ?? 15;
    const activationBonus = contract?.activationBonusPerPatient ?? 200000; // ₦2,000
    const whtPercent = contract?.withholdingTaxPercent ?? 5;

    // Volume count check for tiered pricing
    const totalPartnerReferrals = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", partnerId))
      .collect();

    const referralCount = totalPartnerReferrals.length;

    // Check tiers
    const tiers = await ctx.db
      .query("partnerCommissionTiers")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", partnerId))
      .collect();

    const matchedTier = tiers.find(
      (t) => referralCount >= t.minReferrals && (!t.maxReferrals || referralCount <= t.maxReferrals)
    );

    if (args.eventType === "booking_confirmed") {
      commissionRate = matchedTier?.feePerReferral ?? baseFee;
      commissionAmount = commissionRate;
    } else if (args.eventType === "session_attended") {
      commissionRate = matchedTier?.revenueSharePercent ?? revShare;
      commissionAmount = Math.round((grossAmount * commissionRate) / 100);
    } else if (args.eventType === "activation_bonus") {
      commissionRate = activationBonus;
      commissionAmount = activationBonus;
    } else if (args.eventType === "treatment_completed") {
      commissionRate = matchedTier?.revenueSharePercent ?? revShare;
      commissionAmount = Math.round((grossAmount * commissionRate) / 100);
    }

    // WHT deduction
    const whtAmount = Math.round((commissionAmount * whtPercent) / 100);
    const netPayable = commissionAmount - whtAmount;

    const patientName = `${referral.patientFirstName} ${referral.patientLastName}`.trim();
    const trackingCode = referral.trackingCode || `RHB-${referral._id.slice(-5).toUpperCase()}`;

    const commissionId = await ctx.db.insert("partnerCommissions", {
      partnerId,
      contractId: contract?._id,
      referralId: args.referralId,
      trackingCode,
      patientName,
      eventType: args.eventType,
      grossTransactionAmount: grossAmount,
      commissionRate,
      commissionAmount,
      netPayable,
      status: "approved",
      notes: args.notes || `Milestone trigger: ${args.eventType.replace("_", " ")}`,
      earnedAt: now,
    });

    // Also record an immutable referral event
    await ctx.db.insert("referralEvents", {
      referralId: args.referralId,
      eventName: "commission.earned",
      occurredAt: now,
      actorType: "system",
      metadata: {
        eventType: args.eventType,
        commissionAmount,
        netPayable,
        partnerId,
      },
    });

    return { commissionId, commissionAmount, netPayable, alreadyRecorded: false };
  },
});

// ─── Query: List itemized commissions for partner ─────────────

export const listPartnerCommissions = query({
  args: {
    partnerId: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let commissions = await ctx.db
      .query("partnerCommissions")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerId))
      .order("desc")
      .take(args.limit || 100);

    if (args.status && args.status !== "all") {
      commissions = commissions.filter((c) => c.status === args.status);
    }

    return commissions.map((c) => ({
      _id: c._id,
      referralId: c.referralId,
      trackingCode: c.trackingCode,
      patientName: c.patientName,
      eventType: c.eventType,
      grossTransactionAmount: c.grossTransactionAmount,
      commissionRate: c.commissionRate,
      commissionAmount: c.commissionAmount,
      netPayable: c.netPayable,
      careMode: c.careMode || "in_person",
      physiotherapistName: c.physiotherapistName || "MRTBN Verified Physiotherapist",
      physiotherapistAmount: c.physiotherapistAmount || Math.round(c.grossTransactionAmount * 0.80),
      rehabifyAmount: c.rehabifyAmount || Math.round(c.grossTransactionAmount * 0.10),
      partnerAmount: c.partnerAmount || c.commissionAmount,
      physioPercent: c.physioPercent || 80,
      rehabifyPercent: c.rehabifyPercent || 10,
      partnerPercent: c.partnerPercent || 10,
      paymentMethod: c.paymentMethod || "paystack",
      billingPeriod: c.billingPeriod || "2026-09",
      bulkPayoutStatus: c.bulkPayoutStatus || (c.status === "settled" ? "paid" : "accrued"),
      status: c.status,
      settlementId: c.settlementId,
      notes: c.notes,
      earnedAt: c.earnedAt,
      earnedAtIso: new Date(c.earnedAt).toISOString(),
    }));
  },
});

// ─── Query: Partner commercial overview and KPIs ──────────────

export const getPartnerCommercialSummary = query({
  args: {
    partnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const commissions = await ctx.db
      .query("partnerCommissions")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerId))
      .collect();

    const totalEarnedKobo = commissions.reduce((sum, c) => sum + c.commissionAmount, 0);
    const netPayableKobo = commissions.reduce((sum, c) => sum + c.netPayable, 0);

    const pendingKobo = commissions
      .filter((c) => c.status === "pending_approval" || c.status === "approved")
      .reduce((sum, c) => sum + c.netPayable, 0);

    const settledKobo = commissions
      .filter((c) => c.status === "settled")
      .reduce((sum, c) => sum + c.netPayable, 0);

    const totalTransactions = commissions.length;

    // Get referral count to compute tier progress
    const referrals = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerId))
      .collect();

    const totalReferrals = referrals.length;

    // Format currency helpers (NGN)
    const formatNaira = (kobo: number) => {
      const naira = kobo / 100;
      return `₦${naira.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };

    return {
      kpis: {
        totalEarned: formatNaira(totalEarnedKobo),
        totalEarnedKobo,
        netPayable: formatNaira(netPayableKobo),
        netPayableKobo,
        pendingSettlement: formatNaira(pendingKobo),
        pendingSettlementKobo: pendingKobo,
        settledPaidOut: formatNaira(settledKobo),
        settledKobo,
        totalTransactions,
      },
      tierProgress: {
        currentReferrals: totalReferrals,
        nextTierThreshold: totalReferrals < 10 ? 10 : totalReferrals < 30 ? 30 : 50,
        currentTierName: totalReferrals < 10 ? "Starter" : totalReferrals < 30 ? "Growth" : "Enterprise",
        percentToNextTier: Math.min(100, Math.round((totalReferrals / (totalReferrals < 10 ? 10 : totalReferrals < 30 ? 30 : 50)) * 100)),
      },
      recentCommissions: commissions.slice(0, 10).map((c) => ({
        ...c,
        formattedAmount: formatNaira(c.netPayable),
        dateFormatted: new Date(c.earnedAt).toLocaleDateString(),
      })),
    };
  },
});
