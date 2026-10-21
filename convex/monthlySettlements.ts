/**
 * Partner monthly settlements and Paystack payouts.
 *
 * Lifecycle of a payout:
 *   accrued commissions (≤ billing period, incl. refund adjustments)
 *     → admin initiates transfer → partnerPayoutTransfers row (initiated) and the
 *       commissions are reserved (bulkPayoutStatus "pending_bulk_payout")
 *     → Paystack transfer.success webhook (signature verified in Convex) → paid/settled
 *     → transfer.failed / transfer.reversed → commissions released back to accrued.
 * Commissions are never marked paid just because a transfer was requested.
 */
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { adminDisplayName, requireAdmin, requirePartnerAccess } from "./helpers/partnerAccess";
import { randomString } from "./helpers/partnerShared";
import { publicCommissionStatus } from "./helpers/partnerLedger";
import { verifyPaystackSignature } from "./helpers/paystackSignature";
import { currentPaystackMode } from "./helpers/paystackMode";
import { completeMarketplaceBookingCore } from "./marketplace/booking";
import {
  DEFAULT_REVENUE_SETTINGS,
  calculatePaystackOutboundFee,
  calculateStampDuty,
} from "./platformSettings";

export function getCurrentBillingPeriod(timestamp: number = Date.now()): string {
  const d = new Date(timestamp);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatBillingPeriod(period: string): string {
  const [year, month] = period.split("-");
  const d = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, 1));
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function assertPeriod(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new ConvexError("Billing period must be YYYY-MM.");
}

const isLive = (c: Doc<"partnerCommissions">) => c.environment !== "sandbox";

/** Commissions that can be paid out now for a partner, up to and including `period`. */
async function payableCommissions(ctx: QueryCtx | MutationCtx, partnerCode: string, period: string) {
  const rows = await ctx.db
    .query("partnerCommissions")
    .withIndex("by_partner_and_period", (q) => q.eq("partnerId", partnerCode).lte("billingPeriod", period))
    .collect();
  return rows.filter(
    (c) =>
      isLive(c) &&
      c.status === "approved" &&
      (c.bulkPayoutStatus ?? "accrued") === "accrued" &&
      !c.payoutTransferId
  );
}

function payoutMath(totalKobo: number) {
  const fee = totalKobo > 0 ? calculatePaystackOutboundFee(totalKobo) : 0;
  const stamp = totalKobo > 0 ? calculateStampDuty(totalKobo) : 0;
  return { feeKobo: fee, stampDutyKobo: stamp, netKobo: Math.max(0, totalKobo - fee - stamp) };
}

async function activeTransfer(ctx: QueryCtx | MutationCtx, partnerCode: string) {
  const transfers = await ctx.db
    .query("partnerPayoutTransfers")
    .withIndex("by_partner_period", (q) => q.eq("partnerCode", partnerCode))
    .collect();
  return transfers.find((t) => t.status === "initiated" || t.status === "otp_required" || t.status === "pending") ?? null;
}

// ─── Admin: summary & invoices ───────────────────────────────────────────────

export const getMonthlyBulkPayoutSummary = query({
  args: { billingPeriod: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const period = args.billingPeriod || getCurrentBillingPeriod();
    assertPeriod(period);
    const settings = (await ctx.db.query("platformRevenueSettings").order("desc").first()) ?? DEFAULT_REVENUE_SETTINGS;
    const partners = await ctx.db.query("partners").collect();
    const periodCommissions = (await ctx.db
      .query("partnerCommissions")
      .withIndex("by_billing_period", (q) => q.eq("billingPeriod", period))
      .collect()).filter(isLive);
    const bankAccounts = await ctx.db.query("partnerBankAccounts").collect();

    const partnerSummaries = [];
    for (const partner of partners) {
      const inPeriod = periodCommissions.filter((c) => c.partnerId === partner.code && c.status !== "reversed" && c.status !== "cancelled");
      const payable = await payableCommissions(ctx, partner.code, period);
      const payableKobo = payable.reduce((s, c) => s + c.netPayable, 0);
      const transfer = await activeTransfer(ctx, partner.code);
      if (inPeriod.length === 0 && payable.length === 0 && !transfer) continue;
      const math = payoutMath(payableKobo);
      const bank = bankAccounts.find((a) => a.partnerCode === partner.code && a.isDefault && a.isVerified);
      const referrals = await ctx.db
        .query("inboundReferrals")
        .withIndex("by_partner_and_environment", (q) => q.eq("partnerId", partner.code).eq("environment", "live"))
        .collect();
      const periodStart = Date.parse(`${period}-01T00:00:00Z`);
      const [y, m] = period.split("-").map(Number);
      const periodEnd = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1);
      const sum = (f: (c: Doc<"partnerCommissions">) => number) => inPeriod.reduce((s, c) => s + f(c), 0);
      const payoutStatus = transfer
        ? "in_progress"
        : payableKobo > 0
          ? "accruing_for_month_end"
          : inPeriod.length > 0 && inPeriod.every((c) => c.bulkPayoutStatus === "paid")
            ? "paid"
            : "no_earnings";
      partnerSummaries.push({
        partnerId: partner.code,
        partnerName: partner.name,
        partnerType: partner.type,
        contactEmail: partner.financeContactEmail || partner.contactEmail,
        contactPhone: partner.contactPhone,
        totalReferredPatients: referrals.filter((r) => r.createdAt >= periodStart && r.createdAt < periodEnd).length,
        totalTreatedSessions: inPeriod.filter((c) => c.eventType === "payment").length,
        totalGrossKobo: sum((c) => c.grossTransactionAmount),
        totalGrossCharged: sum((c) => c.grossTransactionAmount),
        totalPhysioKobo: sum((c) => c.physiotherapistAmount ?? 0),
        totalPhysiotherapistShare: sum((c) => c.physiotherapistAmount ?? 0),
        totalRehabifyKobo: sum((c) => c.rehabifyAmount ?? 0),
        totalRehabifyShare: sum((c) => c.rehabifyAmount ?? 0),
        periodEarningsKobo: sum((c) => c.netPayable),
        // Amount that a payout would send now (includes carry-over and refund adjustments)
        totalPartnerKobo: payableKobo,
        totalPartnerCommission: payableKobo,
        paystackCount: inPeriod.filter((c) => c.paymentMethod !== "bank_transfer").length,
        bankTransferCount: inPeriod.filter((c) => c.paymentMethod === "bank_transfer").length,
        payoutStatus,
        bulkPayoutStatus: payoutStatus,
        bulkPayoutSchedule: "End of month",
        estimatedOutboundFeeKobo: math.feeKobo,
        estimatedStampDutyKobo: math.stampDutyKobo,
        estimatedNetPayoutKobo: math.netKobo,
        activeTransfer: transfer
          ? { reference: transfer.transferReference, status: transfer.status, amountKobo: transfer.amountKobo, transferCode: transfer.transferCode ?? null }
          : null,
        commissions: inPeriod,
        hasBankAccount: Boolean(bank),
        bankAccountName: bank?.accountName,
        bankName: bank?.bankName,
        maskedAccountNumber: bank ? `****${bank.accountNumber.slice(-4)}` : undefined,
      });
    }

    const totals = partnerSummaries.reduce(
      (acc, p) => ({
        totalReferredPatients: acc.totalReferredPatients + p.totalReferredPatients,
        totalSessions: acc.totalSessions + p.totalTreatedSessions,
        totalGrossKobo: acc.totalGrossKobo + p.totalGrossKobo,
        totalPhysioKobo: acc.totalPhysioKobo + p.totalPhysioKobo,
        totalRehabifyKobo: acc.totalRehabifyKobo + p.totalRehabifyKobo,
        totalPartnerKobo: acc.totalPartnerKobo + p.totalPartnerKobo,
      }),
      { totalReferredPatients: 0, totalSessions: 0, totalGrossKobo: 0, totalPhysioKobo: 0, totalRehabifyKobo: 0, totalPartnerKobo: 0 }
    );
    const live = periodCommissions.filter((c) => c.status !== "reversed" && c.status !== "cancelled");
    return {
      billingPeriod: period,
      billingPeriodLabel: formatBillingPeriod(period),
      platformSettings: {
        rehabifyPercent: settings.rehabifyPercent,
        physiotherapistPercent: settings.physiotherapistPercent,
        partnerPercent: settings.partnerPercent,
        paystackFeeBearerInbound: (settings as { paystackFeeBearerInbound?: string }).paystackFeeBearerInbound || "physiotherapist",
        paystackFeeBearerOutbound: (settings as { paystackFeeBearerOutbound?: string }).paystackFeeBearerOutbound || "physiotherapist",
      },
      partnerSummaries,
      partners: partnerSummaries,
      grandTotals: totals,
      totals: {
        totalReferredPatients: totals.totalReferredPatients,
        totalPartners: partnerSummaries.length,
        totalGrossCharged: totals.totalGrossKobo,
        totalPhysiotherapistShare: totals.totalPhysioKobo,
        totalRehabifyShare: totals.totalRehabifyKobo,
        totalPartnerCommission: totals.totalPartnerKobo,
        paystackTotal: live.filter((c) => c.paymentMethod !== "bank_transfer").reduce((s, c) => s + c.grossTransactionAmount, 0),
        bankTransferTotal: live.filter((c) => c.paymentMethod === "bank_transfer").reduce((s, c) => s + c.grossTransactionAmount, 0),
      },
    };
  },
});

/** Itemised ledger for the partner's own commissions (owner or admin). */
export const getPartnerTransparentLedger = query({
  args: { partnerCode: v.string(), billingPeriod: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const settings = (await ctx.db.query("platformRevenueSettings").order("desc").first()) ?? DEFAULT_REVENUE_SETTINGS;
    const base = args.billingPeriod
      ? ctx.db.query("partnerCommissions").withIndex("by_partner_and_period", (q) => q.eq("partnerId", partner.code).eq("billingPeriod", args.billingPeriod))
      : ctx.db.query("partnerCommissions").withIndex("by_partner_id", (q) => q.eq("partnerId", partner.code));
    const rows = (await base.order("desc").take(1000)).filter(isLive);
    const ledger = rows.map((c) => ({
      id: c._id,
      trackingCode: c.trackingCode ?? null,
      eventType: c.eventType,
      careMode: c.careMode ?? null,
      physiotherapistName: c.physiotherapistName ?? null,
      grossChargedKobo: c.grossTransactionAmount,
      partnerEarnedKobo: c.netPayable,
      partnerPercent: c.commissionRate,
      paymentMethod: c.paymentMethod ?? null,
      paymentReference: c.paymentReference ?? null,
      billingPeriod: c.billingPeriod ?? getCurrentBillingPeriod(c.earnedAt),
      status: publicCommissionStatus(c),
      bulkPayoutStatus: c.bulkPayoutStatus ?? "accrued",
      earnedAt: c.earnedAt,
    }));
    const counted = ledger.filter((l) => l.status !== "reversed" && l.status !== "cancelled");
    return {
      partnerCode: partner.code,
      platformSplits: {
        physioPercent: settings.physiotherapistPercent,
        rehabifyPercent: settings.rehabifyPercent,
        partnerPercent: settings.partnerPercent,
      },
      summary: {
        totalReferredPatients: new Set(rows.map((c) => c.patientUserId ?? c.trackingCode)).size,
        totalPayments: counted.filter((l) => l.eventType === "payment").length,
        totalGrossVolumeKobo: counted.reduce((s, l) => s + l.grossChargedKobo, 0),
        totalPartnerEarnedKobo: counted.reduce((s, l) => s + l.partnerEarnedKobo, 0),
        bulkPayoutCycle: "Monthly",
      },
      ledger,
    };
  },
});

/** Settlement statement for one billing period (owner or admin). */
export const generatePartnerInvoice = query({
  args: { partnerCode: v.string(), billingPeriod: v.string() },
  handler: async (ctx, args) => {
    assertPeriod(args.billingPeriod);
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const settings = (await ctx.db.query("platformRevenueSettings").order("desc").first()) ?? DEFAULT_REVENUE_SETTINGS;
    const commissions = (
      await ctx.db
        .query("partnerCommissions")
        .withIndex("by_partner_and_period", (q) => q.eq("partnerId", partner.code).eq("billingPeriod", args.billingPeriod))
        .collect()
    ).filter((c) => isLive(c) && c.status !== "reversed" && c.status !== "cancelled");
    const bank = await ctx.db
      .query("partnerBankAccounts")
      .withIndex("by_partner_code_default", (q) => q.eq("partnerCode", partner.code).eq("isDefault", true))
      .first();
    const lineItems = commissions.map((c, i) => ({
      sn: i + 1,
      date: new Date(c.earnedAt).toISOString().split("T")[0],
      trackingCode: c.trackingCode ?? "—",
      eventType: c.eventType,
      patientName: c.patientName ?? "—",
      physiotherapistName: c.physiotherapistName ?? "—",
      careMode: c.careMode === "virtual" ? "Virtual" : c.careMode === "in_person" ? "In-person" : "—",
      grossAmountKobo: c.grossTransactionAmount,
      physioShareKobo: c.physiotherapistAmount ?? 0,
      rehabifyShareKobo: c.rehabifyAmount ?? 0,
      partnerShareKobo: c.commissionAmount,
      partnerPercent: c.commissionRate,
      withholdingTaxKobo: c.commissionAmount - c.netPayable,
      netPartnerAmountKobo: c.netPayable,
      paymentMethod: c.paymentMethod === "bank_transfer" ? "Bank transfer" : "Paystack",
      paymentReference: c.paymentReference ?? "—",
      payoutStatus: c.bulkPayoutStatus ?? "accrued",
    }));
    const totalNet = lineItems.reduce((s, l) => s + l.netPartnerAmountKobo, 0);
    const math = payoutMath(totalNet);
    return {
      invoiceNumber: `RH-STMT-${args.billingPeriod.replace("-", "")}-${partner.code.toUpperCase().slice(0, 10)}`,
      invoiceDate: new Date().toISOString().split("T")[0],
      billingPeriod: args.billingPeriod,
      billingPeriodLabel: formatBillingPeriod(args.billingPeriod),
      issuer: { name: "Rehabify Health Technologies Ltd", address: "Lagos, Nigeria", email: "finance@physioaroundme.com", website: "physioaroundme.com" },
      recipient: {
        name: partner.name,
        code: partner.code,
        type: partner.type,
        contactEmail: partner.financeContactEmail || partner.contactEmail || "",
        contactPhone: partner.contactPhone || "",
      },
      bankDetails: bank
        ? { bankName: bank.bankName, accountNumber: `******${bank.accountNumber.slice(-4)}`, accountName: bank.accountName }
        : null,
      splitConfig: {
        physiotherapistPercent: settings.physiotherapistPercent,
        rehabifyPercent: settings.rehabifyPercent,
        partnerPercent: settings.partnerPercent,
      },
      lineItems,
      summary: {
        totalSessions: lineItems.filter((l) => l.eventType === "payment").length,
        totalGrossKobo: lineItems.reduce((s, l) => s + l.grossAmountKobo, 0),
        totalPartnerShareKobo: lineItems.reduce((s, l) => s + l.partnerShareKobo, 0),
        totalWithholdingTaxKobo: lineItems.reduce((s, l) => s + l.withholdingTaxKobo, 0),
        totalPaystackCollectionFeesKobo: 0,
        totalPaystackTransferFeesKobo: math.feeKobo,
        totalStampDutyKobo: math.stampDutyKobo,
        totalFeesKobo: math.feeKobo + math.stampDutyKobo,
        totalNetPayableKobo: math.netKobo,
      },
      payoutStatus:
        lineItems.length === 0 ? "no_earnings" : lineItems.every((l) => l.payoutStatus === "paid") ? "paid" : "pending",
    };
  },
});

// ─── Admin: bank-transfer confirmation & manual settlement ───────────────────

/** Admin confirms a marketplace booking was paid by direct bank transfer. */
export const confirmBankTransferBooking = mutation({
  args: { bookingId: v.id("marketplaceBookings"), senderName: v.string(), bankName: v.string(), referenceNote: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new ConvexError("Booking not found.");
    if (booking.paymentStatus === "completed") throw new ConvexError("This booking is already paid.");
    if (!booking.physiotherapistId) throw new ConvexError("Booking has not been assigned to a physiotherapist yet.");
    // Joy bookings wait for the physio to accept after payment; they're confirmed through Joy's flow
    if (booking.sourceSystem === "joy_ai") throw new ConvexError("Confirm Joy payments from the Joy bookings screen.");
    const transferRef = `TXFR-${Date.now()}-${randomString(6, "ABCDEFGHJKMNPQRSTUVWXYZ23456789")}`;
    await ctx.db.patch(booking._id, {
      bankTransferDetails: {
        senderName: args.senderName,
        bankName: args.bankName,
        confirmedBy: adminDisplayName(admin.user),
        confirmedAt: Date.now(),
      },
    });
    const result = await completeMarketplaceBookingCore(ctx, booking._id, {
      paymentReference: transferRef,
      paymentMethod: "bank_transfer",
      paidAmountKobo: booking.serviceAmount,
    });
    return { ...result, success: Boolean(result?.success), transferRef };
  },
});

/** Admin records a manual (off-Paystack) wire for everything payable up to a period. */
export const processMonthlyBulkPayout = mutation({
  args: {
    partnerCode: v.optional(v.string()),
    partnerId: v.optional(v.string()),
    billingPeriod: v.string(),
    payoutBatchReference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    assertPeriod(args.billingPeriod);
    const targetCode = args.partnerCode || args.partnerId;
    if (!targetCode) throw new ConvexError("Choose the partner to settle.");
    if (await activeTransfer(ctx, targetCode)) throw new ConvexError("A Paystack payout for this partner is already in progress.");
    const payable = await payableCommissions(ctx, targetCode, args.billingPeriod);
    const total = payable.reduce((s, c) => s + c.netPayable, 0);
    if (payable.length === 0 || total <= 0) throw new ConvexError("Nothing is payable for this partner.");
    const now = Date.now();
    const reference = args.payoutBatchReference?.trim() || `WIRE-${args.billingPeriod.replace("-", "")}-${randomString(8, "ABCDEFGHJKMNPQRSTUVWXYZ23456789")}`;
    const transferId = await ctx.db.insert("partnerPayoutTransfers", {
      transferReference: reference,
      partnerCode: targetCode,
      billingPeriod: args.billingPeriod,
      amountKobo: total,
      grossCommissionKobo: total,
      feesKobo: 0,
      commissionIds: payable.map((c) => c._id),
      status: "success",
      initiatedBy: `${adminDisplayName(admin.user)} (manual wire)`,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });
    for (const c of payable) {
      await ctx.db.patch(c._id, {
        bulkPayoutStatus: "paid",
        bulkPayoutBatchId: reference,
        payoutTransferId: transferId,
        status: "settled",
        settledAt: now,
        paidAt: now,
        notes: `${c.notes ?? ""} | Paid by manual wire ${reference}${args.note ? ` (${args.note})` : ""}`.slice(0, 2000),
      });
    }
    return {
      success: true,
      settledRecordsCount: payable.length,
      totalSettledKobo: total,
      billingPeriod: args.billingPeriod,
      batchReference: reference,
      message: `Recorded manual payout of ₦${Math.round(total / 100).toLocaleString()} (${payable.length} commission records).`,
    };
  },
});

// ─── Paystack transfers ──────────────────────────────────────────────────────

export const assertAdminForAction = internalQuery({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    return { name: adminDisplayName(admin.user) };
  },
});

export const prepareTransfer = internalMutation({
  args: { partnerCode: v.string(), billingPeriod: v.string(), initiatedBy: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertPeriod(args.billingPeriod);
    if (await activeTransfer(ctx, args.partnerCode)) throw new ConvexError("A payout for this partner is already in progress.");
    const partner = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", args.partnerCode))
      .first();
    if (!partner) throw new ConvexError("Partner not found.");
    const bank = await ctx.db
      .query("partnerBankAccounts")
      .withIndex("by_partner_code_default", (q) => q.eq("partnerCode", partner.code).eq("isDefault", true))
      .first();
    if (!bank || !bank.isVerified) throw new ConvexError(`${partner.name} has no verified payout bank account.`);
    const payable = await payableCommissions(ctx, partner.code, args.billingPeriod);
    const total = payable.reduce((s, c) => s + c.netPayable, 0);
    const math = payoutMath(total);
    if (payable.length === 0 || math.netKobo <= 0) throw new ConvexError(`Nothing payable for ${partner.name} after fees.`);
    const now = Date.now();
    const reference = `TRF_RH_${randomString(20, "ABCDEFGHJKMNPQRSTUVWXYZ23456789")}`;
    const transferId = await ctx.db.insert("partnerPayoutTransfers", {
      transferReference: reference,
      partnerCode: partner.code,
      billingPeriod: args.billingPeriod,
      amountKobo: math.netKobo,
      grossCommissionKobo: total,
      feesKobo: math.feeKobo + math.stampDutyKobo,
      commissionIds: payable.map((c) => c._id),
      status: "initiated",
      initiatedBy: args.initiatedBy,
      createdAt: now,
      updatedAt: now,
    });
    for (const c of payable) {
      await ctx.db.patch(c._id, { bulkPayoutStatus: "pending_bulk_payout", payoutTransferId: transferId, bulkPayoutBatchId: reference });
    }
    return {
      transferId,
      reference,
      amountKobo: math.netKobo,
      partnerName: partner.name,
      bank: {
        id: bank._id,
        accountName: bank.accountName,
        accountNumber: bank.accountNumber,
        bankCode: bank.bankCode,
        // A recipient made with the other Paystack mode (test keys before go-live) is recreated
        recipientCode:
          bank.paystackRecipientCode && (bank.paystackRecipientMode ?? "test") === currentPaystackMode()
            ? bank.paystackRecipientCode
            : null,
      },
    };
  },
});

export const saveRecipientCode = internalMutation({
  args: { bankAccountId: v.id("partnerBankAccounts"), recipientCode: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.bankAccountId, {
      paystackRecipientCode: args.recipientCode,
      paystackRecipientMode: currentPaystackMode(),
      updatedAt: Date.now(),
    });
  },
});

/** Paystack answered and refused the transfer (so no money moved). */
class TransferRejected extends Error {
  constructor(message: string, readonly httpStatus: number, readonly answered: boolean) {
    super(message);
  }
}

/**
 * Only a clear 4xx refusal from Paystack means nothing was sent. Timeouts, network errors,
 * 5xx and unreadable replies may still have gone through, so those transfers stay pending
 * for the transfer webhook (or verifyPartnerTransfer) to settle, and their commissions are
 * not released to be paid a second time.
 */
function isDefiniteRefusal(error: unknown): boolean {
  return error instanceof TransferRejected && error.answered && error.httpStatus >= 400 && error.httpStatus < 500;
}

export const getTransferForVerify = internalQuery({
  args: { transferId: v.id("partnerPayoutTransfers") },
  handler: async (ctx, args) => ctx.db.get(args.transferId),
});

/**
 * Admin: ask Paystack for the real outcome of a partner transfer that is stuck pending (no
 * webhook arrived, or the request timed out) and settle it.
 */
export const verifyPartnerTransfer = action({
  args: { transferId: v.id("partnerPayoutTransfers") },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    await ctx.runQuery(internal.monthlySettlements.assertAdminForAction, {});
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new ConvexError("Payment service not configured (PAYSTACK_SECRET_KEY missing).");
    const transfer: Doc<"partnerPayoutTransfers"> | null = await ctx.runQuery(internal.monthlySettlements.getTransferForVerify, args);
    if (!transfer) throw new ConvexError("Transfer not found.");
    const response = await fetch(`https://api.paystack.co/transfer/verify/${encodeURIComponent(transfer.transferReference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: { status?: string; transfer_code?: string } } | null;
    if (response.status === 404 || (data && data.status === false && /not found/i.test(data.message ?? ""))) {
      // Paystack never created it: safe to release the commissions
      await ctx.runMutation(internal.monthlySettlements.markTransferState, {
        transferId: transfer._id,
        state: "failed",
        reason: "Paystack has no record of this transfer",
      });
      return { status: "failed", message: "Paystack has no record of this transfer. The commissions are payable again." };
    }
    if (!response.ok || !data?.status) throw new ConvexError(data?.message || `Paystack returned HTTP ${response.status}`);
    const paystackStatus = data.data?.status ?? "unknown";
    const state = paystackStatus === "success" ? "success" : paystackStatus === "failed" ? "failed" : paystackStatus === "otp" ? "otp_required" : "pending";
    await ctx.runMutation(internal.monthlySettlements.markTransferState, {
      transferId: transfer._id,
      state,
      transferCode: data.data?.transfer_code,
      reason: state === "failed" ? "Paystack reports the transfer failed" : undefined,
    });
    return { status: state, paystackStatus, message: `Paystack reports this transfer as ${paystackStatus}.` };
  },
});

async function settleTransfer(ctx: MutationCtx, transfer: Doc<"partnerPayoutTransfers">, outcome: "success" | "failed" | "reversed", reason?: string) {
  if (transfer.status === "success" || transfer.status === "failed" || transfer.status === "reversed") {
    // Paystack can deliver "reversed" after "success": release the commissions again.
    if (!(transfer.status === "success" && outcome === "reversed")) return false;
  }
  const now = Date.now();
  await ctx.db.patch(transfer._id, { status: outcome, failureReason: reason, updatedAt: now, completedAt: now });
  for (const id of transfer.commissionIds) {
    const c = await ctx.db.get(id);
    if (!c || c.payoutTransferId !== transfer._id) continue;
    if (outcome === "success") {
      await ctx.db.patch(id, { bulkPayoutStatus: "paid", status: "settled", settledAt: now, paidAt: now });
    } else {
      await ctx.db.patch(id, {
        bulkPayoutStatus: "accrued",
        status: c.status === "settled" ? "approved" : c.status,
        payoutTransferId: undefined,
        bulkPayoutBatchId: undefined,
        settledAt: undefined,
        paidAt: undefined,
        notes: `${c.notes ?? ""} | Payout ${transfer.transferReference} ${outcome}${reason ? `: ${reason}` : ""}`.slice(0, 2000),
      });
    }
  }
  return true;
}

export const markTransferState = internalMutation({
  args: {
    transferId: v.id("partnerPayoutTransfers"),
    state: v.union(v.literal("otp_required"), v.literal("pending"), v.literal("success"), v.literal("failed")),
    transferCode: v.optional(v.string()),
    bulkBatchCode: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) return;
    if (args.state === "success" || args.state === "failed") {
      await ctx.db.patch(transfer._id, { transferCode: args.transferCode ?? transfer.transferCode, bulkBatchCode: args.bulkBatchCode ?? transfer.bulkBatchCode });
      await settleTransfer(ctx, (await ctx.db.get(transfer._id))!, args.state, args.reason);
      return;
    }
    if (transfer.status === "success" || transfer.status === "failed" || transfer.status === "reversed") return;
    await ctx.db.patch(transfer._id, {
      status: args.state,
      transferCode: args.transferCode ?? transfer.transferCode,
      bulkBatchCode: args.bulkBatchCode ?? transfer.bulkBatchCode,
      failureReason: args.reason ?? transfer.failureReason,
      updatedAt: Date.now(),
    });
  },
});

async function ensureRecipient(ctx: any, secret: string, prepared: { bank: { id: Id<"partnerBankAccounts">; accountName: string; accountNumber: string; bankCode: string; recipientCode: string | null }; partnerName: string }) {
  if (prepared.bank.recipientCode) return prepared.bank.recipientCode;
  const response = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "nuban",
      name: prepared.bank.accountName,
      account_number: prepared.bank.accountNumber,
      bank_code: prepared.bank.bankCode,
      currency: "NGN",
      description: `Partner payout: ${prepared.partnerName}`,
    }),
  });
  const data = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: { recipient_code?: string } } | null;
  if (!data?.status || !data.data?.recipient_code) throw new Error(data?.message || "Could not create the Paystack transfer recipient");
  await ctx.runMutation(internal.monthlySettlements.saveRecipientCode, { bankAccountId: prepared.bank.id, recipientCode: data.data.recipient_code });
  return data.data.recipient_code;
}

export const getPaystackBalance = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.monthlySettlements.assertAdminForAction, {});
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return { success: false, message: "PAYSTACK_SECRET_KEY is not configured", balanceKobo: 0, balanceNaira: 0 };
    try {
      const response = await fetch("https://api.paystack.co/balance", { headers: { Authorization: `Bearer ${secret}` } });
      const data = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: Array<{ currency: string; balance: number }> } | null;
      if (!response.ok || !data?.status || !Array.isArray(data.data)) {
        return { success: false, message: data?.message || `Paystack balance error: HTTP ${response.status}`, balanceKobo: 0, balanceNaira: 0 };
      }
      const ngn = data.data.find((b) => b.currency === "NGN") ?? data.data[0];
      const balanceKobo = ngn?.balance ?? 0;
      return { success: true, balanceKobo, balanceNaira: Math.round(balanceKobo / 100), currency: ngn?.currency ?? "NGN" };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : "Balance request failed", balanceKobo: 0, balanceNaira: 0 };
    }
  },
});

/** Pays one partner everything payable up to `billingPeriod` via a Paystack transfer. */
export const executePartnerPayoutTransfer = action({
  args: { partnerCode: v.optional(v.string()), partnerId: v.optional(v.string()), billingPeriod: v.string(), note: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    const admin: { name: string } = await ctx.runQuery(internal.monthlySettlements.assertAdminForAction, {});
    const targetCode = args.partnerCode || args.partnerId;
    if (!targetCode) throw new ConvexError("Partner code is required.");
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new ConvexError("Payment service not configured (PAYSTACK_SECRET_KEY missing).");

    const prepared: any = await ctx.runMutation(internal.monthlySettlements.prepareTransfer, {
      partnerCode: targetCode,
      billingPeriod: args.billingPeriod,
      initiatedBy: admin.name,
    });
    let requestSent = false;
    try {
      const recipient = await ensureRecipient(ctx, secret, prepared);
      requestSent = true;
      const response = await fetch("https://api.paystack.co/transfer", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          source: "balance",
          amount: prepared.amountKobo,
          recipient,
          reason: `Rehabify partner settlement to ${args.billingPeriod}${args.note ? ` — ${args.note.slice(0, 60)}` : ""}`,
          reference: prepared.reference,
        }),
      });
      const data = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: { status?: string; transfer_code?: string } } | null;
      if (!response.ok || !data?.status) throw new TransferRejected(data?.message || `Paystack transfer failed (HTTP ${response.status})`, response.status, data !== null);
      const state = data.data?.status === "otp" ? "otp_required" : data.data?.status === "success" ? "success" : "pending";
      await ctx.runMutation(internal.monthlySettlements.markTransferState, {
        transferId: prepared.transferId,
        state,
        transferCode: data.data?.transfer_code,
      });
      return {
        success: state !== "otp_required",
        requiresOtp: state === "otp_required",
        transferCode: data.data?.transfer_code,
        transferReference: prepared.reference,
        amountKobo: prepared.amountKobo,
        status: state,
        message:
          state === "otp_required"
            ? "Paystack requires OTP authorisation for this transfer."
            : `Transfer of ₦${Math.round(prepared.amountKobo / 100).toLocaleString()} to ${prepared.partnerName} submitted. Commissions are marked paid when Paystack confirms it.`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const unknown = requestSent && !isDefiniteRefusal(error);
      await ctx.runMutation(internal.monthlySettlements.markTransferState, {
        transferId: prepared.transferId,
        state: unknown ? "pending" : "failed",
        reason: unknown ? `Outcome unknown (${message}). Check this transfer on Paystack before paying again.` : message,
      });
      throw new ConvexError(
        unknown
          ? "We couldn't confirm whether Paystack accepted the transfer. It's marked pending: check it on Paystack before trying again."
          : message || "Transfer failed"
      );
    }
  },
});

export const getTransferByCode = internalQuery({
  args: { transferCode: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("partnerPayoutTransfers")
      .withIndex("by_transfer_code", (q) => q.eq("transferCode", args.transferCode))
      .first();
  },
});

export const finalizePartnerPayoutTransfer = action({
  args: { transferCode: v.string(), otp: v.string(), partnerCode: v.optional(v.string()), billingPeriod: v.optional(v.string()), transferReference: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    await ctx.runQuery(internal.monthlySettlements.assertAdminForAction, {});
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new ConvexError("Payment service not configured.");
    const transfer: Doc<"partnerPayoutTransfers"> | null = await ctx.runQuery(internal.monthlySettlements.getTransferByCode, { transferCode: args.transferCode });
    if (!transfer || transfer.status !== "otp_required") throw new ConvexError("No transfer is waiting for an OTP with that code.");
    const response = await fetch("https://api.paystack.co/transfer/finalize_transfer", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ transfer_code: args.transferCode, otp: args.otp }),
    });
    const data = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: { status?: string } } | null;
    if (!response.ok || !data?.status) throw new ConvexError(data?.message || "Failed to finalise the Paystack transfer.");
    await ctx.runMutation(internal.monthlySettlements.markTransferState, {
      transferId: transfer._id,
      state: data.data?.status === "success" ? "success" : "pending",
      transferCode: args.transferCode,
    });
    return { success: true, message: "Transfer authorised. Commissions are marked paid when Paystack confirms the transfer.", transferCode: args.transferCode };
  },
});

export const listPayablePartners = internalQuery({
  args: { billingPeriod: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const partners = await ctx.db.query("partners").collect();
    const result: string[] = [];
    for (const partner of partners) {
      if (await activeTransfer(ctx, partner.code)) continue;
      const bank = await ctx.db
        .query("partnerBankAccounts")
        .withIndex("by_partner_code_default", (q) => q.eq("partnerCode", partner.code).eq("isDefault", true))
        .first();
      if (!bank?.isVerified) continue;
      const total = (await payableCommissions(ctx, partner.code, args.billingPeriod)).reduce((s, c) => s + c.netPayable, 0);
      if (payoutMath(total).netKobo > 0) result.push(partner.code);
    }
    return result;
  },
});

/** Pays every eligible partner (verified bank account, positive balance) in one Paystack bulk transfer. */
export const executePaystackBulkMonthlyPayout = action({
  args: { billingPeriod: v.string() },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    const admin: { name: string } = await ctx.runQuery(internal.monthlySettlements.assertAdminForAction, {});
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new ConvexError("Payment service not configured.");
    const codes: string[] = await ctx.runQuery(internal.monthlySettlements.listPayablePartners, { billingPeriod: args.billingPeriod });
    if (codes.length === 0) throw new ConvexError("No partners have a verified bank account and a positive payable balance.");

    const prepared: any[] = [];
    for (const code of codes) {
      try {
        const item = await ctx.runMutation(internal.monthlySettlements.prepareTransfer, { partnerCode: code, billingPeriod: args.billingPeriod, initiatedBy: `${admin.name} (bulk)` });
        item.recipient = await ensureRecipient(ctx, secret, item);
        prepared.push(item);
      } catch (error) {
        console.error("bulk_payout_prepare_failed", { code, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (prepared.length === 0) throw new ConvexError("Could not prepare any transfers.");

    try {
      const response = await fetch("https://api.paystack.co/transfer/bulk", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          currency: "NGN",
          source: "balance",
          transfers: prepared.map((p) => ({ amount: p.amountKobo, recipient: p.recipient, reference: p.reference, reason: `Rehabify partner settlement to ${args.billingPeriod}` })),
        }),
      });
      const data = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: Array<{ reference?: string; transfer_code?: string; status?: string }> } | null;
      if (!response.ok || !data?.status) throw new TransferRejected(data?.message || `Paystack bulk transfer failed (HTTP ${response.status})`, response.status, data !== null);
      for (const p of prepared) {
        const row = data.data?.find((d) => d.reference === p.reference);
        await ctx.runMutation(internal.monthlySettlements.markTransferState, {
          transferId: p.transferId,
          state: row?.status === "success" ? "success" : "pending",
          transferCode: row?.transfer_code,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const unknown = !isDefiniteRefusal(error);
      for (const p of prepared) {
        await ctx.runMutation(internal.monthlySettlements.markTransferState, {
          transferId: p.transferId,
          state: unknown ? "pending" : "failed",
          reason: unknown ? `Outcome unknown (${message}). Check these transfers on Paystack before paying again.` : message,
        });
      }
      throw new ConvexError(
        unknown
          ? "We couldn't confirm whether Paystack accepted the bulk transfer. The transfers are marked pending: check them on Paystack before trying again."
          : message || "Bulk transfer failed"
      );
    }
    const total = prepared.reduce((s, p) => s + p.amountKobo, 0);
    return {
      success: true,
      partnersCount: prepared.length,
      totalAmountKobo: total,
      message: `Bulk transfer submitted for ${prepared.length} partner(s), ₦${Math.round(total / 100).toLocaleString()} in total. Commissions are marked paid as Paystack confirms each transfer.`,
    };
  },
});

/**
 * Paystack transfer webhooks (transfer.success / transfer.failed / transfer.reversed).
 * The raw body and signature are verified here, inside Convex, so this public entry
 * point cannot be used to mark payouts paid or reverse them.
 */
export const recordPaystackTransferWebhook = mutation({
  args: { rawBody: v.string(), signature: v.string() },
  handler: async (ctx, args) => {
    if (!(await verifyPaystackSignature(args.rawBody, args.signature))) throw new Error("Invalid Paystack webhook signature");
    let payload: { event?: string; data?: Record<string, any> };
    try {
      payload = JSON.parse(args.rawBody);
    } catch {
      throw new Error("Invalid webhook payload");
    }
    const event = payload.event ?? "";
    const data = payload.data ?? {};
    const reference = typeof data.reference === "string" ? data.reference : "";
    if (!["transfer.success", "transfer.failed", "transfer.reversed"].includes(event) || !reference) {
      return { handled: false };
    }

    const transfer = await ctx.db
      .query("partnerPayoutTransfers")
      .withIndex("by_reference", (q) => q.eq("transferReference", reference))
      .first();
    if (transfer) {
      const outcome = event === "transfer.success" ? "success" : event === "transfer.reversed" ? "reversed" : "failed";
      if (typeof data.transfer_code === "string" && !transfer.transferCode) await ctx.db.patch(transfer._id, { transferCode: data.transfer_code });
      const changed = await settleTransfer(ctx, transfer, outcome, typeof data.reason === "string" ? data.reason : undefined);
      return { handled: true, kind: "partner_payout", outcome, changed };
    }

    // Referring-doctor payouts made from the Paystack dashboard carry "referral:<id>".
    if (event === "transfer.success") {
      const metadataId = typeof data.metadata?.referralId === "string" ? data.metadata.referralId : null;
      const match = metadataId ?? (`${reference} ${data.reason ?? ""}`.match(/(?:referral:|convex:)([a-z0-9]{20,40})/i)?.[1] ?? null);
      const referralId = match ? ctx.db.normalizeId("inboundReferrals", match) : null;
      const referral = referralId ? await ctx.db.get(referralId) : null;
      if (referral) {
        const events = await ctx.db
          .query("referralEvents")
          .withIndex("by_referral_id", (q) => q.eq("referralId", referral._id))
          .collect();
        if (events.some((e) => e.eventName === "referral.paid_out" && e.metadata?.transferReference === reference)) {
          return { handled: true, kind: "doctor_payout", duplicate: true };
        }
        const amount = Number(data.amount) || 0;
        await ctx.db.patch(referral._id, { commissionEarned: (referral.commissionEarned ?? 0) + amount, updatedAt: Date.now() });
        await ctx.db.insert("referralEvents", {
          referralId: referral._id,
          eventName: "referral.paid_out",
          occurredAt: Date.now(),
          actorType: "system",
          actorId: "paystack",
          metadata: { transferReference: reference, amountKobo: amount },
        });
        return { handled: true, kind: "doctor_payout" };
      }
    }
    return { handled: false };
  },
});
