/**
 * The single partner commission ledger.
 *
 * Commissions are earned ONLY from verified payments (Paystack webhook / verification,
 * or an admin-confirmed bank transfer) by patients attributed to a partner. Amounts
 * come from the partner's active contract, or the platform default partner share.
 * Sandbox never earns. Every earning is idempotent on its payment reference, and
 * refunds reverse (or, if already paid out, offset) the commission.
 */
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { DEFAULT_REVENUE_SETTINGS, calculateSplit } from "../platformSettings";
import type { PartnerEnv } from "./partnerShared";

export function billingPeriodOf(timestamp: number = Date.now()): string {
  const d = new Date(timestamp);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function activeContract(ctx: MutationCtx, partnerCode: string, at: number) {
  const contracts = await ctx.db
    .query("partnerContracts")
    .withIndex("by_partner_id", (q) => q.eq("partnerId", partnerCode))
    .collect();
  return (
    contracts
      .filter((c) => c.status === "active" && c.effectiveFrom <= at && (!c.effectiveTo || c.effectiveTo > at))
      .sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0] ?? null
  );
}

async function isFirstPaidVisit(ctx: MutationCtx, partnerCode: string, patientUserId?: Id<"users">): Promise<boolean> {
  if (!patientUserId) return true;
  const previous = await ctx.db
    .query("partnerCommissions")
    .withIndex("by_partner_and_patient", (q) => q.eq("partnerId", partnerCode).eq("patientUserId", patientUserId))
    .collect();
  return !previous.some((c) => c.eventType === "payment" && c.status !== "reversed" && c.status !== "cancelled");
}

export type CommissionInput = {
  partnerCode: string;
  environment: PartnerEnv;
  idempotencyKey: string; // e.g. "payment:<paystack reference>"
  grossKobo: number; // verified service amount (excluding processing fees)
  paymentMethod: "paystack" | "bank_transfer";
  paymentReference?: string;
  source: "marketplace" | "joy" | "bank_transfer";
  referralId?: Id<"inboundReferrals">;
  bookingId?: Id<"marketplaceBookings">;
  linkId?: Id<"partnerReferralLinks">;
  patientUserId?: Id<"users">;
  patientName?: string;
  trackingCode?: string;
  physiotherapistId?: Id<"users">;
  physiotherapistName?: string;
  careMode?: "virtual" | "in_person";
  earnedAt?: number;
  /** Standard pricing pays the physio a fixed amount, so the split isn't a percentage. */
  physiotherapistKobo?: number;
};

export async function recordPartnerCommission(
  ctx: MutationCtx,
  input: CommissionInput
): Promise<{ commissionId: Id<"partnerCommissions">; created: boolean } | { skipped: string }> {
  if (input.environment !== "live") return { skipped: "sandbox" };
  if (!Number.isFinite(input.grossKobo) || input.grossKobo <= 0) return { skipped: "no_gross_amount" };

  const existing = await ctx.db
    .query("partnerCommissions")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", input.idempotencyKey))
    .first();
  if (existing) return { commissionId: existing._id, created: false };

  const partner = await ctx.db
    .query("partners")
    .withIndex("by_code", (q) => q.eq("code", input.partnerCode))
    .first();
  if (!partner) return { skipped: "unknown_partner" };

  const earnedAt = input.earnedAt ?? Date.now();
  const settingsDoc = await ctx.db.query("platformRevenueSettings").order("desc").first();
  const settings = settingsDoc ?? DEFAULT_REVENUE_SETTINGS;
  const split = calculateSplit(input.grossKobo, settings, true);
  const contract = await activeContract(ctx, partner.code, earnedAt);
  const firstVisit = await isFirstPaidVisit(ctx, partner.code, input.patientUserId);

  let commissionAmount = split.partnerAmount;
  let commissionRate = settings.partnerPercent;
  let whtPercent = 0;
  const notes: string[] = [];

  if (contract) {
    whtPercent = contract.withholdingTaxPercent ?? 0;
    const revenueShare = contract.revenueSharePercent ?? settings.partnerPercent;
    const baseFee = contract.baseFeePerBooking ?? 0;
    switch (contract.modelType) {
      case "percentage_revenue_share":
        commissionRate = revenueShare;
        commissionAmount = Math.round((input.grossKobo * revenueShare) / 100);
        break;
      case "fixed_per_patient":
        commissionRate = baseFee;
        commissionAmount = firstVisit ? baseFee : 0;
        break;
      case "hybrid":
        commissionRate = revenueShare;
        commissionAmount = Math.round((input.grossKobo * revenueShare) / 100) + (firstVisit ? baseFee : 0);
        break;
      case "tiered_volume": {
        const paidPatients = await ctx.db
          .query("partnerCommissions")
          .withIndex("by_partner_id", (q) => q.eq("partnerId", partner.code))
          .collect();
        const patientCount =
          new Set(paidPatients.filter((c) => c.eventType === "payment" && c.status !== "reversed" && c.patientUserId).map((c) => c.patientUserId)).size +
          (firstVisit ? 1 : 0);
        const tiers = await ctx.db
          .query("partnerCommissionTiers")
          .withIndex("by_contract_id", (q) => q.eq("contractId", contract._id))
          .collect();
        const tier = tiers.find((t) => patientCount >= t.minReferrals && (!t.maxReferrals || patientCount <= t.maxReferrals));
        const tierShare = tier?.revenueSharePercent ?? revenueShare;
        commissionRate = tierShare;
        commissionAmount = Math.round((input.grossKobo * tierShare) / 100) + (firstVisit ? tier?.feePerReferral ?? 0 : 0);
        if (tier) notes.push(`Tier: ${tier.tierName}`);
        break;
      }
    }
    if (firstVisit && contract.activationBonusPerPatient) {
      commissionAmount += contract.activationBonusPerPatient;
      notes.push("Includes activation bonus");
    }
    notes.push(`Contract ${contract.contractNumber} (${contract.modelType})`);
  } else {
    notes.push(`Platform default partner share ${settings.partnerPercent}%`);
  }

  if (commissionAmount <= 0) return { skipped: "no_commission_under_contract" };
  const whtAmount = Math.round((commissionAmount * whtPercent) / 100);
  const netPayable = commissionAmount - whtAmount;
  if (whtPercent > 0) notes.push(`WHT ${whtPercent}%`);

  const fixedPhysio =
    typeof input.physiotherapistKobo === "number" && input.physiotherapistKobo >= 0 ? input.physiotherapistKobo : undefined;
  const percentOf = (part: number, whole: number) => Math.round((part / whole) * 1000) / 10;

  const commissionId = await ctx.db.insert("partnerCommissions", {
    partnerId: partner.code,
    contractId: contract?._id,
    referralId: input.referralId,
    trackingCode: input.trackingCode,
    patientName: input.patientName,
    eventType: "payment",
    environment: "live",
    bookingId: input.bookingId,
    linkId: input.linkId,
    patientUserId: input.patientUserId,
    idempotencyKey: input.idempotencyKey,
    source: input.source,
    grossTransactionAmount: input.grossKobo,
    commissionRate,
    commissionAmount,
    netPayable,
    physiotherapistId: input.physiotherapistId,
    physiotherapistName: input.physiotherapistName,
    careMode: input.careMode,
    ...(fixedPhysio !== undefined
      ? {
          physiotherapistAmount: fixedPhysio,
          rehabifyAmount: input.grossKobo - fixedPhysio - commissionAmount,
          physioPercent: percentOf(fixedPhysio, input.grossKobo),
          rehabifyPercent: percentOf(input.grossKobo - fixedPhysio - commissionAmount, input.grossKobo),
        }
      : {
          physiotherapistAmount: split.physiotherapistAmount,
          rehabifyAmount: split.rehabifyAmount,
          physioPercent: split.physioPercent,
          rehabifyPercent: split.rehabifyPercent,
        }),
    partnerAmount: commissionAmount,
    partnerPercent: settings.partnerPercent,
    netPartnerAmount: netPayable,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
    billingPeriod: billingPeriodOf(earnedAt),
    bulkPayoutStatus: "accrued",
    status: "approved",
    notes: notes.join(" · "),
    earnedAt,
  });

  if (input.referralId) {
    await ctx.db.insert("referralEvents", {
      referralId: input.referralId,
      eventName: "commission.earned",
      occurredAt: earnedAt,
      actorType: "system",
      metadata: { commissionId, commissionAmount, netPayable, paymentReference: input.paymentReference },
    });
  }
  return { commissionId, created: true };
}

/**
 * Reverses commissions earned on a refunded payment. Unpaid commissions are marked
 * reversed; commissions already in (or past) a payout get a negative adjustment that
 * is netted against the partner's next payout.
 */
export async function reverseCommissionsForPayment(
  ctx: MutationCtx,
  paymentReference: string,
  reason: string
): Promise<{ reversed: number; adjusted: number }> {
  const commissions = await ctx.db
    .query("partnerCommissions")
    .withIndex("by_payment_reference", (q) => q.eq("paymentReference", paymentReference))
    .collect();
  const now = Date.now();
  let reversed = 0;
  let adjusted = 0;
  for (const commission of commissions) {
    if (commission.eventType !== "payment") continue;
    if (commission.status === "reversed" || commission.status === "cancelled") continue;
    const adjustmentKey = `refund:${commission._id}`;
    const alreadyAdjusted = await ctx.db
      .query("partnerCommissions")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", adjustmentKey))
      .first();
    if (alreadyAdjusted) continue;

    if ((commission.bulkPayoutStatus ?? "accrued") === "accrued" && !commission.payoutTransferId) {
      await ctx.db.patch(commission._id, { status: "reversed", reversedAt: now, reversalReason: reason });
      reversed++;
      continue;
    }
    await ctx.db.insert("partnerCommissions", {
      partnerId: commission.partnerId,
      contractId: commission.contractId,
      referralId: commission.referralId,
      trackingCode: commission.trackingCode,
      patientName: commission.patientName,
      eventType: "refund_adjustment",
      environment: "live",
      bookingId: commission.bookingId,
      linkId: commission.linkId,
      patientUserId: commission.patientUserId,
      idempotencyKey: adjustmentKey,
      source: "refund",
      reversesCommissionId: commission._id,
      grossTransactionAmount: -commission.grossTransactionAmount,
      commissionRate: commission.commissionRate,
      commissionAmount: -commission.commissionAmount,
      netPayable: -commission.netPayable,
      partnerAmount: -(commission.partnerAmount ?? commission.commissionAmount),
      netPartnerAmount: -commission.netPayable,
      paymentMethod: commission.paymentMethod,
      paymentReference: commission.paymentReference,
      billingPeriod: billingPeriodOf(now),
      bulkPayoutStatus: "accrued",
      status: "approved",
      notes: `Refund adjustment: ${reason}`,
      earnedAt: now,
    });
    adjusted++;
  }
  return { reversed, adjusted };
}

/** Public commission status shown to partners. */
export function publicCommissionStatus(c: Doc<"partnerCommissions">): "pending" | "approved" | "paid" | "reversed" | "cancelled" {
  if (c.status === "reversed") return "reversed";
  if (c.status === "cancelled") return "cancelled";
  if (c.status === "settled" || c.bulkPayoutStatus === "paid") return "paid";
  if (c.status === "pending_approval") return "pending";
  return "approved";
}
