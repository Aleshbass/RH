/**
 * Partner commercial contracts (admin-managed) and the partner-facing commission views.
 * Commissions themselves are written only by helpers/partnerLedger.ts from verified
 * payments — there is no public mutation that can create one.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { adminDisplayName, requireAdmin, requirePartnerAccess } from "./helpers/partnerAccess";
import { publicCommissionStatus } from "./helpers/partnerLedger";
import { DEFAULT_REVENUE_SETTINGS } from "./platformSettings";

// ─── Admin: contracts ────────────────────────────────────────────────────────

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
    baseFeePerBooking: v.optional(v.number()),
    revenueSharePercent: v.optional(v.number()),
    activationBonusPerPatient: v.optional(v.number()),
    vatApplicable: v.optional(v.boolean()),
    withholdingTaxPercent: v.optional(v.number()),
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
    await requireAdmin(ctx);
    const partner = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", args.partnerId))
      .first();
    if (!partner) throw new ConvexError("Partner not found.");
    const pct = (value: number | undefined, label: string) => {
      if (value !== undefined && (value < 0 || value > 50)) throw new ConvexError(`${label} must be between 0 and 50%.`);
    };
    pct(args.revenueSharePercent, "Revenue share");
    pct(args.withholdingTaxPercent, "Withholding tax");
    for (const amount of [args.baseFeePerBooking, args.activationBonusPerPatient]) {
      if (amount !== undefined && (amount < 0 || !Number.isInteger(amount))) throw new ConvexError("Amounts must be whole kobo values ≥ 0.");
    }

    const now = Date.now();
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
        baseFeePerBooking: args.baseFeePerBooking,
        revenueSharePercent: args.revenueSharePercent,
        activationBonusPerPatient: args.activationBonusPerPatient,
        vatApplicable: args.vatApplicable ?? false,
        withholdingTaxPercent: args.withholdingTaxPercent ?? 0,
        notes: args.notes,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (args.tiers) {
      const oldTiers = await ctx.db
        .query("partnerCommissionTiers")
        .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerId))
        .collect();
      for (const t of oldTiers) await ctx.db.delete(t._id);
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
    return { contractId, status: "active" as const };
  },
});

/**
 * Ends a partner's active contract now. From this moment new commissions use the platform
 * default share (helpers/partnerLedger.ts only reads active contracts); commissions already
 * earned are untouched. The reason is kept on the contract's notes for the record.
 */
export const terminatePartnerContract = mutation({
  args: { contractId: v.id("partnerContracts"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reason = args.reason.trim();
    if (reason.length < 3) throw new ConvexError("Give a short reason for ending the contract.");
    if (reason.length > 500) throw new ConvexError("Keep the reason under 500 characters.");
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new ConvexError("Contract not found.");
    if (contract.status !== "active") throw new ConvexError("Only an active contract can be ended.");

    const now = Date.now();
    const stamp = `Ended ${new Date(now).toISOString().slice(0, 10)} by ${adminDisplayName(admin.user)}: ${reason}`;
    await ctx.db.patch(contract._id, {
      status: "terminated",
      effectiveTo: now,
      notes: contract.notes ? `${contract.notes}\n\n${stamp}` : stamp,
      updatedAt: now,
    });
    return { contractId: contract._id, status: "terminated" as const };
  },
});

/**
 * Admin: every partner contract (newest first) with the partner's name and its volume
 * tiers, plus the platform default share used for partners with no active contract.
 * Contracts are admin-curated, so the table stays small; reads are still capped.
 */
export const adminListPartnerContracts = query({
  args: { partnerId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const partnerFilter = args.partnerId?.trim();
    const contracts = partnerFilter
      ? await ctx.db
          .query("partnerContracts")
          .withIndex("by_partner_id", (q) => q.eq("partnerId", partnerFilter))
          .order("desc")
          .take(200)
      : await ctx.db.query("partnerContracts").order("desc").take(500);

    const partners = new Map<string, Doc<"partners"> | null>();
    for (const code of new Set(contracts.map((c) => c.partnerId))) {
      partners.set(
        code,
        await ctx.db
          .query("partners")
          .withIndex("by_code", (q) => q.eq("code", code))
          .first()
      );
    }

    const rows = await Promise.all(
      contracts.map(async (c) => {
        const partner = partners.get(c.partnerId) ?? null;
        const tiers = await ctx.db
          .query("partnerCommissionTiers")
          .withIndex("by_contract_id", (q) => q.eq("contractId", c._id))
          .take(50);
        return {
          ...c,
          partnerName: partner?.name ?? c.partnerId,
          partnerType: partner?.type ?? null,
          partnerActive: partner?.isActive ?? false,
          tiers: tiers
            .sort((a, b) => a.minReferrals - b.minReferrals)
            .map((t) => ({
              _id: t._id,
              tierName: t.tierName,
              minReferrals: t.minReferrals,
              maxReferrals: t.maxReferrals,
              feePerReferral: t.feePerReferral,
              revenueSharePercent: t.revenueSharePercent,
              bonusAmount: t.bonusAmount,
            })),
        };
      })
    );

    const settings = (await ctx.db.query("platformRevenueSettings").order("desc").first()) ?? DEFAULT_REVENUE_SETTINGS;
    return { contracts: rows, defaultPartnerPercent: settings.partnerPercent };
  },
});

// ─── Partner views ───────────────────────────────────────────────────────────

export const getActivePartnerContract = query({
  args: { partnerId: v.string() },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerId);
    const now = Date.now();
    const contracts = await ctx.db
      .query("partnerContracts")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", partner.code))
      .collect();
    const contract = contracts
      .filter((c) => c.status === "active" && c.effectiveFrom <= now && (!c.effectiveTo || c.effectiveTo > now))
      .sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0];
    if (!contract) {
      const settings = (await ctx.db.query("platformRevenueSettings").order("desc").first()) ?? DEFAULT_REVENUE_SETTINGS;
      return {
        isDefault: true,
        contractNumber: null,
        partnerId: partner.code,
        status: "active" as const,
        modelType: "percentage_revenue_share" as const,
        revenueSharePercent: settings.partnerPercent,
        baseFeePerBooking: null,
        activationBonusPerPatient: null,
        withholdingTaxPercent: 0,
        paymentTermsDays: 30,
        payoutCurrency: "NGN",
        vatApplicable: false,
        effectiveFrom: null,
        tiers: [],
      };
    }
    const tiers = await ctx.db
      .query("partnerCommissionTiers")
      .withIndex("by_contract_id", (q) => q.eq("contractId", contract._id))
      .collect();
    return { ...contract, isDefault: false, tiers: tiers.sort((a, b) => a.minReferrals - b.minReferrals) };
  },
});

function commissionRow(c: Doc<"partnerCommissions">) {
  return {
    _id: c._id,
    referralId: c.referralId ?? null,
    trackingCode: c.trackingCode ?? null,
    patientName: c.patientName ?? null,
    eventType: c.eventType,
    grossTransactionAmount: c.grossTransactionAmount,
    commissionRate: c.commissionRate,
    commissionAmount: c.commissionAmount,
    netPayable: c.netPayable,
    careMode: c.careMode ?? null,
    physiotherapistName: c.physiotherapistName ?? null,
    paymentMethod: c.paymentMethod ?? null,
    paymentReference: c.paymentReference ?? null,
    billingPeriod: c.billingPeriod ?? null,
    status: publicCommissionStatus(c),
    payoutStatus: c.bulkPayoutStatus ?? "accrued",
    notes: c.notes ?? null,
    earnedAt: c.earnedAt,
    paidAt: c.paidAt ?? c.settledAt ?? null,
  };
}

export const listPartnerCommissions = query({
  args: { partnerId: v.string(), status: v.optional(v.string()), billingPeriod: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerId);
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 100), 1), 500);
    const base = args.billingPeriod
      ? ctx.db
          .query("partnerCommissions")
          .withIndex("by_partner_and_period", (q) => q.eq("partnerId", partner.code).eq("billingPeriod", args.billingPeriod))
      : ctx.db.query("partnerCommissions").withIndex("by_partner_id", (q) => q.eq("partnerId", partner.code));
    const rows = await base.order("desc").take(args.status && args.status !== "all" ? 2000 : limit);
    return rows
      .filter((c) => c.environment !== "sandbox")
      .map(commissionRow)
      .filter((c) => !args.status || args.status === "all" || c.status === args.status)
      .slice(0, limit);
  },
});

export const getPartnerCommercialSummary = query({
  args: { partnerId: v.string() },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerId);
    const commissions = (
      await ctx.db
        .query("partnerCommissions")
        .withIndex("by_partner_id", (q) => q.eq("partnerId", partner.code))
        .collect()
    ).filter((c) => c.environment !== "sandbox");

    let totalEarnedKobo = 0;
    let availablePayoutKobo = 0; // approved, not yet in a payout
    let inPayoutKobo = 0; // transfer initiated, awaiting confirmation
    let paidOutKobo = 0;
    let reversedKobo = 0;
    for (const c of commissions) {
      const status = publicCommissionStatus(c);
      if (status === "reversed" || status === "cancelled") {
        reversedKobo += Math.abs(c.netPayable);
        continue;
      }
      totalEarnedKobo += c.netPayable;
      if (status === "paid") paidOutKobo += c.netPayable;
      else if (c.bulkPayoutStatus === "pending_bulk_payout") inPayoutKobo += c.netPayable;
      else availablePayoutKobo += c.netPayable;
    }
    const attributedPatients = new Set(commissions.filter((c) => c.eventType === "payment" && c.patientUserId).map((c) => c.patientUserId)).size;
    const liveReferrals = await ctx.db
      .query("inboundReferrals")
      .withIndex("by_partner_and_environment", (q) => q.eq("partnerId", partner.code).eq("environment", "live"))
      .take(5000);
    const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
    return {
      // Flat fields (used by the portal KPI cards)
      totalEarnedKobo,
      availablePayoutKobo,
      pendingReviewKobo: inPayoutKobo,
      inPayoutKobo,
      paidOutKobo,
      reversedKobo,
      // Formatted
      kpis: {
        totalEarned: naira(totalEarnedKobo),
        available: naira(availablePayoutKobo),
        inPayout: naira(inPayoutKobo),
        paidOut: naira(paidOutKobo),
        totalTransactions: commissions.length,
      },
      performance: {
        liveReferrals: liveReferrals.length,
        paidPatients: attributedPatients,
      },
      recentCommissions: commissions
        .sort((a, b) => b.earnedAt - a.earnedAt)
        .slice(0, 10)
        .map(commissionRow),
    };
  },
});
