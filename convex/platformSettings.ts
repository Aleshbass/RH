import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ensureUserRole } from "./auth";

export const DEFAULT_REVENUE_SETTINGS = {
  rehabifyPercent: 10,
  physiotherapistPercent: 80,
  partnerPercent: 10,
  defaultVirtualRateKobo: 600000,   // ₦6,000 in kobo
  defaultInPersonRateKobo: 1000000, // ₦10,000 in kobo
  payoutSchedule: "end_of_month" as const,
  paystackFeeBearerInbound: "physiotherapist" as const,   // Default: physio absorbs collection fee
  paystackFeeBearerOutbound: "physiotherapist" as const,  // Default: physio absorbs transfer fee
};

/**
 * Public/Auth query to get the current active platform revenue split & pricing settings.
 * Returns defaults if no custom settings have been saved yet.
 */
export const getPlatformRevenueSettings = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("platformRevenueSettings")
      .order("desc")
      .first();

    if (!settings) {
      return {
        ...DEFAULT_REVENUE_SETTINGS,
        isCustom: false,
        updatedAt: Date.now(),
      };
    }

    return {
      _id: settings._id,
      rehabifyPercent: settings.rehabifyPercent,
      physiotherapistPercent: settings.physiotherapistPercent,
      partnerPercent: settings.partnerPercent,
      defaultVirtualRateKobo: settings.defaultVirtualRateKobo,
      defaultInPersonRateKobo: settings.defaultInPersonRateKobo,
      payoutSchedule: settings.payoutSchedule,
      paystackFeeBearerInbound: settings.paystackFeeBearerInbound || DEFAULT_REVENUE_SETTINGS.paystackFeeBearerInbound,
      paystackFeeBearerOutbound: settings.paystackFeeBearerOutbound || DEFAULT_REVENUE_SETTINGS.paystackFeeBearerOutbound,
      updatedAt: settings.updatedAt,
      updatedBy: settings.updatedBy,
      isCustom: true,
    };
  },
});

/**
 * Admin-only mutation to update the platform split percentages and baseline pricing.
 * Once updated, this governs fee calculations and commission ledger across the platform.
 */
export const updatePlatformRevenueSettings = mutation({
  args: {
    rehabifyPercent: v.number(),
    physiotherapistPercent: v.number(),
    partnerPercent: v.number(),
    defaultVirtualRateKobo: v.number(),
    defaultInPersonRateKobo: v.number(),
    payoutSchedule: v.optional(v.string()),
    paystackFeeBearerInbound: v.optional(v.union(
      v.literal("physiotherapist"),
      v.literal("patient"),
      v.literal("rehabify"),
      v.literal("split_proportional")
    )),
    paystackFeeBearerOutbound: v.optional(v.union(
      v.literal("physiotherapist"),
      v.literal("partner"),
      v.literal("rehabify"),
      v.literal("split_proportional")
    )),
  },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx as any, ["admin"]);

    const totalPercent = args.rehabifyPercent + args.physiotherapistPercent + args.partnerPercent;
    if (Math.abs(totalPercent - 100) > 0.01) {
      throw new Error(`Total split percentage must equal 100%. Currently: ${totalPercent}% (Rehabify: ${args.rehabifyPercent}%, Physio: ${args.physiotherapistPercent}%, Partner: ${args.partnerPercent}%)`);
    }

    if (args.defaultVirtualRateKobo <= 0 || args.defaultInPersonRateKobo <= 0) {
      throw new Error("Baseline consultation rates must be greater than zero");
    }

    const now = Date.now();
    const adminName = `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || admin.email || "Admin";

    const existing = await ctx.db
      .query("platformRevenueSettings")
      .order("desc")
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        rehabifyPercent: args.rehabifyPercent,
        physiotherapistPercent: args.physiotherapistPercent,
        partnerPercent: args.partnerPercent,
        defaultVirtualRateKobo: args.defaultVirtualRateKobo,
        defaultInPersonRateKobo: args.defaultInPersonRateKobo,
        payoutSchedule: args.payoutSchedule || existing.payoutSchedule,
        paystackFeeBearerInbound: args.paystackFeeBearerInbound || existing.paystackFeeBearerInbound,
        paystackFeeBearerOutbound: args.paystackFeeBearerOutbound || existing.paystackFeeBearerOutbound,
        updatedAt: now,
        updatedBy: adminName,
      });
      return { success: true, id: existing._id };
    } else {
      const id = await ctx.db.insert("platformRevenueSettings", {
        rehabifyPercent: args.rehabifyPercent,
        physiotherapistPercent: args.physiotherapistPercent,
        partnerPercent: args.partnerPercent,
        defaultVirtualRateKobo: args.defaultVirtualRateKobo,
        defaultInPersonRateKobo: args.defaultInPersonRateKobo,
        payoutSchedule: args.payoutSchedule || "end_of_month",
        paystackFeeBearerInbound: args.paystackFeeBearerInbound || "physiotherapist",
        paystackFeeBearerOutbound: args.paystackFeeBearerOutbound || "physiotherapist",
        updatedAt: now,
        updatedBy: adminName,
      });
      return { success: true, id };
    }
  },
});

/**
 * Utility helper to compute the 3-way split given a gross amount (in kobo).
 */
export function calculateSplit(
  grossKobo: number,
  settings: {
    rehabifyPercent: number;
    physiotherapistPercent: number;
    partnerPercent: number;
  },
  hasPartner: boolean = true
) {
  if (hasPartner) {
    const physioAmount = Math.round((grossKobo * settings.physiotherapistPercent) / 100);
    const partnerAmount = Math.round((grossKobo * settings.partnerPercent) / 100);
    const rehabifyAmount = grossKobo - physioAmount - partnerAmount; // Ensure exact sum = gross

    return {
      grossKobo,
      physiotherapistAmount: physioAmount,
      physioPercent: settings.physiotherapistPercent,
      partnerAmount: partnerAmount,
      partnerPercent: settings.partnerPercent,
      rehabifyAmount: rehabifyAmount,
      rehabifyPercent: settings.rehabifyPercent,
    };
  } else {
    // If no partner, physiotherapist keeps their share + partner share, or Rehabify takes 10%
    const physioPercent = 100 - settings.rehabifyPercent;
    const physioAmount = Math.round((grossKobo * physioPercent) / 100);
    const rehabifyAmount = grossKobo - physioAmount;

    return {
      grossKobo,
      physiotherapistAmount: physioAmount,
      physioPercent,
      partnerAmount: 0,
      partnerPercent: 0,
      rehabifyAmount,
      rehabifyPercent: settings.rehabifyPercent,
    };
  }
}

/**
 * Calculate Paystack inbound (collection) fee.
 * Local transactions: 1.5% + ₦100 flat (waived if amount < ₦2,500), capped at ₦2,000.
 */
export function calculatePaystackInboundFee(amountKobo: number): number {
  const percentageFee = Math.round(amountKobo * 0.015);
  const flatFee = amountKobo < 250000 ? 0 : 10000; // ₦100 in kobo, waived below ₦2,500
  const totalFee = percentageFee + flatFee;
  const cap = 200000; // ₦2,000 in kobo
  return Math.min(totalFee, cap);
}

/**
 * Calculate Paystack outbound (transfer) fee.
 * Tiered: ≪₦5,000 = ₦10, ₦5,001–₦50,000 = ₦25, >₦50,000 = ₦50.
 * Returns transfer fee only (stamp duty is separate).
 */
export function calculatePaystackOutboundFee(amountKobo: number): number {
  const amountNaira = amountKobo / 100;
  if (amountNaira <= 5000) return 1000;   // ₦10 in kobo
  if (amountNaira <= 50000) return 2500;  // ₦25 in kobo
  return 5000;                             // ₦50 in kobo
}

/**
 * Calculate government stamp duty per NTA 2025.
 * ₦50 flat on electronic transfers ≥ ₦10,000. Tracked as a separate line item.
 */
export function calculateStampDuty(amountKobo: number): number {
  const amountNaira = amountKobo / 100;
  return amountNaira >= 10000 ? 5000 : 0; // ₦50 in kobo
}

/**
 * Apply fee deduction to the 3-way split based on admin-configured fee bearer.
 * Returns net amounts after deducting both inbound and outbound Paystack fees.
 */
export function applyFeeDeduction(
  split: {
    physiotherapistAmount: number;
    rehabifyAmount: number;
    partnerAmount: number;
    physioPercent: number;
    rehabifyPercent: number;
    partnerPercent: number;
  },
  inboundFeeKobo: number,
  outboundFeeKobo: number,
  stampDutyKobo: number,
  inboundBearer: string = "physiotherapist",
  outboundBearer: string = "physiotherapist"
) {
  let netPhysio = split.physiotherapistAmount;
  let netRehabify = split.rehabifyAmount;
  let netPartner = split.partnerAmount;

  // Apply inbound (collection) fee
  if (inboundBearer === "physiotherapist") {
    netPhysio -= inboundFeeKobo;
  } else if (inboundBearer === "rehabify") {
    netRehabify -= inboundFeeKobo;
  } else if (inboundBearer === "split_proportional") {
    const totalPercent = split.physioPercent + split.rehabifyPercent + split.partnerPercent;
    netPhysio -= Math.round((inboundFeeKobo * split.physioPercent) / totalPercent);
    netRehabify -= Math.round((inboundFeeKobo * split.rehabifyPercent) / totalPercent);
    netPartner -= Math.round((inboundFeeKobo * split.partnerPercent) / totalPercent);
  }
  // "patient" bearer means patient pays extra at checkout — no deduction from splits

  // Apply outbound (transfer + stamp duty) fee
  const totalOutboundFee = outboundFeeKobo + stampDutyKobo;
  if (outboundBearer === "physiotherapist") {
    netPhysio -= totalOutboundFee;
  } else if (outboundBearer === "partner") {
    netPartner -= totalOutboundFee;
  } else if (outboundBearer === "rehabify") {
    netRehabify -= totalOutboundFee;
  } else if (outboundBearer === "split_proportional") {
    const totalPercent = split.physioPercent + split.rehabifyPercent + split.partnerPercent;
    netPhysio -= Math.round((totalOutboundFee * split.physioPercent) / totalPercent);
    netRehabify -= Math.round((totalOutboundFee * split.rehabifyPercent) / totalPercent);
    netPartner -= Math.round((totalOutboundFee * split.partnerPercent) / totalPercent);
  }

  return {
    netPhysiotherapistAmount: Math.max(0, netPhysio),
    netRehabifyAmount: Math.max(0, netRehabify),
    netPartnerAmount: Math.max(0, netPartner),
    totalFeesDeducted: inboundFeeKobo + outboundFeeKobo + stampDutyKobo,
  };
}

/**
 * Calculate gross charge and fee when the patient absorbs the Paystack collection fee.
 * Paystack collection fee formula: 1.5% + ₦100 (waived under ₦2,500), capped at ₦2,000 (200,000 kobo).
 * To ensure the platform/provider nets `desiredNetKobo`:
 * - If gross < 250,000 kobo (₦2,500): gross = desiredNet / (1 - 0.015)
 * - If gross >= 250,000 kobo: gross = (desiredNet + 10,000) / (1 - 0.015)
 * - If fee reaches 200,000 kobo (₦2,000) cap: gross = desiredNet + 200,000
 */
export function calculatePaystackInboundGrossAmount(desiredNetKobo: number): {
  grossKobo: number;
  feeKobo: number;
} {
  if (desiredNetKobo <= 0) {
    return { grossKobo: 0, feeKobo: 0 };
  }

  const capKobo = 200000; // ₦2,000 in kobo
  const flatKobo = 10000; // ₦100 in kobo

  // Case 1: Below ₦2,500 (250,000 kobo) threshold, flat fee waived
  const grossBelowThreshold = Math.round(desiredNetKobo / 0.985);
  if (grossBelowThreshold < 250000) {
    const fee = calculatePaystackInboundFee(grossBelowThreshold);
    return { grossKobo: grossBelowThreshold, feeKobo: fee };
  }

  // Case 2: Above ₦2,500 threshold, flat fee ₦100 applies
  const grossWithFlat = Math.round((desiredNetKobo + flatKobo) / 0.985);
  const fee = calculatePaystackInboundFee(grossWithFlat);

  if (fee >= capKobo) {
    // Case 3: Hit the ₦2,000 cap
    return {
      grossKobo: desiredNetKobo + capKobo,
      feeKobo: capKobo,
    };
  }

  return {
    grossKobo: grossWithFlat,
    feeKobo: fee,
  };
}

