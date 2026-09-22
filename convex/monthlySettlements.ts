import { query, mutation, action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { ensureUserRole } from "./auth";
import {
  DEFAULT_REVENUE_SETTINGS,
  calculateSplit,
  calculatePaystackInboundFee,
  calculatePaystackOutboundFee,
  calculateStampDuty,
  applyFeeDeduction,
} from "./platformSettings";

/**
 * Returns current billing period e.g. "2026-09"
 */
export function getCurrentBillingPeriod(timestamp: number = Date.now()): string {
  const d = new Date(timestamp);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Formats a billing period to human-readable month e.g. "September 2026"
 */
export function formatBillingPeriod(period: string): string {
  const [year, month] = period.split("-");
  const d = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, 1));
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Query for Admin: Aggregate monthly bulk payouts and referral performance across
 * all referring healthcare firms, clinics, hospitals, and doctors.
 */
export const getMonthlyBulkPayoutSummary = query({
  args: {
    billingPeriod: v.optional(v.string()), // e.g. "2026-09"
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx as any, ["admin"]);

    const activePeriod = args.billingPeriod || getCurrentBillingPeriod();

    // 1. Fetch platform settings
    const settingsDoc = await ctx.db
      .query("platformRevenueSettings")
      .order("desc")
      .first();

    const platformSettings = settingsDoc || DEFAULT_REVENUE_SETTINGS;

    // 2. Fetch all partners
    const partners = await ctx.db.query("partners").collect();

    // 3. Fetch all commissions for this billing period
    const commissions = await ctx.db
      .query("partnerCommissions")
      .withIndex("by_billing_period", (q) => q.eq("billingPeriod", activePeriod))
      .collect();

    // 4. Fetch all inbound referrals for this period
    const allReferrals = await ctx.db
      .query("inboundReferrals")
      .collect();

    // Group referrals & commissions by partnerId / clinic / firm
    const partnerSummaries = partners.map((partner) => {
      const partnerComms = commissions.filter((c) => c.partnerId === partner.code);
      const partnerRefs = allReferrals.filter((r) => r.partnerId === partner.code);

      let totalGrossKobo = 0;
      let totalPhysioKobo = 0;
      let totalRehabifyKobo = 0;
      let totalPartnerKobo = 0;
      let paystackCount = 0;
      let bankTransferCount = 0;

      for (const c of partnerComms) {
        totalGrossKobo += c.grossTransactionAmount;
        totalPhysioKobo += c.physiotherapistAmount || Math.round((c.grossTransactionAmount * platformSettings.physiotherapistPercent) / 100);
        totalRehabifyKobo += c.rehabifyAmount || Math.round((c.grossTransactionAmount * platformSettings.rehabifyPercent) / 100);
        totalPartnerKobo += c.partnerAmount || c.commissionAmount;

        if (c.paymentMethod === "bank_transfer") {
          bankTransferCount++;
        } else {
          paystackCount++;
        }
      }

      const allPaid = partnerComms.length > 0 && partnerComms.every((c) => c.bulkPayoutStatus === "paid");
      const payoutStatus = partnerComms.length === 0 
        ? "no_earnings" 
        : allPaid 
        ? "paid" 
        : "accruing_for_month_end";

      return {
        partnerId: partner.code,
        partnerName: partner.name,
        partnerType: partner.type, // "hospital", "clinic", "corporate", "hmo"
        contactEmail: partner.contactEmail || partner.ownerEmail,
        contactPhone: partner.contactPhone,
        totalReferredPatients: partnerRefs.length,
        totalTreatedSessions: partnerComms.length,
        totalGrossKobo,
        totalGrossCharged: totalGrossKobo,
        totalPhysioKobo,
        totalPhysiotherapistShare: totalPhysioKobo,
        totalRehabifyKobo,
        totalRehabifyShare: totalRehabifyKobo,
        totalPartnerKobo,
        totalPartnerCommission: totalPartnerKobo,
        paystackCount,
        bankTransferCount,
        payoutStatus,
        bulkPayoutStatus: payoutStatus,
        bulkPayoutSchedule: "End of Month",
        // Fee estimates for this partner's payout
        estimatedOutboundFeeKobo: calculatePaystackOutboundFee(totalPartnerKobo),
        estimatedStampDutyKobo: calculateStampDuty(totalPartnerKobo),
        estimatedNetPayoutKobo: Math.max(0, totalPartnerKobo - calculatePaystackOutboundFee(totalPartnerKobo) - calculateStampDuty(totalPartnerKobo)),
        commissions: partnerComms,
      };
    });

    // Grand totals across all firms/clinics
    const grandTotals = partnerSummaries.reduce(
      (acc, p) => ({
        totalPatientsReferred: acc.totalPatientsReferred + p.totalReferredPatients,
        totalSessions: acc.totalSessions + p.totalTreatedSessions,
        totalGrossKobo: acc.totalGrossKobo + p.totalGrossKobo,
        totalPhysioKobo: acc.totalPhysioKobo + p.totalPhysioKobo,
        totalRehabifyKobo: acc.totalRehabifyKobo + p.totalRehabifyKobo,
        totalPartnerKobo: acc.totalPartnerKobo + p.totalPartnerKobo,
      }),
      {
        totalPatientsReferred: 0,
        totalSessions: 0,
        totalGrossKobo: 0,
        totalPhysioKobo: 0,
        totalRehabifyKobo: 0,
        totalPartnerKobo: 0,
      }
    );

    let paystackTotalKobo = 0;
    let bankTransferTotalKobo = 0;
    for (const c of commissions) {
      if (c.paymentMethod === "bank_transfer") {
        bankTransferTotalKobo += c.grossTransactionAmount;
      } else {
        paystackTotalKobo += c.grossTransactionAmount;
      }
    }

    // Resolve partner bank account status
    const partnerBankAccounts = await ctx.db
      .query("partnerBankAccounts")
      .collect();

    // Enrich partner summaries with bank account status
    const enrichedPartnerSummaries = partnerSummaries.map((p) => {
      const bankAcct = partnerBankAccounts.find(
        (a) => a.partnerCode === p.partnerId && a.isDefault && a.isVerified
      );
      return {
        ...p,
        hasBankAccount: !!bankAcct,
        bankAccountName: bankAcct?.accountName,
        bankName: bankAcct?.bankName,
        maskedAccountNumber: bankAcct?.accountNumber
          ? `****${bankAcct.accountNumber.slice(-4)}`
          : undefined,
      };
    });

    return {
      billingPeriod: activePeriod,
      billingPeriodLabel: formatBillingPeriod(activePeriod),
      platformSettings: {
        rehabifyPercent: platformSettings.rehabifyPercent,
        physiotherapistPercent: platformSettings.physiotherapistPercent,
        partnerPercent: platformSettings.partnerPercent,
        paystackFeeBearerInbound: (platformSettings as any).paystackFeeBearerInbound || "physiotherapist",
        paystackFeeBearerOutbound: (platformSettings as any).paystackFeeBearerOutbound || "physiotherapist",
      },
      partnerSummaries: enrichedPartnerSummaries,
      partners: enrichedPartnerSummaries,
      grandTotals,
      totals: {
        totalReferredPatients: grandTotals.totalPatientsReferred,
        totalPartners: partners.length,
        totalGrossCharged: grandTotals.totalGrossKobo,
        totalPhysiotherapistShare: grandTotals.totalPhysioKobo,
        totalRehabifyShare: grandTotals.totalRehabifyKobo,
        totalPartnerCommission: grandTotals.totalPartnerKobo,
        paystackTotal: paystackTotalKobo,
        bankTransferTotal: bankTransferTotalKobo,
      },
    };
  },
});

/**
 * Query for Partner Portal: Returns transparent, itemized ledger for a specific partner.
 * Shows what the physiotherapist charged, the 80% physio share, 10% Rehabify share,
 * and 10% Partner share, with payment method (Paystack vs Transfer).
 */
export const getPartnerTransparentLedger = query({
  args: {
    partnerCode: v.string(),
    billingPeriod: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Fetch platform settings
    const settingsDoc = await ctx.db
      .query("platformRevenueSettings")
      .order("desc")
      .first();

    const platformSettings = settingsDoc || DEFAULT_REVENUE_SETTINGS;

    // 2. Fetch commissions for this partner
    let queryBuilder = ctx.db
      .query("partnerCommissions")
      .withIndex("by_partner_id", (q) => q.eq("partnerId", args.partnerCode));

    const commissions = await queryBuilder.order("desc").collect();

    // Filter by billing period if provided
    const filtered = args.billingPeriod
      ? commissions.filter((c) => c.billingPeriod === args.billingPeriod)
      : commissions;

    // Map itemized ledger with full transparency
    const itemized = filtered.map((c) => {
      const grossKobo = c.grossTransactionAmount;
      const physioPercent = c.physioPercent || platformSettings.physiotherapistPercent;
      const rehabifyPercent = c.rehabifyPercent || platformSettings.rehabifyPercent;
      const partnerPercent = c.partnerPercent || platformSettings.partnerPercent;

      const physioKobo = c.physiotherapistAmount || Math.round((grossKobo * physioPercent) / 100);
      const rehabifyKobo = c.rehabifyAmount || Math.round((grossKobo * rehabifyPercent) / 100);
      const partnerKobo = c.partnerAmount || c.commissionAmount;

      return {
        id: c._id,
        trackingCode: c.trackingCode,
        patientName: c.patientName,
        careMode: c.careMode || "in_person",
        careModeLabel: c.careMode === "virtual" ? "Virtual Consultation" : "In-Person Session",
        physiotherapistName: c.physiotherapistName || "MRTBN Verified Physiotherapist",
        grossChargedKobo: grossKobo,
        physioEarnedKobo: physioKobo,
        physioPercent,
        rehabifyShareKobo: rehabifyKobo,
        rehabifyPercent,
        partnerEarnedKobo: partnerKobo,
        partnerPercent,
        paymentMethod: c.paymentMethod || "paystack",
        paymentMethodLabel: c.paymentMethod === "bank_transfer" ? "Direct Bank Transfer" : "Paystack Online",
        paymentReference: c.paymentReference,
        billingPeriod: c.billingPeriod || getCurrentBillingPeriod(c.earnedAt),
        bulkPayoutStatus: c.bulkPayoutStatus || (c.status === "settled" ? "paid" : "accrued"),
        bulkPayoutDate: "Paid in bulk at month-end",
        earnedAt: c.earnedAt,
      };
    });

    // Compute KPI cards
    const totalEarnedKobo = itemized.reduce((sum, item) => sum + item.partnerEarnedKobo, 0);
    const totalGrossKobo = itemized.reduce((sum, item) => sum + item.grossChargedKobo, 0);
    const totalReferredPatients = new Set(itemized.map((item) => item.trackingCode)).size;

    return {
      partnerCode: args.partnerCode,
      platformSplits: {
        physioPercent: platformSettings.physiotherapistPercent,
        rehabifyPercent: platformSettings.rehabifyPercent,
        partnerPercent: platformSettings.partnerPercent,
      },
      summary: {
        totalReferredPatients,
        totalCompletedSessions: itemized.length,
        totalGrossVolumeKobo: totalGrossKobo,
        totalPartnerEarnedKobo: totalEarnedKobo,
        bulkPayoutCycle: "End of Month Bulk Payout",
      },
      ledger: itemized,
    };
  },
});

/**
 * Mutation: Record booking payment and auto-generate the transparent 80/10/10 split.
 * Works whether payment was completed via Paystack OR confirmed via Bank Transfer!
 */
export const recordBookingPaymentAndSplit = mutation({
  args: {
    bookingId: v.id("marketplaceBookings"),
    paymentMethod: v.union(v.literal("paystack"), v.literal("bank_transfer")),
    paymentReference: v.string(),
    senderName: v.optional(v.string()),
    bankName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) {
      throw new Error("Booking not found");
    }

    const now = Date.now();
    const billingPeriod = getCurrentBillingPeriod(now);

    // 1. Fetch platform settings
    const settingsDoc = await ctx.db
      .query("platformRevenueSettings")
      .order("desc")
      .first();

    const platformSettings = settingsDoc || DEFAULT_REVENUE_SETTINGS;

    // 2. Resolve Physiotherapist details
    const physioUser = await ctx.db.get(booking.physiotherapistId);
    const physioName = physioUser ? `${physioUser.firstName || ""} ${physioUser.lastName || ""}`.trim() : "Physiotherapist";

    // 3. Resolve Patient details
    const patientUser = await ctx.db.get(booking.patientId);
    const patientName = booking.guestName || (patientUser ? `${patientUser.firstName || ""} ${patientUser.lastName || ""}`.trim() : "Patient");

    // 4. Resolve Partner referral attribution
    // Check if patient was referred by a partner code
    const partnerCode = booking.partnerId || patientUser?.referredByPartnerCode;
    const hasPartner = !!partnerCode;

    // 5. Calculate 3-way split (80% Physio, 10% Rehabify, 10% Partner)
    const grossKobo = booking.serviceAmount;
    const split = calculateSplit(grossKobo, platformSettings, hasPartner);

    const careMode: "virtual" | "in_person" = booking.isOnline ? "virtual" : "in_person";

    // 5b. Calculate Paystack fees (only for Paystack payments)
    const isPaystack = args.paymentMethod === "paystack";
    const inboundFeeKobo = isPaystack ? calculatePaystackInboundFee(grossKobo) : 0;
    const outboundFeeKobo = calculatePaystackOutboundFee(split.partnerAmount); // For partner payout
    const stampDutyKobo = calculateStampDuty(split.partnerAmount);

    const inboundBearer = (platformSettings as any).paystackFeeBearerInbound || "physiotherapist";
    const outboundBearer = (platformSettings as any).paystackFeeBearerOutbound || "physiotherapist";

    const netAmounts = applyFeeDeduction(
      split,
      inboundFeeKobo,
      outboundFeeKobo,
      stampDutyKobo,
      inboundBearer,
      outboundBearer
    );

    // 6. Update booking record
    await ctx.db.patch(booking._id, {
      paymentStatus: "completed",
      bookingStatus: "confirmed",
      paymentMethod: args.paymentMethod,
      paymentReference: args.paymentReference,
      paidAt: now,
      careMode,
      physiotherapistEarnings: split.physiotherapistAmount,
      rehabifyEarnings: split.rehabifyAmount,
      partnerEarnings: split.partnerAmount,
      bankTransferDetails: args.paymentMethod === "bank_transfer" ? {
        senderName: args.senderName,
        bankName: args.bankName,
        confirmedAt: now,
      } : undefined,
      updatedAt: now,
    });

    // 7. If referred by partner, create or update partnerCommissions transparent record
    if (hasPartner && partnerCode) {
      // Find inbound referral record if exists
      const referral = await ctx.db
        .query("inboundReferrals")
        .withIndex("by_partner_id", (q) => q.eq("partnerId", partnerCode))
        .filter((q) => q.eq(q.field("trackingCode"), patientUser?.referralPublicCode || ""))
        .first();

      const trackingCode = referral?.trackingCode || patientUser?.referralPublicCode || `RHB-${Math.floor(10000 + Math.random() * 90000)}`;

      await ctx.db.insert("partnerCommissions", {
        partnerId: partnerCode,
        referralId: referral?._id || (booking._id as any),
        trackingCode,
        patientName,
        eventType: "booking_confirmed",
        grossTransactionAmount: grossKobo,
        commissionRate: split.partnerPercent,
        commissionAmount: split.partnerAmount,
        netPayable: netAmounts.netPartnerAmount,
        physiotherapistId: booking.physiotherapistId,
        physiotherapistName: physioName,
        careMode,
        physiotherapistAmount: split.physiotherapistAmount, // 80%
        rehabifyAmount: split.rehabifyAmount,               // 10%
        partnerAmount: split.partnerAmount,                 // 10%
        physioPercent: split.physioPercent,
        rehabifyPercent: split.rehabifyPercent,
        partnerPercent: split.partnerPercent,
        // Paystack fee tracking
        paystackInboundFeeKobo: inboundFeeKobo,
        paystackOutboundFeeKobo: outboundFeeKobo,
        stampDutyKobo: stampDutyKobo,
        feeBearer: inboundBearer,
        netPhysiotherapistAmount: netAmounts.netPhysiotherapistAmount,
        netPartnerAmount: netAmounts.netPartnerAmount,
        netRehabifyAmount: netAmounts.netRehabifyAmount,
        paymentMethod: args.paymentMethod,
        paymentReference: args.paymentReference,
        billingPeriod,
        bulkPayoutStatus: "accrued",
        status: "approved",
        notes: `Recorded via ${args.paymentMethod === "bank_transfer" ? "Direct Bank Transfer" : "Paystack Gateway"}. 80/10/10 platform split applied. Fees: Inbound ₦${(inboundFeeKobo / 100).toFixed(0)}, Outbound ₦${(outboundFeeKobo / 100).toFixed(0)}, Stamp Duty ₦${(stampDutyKobo / 100).toFixed(0)} (bearer: ${inboundBearer}).`,
        earnedAt: now,
      });
    }

    return {
      success: true,
      split,
      billingPeriod,
      paymentMethod: args.paymentMethod,
    };
  },
});

/**
 * Mutation for Admin: Confirm a manual bank transfer payment for any booking.
 * Guarantees that bank transfer payments are fully tracked and never lost.
 */
export const confirmBankTransferBooking = mutation({
  args: {
    bookingId: v.id("marketplaceBookings"),
    senderName: v.string(),
    bankName: v.string(),
    referenceNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx as any, ["admin"]);
    const adminName = `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || admin.email || "Admin";

    const transferRef = `TXFR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");

    const now = Date.now();
    const billingPeriod = getCurrentBillingPeriod(now);

    // 1. Fetch platform settings
    const settingsDoc = await ctx.db
      .query("platformRevenueSettings")
      .order("desc")
      .first();

    const platformSettings = settingsDoc || DEFAULT_REVENUE_SETTINGS;

    // 2. Resolve Physiotherapist details
    const physioUser = await ctx.db.get(booking.physiotherapistId);
    const physioName = physioUser ? `${physioUser.firstName || ""} ${physioUser.lastName || ""}`.trim() : "Physiotherapist";

    // 3. Resolve Patient details
    const patientUser = await ctx.db.get(booking.patientId);
    const patientName = booking.guestName || (patientUser ? `${patientUser.firstName || ""} ${patientUser.lastName || ""}`.trim() : "Patient");

    const partnerCode = booking.partnerId || patientUser?.referredByPartnerCode;
    const hasPartner = !!partnerCode;

    const grossKobo = booking.serviceAmount;
    const split = calculateSplit(grossKobo, platformSettings, hasPartner);
    const careMode: "virtual" | "in_person" = booking.isOnline ? "virtual" : "in_person";

    await ctx.db.patch(booking._id, {
      paymentStatus: "completed",
      bookingStatus: "confirmed",
      paymentMethod: "bank_transfer",
      paymentReference: transferRef,
      paidAt: now,
      careMode,
      physiotherapistEarnings: split.physiotherapistAmount,
      rehabifyEarnings: split.rehabifyAmount,
      partnerEarnings: split.partnerAmount,
      bankTransferDetails: {
        senderName: args.senderName,
        bankName: args.bankName,
        confirmedBy: adminName,
        confirmedAt: now,
      },
      updatedAt: now,
    });

    if (hasPartner && partnerCode) {
      const referral = await ctx.db
        .query("inboundReferrals")
        .withIndex("by_partner_id", (q) => q.eq("partnerId", partnerCode))
        .filter((q) => q.eq(q.field("trackingCode"), patientUser?.referralPublicCode || ""))
        .first();

      const trackingCode = referral?.trackingCode || patientUser?.referralPublicCode || `RHB-${Math.floor(10000 + Math.random() * 90000)}`;

      await ctx.db.insert("partnerCommissions", {
        partnerId: partnerCode,
        referralId: referral?._id || (booking._id as any),
        trackingCode,
        patientName,
        eventType: "booking_confirmed",
        grossTransactionAmount: grossKobo,
        commissionRate: split.partnerPercent,
        commissionAmount: split.partnerAmount,
        netPayable: split.partnerAmount,
        physiotherapistId: booking.physiotherapistId,
        physiotherapistName: physioName,
        careMode,
        physiotherapistAmount: split.physiotherapistAmount,
        rehabifyAmount: split.rehabifyAmount,
        partnerAmount: split.partnerAmount,
        physioPercent: split.physioPercent,
        rehabifyPercent: split.rehabifyPercent,
        partnerPercent: split.partnerPercent,
        paymentMethod: "bank_transfer",
        paymentReference: transferRef,
        billingPeriod,
        bulkPayoutStatus: "accrued",
        status: "approved",
        notes: `Bank Transfer confirmed by Admin (${adminName}). Sender: ${args.senderName} (${args.bankName}). ${args.referenceNote || ""}`,
        earnedAt: now,
      });
    }

    return { success: true, transferRef, split };
  },
});

/**
 * Mutation for Admin: Process end-of-month bulk payout for a specific partner or all partners.
 * Marks accrued commissions as "paid" with a bulk settlement batch reference.
 */
export const processMonthlyBulkPayout = mutation({
  args: {
    partnerCode: v.optional(v.string()), // If omitted, settles all partners for the period
    partnerId: v.optional(v.string()),   // Alias from frontend
    billingPeriod: v.string(),           // e.g. "2026-09"
    payoutBatchReference: v.optional(v.string()), // Bank bulk wire reference e.g. "WIRE-20260930-BATCH01"
    note: v.optional(v.string()),        // Transaction note from modal
  },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx as any, ["admin"]);
    const adminName = `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || admin.email || "Admin";

    const targetPartnerCode = args.partnerCode || args.partnerId;
    const batchReference = args.payoutBatchReference || args.note || `WIRE-${args.billingPeriod.replace("-", "")}-${Date.now()}`;

    let commissions = await ctx.db
      .query("partnerCommissions")
      .withIndex("by_billing_period", (q) => q.eq("billingPeriod", args.billingPeriod))
      .filter((q) => q.neq(q.field("bulkPayoutStatus"), "paid"))
      .collect();

    if (targetPartnerCode) {
      commissions = commissions.filter((c) => c.partnerId === targetPartnerCode);
    }

    const now = Date.now();
    let totalSettledKobo = 0;

    for (const comm of commissions) {
      await ctx.db.patch(comm._id, {
        bulkPayoutStatus: "paid",
        bulkPayoutBatchId: batchReference,
        status: "settled",
        settledAt: now,
        paidAt: now,
        notes: `${comm.notes || ""} | Bulk settled at month-end by ${adminName} ref: ${batchReference}`,
      });
      totalSettledKobo += comm.partnerAmount || comm.commissionAmount;
    }

    return {
      success: true,
      settledRecordsCount: commissions.length,
      totalSettledKobo,
      billingPeriod: args.billingPeriod,
      batchReference,
      message: `Successfully settled ${commissions.length} commission record(s) totaling ₦${Math.round(totalSettledKobo / 100).toLocaleString()}`,
    };
  },
});

/**
 * Query for Admin: Generate a downloadable partner invoice/settlement statement.
 * Produces structured data that the frontend renders into a printable/PDF invoice.
 */
export const generatePartnerInvoice = query({
  args: {
    partnerCode: v.string(),
    billingPeriod: v.string(), // e.g. "2026-09"
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx as any, ["admin"]);

    // Fetch partner details
    const partner = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", args.partnerCode))
      .first();

    if (!partner) {
      throw new Error(`Partner not found: ${args.partnerCode}`);
    }

    // Fetch platform settings
    const settingsDoc = await ctx.db
      .query("platformRevenueSettings")
      .order("desc")
      .first();
    const platformSettings = settingsDoc || DEFAULT_REVENUE_SETTINGS;

    // Fetch commissions for this partner & billing period
    const commissions = await ctx.db
      .query("partnerCommissions")
      .withIndex("by_billing_period", (q) => q.eq("billingPeriod", args.billingPeriod))
      .collect();

    const partnerCommissions = commissions.filter((c) => c.partnerId === args.partnerCode);

    // Fetch partner bank account
    const bankAccount = await ctx.db
      .query("partnerBankAccounts")
      .withIndex("by_partner_code", (q: any) => q.eq("partnerCode", args.partnerCode))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();

    // Build line items
    const lineItems = partnerCommissions.map((c, idx) => {
      return {
        sn: idx + 1,
        date: new Date(c.earnedAt).toISOString().split("T")[0],
        trackingCode: c.trackingCode,
        patientName: c.patientName,
        physiotherapistName: c.physiotherapistName || "Physiotherapist",
        careMode: c.careMode === "virtual" ? "Virtual" : "In-Person",
        grossAmountKobo: c.grossTransactionAmount,
        physioShareKobo: c.physiotherapistAmount || 0,
        physioPercent: c.physioPercent || platformSettings.physiotherapistPercent,
        rehabifyShareKobo: c.rehabifyAmount || 0,
        rehabifyPercent: c.rehabifyPercent || platformSettings.rehabifyPercent,
        partnerShareKobo: c.partnerAmount || c.commissionAmount,
        partnerPercent: c.partnerPercent || platformSettings.partnerPercent,
        paystackInboundFeeKobo: c.paystackInboundFeeKobo || 0,
        paystackOutboundFeeKobo: c.paystackOutboundFeeKobo || 0,
        stampDutyKobo: c.stampDutyKobo || 0,
        netPartnerAmountKobo: c.netPartnerAmount || c.partnerAmount || c.commissionAmount,
        paymentMethod: c.paymentMethod === "bank_transfer" ? "Bank Transfer" : "Paystack",
        paymentReference: c.paymentReference || "-",
      };
    });

    // Compute totals
    const totalGrossKobo = lineItems.reduce((s, l) => s + l.grossAmountKobo, 0);
    const totalPartnerShareKobo = lineItems.reduce((s, l) => s + l.partnerShareKobo, 0);
    const totalInboundFeesKobo = lineItems.reduce((s, l) => s + l.paystackInboundFeeKobo, 0);
    const totalOutboundFeesKobo = lineItems.reduce((s, l) => s + l.paystackOutboundFeeKobo, 0);
    const totalStampDutyKobo = lineItems.reduce((s, l) => s + l.stampDutyKobo, 0);
    const totalNetPayableKobo = lineItems.reduce((s, l) => s + l.netPartnerAmountKobo, 0);

    // Generate invoice number
    const invoiceNumber = `RH-INV-${args.billingPeriod.replace("-", "")}-${args.partnerCode.toUpperCase().slice(0, 8)}`;

    return {
      invoiceNumber,
      invoiceDate: new Date().toISOString().split("T")[0],
      billingPeriod: args.billingPeriod,
      billingPeriodLabel: formatBillingPeriod(args.billingPeriod),

      // Issuer (Rehabify)
      issuer: {
        name: "Rehabify Health Technologies Ltd",
        address: "Lagos, Nigeria",
        email: "finance@physioaroundme.com",
        website: "physioaroundme.com",
      },

      // Recipient (Partner)
      recipient: {
        name: partner.name,
        code: partner.code,
        type: partner.type,
        contactEmail: partner.contactEmail || partner.ownerEmail || "",
        contactPhone: partner.contactPhone || "",
      },

      // Bank account for payment
      bankDetails: bankAccount
        ? {
            bankName: bankAccount.bankName,
            accountNumber: bankAccount.accountNumber,
            accountName: bankAccount.accountName,
          }
        : null,

      // Revenue split applied
      splitConfig: {
        physiotherapistPercent: platformSettings.physiotherapistPercent,
        rehabifyPercent: platformSettings.rehabifyPercent,
        partnerPercent: platformSettings.partnerPercent,
        feeBearerInbound: (platformSettings as any).paystackFeeBearerInbound || "physiotherapist",
        feeBearerOutbound: (platformSettings as any).paystackFeeBearerOutbound || "physiotherapist",
      },

      // Line items
      lineItems,

      // Summary totals
      summary: {
        totalSessions: lineItems.length,
        totalGrossKobo,
        totalPartnerShareKobo,
        // Fees breakdown (separate line items per accounting standards)
        totalPaystackCollectionFeesKobo: totalInboundFeesKobo,
        totalPaystackTransferFeesKobo: totalOutboundFeesKobo,
        totalStampDutyKobo,
        totalFeesKobo: totalInboundFeesKobo + totalOutboundFeesKobo + totalStampDutyKobo,
        totalNetPayableKobo,
      },

      // Payout status
      payoutStatus: partnerCommissions.length === 0
        ? "no_earnings"
        : partnerCommissions.every((c) => c.bulkPayoutStatus === "paid")
          ? "paid"
          : "pending",
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYSTACK TRANSFER API AUTOMATION & SETTLEMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal query: Fetch pending commission records for a partner in a billing period.
 */
export const internalGetPendingCommissionsForPayout = internalQuery({
  args: {
    partnerCode: v.optional(v.string()),
    billingPeriod: v.string(),
  },
  handler: async (ctx, args) => {
    let commissions = await ctx.db
      .query("partnerCommissions")
      .withIndex("by_billing_period", (q) => q.eq("billingPeriod", args.billingPeriod))
      .filter((q) => q.neq(q.field("bulkPayoutStatus"), "paid"))
      .collect();

    if (args.partnerCode) {
      commissions = commissions.filter((c) => c.partnerId === args.partnerCode);
    }
    return commissions;
  },
});

/**
 * Internal query: Fetch partner record and verified bank account.
 */
export const internalGetPartnerWithBankAccount = internalQuery({
  args: { partnerCode: v.string() },
  handler: async (ctx, args) => {
    const partner = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", args.partnerCode))
      .first();

    const bankAccounts = await ctx.db
      .query("partnerBankAccounts")
      .withIndex("by_partner_code", (q) => q.eq("partnerCode", args.partnerCode))
      .collect();

    const bankAccount = bankAccounts.find((a) => a.isDefault && a.isVerified) || bankAccounts.find((a) => a.isVerified) || null;

    return { partner, bankAccount };
  },
});

/**
 * Internal mutation: Save Paystack transfer recipient code for a partner bank account.
 */
export const internalSaveRecipientCode = internalMutation({
  args: {
    bankAccountId: v.id("partnerBankAccounts"),
    recipientCode: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.bankAccountId, {
      paystackRecipientCode: args.recipientCode,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal mutation: Record payout settlement in partner commissions.
 */
export const internalRecordPayoutSettlement = internalMutation({
  args: {
    partnerCode: v.optional(v.string()),
    billingPeriod: v.string(),
    batchReference: v.string(),
    transferCode: v.optional(v.string()),
    transferStatus: v.optional(v.string()),
    settledBy: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let commissions = await ctx.db
      .query("partnerCommissions")
      .withIndex("by_billing_period", (q) => q.eq("billingPeriod", args.billingPeriod))
      .filter((q) => q.neq(q.field("bulkPayoutStatus"), "paid"))
      .collect();

    if (args.partnerCode) {
      commissions = commissions.filter((c) => c.partnerId === args.partnerCode);
    }

    const now = Date.now();
    let totalSettledKobo = 0;

    for (const comm of commissions) {
      await ctx.db.patch(comm._id, {
        bulkPayoutStatus: "paid",
        bulkPayoutBatchId: args.batchReference,
        status: "settled",
        settledAt: now,
        paidAt: now,
        notes: `${comm.notes || ""} | Settled by ${args.settledBy} [Ref: ${args.batchReference}${args.transferCode ? `, Code: ${args.transferCode}` : ""}]`,
      });
      totalSettledKobo += comm.partnerAmount || comm.commissionAmount;
    }

    return {
      settledCount: commissions.length,
      totalSettledKobo,
    };
  },
});

/**
 * Action: Query Paystack live NGN account balance for payouts.
 */
export const getPaystackBalance = action({
  args: {},
  handler: async () => {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) {
      return { success: false, message: "PAYSTACK_SECRET_KEY is not configured", balanceKobo: 0, balanceNaira: 0 };
    }

    try {
      const res = await fetch("https://api.paystack.co/balance", {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { success: false, message: `Paystack balance error: HTTP ${res.status}`, balanceKobo: 0, balanceNaira: 0 };
      }

      const data = await res.json();
      if (data.status && Array.isArray(data.data)) {
        const ngn = data.data.find((b: any) => b.currency === "NGN") || data.data[0];
        const balanceKobo = ngn ? ngn.balance : 0;
        return {
          success: true,
          balanceKobo,
          balanceNaira: Math.round(balanceKobo / 100),
          currency: ngn?.currency || "NGN",
        };
      }

      return { success: false, message: data.message || "Failed to fetch balance", balanceKobo: 0, balanceNaira: 0 };
    } catch (err: any) {
      return { success: false, message: err.message || "Balance request failed", balanceKobo: 0, balanceNaira: 0 };
    }
  },
});

/**
 * Action: Execute single partner payout transfer via Paystack Transfer API.
 */
export const executePartnerPayoutTransfer = action({
  args: {
    partnerCode: v.optional(v.string()),
    partnerId: v.optional(v.string()),
    billingPeriod: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    const targetCode = args.partnerCode || args.partnerId;
    if (!targetCode) {
      throw new Error("Partner code is required to execute transfer.");
    }

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) {
      throw new Error("Payment service not configured (PAYSTACK_SECRET_KEY missing)");
    }

    // 1. Fetch partner and bank account
    const result: any = await ctx.runQuery(
      (internal as any).monthlySettlements.internalGetPartnerWithBankAccount,
      { partnerCode: targetCode }
    );
    const partner = result?.partner;
    const bankAccount = result?.bankAccount;

    if (!partner) {
      throw new Error(`Partner not found: ${targetCode}`);
    }
    if (!bankAccount || !bankAccount.isVerified) {
      throw new Error(`Partner ${partner.name} does not have a verified default bank account on file.`);
    }

    // 2. Ensure transfer recipient exists
    let recipientCode: string = bankAccount.paystackRecipientCode || "";
    if (!recipientCode) {
      const recipientRes: Response = await fetch("https://api.paystack.co/transferrecipient", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "nuban",
          name: bankAccount.accountName,
          account_number: bankAccount.accountNumber,
          bank_code: bankAccount.bankCode,
          currency: "NGN",
          description: `Partner payout: ${partner.code} - ${partner.name}`,
        }),
      });

      const recipientData: any = await recipientRes.json();
      if (!recipientData.status || !recipientData.data?.recipient_code) {
        throw new Error(`Failed to create Paystack transfer recipient: ${recipientData.message || "Unknown error"}`);
      }

      recipientCode = recipientData.data.recipient_code as string;
      await ctx.runMutation((internal as any).monthlySettlements.internalSaveRecipientCode, {
        bankAccountId: bankAccount._id,
        recipientCode,
      });
    }

    // 3. Fetch pending commissions
    const commissions: any[] = await ctx.runQuery(
      (internal as any).monthlySettlements.internalGetPendingCommissionsForPayout,
      { partnerCode: targetCode, billingPeriod: args.billingPeriod }
    );

    if (commissions.length === 0) {
      throw new Error(`No pending commissions to disburse for ${partner.name} in cycle ${args.billingPeriod}`);
    }

    const totalPartnerKobo = commissions.reduce(
      (sum: number, c: any) => sum + (c.partnerAmount || c.commissionAmount || 0),
      0
    );

    const outboundFeeKobo = calculatePaystackOutboundFee(totalPartnerKobo);
    const stampDutyKobo = calculateStampDuty(totalPartnerKobo);
    const netPayoutKobo = Math.max(0, totalPartnerKobo - outboundFeeKobo - stampDutyKobo);

    if (netPayoutKobo <= 0) {
      throw new Error(`Net payout after fees is ₦0. Cannot execute transfer.`);
    }

    // 4. Generate unique reference
    const transferReference = `TRF_RH_${targetCode}_${args.billingPeriod.replace("-", "")}_${Date.now()}`;

    // 5. Execute transfer
    const transferRes: Response = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: netPayoutKobo,
        recipient: recipientCode,
        reason: `Rehabify settlement ${args.billingPeriod} - ${partner.name}`,
        reference: transferReference,
      }),
    });

    const transferData: any = await transferRes.json();

    if (!transferRes.ok || !transferData.status) {
      throw new Error(transferData.message || `Paystack transfer failed (HTTP ${transferRes.status})`);
    }

    // Check if OTP required
    if (transferData.data?.status === "otp") {
      return {
        success: false,
        requiresOtp: true,
        transferCode: transferData.data.transfer_code as string,
        transferReference,
        amountKobo: netPayoutKobo,
        message: "Paystack transfer requires OTP authorization.",
      };
    }

    // 6. Record success in Convex
    await ctx.runMutation((internal as any).monthlySettlements.internalRecordPayoutSettlement, {
      partnerCode: targetCode,
      billingPeriod: args.billingPeriod,
      batchReference: transferReference,
      transferCode: transferData.data?.transfer_code,
      transferStatus: transferData.data?.status || "pending",
      settledBy: "Admin via Paystack Automated Transfer",
      notes: args.note,
    });

    return {
      success: true,
      requiresOtp: false,
      transferCode: transferData.data?.transfer_code as string,
      transferReference,
      amountKobo: netPayoutKobo,
      status: (transferData.data?.status as string) || "pending",
      message: `Disbursement of ₦${Math.round(netPayoutKobo / 100).toLocaleString()} to ${partner.name} initiated successfully via Paystack!`,
    };
  },
});

/**
 * Action: Finalize a pending Paystack transfer with an OTP code.
 */
export const finalizePartnerPayoutTransfer = action({
  args: {
    transferCode: v.string(),
    otp: v.string(),
    partnerCode: v.string(),
    billingPeriod: v.string(),
    transferReference: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) {
      throw new Error("Payment service not configured");
    }

    const res: Response = await fetch("https://api.paystack.co/transfer/finalize_transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transfer_code: args.transferCode,
        otp: args.otp,
      }),
    });

    const data: any = await res.json();
    if (!res.ok || !data.status) {
      throw new Error(data.message || "Failed to finalize Paystack transfer with OTP");
    }

    await ctx.runMutation((internal as any).monthlySettlements.internalRecordPayoutSettlement, {
      partnerCode: args.partnerCode,
      billingPeriod: args.billingPeriod,
      batchReference: args.transferReference,
      transferCode: args.transferCode,
      transferStatus: data.data?.status || "pending",
      settledBy: "Admin via Paystack Transfer (OTP finalized)",
    });

    return {
      success: true,
      message: "Transfer finalized successfully!",
      transferCode: args.transferCode,
    };
  },
});

/**
 * Action: Execute bulk monthly payout for all eligible partners via Paystack Bulk Transfer API.
 */
export const executePaystackBulkMonthlyPayout = action({
  args: {
    billingPeriod: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) {
      throw new Error("Payment service not configured");
    }

    // 1. Get summary to find partners with pending payouts
    const summary: any = await ctx.runQuery((api as any).monthlySettlements.getMonthlyBulkPayoutSummary, {
      billingPeriod: args.billingPeriod,
    });

    if (!summary || !summary.partnerBreakdown) {
      throw new Error("No payout records found for this billing period");
    }

    const eligiblePartners = summary.partnerBreakdown.filter(
      (p: any) => p.bulkPayoutStatus !== "paid" && p.totalPartnerCommission > 0 && p.hasBankAccount
    );

    if (eligiblePartners.length === 0) {
      throw new Error("No eligible partners with pending commissions and verified bank accounts were found.");
    }

    // 2. Prepare transfers list
    const transfers: Array<{
      amount: number;
      recipient: string;
      reference: string;
      reason: string;
      partnerCode: string;
    }> = [];

    const now = Date.now();
    for (let i = 0; i < eligiblePartners.length; i++) {
      const p = eligiblePartners[i];
      const bankResult: any = await ctx.runQuery(
        (internal as any).monthlySettlements.internalGetPartnerWithBankAccount,
        { partnerCode: p.partnerId }
      );
      const bankAccount = bankResult?.bankAccount;

      if (!bankAccount || !bankAccount.isVerified) continue;

      let recipientCode: string = bankAccount.paystackRecipientCode || "";
      if (!recipientCode) {
        const recipientRes: Response = await fetch("https://api.paystack.co/transferrecipient", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "nuban",
            name: bankAccount.accountName,
            account_number: bankAccount.accountNumber,
            bank_code: bankAccount.bankCode,
            currency: "NGN",
            description: `Partner payout: ${p.partnerId}`,
          }),
        });
        const recipientData: any = await recipientRes.json();
        if (recipientData.status && recipientData.data?.recipient_code) {
          recipientCode = recipientData.data.recipient_code as string;
          await ctx.runMutation((internal as any).monthlySettlements.internalSaveRecipientCode, {
            bankAccountId: bankAccount._id,
            recipientCode,
          });
        }
      }

      if (!recipientCode) continue;

      const netAmount = p.estimatedNetPayoutKobo || p.totalPartnerCommission;
      if (netAmount <= 0) continue;

      transfers.push({
        amount: netAmount,
        recipient: recipientCode,
        reference: `TRF_BULK_${p.partnerId}_${args.billingPeriod.replace("-", "")}_${now}_${i}`,
        reason: `Rehabify bulk payout ${args.billingPeriod} - ${p.partnerName}`,
        partnerCode: p.partnerId,
      });
    }

    if (transfers.length === 0) {
      throw new Error("Unable to construct valid transfer recipients for eligible partners.");
    }

    // 3. Submit bulk transfer to Paystack
    const bulkRes: Response = await fetch("https://api.paystack.co/transfer/bulk", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currency: "NGN",
        source: "balance",
        transfers: transfers.map(({ partnerCode, ...rest }) => rest),
      }),
    });

    const bulkData: any = await bulkRes.json();
    if (!bulkRes.ok || !bulkData.status) {
      throw new Error(bulkData.message || "Paystack bulk transfer failed");
    }

    const batchCode = bulkData.data?.[0]?.transfer_code || `BATCH-${args.billingPeriod.replace("-", "")}-${now}`;

    // 4. Record settlement for each partner
    for (const t of transfers) {
      await ctx.runMutation((internal as any).monthlySettlements.internalRecordPayoutSettlement, {
        partnerCode: t.partnerCode,
        billingPeriod: args.billingPeriod,
        batchReference: t.reference,
        transferCode: batchCode,
        transferStatus: "queued",
        settledBy: "Admin via Paystack Bulk Transfer",
      });
    }

    const totalKobo = transfers.reduce((sum, t) => sum + t.amount, 0);

    return {
      success: true,
      batchCode,
      partnersCount: transfers.length,
      totalAmountKobo: totalKobo,
      message: `Bulk transfer queued for ${transfers.length} partners (Total: ₦${Math.round(totalKobo / 100).toLocaleString()}).`,
    };
  },
});

/**
 * Mutation: Roll back payout settlement when a Paystack transfer fails or is reversed.
 * Resets affected commissions from "paid" → "pending_bulk_payout" so the admin can re-attempt.
 */
export const rollbackPayoutSettlement = mutation({
  args: {
    partnerCode: v.optional(v.string()),
    billingPeriod: v.string(),
    batchReference: v.string(),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let commissions = await ctx.db
      .query("partnerCommissions")
      .withIndex("by_billing_period", (q) => q.eq("billingPeriod", args.billingPeriod))
      .filter((q) => q.eq(q.field("bulkPayoutStatus"), "paid"))
      .collect();

    // Match by partner and/or batch reference
    if (args.partnerCode) {
      commissions = commissions.filter((c) => c.partnerId === args.partnerCode);
    }
    if (args.batchReference) {
      commissions = commissions.filter((c) => c.bulkPayoutBatchId === args.batchReference);
    }

    const now = Date.now();
    let rolledBackCount = 0;

    for (const comm of commissions) {
      await ctx.db.patch(comm._id, {
        bulkPayoutStatus: "pending_bulk_payout",
        status: "pending_approval",
        settledAt: undefined,
        paidAt: undefined,
        notes: `${comm.notes || ""} | ROLLED BACK at ${new Date(now).toISOString()} — Paystack transfer failed/reversed${args.failureReason ? `: ${args.failureReason}` : ""}`,
      });
      rolledBackCount++;
    }

    return { rolledBackCount };
  },
});

export const internalRollbackPayoutSettlement = rollbackPayoutSettlement;

