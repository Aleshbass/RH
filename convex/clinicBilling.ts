import { CLINIC_LAUNCH_WEEK, seatsLabel } from "../lib/clinicPlans";
import { insertNotification } from "./helpers/pushNotify";
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { clinicPaymentSplit } from "./clinicFees";
import { loadClinicFeeConfig } from "./clinicFeeSettings";
import { Doc, Id } from "./_generated/dataModel";
import {
  canUseArea,
  ensureClinicApproved,
  getClinicMember,
  getOwnerClinic,
  getClinicMemberOrNull,
  requireClinicWrite,
} from "./clinicTools";
import { ensureUserRole, getAuthenticatedUser } from "./auth";
import { appLink, publicAppUrl } from "./helpers/appUrl";
import { activePaymentLink, closeInvoicePaymentLinks, PAYMENT_LINK_TTL_MS } from "./helpers/paymentLinks";
import { reverseCommissionsForPayment } from "./helpers/partnerLedger";
import { currentPaystackMode, usableSubaccount } from "./helpers/paystackMode";
import { offlinePaidAt, settleClinicInvoiceOffline } from "./helpers/clinicOfflinePayment";
import { verifyPaystackSignature } from "./helpers/paystackSignature";
import { issueReceipt } from "./helpers/receipts";
import { createRefundRequest } from "./helpers/refunds";
import { startOfZonedDay, zonedDateKey } from "./helpers/lagosTime";
import {
  CLINIC_PLAN_PAGE,
  DAY_MS,
  LAUNCH_BILLING_FROM_MS,
  LAUNCH_WEEK_START_MESSAGE,
  OVERAGE_UNIT_KOBO,
  addMonthsLagos,
  allowanceLevel,
  billingIsOn,
  clinicianSeatUsage,
  countActiveProgrammes,
  dueAtFor,
  lagosDateToMs,
  launchWeekOpen,
  longDate,
  noticeDueFrom,
  periodLabel,
  planName,
  readOnlyFromFor,
  standardPlanNumbers,
  statusFromOpenInvoices,
  subscriptionForClinic,
  type ClinicSubscription,
  type ClinicSubscriptionInvoice,
} from "./helpers/clinicSubscriptions";

/**
 * Clinic billing: payout account (Paystack subaccount), shareable payment links,
 * and manual "mark as paid" for cash or transfer payments.
 *
 * Money flow for a payment link:
 *   patient pays the invoice total → Paystack splits it: the clinic's subaccount receives the
 *   clinic's share; Rehabify's main account keeps the rest (transaction_charge) and bears
 *   Paystack's processing fee. Stamp duty comes off the clinic's payout to its bank. The
 *   numbers are admin-set (convex/clinicFees.ts, clinicFeeSettings). Without a payout account
 *   the full amount settles to Rehabify and the clinic's share is paid out manually.
 */

const PAYSTACK_API = "https://api.paystack.co";

/**
 * Kobo that stays in Rehabify's Paystack account when the invoice is split: the total minus
 * the provider's share. Works for older 90/10 invoices and the 80/20-after-fees model alike.
 */
export function mainAccountChargeKobo(invoice: Doc<"invoices">): number {
  const total = invoice.feeBreakdown?.total ?? invoice.totalAmount;
  const providerShare =
    invoice.feeBreakdown?.physiotherapistEarnings ??
    invoice.physiotherapistShare ??
    total - (invoice.feeBreakdown?.platformFee ?? invoice.platformFeeAmount);
  return Math.max(0, Math.round(total - providerShare));
}


export async function paystackRequest(path: string, init: RequestInit = {}) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new ConvexError("Payments are not configured yet. Please contact Rehabify support.");
  }
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data: any = await response.json().catch(() => null);
  if (!response.ok || !data?.status) {
    throw new ConvexError(data?.message || `Paystack request failed (HTTP ${response.status})`);
  }
  return data.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payout account
// ─────────────────────────────────────────────────────────────────────────────

export const getClinicPayoutAccount = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getClinicMemberOrNull(ctx);
    if (!auth) return null;
    const account = await ctx.db
      .query("clinicPayoutAccounts")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", auth.clinic._id))
      .first();
    if (!account) return null;
    return {
      bankName: account.bankName,
      bankCode: account.bankCode,
      bankSlug: account.bankSlug ?? null,
      accountName: account.accountName,
      accountNumberLast4: account.accountNumber.slice(-4),
      updatedAt: account.updatedAt,
      // Saved under the other Paystack mode (test keys): payments can't reach it until it's renewed
      // (renewPayoutAccount does that from the saved details, without asking the owner again)
      usable: usableSubaccount(account) !== null,
    };
  },
});

/**
 * Disconnect the clinic's payout account. Online payments then settle to Rehabify and the
 * clinic's share is transferred manually until a new account is connected. The Paystack
 * subaccount itself is deactivated so it can't receive new splits.
 */
export const removePayoutAccount = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean }> => {
    const owner = await ctx.runQuery(internal.clinicBilling.resolveOwnerClinicForAction, {});
    const removed = await ctx.runMutation(internal.clinicBilling.deletePayoutAccount, { clinicId: owner.clinicId });
    if (removed?.subaccountCode) {
      try {
        await paystackRequest(`/subaccount/${encodeURIComponent(removed.subaccountCode)}`, {
          method: "PUT",
          body: JSON.stringify({ active: false }),
        });
      } catch (err) {
        // The account is already disconnected here; a stale subaccount gets no new payment links
        console.error("Could not deactivate Paystack subaccount", err);
      }
    }
    return { success: true };
  },
});

export const deletePayoutAccount = internalMutation({
  args: { clinicId: v.id("clinics") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("clinicPayoutAccounts")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", args.clinicId))
      .first();
    if (!existing) return null;
    await ctx.db.delete(existing._id);
    return { subaccountCode: existing.subaccountCode };
  },
});

export const resolveOwnerClinicForAction = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicApproved(ctx, clinic);
    return { userId: user._id, clinicId: clinic._id, clinicName: clinic.name, email: clinic.contactEmail || user.email || "" };
  },
});

export const savePayoutAccount = internalMutation({
  args: {
    clinicId: v.id("clinics"),
    subaccountCode: v.string(),
    bankCode: v.string(),
    bankName: v.string(),
    bankSlug: v.optional(v.string()),
    accountNumber: v.string(),
    accountName: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("clinicPayoutAccounts")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", args.clinicId))
      .first();
    // The subaccount was just created with the current key, so it belongs to this Paystack mode
    const paystackMode = currentPaystackMode();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, paystackMode, updatedAt: now });
    } else {
      await ctx.db.insert("clinicPayoutAccounts", { ...args, paystackMode, createdAt: now, updatedAt: now });
    }
  },
});

/** Look up the account holder's name before connecting, so the owner can confirm it. */
export const verifyPayoutAccount = action({
  args: { bankCode: v.string(), accountNumber: v.string() },
  handler: async (ctx, args): Promise<{ accountName: string }> => {
    await ctx.runQuery(internal.clinicBilling.resolveOwnerClinicForAction, {});
    if (!/^\d{10}$/.test(args.accountNumber)) {
      throw new ConvexError("Account number must be 10 digits");
    }
    const data = await paystackRequest(
      `/bank/resolve?account_number=${encodeURIComponent(args.accountNumber)}&bank_code=${encodeURIComponent(args.bankCode)}`,
      { method: "GET" }
    );
    return { accountName: data.account_name as string };
  },
});

/** Create (or replace) the clinic's Paystack subaccount so payments settle to the clinic directly. */
export const connectPayoutAccount = action({
  args: { bankCode: v.string(), bankName: v.string(), bankSlug: v.optional(v.string()), accountNumber: v.string() },
  handler: async (ctx, args): Promise<{ accountName: string }> => {
    const owner = await ctx.runQuery(internal.clinicBilling.resolveOwnerClinicForAction, {});
    if (!/^\d{10}$/.test(args.accountNumber)) {
      throw new ConvexError("Account number must be 10 digits");
    }
    const resolved = await paystackRequest(
      `/bank/resolve?account_number=${encodeURIComponent(args.accountNumber)}&bank_code=${encodeURIComponent(args.bankCode)}`,
      { method: "GET" }
    );
    const subaccountCode = await createClinicSubaccount(owner, args.bankCode, args.accountNumber);
    await ctx.runMutation(internal.clinicBilling.savePayoutAccount, {
      clinicId: owner.clinicId,
      subaccountCode,
      bankCode: args.bankCode,
      bankName: args.bankName,
      bankSlug: args.bankSlug,
      accountNumber: args.accountNumber,
      accountName: resolved.account_name,
    });
    return { accountName: resolved.account_name as string };
  },
});

/** A Paystack subaccount for the clinic's bank account, under the current key. Returns its code. */
async function createClinicSubaccount(
  clinic: { clinicId: Id<"clinics">; clinicName: string; email: string },
  bankCode: string,
  accountNumber: string
): Promise<string> {
  const subaccount = await paystackRequest("/subaccount", {
    method: "POST",
    body: JSON.stringify({
      business_name: clinic.clinicName,
      settlement_bank: bankCode,
      account_number: accountNumber,
      // The Rehabify fee is taken per transaction (transaction_charge), not as a percentage here
      percentage_charge: 0,
      primary_contact_email: clinic.email || undefined,
      description: `Rehabify clinic ${clinic.clinicId}`,
    }),
  });
  return subaccount.subaccount_code as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Renewing a payout account from another Paystack mode
//
// A subaccount made with test keys doesn't exist once Rehabify runs on live keys, so the clinic
// looked "Connected" in Settings while Billing asked for a bank account and payment links failed.
// The bank details are already saved and were checked by Paystack when the owner connected, so
// the subaccount is simply made again under the current key: no action from the owner.
// ─────────────────────────────────────────────────────────────────────────────

type PayoutRenewal = "usable" | "renewed" | "none" | "failed";

export const payoutAccountForRenewal = internalQuery({
  args: { clinicId: v.id("clinics") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("clinicPayoutAccounts")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", args.clinicId))
      .first();
    if (!row) return null;
    const clinic = await ctx.db.get(args.clinicId);
    const owner = clinic ? await ctx.db.get(clinic.ownerId) : null;
    return {
      usable: usableSubaccount(row) !== null,
      bankCode: row.bankCode,
      bankName: row.bankName,
      bankSlug: row.bankSlug,
      accountNumber: row.accountNumber,
      accountName: row.accountName,
      clinicName: clinic?.name ?? "Clinic",
      email: clinic?.contactEmail || owner?.email || "",
    };
  },
});

async function renewClinicSubaccount(ctx: ActionCtx, clinicId: Id<"clinics">): Promise<PayoutRenewal> {
  const row = await ctx.runQuery(internal.clinicBilling.payoutAccountForRenewal, { clinicId });
  if (!row) return "none";
  if (row.usable) return "usable";
  try {
    const subaccountCode = await createClinicSubaccount(
      { clinicId, clinicName: row.clinicName, email: row.email },
      row.bankCode,
      row.accountNumber
    );
    await ctx.runMutation(internal.clinicBilling.savePayoutAccount, {
      clinicId,
      subaccountCode,
      bankCode: row.bankCode,
      bankName: row.bankName,
      bankSlug: row.bankSlug,
      accountNumber: row.accountNumber,
      accountName: row.accountName,
    });
    return "renewed";
  } catch (err) {
    // No bank details in the log: the clinic and Paystack's reason are enough to follow up
    console.error("Could not renew clinic payout subaccount", clinicId, err instanceof Error ? err.message : String(err));
    return "failed";
  }
}

export const resolveBillingClinicForAction = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { clinic } = await requireClinicWrite(ctx, "billing", { allowBillingReadOnly: true });
    return { clinicId: clinic._id };
  },
});

/** Billing and Settings call this when the saved account is from the other Paystack mode. */
export const renewPayoutAccount = action({
  args: {},
  handler: async (ctx): Promise<{ status: PayoutRenewal }> => {
    const { clinicId } = await ctx.runQuery(internal.clinicBilling.resolveBillingClinicForAction, {});
    return { status: await renewClinicSubaccount(ctx, clinicId) };
  },
});

export const stalePayoutAccountClinicIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("clinicPayoutAccounts").take(1000);
    return rows.filter((row) => usableSubaccount(row) === null).map((row) => row.clinicId);
  },
});

/**
 * One-off after a key change: renew every clinic payout account from the other Paystack mode.
 * `npx convex run --prod clinicBilling:renewStalePayoutAccounts` (counts only, no bank details).
 */
export const renewStalePayoutAccounts = internalAction({
  args: {},
  handler: async (ctx): Promise<{ stale: number; renewed: number; failed: number }> => {
    const clinicIds = await ctx.runQuery(internal.clinicBilling.stalePayoutAccountClinicIds, {});
    let renewed = 0;
    let failed = 0;
    for (const clinicId of clinicIds) {
      const status = await renewClinicSubaccount(ctx, clinicId);
      if (status === "renewed") renewed++;
      if (status === "failed") failed++;
    }
    return { stale: clinicIds.length, renewed, failed };
  },
});

/** Nigerian banks supported by Paystack, for the payout account picker. */
export const listBanks = action({
  args: {},
  handler: async (): Promise<{ name: string; code: string; slug: string | null }[]> => {
    const banks = await paystackRequest("/bank?country=nigeria&perPage=200", { method: "GET" });
    const seen = new Set<string>();
    return (banks as any[])
      .filter((bank) => bank.active !== false && !seen.has(bank.code) && seen.add(bank.code))
      .map((bank) => ({ name: bank.name as string, code: bank.code as string, slug: (bank.slug as string) || null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Paystack split for an invoice paid in-app: the clinic payout subaccount for clinic invoices,
 * otherwise the issuing physiotherapist's subaccount. Used by /api/payments/initiate.
 */
export const getInvoiceSettlement = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;

    // Only the patient paying it, the treating physio or the clinic owner may see the split
    const viewer = await getAuthenticatedUser(ctx).catch(() => null);
    if (!viewer) return null;
    const clinic = invoice.clinicId ? await ctx.db.get(invoice.clinicId) : null;
    const canView =
      viewer._id === invoice.patientId ||
      viewer._id === invoice.physiotherapistId ||
      (clinic !== null && viewer._id === clinic.ownerId);
    if (!canView) return null;

    let subaccountCode: string | null = null;
    if (invoice.clinicId) {
      const payout = await ctx.db
        .query("clinicPayoutAccounts")
        .withIndex("by_clinic_id", (q) => q.eq("clinicId", invoice.clinicId!))
        .first();
      // An account from the other Paystack mode can't take a split: Rehabify holds the money instead
      subaccountCode = usableSubaccount(payout);
    } else if (invoice.physiotherapistId) {
      const account = await ctx.db
        .query("physiotherapistBankAccounts")
        .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", invoice.physiotherapistId!))
        .first();
      subaccountCode = account?.isVerified ? usableSubaccount(account) : null;
    }
    return {
      subaccountCode,
      platformFeeKobo: invoice.feeBreakdown?.platformFee ?? invoice.platformFeeAmount,
      mainAccountChargeKobo: mainAccountChargeKobo(invoice),
      clinicName: clinic?.name ?? null,
      // Clinic patients pay the clinic directly: without its bank account there's no online payment
      clinicNotConnected: Boolean(invoice.clinicId) && !subaccountCode,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Payment links
// ─────────────────────────────────────────────────────────────────────────────

export const getInvoiceForPaymentLink = internalQuery({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    // Patients can still be sent payment links while the clinic is read-only
    const member = await requireClinicWrite(ctx, "billing", { allowBillingReadOnly: true });
    const { user, clinic } = member;
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.clinicId !== clinic._id) {
      throw new ConvexError("Invoice not found");
    }
    const patient = await ctx.db.get(invoice.patientId);
    const payout = await ctx.db
      .query("clinicPayoutAccounts")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .first();
    // Patients pay the clinic directly: no bank account connected, no payment link (the clinic
    // can still record cash, POS or transfer payments)
    if (!payout) {
      throw new ConvexError(
        "Connect your clinic's bank account first (Clinic settings → Payouts), so patients' payments go straight to you."
      );
    }
    // An account saved under the other Paystack mode is renewed by the caller, then this runs again
    const subaccountCode = usableSubaccount(payout);
    return {
      clinicId: clinic._id,
      needsRenewal: subaccountCode === null,
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      totalKobo: invoice.feeBreakdown?.total ?? invoice.totalAmount,
      mainAccountChargeKobo: mainAccountChargeKobo(invoice),
      // An older split (80/20 for the clinic's own patients) is brought up to today's rule first
      staleSplit: invoice.patientSource !== "rehabify_referral" && (invoice.clinicSharePercent ?? 100) !== 100,
      // Expired or out-of-date links are replaced with a fresh one, and so is a link that pays
      // into an older (or no) bank account
      paymentLink: invoice.paymentLinkSubaccount === subaccountCode ? activePaymentLink(invoice) : null,
      patientId: invoice.patientId,
      patientEmail: patient?.email || null,
      fallbackEmail: clinic.contactEmail || user.email || null,
      clinicName: clinic.name,
      subaccountCode,
    };
  },
});

/**
 * The clinic's own patients pay the clinic in full (no Rehabify cut since the subscription model):
 * an unpaid invoice made under the older 80/20 split is recalculated before its payment link.
 */
export const refreshClinicInvoiceSplit = internalMutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice?.clinicId || invoice.status === "paid" || invoice.patientSource === "rehabify_referral") return;
    if ((invoice.clinicSharePercent ?? 100) === 100) return;
    const feeConfig = await loadClinicFeeConfig(ctx);
    const total = invoice.feeBreakdown?.total ?? invoice.totalAmount;
    const split = clinicPaymentSplit(total, { ...feeConfig, clinicSharePercent: 100 });
    await ctx.db.patch(invoice._id, {
      platformFeeAmount: split.rehabifyKobo,
      paystackFeeAmount: split.paystackFeeKobo,
      stampDutyAmount: split.stampDutyKobo,
      clinicSharePercent: split.clinicSharePercent,
      physiotherapistShare: split.clinicShareKobo,
      platformShare: split.rehabifyKobo,
      feeBreakdown: {
        ...(invoice.feeBreakdown ?? { subtotal: total, discount: 0, paystackPercentage: feeConfig.paystackPercent, total }),
        platformFee: split.rehabifyKobo,
        paystackFlat: split.paystackFeeKobo,
        physiotherapistEarnings: split.clinicShareKobo,
      },
      // A link made for the old split would settle the wrong amounts
      paymentLink: undefined,
      paymentLinkExpiresAt: undefined,
    });
  },
});

export const recordPaymentLink = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    patientId: v.id("users"),
    reference: v.string(),
    amountKobo: v.number(),
    paymentLink: v.string(),
    /** The clinic subaccount the link pays into (clinic links only) */
    subaccountCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // One live link per invoice: the previous one (expired or for an old amount) is closed
    await closeInvoicePaymentLinks(ctx, args.invoiceId);
    await ctx.db.insert("payments", {
      invoiceId: args.invoiceId,
      userId: args.patientId,
      amount: args.amountKobo,
      currency: "NGN",
      paymentMethod: "paystack",
      status: "pending",
      paystackReference: args.reference,
      transactionReference: args.reference,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.invoiceId, {
      paymentReference: args.reference,
      paymentLink: args.paymentLink,
      paymentLinkExpiresAt: now + PAYMENT_LINK_TTL_MS,
      paymentLinkAmount: args.amountKobo,
      paymentLinkSubaccount: args.subaccountCode,
    });
  },
});

/**
 * Create a Paystack checkout link for a clinic invoice. The patient pays from the link
 * without needing a Rehabify account; the Paystack webhook then marks the invoice paid.
 */
export const createPaymentLink = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<{ paymentLink: string }> => createClinicPaymentLink(ctx, args.invoiceId),
});

/**
 * The clinic invoice's checkout link (shared by the clinic portal and clinicians with Billing in
 * the physio portal). Access: the clinic owner or a team member whose role includes Billing.
 */
export async function createClinicPaymentLink(ctx: ActionCtx, invoiceId: Id<"invoices">): Promise<{ paymentLink: string }> {
    let invoice = await ctx.runQuery(internal.clinicBilling.getInvoiceForPaymentLink, { invoiceId });
    if (invoice.status === "paid") {
      throw new ConvexError("This invoice is already paid");
    }
    if (invoice.status === "void") {
      throw new ConvexError("This invoice was cancelled");
    }
    // A bank account saved under test keys is made again under the current key, quietly (or was
    // just renewed by another tab: reading again picks that up too)
    if (invoice.needsRenewal) {
      await renewClinicSubaccount(ctx, invoice.clinicId);
    }
    if (invoice.staleSplit) {
      await ctx.runMutation(internal.clinicBilling.refreshClinicInvoiceSplit, { invoiceId });
    }
    if (invoice.needsRenewal || invoice.staleSplit) {
      invoice = await ctx.runQuery(internal.clinicBilling.getInvoiceForPaymentLink, { invoiceId });
    }
    const subaccountCode = invoice.subaccountCode;
    if (!subaccountCode) {
      throw new ConvexError(
        "Your clinic's bank account needs reconnecting before patients can pay online. Go to Clinic settings → Payouts → Change account. Cash, POS and transfer payments can still be recorded."
      );
    }
    if (invoice.paymentLink) {
      return { paymentLink: invoice.paymentLink };
    }

    const email = invoice.patientEmail || invoice.fallbackEmail;
    if (!email) {
      throw new ConvexError("Add an email address for the patient or your clinic before creating a payment link");
    }

    const reference = `CLN_${invoice.invoiceNumber}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload: Record<string, unknown> = {
      reference,
      amount: invoice.totalKobo,
      email,
      currency: "NGN",
      callback_url: `${publicAppUrl()}/payment/callback`,
      channels: ["card", "bank", "ussd", "bank_transfer"],
      metadata: {
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        patientId: invoice.patientId,
        source: "clinic_payment_link",
        custom_fields: [
          { display_name: "Clinic", variable_name: "clinic", value: invoice.clinicName },
          { display_name: "Invoice", variable_name: "invoice_number", value: invoice.invoiceNumber },
        ],
      },
    };
    payload.subaccount = subaccountCode;
    // The clinic's subaccount receives exactly its share (stamp duty is deducted from it on payout);
    // Rehabify's account keeps the rest and pays Paystack's fee out of it (see convex/clinicFees.ts)
    payload.transaction_charge = invoice.mainAccountChargeKobo;
    payload.bearer = "account";

    const data = await paystackRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    await ctx.runMutation(internal.clinicBilling.recordPaymentLink, {
      invoiceId: invoice.invoiceId,
      patientId: invoice.patientId,
      reference,
      amountKobo: invoice.totalKobo,
      paymentLink: data.authorization_url,
      subaccountCode,
    });

    return { paymentLink: data.authorization_url as string };
}

/** Record a payment taken outside Paystack (cash, POS, bank transfer) against a payment request. */
export const markInvoicePaid = mutation({
  args: {
    invoiceId: v.id("invoices"),
    method: v.union(v.literal("cash"), v.literal("bank_transfer"), v.literal("pos")),
    /** When the money arrived, if not today (transfers are often logged a day or two later) */
    paidAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Recording a patient's payment keeps working while the clinic is read-only
    const member = await requireClinicWrite(ctx, "billing", { allowBillingReadOnly: true });
    const { clinic } = member;
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.clinicId !== clinic._id) {
      throw new ConvexError("Invoice not found");
    }
    if (invoice.status === "paid") {
      return { success: true };
    }
    if (invoice.status === "void") {
      throw new ConvexError("This invoice was cancelled. Record the payment on its own instead.");
    }
    await settleClinicInvoiceOffline(ctx, clinic, invoice, args.method, offlinePaidAt(args.paidAt));
    return { success: true };
  },
});

/**
 * Undo "Mark as paid" when it was pressed by mistake (wrong invoice, wrong amount). Only for
 * payments recorded by hand: money that came through Paystack is refunded, never un-marked.
 * The invoice goes back to unpaid, so it can be corrected, cancelled or paid properly.
 */
export const undoMarkInvoicePaid = mutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const member = await requireClinicWrite(ctx, "billing", { allowBillingReadOnly: true });
    const { user, clinic } = member;
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.clinicId !== clinic._id) {
      throw new ConvexError("Invoice not found");
    }
    if (invoice.status !== "paid") {
      throw new ConvexError("This invoice isn't marked as paid.");
    }
    const byHand = invoice.paymentMethod === "cash" || invoice.paymentMethod === "bank_transfer" || invoice.paymentMethod === "pos";
    const onlinePayments = await ctx.db
      .query("payments")
      .withIndex("by_invoice_id", (q) => q.eq("invoiceId", invoice._id))
      .collect();
    if (!byHand || onlinePayments.some((p) => p.status === "completed") || (invoice.refundedAmount ?? 0) > 0) {
      throw new ConvexError("This invoice was paid online, so it can't be undone here. Contact Rehabify support about a refund.");
    }
    await ctx.db.patch(invoice._id, {
      status: "sent",
      paymentMethod: undefined,
      paymentDate: undefined,
      paidAmount: 0,
    });
    // Any partner or doctor commission recorded for the hand-marked payment goes with it
    const reason = "Clinic undid a payment marked as paid by mistake";
    await reverseCommissionsForPayment(ctx, `manual:${invoice._id}`, reason);
    // (a payment recorded after an earlier undo has its own reference: see markInvoicePaid)
    if (invoice.paymentDate) await reverseCommissionsForPayment(ctx, `manual:${invoice._id}:${invoice.paymentDate}`, reason);
    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      action: "clinic_invoice_payment_undone",
      targetEntityType: "invoice",
      targetEntityId: invoice._id,
      timestamp: Date.now(),
      details: {
        clinicId: clinic._id,
        invoiceNumber: invoice.invoiceNumber,
        method: invoice.paymentMethod,
        amountKobo: invoice.totalAmount,
        markedPaidAt: invoice.paymentDate,
      },
    });
    return { success: true };
  },
});

/** Cancel an unpaid invoice. */
export const voidInvoice = mutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const member = await requireClinicWrite(ctx, "billing", { allowBillingReadOnly: true });
    const { user, clinic } = member;
    const invoice: Doc<"invoices"> | null = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.clinicId !== clinic._id) {
      throw new ConvexError("Invoice not found");
    }
    if (invoice.status === "paid") {
      throw new ConvexError("Paid invoices cannot be cancelled");
    }
    await ctx.db.patch(args.invoiceId, { status: "void" });
    await closeInvoicePaymentLinks(ctx, args.invoiceId);
    return { success: true, invoiceId: invoice._id as Id<"invoices"> };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Clinic subscriptions (Clinic Master SaaS Agreement, clauses 3 and 7)
//
// Nothing here touches a clinic until an admin switches its billing on. Lifecycle (Lagos dates;
// the daily job runs at 08:00):
//  - Billing start date, then the same day each month: the period rolls and an invoice is issued
//    for the plan fee of the new period (in advance) plus ₦500 for each Active Patient Programme
//    over the allowance in the period that just ended (in arrears). Payable within 7 days.
//  - Allowance warnings by email at 80% and 100%, once each per period.
//  - Due date: reminder. The day after: past_due. 14 days after the reminder: written notice that
//    the clinic becomes read-only in 7 days. Then read_only: view, export and pay only.
//  - Paying (online, or an admin marking a bank transfer) or voiding lifts it at once.
//  - Switching billing off: cancelled. No more invoices; seat limits and read-only lift.
// This is Rehabify's own fee, so it never uses the clinic's subaccount split, and clinic patients'
// payments are untouched.
// ─────────────────────────────────────────────────────────────────────────────

const SUB_REFERENCE = /^CLINICSUB_([a-z0-9]+)_\d+$/;
/** A checkout link is reused for a few hours so repeated clicks don't open new transactions. */
const CHECKOUT_REUSE_MS = 6 * 60 * 60 * 1000;
const PLAN_RANK: Record<ClinicSubscription["plan"], number> = { starter: 0, growth: 1, enterprise: 2 };

const sendCareEmail = makeFunctionReference<
  "action",
  {
    to: string;
    subject: string;
    greetingName?: string;
    heading: string;
    paragraphs: string[];
    buttonLabel?: string;
    buttonUrl?: string;
    footnote?: string;
  }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

const CLINIC_BILLING_FOOTNOTE =
  "You're receiving this because your clinic uses Rehabify. Questions about your plan or an invoice? Write to hello@myrehabifyhealth.com.";

type PaidArgs = { reference: string; amountKobo: number; currency: string };
type SubscriptionPaymentResult = { success: true; alreadyCompleted: boolean } | { success: false; reason: string };
type BillableWork = { subscriptionIds: Id<"clinicSubscriptions">[]; pendingReferences: string[] };
type CheckoutInfo = {
  invoiceId: Id<"clinicSubscriptionInvoices">;
  number: string;
  status: ClinicSubscriptionInvoice["status"];
  amountKobo: number;
  email: string | null;
  clinicId: Id<"clinics">;
  clinicName: string;
  authorizationUrl: string | null;
  checkoutCreatedAt: number | null;
};

// Own functions by name (keeps the generated api types out of these calls)
const processSubscriptionRef = makeFunctionReference<"mutation", { subscriptionId: Id<"clinicSubscriptions"> }, unknown>(
  "clinicBilling:processClinicSubscription"
);
const billableSubscriptionsRef = makeFunctionReference<"query", Record<string, never>, BillableWork>(
  "clinicBilling:billableClinicSubscriptions"
);
const completePaymentRef = makeFunctionReference<"mutation", PaidArgs, SubscriptionPaymentResult>(
  "clinicBilling:completeVerifiedSubscriptionPayment"
);
const checkoutInfoRef = makeFunctionReference<"query", { invoiceId: Id<"clinicSubscriptionInvoices"> }, CheckoutInfo>(
  "clinicBilling:subscriptionCheckoutInfo"
);
const recordCheckoutRef = makeFunctionReference<
  "mutation",
  { invoiceId: Id<"clinicSubscriptionInvoices">; reference: string; authorizationUrl: string },
  null
>("clinicBilling:recordSubscriptionCheckout");

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const validEmail = (value: string | undefined | null): value is string =>
  Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
const isWhole = (value: number | undefined, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** Emails the clinic owner and the clinic's contact address (once each). */
async function emailClinic(
  ctx: MutationCtx,
  clinic: Doc<"clinics">,
  message: { subject: string; heading: string; paragraphs: string[]; buttonLabel?: string; buttonPath?: string }
) {
  const owner = await ctx.db.get(clinic.ownerId);
  const ownerEmail = owner?.email?.trim().toLowerCase();
  const addresses = new Set([ownerEmail, clinic.contactEmail?.trim().toLowerCase()].filter(validEmail));
  for (const to of addresses) {
    await ctx.scheduler.runAfter(0, sendCareEmail, {
      to,
      subject: message.subject,
      greetingName: to === ownerEmail ? owner?.firstName?.trim() || undefined : undefined,
      heading: message.heading,
      paragraphs: message.paragraphs,
      buttonLabel: message.buttonLabel,
      buttonUrl: message.buttonPath ? appLink(message.buttonPath) : undefined,
      footnote: CLINIC_BILLING_FOOTNOTE,
    });
  }
}

async function openSubscriptionInvoices(ctx: QueryCtx | MutationCtx, clinicId: Id<"clinics">) {
  return await ctx.db
    .query("clinicSubscriptionInvoices")
    .withIndex("by_clinic_status", (q) => q.eq("clinicId", clinicId).eq("status", "open"))
    .collect();
}

async function nextSubscriptionInvoiceNumber(ctx: MutationCtx, clinic: Doc<"clinics">, periodStart: number) {
  const clinicPart = clinic.clinicNumber?.replace(/^RH-CL-/, "") || clinic._id.slice(-6).toUpperCase();
  const base = `RH-SUB-${clinicPart}-${zonedDateKey(periodStart).slice(0, 7).replace("-", "")}`;
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await ctx.db
      .query("clinicSubscriptionInvoices")
      .withIndex("by_number", (q) => q.eq("number", candidate))
      .first();
    if (!taken) return candidate;
  }
  return `${base}-${Date.now()}`;
}

type InvoiceLine = ClinicSubscriptionInvoice["lines"][number];

function subscriptionLine(sub: ClinicSubscription, start: number, end: number): InvoiceLine {
  return {
    kind: "subscription",
    label: `${planName(sub.plan)} plan, ${periodLabel(start, end)}`,
    quantity: 1,
    unitKobo: sub.monthlyFeeKobo,
    amountKobo: sub.monthlyFeeKobo,
    periodStart: start,
    periodEnd: end,
  };
}

/** Issues an invoice and emails it. Returns null when there is nothing to charge. */
async function insertSubscriptionInvoice(
  ctx: MutationCtx,
  sub: ClinicSubscription,
  clinic: Doc<"clinics">,
  period: { start: number; end: number },
  lines: InvoiceLine[],
  now: number
) {
  const amountKobo = lines.reduce((sum, line) => sum + line.amountKobo, 0);
  if (amountKobo <= 0) return null;
  const number = await nextSubscriptionInvoiceNumber(ctx, clinic, period.start);
  const dueAt = dueAtFor(now);
  const id = await ctx.db.insert("clinicSubscriptionInvoices", {
    clinicId: clinic._id,
    subscriptionId: sub._id,
    number,
    plan: sub.plan,
    periodStart: period.start,
    periodEnd: period.end,
    lines,
    amountKobo,
    status: "open",
    issuedAt: now,
    dueAt,
    remindersSent: 0,
    createdAt: now,
    updatedAt: now,
  });
  const overage = lines.find((line) => line.kind === "overage");
  await emailClinic(ctx, clinic, {
    subject: `Your Rehabify invoice ${number} (${naira(amountKobo)})`,
    heading: "Your Rehabify invoice",
    paragraphs: [
      `Here's your invoice for ${planName(sub.plan)}, ${periodLabel(period.start, period.end)}: ${naira(amountKobo)}.`,
      ...(overage
        ? [
            `It includes ${overage.quantity} active patient programme${overage.quantity === 1 ? "" : "s"} over your allowance last period, at ${naira(overage.unitKobo)} each.`,
          ]
        : []),
      `Please pay by ${longDate(dueAt)}. You can pay by card or bank transfer from your dashboard.`,
    ],
    buttonLabel: "View and pay",
    buttonPath: CLINIC_PLAN_PAGE,
  });
  return id;
}

/** The invoice for the subscription's current period, issued once (with last period's overage). */
async function issuePeriodInvoice(
  ctx: MutationCtx,
  sub: ClinicSubscription,
  clinic: Doc<"clinics">,
  closed: { start: number; end: number } | null,
  now: number
) {
  if (sub.currentPeriodStart === undefined || sub.currentPeriodEnd === undefined) return null;
  const periodStart = sub.currentPeriodStart;
  const existing = await ctx.db
    .query("clinicSubscriptionInvoices")
    .withIndex("by_subscription_period", (q) => q.eq("subscriptionId", sub._id).eq("periodStart", periodStart))
    .first();
  if (existing) return existing._id;

  const lines: InvoiceLine[] = [subscriptionLine(sub, periodStart, sub.currentPeriodEnd)];
  // Upgrades made part-way through the last period (the rest of it at the new fee)
  for (const p of sub.pendingProrations ?? []) {
    lines.push({ kind: "proration", label: p.label, quantity: 1, unitKobo: p.amountKobo, amountKobo: p.amountKobo, periodStart: p.periodStart, periodEnd: p.periodEnd });
  }
  if (sub.pendingProrations?.length) await ctx.db.patch(sub._id, { pendingProrations: undefined });
  if (closed) {
    // Counted as at the end of the period, over the 30 days before it
    const used = await countActiveProgrammes(ctx, clinic._id, closed.end);
    const extra = Math.max(0, used - sub.programmeAllowance);
    if (extra > 0) {
      lines.push({
        kind: "overage",
        label: `Active patient programmes over your allowance, ${periodLabel(closed.start, closed.end)} (${used} used, ${sub.programmeAllowance} included)`,
        quantity: extra,
        unitKobo: OVERAGE_UNIT_KOBO,
        amountKobo: extra * OVERAGE_UNIT_KOBO,
        periodStart: closed.start,
        periodEnd: closed.end,
      });
    }
  }
  return await insertSubscriptionInvoice(ctx, sub, clinic, { start: periodStart, end: sub.currentPeriodEnd }, lines, now);
}

/**
 * Puts a switched-on subscription in the status its open invoices call for, and tells the clinic
 * when it becomes read-only or when paying lifts it.
 */
async function applySubscriptionStatus(ctx: MutationCtx, subscriptionId: Id<"clinicSubscriptions">, now: number) {
  const sub = await ctx.db.get(subscriptionId);
  if (!billingIsOn(sub)) return;
  const open = await openSubscriptionInvoices(ctx, sub.clinicId);
  const next = statusFromOpenInvoices(open, now);
  if (next === sub.status) return;
  await ctx.db.patch(sub._id, { status: next, readOnlySince: next === "read_only" ? now : undefined, updatedAt: now });
  await ctx.db.insert("systemLogs", {
    type: "billing",
    action: "clinic_subscription_status",
    timestamp: now,
    clinicId: sub.clinicId,
    targetEntityType: "clinic_subscription",
    targetEntityId: String(sub._id),
    details: { from: sub.status, to: next },
  });
  const clinic = await ctx.db.get(sub.clinicId);
  if (!clinic) return;
  if (next === "read_only") {
    const owed = open.reduce((sum, inv) => sum + inv.amountKobo, 0);
    await emailClinic(ctx, clinic, {
      subject: "Your clinic account is now read-only",
      heading: "Your account is read-only",
      paragraphs: [
        `${clinic.name}'s account is now read-only because ${naira(owed)} is overdue.`,
        "Your team can still view and export everything, and your patients keep their programmes, but nothing can be changed. Paying lifts this straight away.",
      ],
      buttonLabel: "Pay now",
      buttonPath: CLINIC_PLAN_PAGE,
    });
  } else if (sub.status === "read_only") {
    await emailClinic(ctx, clinic, {
      subject: "Thanks, your clinic account is working fully again",
      heading: "You're all set",
      paragraphs: [`Thanks for paying. ${clinic.name} can make changes again.`],
    });
  }
}

/** Marks an invoice paid, issues the receipt and lifts past due or read-only if nothing else is owed. */
async function settleSubscriptionInvoice(
  ctx: MutationCtx,
  invoice: ClinicSubscriptionInvoice,
  payment: {
    method: "paystack" | "bank_transfer";
    reference?: string;
    amountKobo: number;
    paidAt: number;
    note?: string;
    adminId?: Id<"users">;
  }
) {
  await ctx.db.patch(invoice._id, {
    status: "paid",
    paidAt: payment.paidAt,
    paidReference: payment.reference,
    paidAmountKobo: payment.amountKobo,
    paymentMethod: payment.method,
    paymentNote: payment.note,
    markedPaidBy: payment.adminId,
    updatedAt: payment.paidAt,
  });
  const clinic = await ctx.db.get(invoice.clinicId);
  if (clinic) {
    const owner = await ctx.db.get(clinic.ownerId);
    const receiptId = await issueReceipt(ctx, {
      kind: "payment",
      payerUserId: clinic.ownerId,
      email: validEmail(owner?.email) ? owner?.email : clinic.contactEmail,
      name: clinic.name,
      relatedType: "clinic_subscription",
      relatedId: invoice._id,
      relationship: "clinic",
      description: `Rehabify ${planName(invoice.plan)}, ${periodLabel(invoice.periodStart, invoice.periodEnd)} (invoice ${invoice.number})`,
      lines: invoice.lines.map((line) => ({ label: line.label, amountKobo: line.amountKobo })),
      reference: payment.reference,
      dedupeKey: payment.reference ?? `bank_transfer:${invoice._id}`,
      paidAt: payment.paidAt,
    });
    await ctx.db.patch(invoice._id, { receiptId });
  }
  await ctx.db.insert("systemLogs", {
    type: "billing",
    action: "clinic_subscription_invoice_paid",
    timestamp: payment.paidAt,
    clinicId: invoice.clinicId,
    actorUserId: payment.adminId ? String(payment.adminId) : undefined,
    targetEntityType: "clinic_subscription_invoice",
    targetEntityId: String(invoice._id),
    details: { number: invoice.number, method: payment.method, reference: payment.reference, amountKobo: payment.amountKobo },
  });
  await applySubscriptionStatus(ctx, invoice.subscriptionId, payment.paidAt);
}

/**
 * Applies Paystack-verified payment evidence. The invoice comes from the reference (which only
 * Rehabify issues), and the amount must cover it. Repeats are no-ops; a second payment for a paid
 * or cancelled invoice is filed as a refund for an admin to approve.
 */
async function completeSubscriptionPayment(
  ctx: MutationCtx,
  reference: string,
  paid: { amountKobo: number; currency: string }
): Promise<SubscriptionPaymentResult> {
  const match = SUB_REFERENCE.exec(reference);
  if (!match) return { success: false, reason: "invalid_reference" };
  const invoiceId = ctx.db.normalizeId("clinicSubscriptionInvoices", match[1]);
  const invoice = invoiceId ? await ctx.db.get(invoiceId) : null;
  if (!invoice) return { success: false, reason: "not_found" };
  const now = Date.now();

  const refundOwed = async (reason: string, reasonText: string) => {
    if (!(paid.amountKobo > 0)) return;
    const clinic = await ctx.db.get(invoice.clinicId);
    await createRefundRequest(ctx, {
      relatedType: "clinic_subscription",
      relatedId: invoice._id,
      reference,
      amountKobo: Math.round(paid.amountKobo),
      reason,
      reasonText,
      requestedBy: "system",
      payerUserId: clinic?.ownerId,
    });
  };

  if (invoice.status === "paid") {
    if (invoice.paidReference !== reference) {
      await refundOwed(
        "duplicate_payment",
        `Invoice ${invoice.number} was already paid, so this second payment is owed back to the clinic.`
      );
    }
    return { success: true, alreadyCompleted: true };
  }
  if (invoice.status === "void") {
    await refundOwed(
      "invoice_cancelled",
      `Invoice ${invoice.number} was cancelled before this payment arrived, so it is owed back to the clinic.`
    );
    return { success: false, reason: "invoice_void" };
  }
  if (paid.currency !== "NGN" || !Number.isFinite(paid.amountKobo) || paid.amountKobo < invoice.amountKobo) {
    await ctx.db.insert("systemLogs", {
      type: "billing",
      action: "clinic_subscription_payment_mismatch",
      timestamp: now,
      clinicId: invoice.clinicId,
      targetEntityType: "clinic_subscription_invoice",
      targetEntityId: String(invoice._id),
      details: { reference, amountKobo: paid.amountKobo, currency: paid.currency, invoiceKobo: invoice.amountKobo },
    });
    return { success: false, reason: "amount_mismatch" };
  }
  await settleSubscriptionInvoice(ctx, invoice, { method: "paystack", reference, amountKobo: paid.amountKobo, paidAt: now });
  return { success: true, alreadyCompleted: false };
}

async function invoiceView(ctx: QueryCtx, inv: ClinicSubscriptionInvoice, now: number) {
  const receipt = inv.receiptId ? await ctx.db.get(inv.receiptId) : null;
  return {
    _id: inv._id,
    number: inv.number,
    planName: planName(inv.plan),
    periodLabel: periodLabel(inv.periodStart, inv.periodEnd),
    lines: inv.lines.map((line) => ({
      kind: line.kind,
      label: line.label,
      quantity: line.quantity,
      unitKobo: line.unitKobo,
      amountKobo: line.amountKobo,
    })),
    amountKobo: inv.amountKobo,
    status: inv.status,
    overdue: inv.status === "open" && now > inv.dueAt,
    issuedAt: inv.issuedAt,
    dueAt: inv.dueAt,
    paidAt: inv.paidAt ?? null,
    paymentMethod: inv.paymentMethod ?? null,
    noticeSentAt: inv.noticeSentAt ?? null,
    readOnlyFrom: inv.readOnlyFrom ?? null,
    receiptUrl: receipt ? `/receipt/${receipt.accessToken}` : null,
    receiptNumber: receipt?.number ?? null,
  };
}

function subscriptionView(sub: ClinicSubscription) {
  return {
    _id: sub._id,
    plan: sub.plan,
    planName: planName(sub.plan),
    status: sub.status,
    seatLimit: sub.seatLimit,
    programmeAllowance: sub.programmeAllowance,
    monthlyFeeKobo: sub.monthlyFeeKobo,
    billingStartsAt: sub.billingStartsAt,
    billingStartDate: zonedDateKey(sub.billingStartsAt),
    currentPeriodStart: sub.currentPeriodStart ?? null,
    currentPeriodEnd: sub.currentPeriodEnd ?? null,
    currentPeriodLabel:
      sub.currentPeriodStart !== undefined && sub.currentPeriodEnd !== undefined
        ? periodLabel(sub.currentPeriodStart, sub.currentPeriodEnd)
        : null,
    // The next invoice is issued when the next period starts
    nextInvoiceAt: billingIsOn(sub) ? (sub.currentPeriodEnd ?? sub.billingStartsAt) : null,
    warnedAt80: sub.warnedAt80 ?? null,
    warnedAt100: sub.warnedAt100 ?? null,
    readOnlySince: sub.readOnlySince ?? null,
    upgradeRequestedPlan: sub.upgradeRequestedPlan ?? null,
    upgradeRequestedAt: sub.upgradeRequestedAt ?? null,
    // Launch week: on a plan, nothing billed until 16 November 2026
    launchWeekFree: billingIsOn(sub) && sub.currentPeriodStart === undefined && launchWeekOpen(Date.now()),
    launchWeekLabel: CLINIC_LAUNCH_WEEK.label,
  };
}

// ─── Daily job ───────────────────────────────────────────────────────────────

/** Rolls periods and issues invoices, sends warnings, reminders and notices, sets the status. */
export const processClinicSubscription = internalMutation({
  args: { subscriptionId: v.id("clinicSubscriptions") },
  handler: async (ctx, args) => {
    const now = Date.now();
    let sub = await ctx.db.get(args.subscriptionId);
    if (!billingIsOn(sub)) return { skipped: true };
    const clinic = await ctx.db.get(sub.clinicId);
    if (!clinic) return { skipped: true };

    // 0. Launch week is free: a plan due to start billing during it starts on 16 November instead
    if (sub.currentPeriodStart === undefined && sub.billingStartsAt < LAUNCH_BILLING_FROM_MS) {
      await ctx.db.patch(sub._id, { billingStartsAt: LAUNCH_BILLING_FROM_MS, updatedAt: now });
      sub = (await ctx.db.get(sub._id))!;
    }

    // 1. Billing periods. Each roll happens once: the period moves on in the same transaction.
    if (now >= sub.billingStartsAt) {
      if (sub.currentPeriodStart === undefined || sub.currentPeriodEnd === undefined) {
        await ctx.db.patch(sub._id, {
          currentPeriodStart: sub.billingStartsAt,
          currentPeriodEnd: addMonthsLagos(sub.billingStartsAt, 1),
          periodNumber: 1,
          warnedAt80: undefined,
          warnedAt100: undefined,
          updatedAt: now,
        });
        sub = (await ctx.db.get(sub._id))!;
        await issuePeriodInvoice(ctx, sub, clinic, null, now);
      }
      // A missed day catches up; anything further behind is left for the next runs
      for (let guard = 0; guard < 3 && sub.currentPeriodStart !== undefined && sub.currentPeriodEnd !== undefined && sub.currentPeriodEnd <= now; guard++) {
        const closed = { start: sub.currentPeriodStart, end: sub.currentPeriodEnd };
        const periodNumber = (sub.periodNumber ?? 1) + 1;
        await ctx.db.patch(sub._id, {
          currentPeriodStart: closed.end,
          currentPeriodEnd: addMonthsLagos(sub.billingStartsAt, periodNumber),
          periodNumber,
          warnedAt80: undefined,
          warnedAt100: undefined,
          updatedAt: now,
        });
        sub = (await ctx.db.get(sub._id))!;
        await issuePeriodInvoice(ctx, sub, clinic, closed, now);
      }
    }

    // 2. Allowance warnings, once per threshold per period
    if (sub.currentPeriodStart !== undefined) {
      const count = await countActiveProgrammes(ctx, clinic._id, now);
      const level = allowanceLevel(count, sub.programmeAllowance);
      const allowance = sub.programmeAllowance;
      const patch: Partial<ClinicSubscription> = { activeProgrammes: count, usageCheckedAt: now };
      if (level === 100 && sub.warnedAt100 === undefined) {
        patch.warnedAt100 = now;
        patch.warnedAt80 = sub.warnedAt80 ?? now;
        await emailClinic(ctx, clinic, {
          subject: "You've reached your patient programme allowance",
          heading: "You've reached your allowance",
          paragraphs: [
            `${clinic.name} has ${count} active patient programmes, and your ${planName(sub.plan)} plan includes ${allowance}.`,
            `Each one over ${allowance} is ${naira(OVERAGE_UNIT_KOBO)} a month, added to your next invoice. If you expect more, a bigger plan may cost less; you can ask to upgrade from your dashboard.`,
          ],
          buttonLabel: "See your plan",
          buttonPath: CLINIC_PLAN_PAGE,
        });
      } else if (level === 80 && sub.warnedAt80 === undefined) {
        patch.warnedAt80 = now;
        await emailClinic(ctx, clinic, {
          subject: "You've used 80% of your patient programmes",
          heading: "You're at 80% of your allowance",
          paragraphs: [
            `${clinic.name} has ${count} active patient programmes, and your ${planName(sub.plan)} plan includes ${allowance}.`,
            `Each one over ${allowance} is ${naira(OVERAGE_UNIT_KOBO)} a month, added to your next invoice. You can ask to upgrade from your dashboard.`,
          ],
          buttonLabel: "See your plan",
          buttonPath: CLINIC_PLAN_PAGE,
        });
      }
      await ctx.db.patch(sub._id, patch);
    }

    // 3. Late payment: reminder on the due date, written notice 14 days after it
    for (const inv of await openSubscriptionInvoices(ctx, clinic._id)) {
      if (inv.remindersSent === 0 && now >= startOfZonedDay(inv.dueAt)) {
        await ctx.db.patch(inv._id, { remindersSent: 1, reminderSentAt: now, updatedAt: now });
        await emailClinic(ctx, clinic, {
          subject: `Your Rehabify invoice ${inv.number} is due today`,
          heading: "Your invoice is due today",
          paragraphs: [
            `Invoice ${inv.number} for ${naira(inv.amountKobo)} is due today, ${longDate(inv.dueAt)}.`,
            "If you've already paid, thank you, and please ignore this email.",
          ],
          buttonLabel: "Pay now",
          buttonPath: CLINIC_PLAN_PAGE,
        });
      } else if (inv.remindersSent > 0 && inv.noticeSentAt === undefined && now >= noticeDueFrom(inv)) {
        const readOnlyFrom = readOnlyFromFor(now);
        await ctx.db.patch(inv._id, { noticeSentAt: now, readOnlyFrom, updatedAt: now });
        await emailClinic(ctx, clinic, {
          subject: `Notice: your clinic account will become read-only on ${longDate(readOnlyFrom)}`,
          heading: "Please pay your overdue invoice",
          paragraphs: [
            `Invoice ${inv.number} for ${naira(inv.amountKobo)} was due on ${longDate(inv.dueAt)} and is still unpaid.`,
            `This is our written notice under clause 7.4 of your Clinic Master SaaS Agreement: if it is still unpaid on ${longDate(readOnlyFrom)}, ${clinic.name}'s account will become read-only until it's paid.`,
            "Read-only means your team can still view and export all your records, bill your patients and remove team members, and your patients keep their programmes, but nothing else can be changed. Paying lifts it straight away.",
            "If you think this invoice is wrong, write to hello@myrehabifyhealth.com and tell us why.",
          ],
          buttonLabel: "Pay now",
          buttonPath: CLINIC_PLAN_PAGE,
        });
      }
    }

    // 4. Past due and read-only follow from the open invoices
    await applySubscriptionStatus(ctx, sub._id, now);
    return { skipped: false };
  },
});

export const billableClinicSubscriptions = internalQuery({
  args: {},
  handler: async (ctx): Promise<BillableWork> => {
    const subscriptionIds: Id<"clinicSubscriptions">[] = [];
    for (const status of ["active", "past_due", "read_only"] as const) {
      const rows = await ctx.db
        .query("clinicSubscriptions")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      subscriptionIds.push(...rows.map((row) => row._id));
    }
    // Checkouts started in the last 30 days that are still open: their webhook may have been lost
    const since = Date.now() - 30 * DAY_MS;
    const open = await ctx.db
      .query("clinicSubscriptionInvoices")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const pendingReferences = open
      .filter((inv) => inv.paystackReference && (inv.checkoutCreatedAt ?? 0) >= since)
      .map((inv) => inv.paystackReference as string);
    return { subscriptionIds, pendingReferences };
  },
});

async function fetchPaystackTransaction(reference: string) {
  try {
    const data = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });
    return (data ?? null) as { status: string; amount: number; currency: string; reference: string } | null;
  } catch {
    return null;
  }
}

/** Daily (convex/crons.ts). Each clinic runs in its own transaction, so one failure stops nothing. */
export const runDailyClinicSubscriptions = internalAction({
  args: {},
  handler: async (ctx): Promise<{ processed: number; failed: number }> => {
    const work = await ctx.runQuery(billableSubscriptionsRef, {});
    for (const reference of work.pendingReferences) {
      const tx = await fetchPaystackTransaction(reference);
      if (tx?.status !== "success" || tx.reference !== reference) continue;
      try {
        await ctx.runMutation(completePaymentRef, {
          reference,
          amountKobo: Number(tx.amount) || 0,
          currency: String(tx.currency || ""),
        });
      } catch (err) {
        console.error("Clinic subscription payment check failed", err instanceof Error ? err.message : "unknown error");
      }
    }
    let failed = 0;
    for (const subscriptionId of work.subscriptionIds) {
      try {
        await ctx.runMutation(processSubscriptionRef, { subscriptionId });
      } catch (err) {
        failed += 1;
        console.error("Clinic subscription run failed", String(subscriptionId), err instanceof Error ? err.message : "unknown error");
      }
    }
    return { processed: work.subscriptionIds.length, failed };
  },
});

// ─── Payment ─────────────────────────────────────────────────────────────────

/** Paying works while read-only: this is a query, and queries never meet the read-only check. */
export const subscriptionCheckoutInfo = internalQuery({
  args: { invoiceId: v.id("clinicSubscriptionInvoices") },
  handler: async (ctx, args): Promise<CheckoutInfo> => {
    const { clinic } = await getClinicMember(ctx, "billing");
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.clinicId !== clinic._id) throw new ConvexError("Invoice not found");
    const owner = await ctx.db.get(clinic.ownerId);
    const ownerEmail = owner?.email ?? null;
    const email = validEmail(ownerEmail) ? ownerEmail : validEmail(clinic.contactEmail) ? clinic.contactEmail : null;
    return {
      invoiceId: invoice._id,
      number: invoice.number,
      status: invoice.status,
      amountKobo: invoice.amountKobo,
      email,
      clinicId: clinic._id,
      clinicName: clinic.name,
      authorizationUrl: invoice.authorizationUrl ?? null,
      checkoutCreatedAt: invoice.checkoutCreatedAt ?? null,
    };
  },
});

export const recordSubscriptionCheckout = internalMutation({
  args: { invoiceId: v.id("clinicSubscriptionInvoices"), reference: v.string(), authorizationUrl: v.string() },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.status !== "open") return null;
    const now = Date.now();
    await ctx.db.patch(invoice._id, {
      paystackReference: args.reference,
      authorizationUrl: args.authorizationUrl,
      checkoutCreatedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

/** Opens a Paystack checkout for one of Rehabify's invoices to the clinic. */
export const payClinicSubscriptionInvoice = action({
  args: { invoiceId: v.id("clinicSubscriptionInvoices") },
  handler: async (ctx, args): Promise<{ authorizationUrl: string }> => {
    const info = await ctx.runQuery(checkoutInfoRef, { invoiceId: args.invoiceId });
    if (info.status === "paid") throw new ConvexError("This invoice is already paid.");
    if (info.status === "void") throw new ConvexError("This invoice was cancelled.");
    if (info.authorizationUrl && info.checkoutCreatedAt && Date.now() - info.checkoutCreatedAt < CHECKOUT_REUSE_MS) {
      return { authorizationUrl: info.authorizationUrl };
    }
    if (!info.email) {
      throw new ConvexError("Add an email address for your clinic in Clinic settings before paying online.");
    }
    const reference = `CLINICSUB_${info.invoiceId}_${Date.now()}`;
    const data = await paystackRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        reference,
        amount: info.amountKobo,
        email: info.email,
        currency: "NGN",
        callback_url: `${publicAppUrl()}${CLINIC_PLAN_PAGE}`,
        channels: ["card", "bank", "ussd", "bank_transfer"],
        // Rehabify's own fee: no subaccount split
        metadata: {
          source: "clinic_subscription",
          invoiceId: info.invoiceId,
          clinicId: info.clinicId,
          custom_fields: [
            { display_name: "Clinic", variable_name: "clinic", value: info.clinicName },
            { display_name: "Invoice", variable_name: "invoice_number", value: info.number },
          ],
        },
      }),
    });
    const authorizationUrl = typeof data?.authorization_url === "string" ? data.authorization_url : "";
    if (!authorizationUrl.startsWith("https://")) {
      throw new ConvexError("We couldn't start the payment. Please try again.");
    }
    await ctx.runMutation(recordCheckoutRef, { invoiceId: info.invoiceId, reference, authorizationUrl });
    return { authorizationUrl };
  },
});

export const completeVerifiedSubscriptionPayment = internalMutation({
  args: { reference: v.string(), amountKobo: v.number(), currency: v.string() },
  handler: async (ctx, args): Promise<SubscriptionPaymentResult> =>
    completeSubscriptionPayment(ctx, args.reference, { amountKobo: args.amountKobo, currency: args.currency }),
});

/**
 * Called when Paystack sends the clinic back to the plan page. Re-verifies the reference with
 * Paystack's API before anything is marked paid; safe to repeat.
 */
export const verifyClinicSubscriptionPayment = action({
  args: { reference: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{ status: "paid" | "pending" | "failed" | "not_found" | "invalid" | "needs_review" }> => {
    const reference = args.reference.trim();
    if (!SUB_REFERENCE.test(reference)) return { status: "invalid" };
    const tx = await fetchPaystackTransaction(reference);
    if (!tx || tx.reference !== reference) return { status: "not_found" };
    if (tx.status === "success") {
      const result = await ctx.runMutation(completePaymentRef, {
        reference,
        amountKobo: Number(tx.amount) || 0,
        currency: String(tx.currency || ""),
      });
      return { status: result.success ? "paid" : "needs_review" };
    }
    if (tx.status === "failed" || tx.status === "reversed") return { status: "failed" };
    return { status: "pending" };
  },
});

/**
 * Paystack charge webhook for CLINICSUB_ references (app/api/webhooks/paystack). The signature is
 * verified here, inside Convex, before anything else, so this public entry point can't fake a payment.
 */
export const recordClinicSubscriptionPaystackWebhook = mutation({
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
    if (!reference.startsWith("CLINICSUB_")) return { handled: false };
    if (payload.event !== "charge.success") return { handled: true, ignored: String(payload.event) };
    if (data.status !== undefined && data.status !== "success") {
      return { handled: true, success: false, reason: `charge_${data.status}` };
    }
    const result = await completeSubscriptionPayment(ctx, reference, {
      amountKobo: Number(data.amount) || 0,
      currency: typeof data.currency === "string" ? data.currency : "",
    });
    return { handled: true, ...result };
  },
});

// ─── Clinic dashboard ────────────────────────────────────────────────────────

/** "Your plan": plan, usage and invoices. Null for people without the Billing page. */
export const getMyClinicPlan = query({
  args: {},
  handler: async (ctx) => {
    let member;
    try {
      member = await getClinicMemberOrNull(ctx, "billing");
    } catch {
      return null;
    }
    if (!member) return null;
    const { clinic } = member;
    const now = Date.now();
    const sub = await subscriptionForClinic(ctx, clinic._id);
    const canExport = member.permissions === "all";
    // Not set up or not switched on: the clinic isn't billed and nothing is limited
    if (!sub || sub.status === "inactive") {
      return { canExport, subscription: null, usage: null, invoices: [], owedKobo: 0, overageUnitKobo: OVERAGE_UNIT_KOBO };
    }
    const [seats, activeProgrammes, invoices] = await Promise.all([
      clinicianSeatUsage(ctx, clinic),
      countActiveProgrammes(ctx, clinic._id, now),
      ctx.db
        .query("clinicSubscriptionInvoices")
        .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
        .order("desc")
        .take(24),
    ]);
    return {
      canExport,
      subscription: subscriptionView(sub),
      usage: { seatsUsed: seats.used, seatsPending: seats.pending, activeProgrammes },
      invoices: await Promise.all(invoices.map((inv) => invoiceView(ctx, inv, now))),
      owedKobo: invoices.filter((inv) => inv.status === "open").reduce((sum, inv) => sum + inv.amountKobo, 0),
      overageUnitKobo: OVERAGE_UNIT_KOBO,
    };
  },
});

/**
 * The billing banner on the clinic dashboard: read-only for everyone (so they know why changes are
 * refused); past due and allowance warnings for people with the Billing page.
 */
export const getMyClinicBillingBanner = query({
  args: {},
  handler: async (ctx) => {
    let member;
    try {
      member = await getClinicMemberOrNull(ctx);
    } catch {
      return null;
    }
    if (!member) return null;
    const sub = await subscriptionForClinic(ctx, member.clinic._id);
    if (!billingIsOn(sub)) return null;
    const canPay = canUseArea(member, "billing");
    const open = await openSubscriptionInvoices(ctx, member.clinic._id);
    const noticed = open.map((inv) => inv.readOnlyFrom).filter((at): at is number => at !== undefined);
    const base = {
      canPay,
      owedKobo: open.reduce((sum, inv) => sum + inv.amountKobo, 0),
      allowance: sub.programmeAllowance,
      readOnlyFrom: noticed.length ? Math.min(...noticed) : null,
    };
    if (sub.status === "read_only") return { kind: "read_only" as const, ...base };
    if (!canPay) return null;
    if (sub.status === "past_due") return { kind: "past_due" as const, ...base };
    if (sub.warnedAt100 !== undefined) return { kind: "allowance_100" as const, ...base };
    if (sub.warnedAt80 !== undefined) return { kind: "allowance_80" as const, ...base };
    return null;
  },
});

/** Asks Rehabify to move the clinic to a bigger plan. Works while read-only. */
export const requestClinicPlanUpgrade = mutation({
  args: { plan: v.union(v.literal("growth"), v.literal("enterprise")) },
  handler: async (ctx, args) => {
    const { clinic, user } = await getClinicMember(ctx, "billing", { allowBillingReadOnly: true });
    const sub = await subscriptionForClinic(ctx, clinic._id);
    if (!billingIsOn(sub)) throw new ConvexError("Your clinic isn't on a paid plan yet.");
    if (PLAN_RANK[args.plan] <= PLAN_RANK[sub.plan]) throw new ConvexError("You're already on this plan or a bigger one.");
    if (sub.upgradeRequestedPlan === args.plan) return { alreadyRequested: true };
    const now = Date.now();
    await ctx.db.patch(sub._id, { upgradeRequestedPlan: args.plan, upgradeRequestedAt: now, updatedAt: now });
    const admins = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).collect();
    for (const admin of admins) {
      await insertNotification(ctx, {
        userId: admin._id,
        type: "system_alert",
        priority: "medium",
        status: "pending",
        payload: {
          title: "Clinic plan upgrade requested",
          body: `${clinic.name} asked to move from ${planName(sub.plan)} to ${planName(args.plan)}.`,
          data: { entityId: clinic._id, entityType: "clinic", actionUrl: `/dashboard/admin/clinics/${clinic._id}` },
        },
        createdAt: now,
      });
    }
    await ctx.db.insert("systemLogs", {
      type: "billing",
      action: "clinic_plan_upgrade_requested",
      timestamp: now,
      clinicId: clinic._id,
      actorUserId: String(user._id),
      targetEntityType: "clinic_subscription",
      targetEntityId: String(sub._id),
      details: { from: sub.plan, to: args.plan },
    });
    return { alreadyRequested: false };
  },
});

// ─── Admin ───────────────────────────────────────────────────────────────────

/** A clinic's subscription, the plan from its signed agreement, usage and invoices. */
export const adminGetClinicSubscription = query({
  args: { clinicId: v.id("clinics") },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const clinic = await ctx.db.get(args.clinicId);
    if (!clinic) return null;
    const now = Date.now();
    const [sub, signatures, seats, activeProgrammes, invoices] = await Promise.all([
      subscriptionForClinic(ctx, clinic._id),
      ctx.db
        .query("agreementSignatures")
        .withIndex("by_clinic_agreement", (q) => q.eq("clinicId", clinic._id).eq("agreementId", "clinic_master_saas"))
        .order("desc")
        .take(20),
      clinicianSeatUsage(ctx, clinic),
      countActiveProgrammes(ctx, clinic._id, now),
      ctx.db
        .query("clinicSubscriptionInvoices")
        .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
        .order("desc")
        .take(36),
    ]);
    const signature = signatures.find((row) => row.status !== "void") ?? null;
    const signedPlan = signature?.values.plan;
    const today = zonedDateKey(now);
    const launchWeek = launchWeekOpen(now);
    return {
      agreement: signature
        ? {
            plan: signedPlan === "starter" || signedPlan === "growth" ? signedPlan : null,
            signedAt: signature.signedAt,
            countersigned: signature.status === "active",
          }
        : null,
      subscription: sub ? { ...subscriptionView(sub), note: sub.note ?? null } : null,
      usage: { seatsUsed: seats.used, seatsPending: seats.pending, activeProgrammes },
      invoices: await Promise.all(
        invoices.map(async (inv) => ({
          ...(await invoiceView(ctx, inv, now)),
          paymentNote: inv.paymentNote ?? null,
          voidReason: inv.voidReason ?? null,
        }))
      ),
      today,
      // During launch week billing can't start before 16 November
      earliestStartDate: launchWeek ? CLINIC_LAUNCH_WEEK.billingFrom : today,
      launchWeek: launchWeek ? { label: CLINIC_LAUNCH_WEEK.label, billingFrom: CLINIC_LAUNCH_WEEK.billingFrom } : null,
      // The day after launch week while it runs, then the 1st of next month (calendar months)
      suggestedStartDate: launchWeek
        ? CLINIC_LAUNCH_WEEK.billingFrom
        : zonedDateKey(addMonthsLagos(lagosDateToMs(`${today.slice(0, 7)}-01`) ?? now, 1)),
    };
  },
});

/**
 * Sets a clinic's plan and billing start date, and optionally switches billing on. A plan change
 * on a running subscription applies to seats and the allowance at once. A higher fee is charged
 * pro rata for the rest of the current period, as a line on the next invoice (agreement: seats
 * added mid-month); a lower fee starts with the next invoice, with no credit.
 */
export const adminSaveClinicSubscription = mutation({
  args: {
    clinicId: v.id("clinics"),
    plan: v.union(v.literal("starter"), v.literal("growth"), v.literal("enterprise")),
    billingStartDate: v.string(), // "YYYY-MM-DD", Lagos
    seatLimit: v.optional(v.number()),
    programmeAllowance: v.optional(v.number()),
    monthlyFeeNaira: v.optional(v.number()),
    note: v.optional(v.string()),
    switchOn: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const clinic = await ctx.db.get(args.clinicId);
    if (!clinic) throw new ConvexError("Clinic not found");
    const now = Date.now();

    let numbers: { seatLimit: number; programmeAllowance: number; monthlyFeeKobo: number };
    if (args.plan === "enterprise") {
      if (!isWhole(args.seatLimit, 1, 10_000)) throw new ConvexError("Enter the number of clinician seats (1 or more).");
      if (!isWhole(args.programmeAllowance, 0, 1_000_000)) throw new ConvexError("Enter the programme allowance (0 or more).");
      const fee = args.monthlyFeeNaira;
      if (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0 || fee > 100_000_000) {
        throw new ConvexError("Enter the monthly fee in naira.");
      }
      numbers = { seatLimit: args.seatLimit, programmeAllowance: args.programmeAllowance, monthlyFeeKobo: Math.round(fee * 100) };
    } else {
      numbers = await standardPlanNumbers(ctx, args.plan);
    }

    const startsAt = lagosDateToMs(args.billingStartDate.trim());
    if (startsAt === null) throw new ConvexError("Pick a billing start date.");
    const existing = await subscriptionForClinic(ctx, clinic._id);
    const isOn = billingIsOn(existing);
    const started = isOn && existing.currentPeriodStart !== undefined;
    if (started && startsAt !== existing.billingStartsAt) {
      throw new ConvexError(
        `Billing started on ${longDate(existing.billingStartsAt)}, so the start date can't change. Switch billing off and on again to restart it.`
      );
    }
    const turningOn = Boolean(args.switchOn) && !isOn;
    if ((turningOn || (isOn && !started)) && startsAt < startOfZonedDay(now)) {
      throw new ConvexError("Pick a billing start date from today onwards.");
    }
    if (!started && startsAt < LAUNCH_BILLING_FROM_MS) throw new ConvexError(LAUNCH_WEEK_START_MESSAGE);

    const requested = existing?.upgradeRequestedPlan as ClinicSubscription["plan"] | undefined;
    const fields = {
      plan: args.plan,
      ...numbers,
      billingStartsAt: startsAt,
      note: args.note?.trim().slice(0, 500) || undefined,
      updatedBy: admin._id,
      updatedAt: now,
      // Moving to the plan the clinic asked for (or a bigger one) answers its request
      ...(requested && PLAN_RANK[args.plan] >= (PLAN_RANK[requested] ?? 0)
        ? { upgradeRequestedPlan: undefined, upgradeRequestedAt: undefined }
        : {}),
    };
    // Upgrading part-way through a period: the rest of it at the new fee, pro rata
    let proration: NonNullable<ClinicSubscription["pendingProrations"]>[number] | null = null;
    if (
      started &&
      existing.currentPeriodStart !== undefined &&
      existing.currentPeriodEnd !== undefined &&
      now < existing.currentPeriodEnd &&
      numbers.monthlyFeeKobo > existing.monthlyFeeKobo
    ) {
      const length = existing.currentPeriodEnd - existing.currentPeriodStart;
      const left = existing.currentPeriodEnd - Math.max(now, existing.currentPeriodStart);
      const amountKobo = Math.round(((numbers.monthlyFeeKobo - existing.monthlyFeeKobo) * left) / length);
      if (amountKobo > 0) {
        proration = {
          label: `Upgrade to ${planName(args.plan)} from ${longDate(now)} to the end of the period (pro rata)`,
          amountKobo,
          periodStart: now,
          periodEnd: existing.currentPeriodEnd,
          at: now,
        };
      }
    }

    let subscriptionId: Id<"clinicSubscriptions">;
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...fields,
        ...(proration ? { pendingProrations: [...(existing.pendingProrations ?? []), proration] } : {}),
      });
      subscriptionId = existing._id;
    } else {
      subscriptionId = await ctx.db.insert("clinicSubscriptions", { clinicId: clinic._id, status: "inactive", createdAt: now, ...fields });
    }

    if (turningOn) {
      // Switching on (again) starts a fresh run of periods from the start date
      await ctx.db.patch(subscriptionId, {
        status: "active",
        switchedOnAt: now,
        switchedOnBy: admin._id,
        cancelledAt: undefined,
        readOnlySince: undefined,
        currentPeriodStart: undefined,
        currentPeriodEnd: undefined,
        periodNumber: undefined,
        warnedAt80: undefined,
        warnedAt100: undefined,
      });
      const name = planName(args.plan);
      await emailClinic(ctx, clinic, {
        subject: `Your Rehabify plan: ${name}`,
        heading: `You're on the ${name} plan`,
        paragraphs: [
          `${clinic.name} is on the ${name} plan: ${naira(numbers.monthlyFeeKobo)} a month (excluding VAT), with ${seatsLabel(numbers.seatLimit)} and ${numbers.programmeAllowance} active patient programmes.`,
          ...(launchWeekOpen(now)
            ? [`It's launch week, so your plan is free from ${CLINIC_LAUNCH_WEEK.label}. Nothing is charged for those days.`]
            : []),
          `Your first invoice is issued on ${longDate(startsAt)} and is payable within 7 days. Each active patient programme over your allowance is ${naira(OVERAGE_UNIT_KOBO)} a month, billed the month after.`,
          "You can see your plan, usage and invoices, and export your data, from your dashboard.",
        ],
        buttonLabel: "See your plan",
        buttonPath: CLINIC_PLAN_PAGE,
      });
      if (startsAt <= now) await ctx.scheduler.runAfter(0, processSubscriptionRef, { subscriptionId });
    } else if (started && (existing.plan !== args.plan || existing.seatLimit !== numbers.seatLimit || existing.monthlyFeeKobo !== numbers.monthlyFeeKobo)) {
      const name = planName(args.plan);
      await emailClinic(ctx, clinic, {
        subject: `Your Rehabify plan has changed: ${name}`,
        heading: `You're now on the ${name} plan`,
        paragraphs: [
          `${clinic.name} now has up to ${numbers.seatLimit} clinician${numbers.seatLimit === 1 ? "" : "s"} and ${numbers.programmeAllowance} active patient programmes, from today.`,
          proration
            ? `The new fee is ${naira(numbers.monthlyFeeKobo)} a month (excluding VAT). For the rest of this period you pay only the difference, ${naira(proration.amountKobo)}, which is added to your next invoice.`
            : `The fee of ${naira(numbers.monthlyFeeKobo)} a month (excluding VAT) applies from your next invoice.`,
        ],
        buttonLabel: "See your plan",
        buttonPath: CLINIC_PLAN_PAGE,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: admin._id,
      action: turningOn ? "clinic_billing_switched_on" : "clinic_subscription_saved",
      targetEntityType: "clinic",
      targetEntityId: clinic._id,
      timestamp: now,
      details: {
        plan: args.plan,
        ...numbers,
        billingStartDate: args.billingStartDate,
        prorationKobo: proration?.amountKobo ?? 0,
        launchWeekFree: turningOn && launchWeekOpen(now),
      },
    });
    return { subscriptionId, switchedOn: turningOn };
  },
});

/** Stops billing: no more invoices; seat limits and read-only lift. Open invoices stay payable. */
export const adminSwitchClinicBillingOff = mutation({
  args: { clinicId: v.id("clinics") },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const sub = await subscriptionForClinic(ctx, args.clinicId);
    if (!billingIsOn(sub)) return { changed: false };
    const now = Date.now();
    await ctx.db.patch(sub._id, { status: "cancelled", cancelledAt: now, readOnlySince: undefined, updatedBy: admin._id, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorUserId: admin._id,
      action: "clinic_billing_switched_off",
      targetEntityType: "clinic",
      targetEntityId: args.clinicId,
      timestamp: now,
      details: { plan: sub.plan, previousStatus: sub.status },
    });
    return { changed: true };
  },
});

/** Records a bank transfer for an invoice: issues the receipt and lifts read-only. */
export const adminMarkSubscriptionInvoicePaid = mutation({
  args: { invoiceId: v.id("clinicSubscriptionInvoices"), note: v.string() },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new ConvexError("Invoice not found");
    if (invoice.status === "paid") return { success: true };
    if (invoice.status === "void") throw new ConvexError("This invoice was voided.");
    const note = args.note.trim().slice(0, 300);
    if (note.length < 3) throw new ConvexError("Add a short note, e.g. the transfer reference.");
    await settleSubscriptionInvoice(ctx, invoice, {
      method: "bank_transfer",
      amountKobo: invoice.amountKobo,
      paidAt: Date.now(),
      note,
      adminId: admin._id,
    });
    return { success: true };
  },
});

/**
 * Voids an unpaid invoice. With `reissue`, a corrected invoice for the same period is issued at
 * the current plan fee (any overage line is kept).
 */
export const adminVoidSubscriptionInvoice = mutation({
  args: { invoiceId: v.id("clinicSubscriptionInvoices"), reason: v.string(), reissue: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new ConvexError("Invoice not found");
    if (invoice.status === "paid") throw new ConvexError("Paid invoices can't be voided.");
    if (invoice.status === "void") return { success: true, reissuedId: null };
    const reason = args.reason.trim().slice(0, 300);
    if (reason.length < 3) throw new ConvexError("Add a short reason.");
    const now = Date.now();
    await ctx.db.patch(invoice._id, { status: "void", voidedAt: now, voidedBy: admin._id, voidReason: reason, updatedAt: now });

    let reissuedId: Id<"clinicSubscriptionInvoices"> | null = null;
    if (args.reissue) {
      const [sub, clinic] = await Promise.all([ctx.db.get(invoice.subscriptionId), ctx.db.get(invoice.clinicId)]);
      if (sub && clinic) {
        const lines = invoice.lines.map((line) =>
          line.kind === "subscription" ? subscriptionLine(sub, line.periodStart, line.periodEnd) : line
        );
        reissuedId = await insertSubscriptionInvoice(ctx, sub, clinic, { start: invoice.periodStart, end: invoice.periodEnd }, lines, now);
      }
    }
    await ctx.db.insert("auditLogs", {
      actorUserId: admin._id,
      action: "clinic_subscription_invoice_voided",
      targetEntityType: "clinic",
      targetEntityId: invoice.clinicId,
      timestamp: now,
      details: { invoiceId: invoice._id, number: invoice.number, reason, reissuedId },
    });
    await applySubscriptionStatus(ctx, invoice.subscriptionId, now);
    return { success: true, reissuedId };
  },
});

/** Clinics that are past due or read-only, for the admin clinics list. */
export const adminClinicBillingAttention = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const subs = [
      ...(await ctx.db.query("clinicSubscriptions").withIndex("by_status", (q) => q.eq("status", "read_only")).take(100)),
      ...(await ctx.db.query("clinicSubscriptions").withIndex("by_status", (q) => q.eq("status", "past_due")).take(100)),
    ];
    return await Promise.all(
      subs.map(async (sub) => {
        const [clinic, open] = await Promise.all([ctx.db.get(sub.clinicId), openSubscriptionInvoices(ctx, sub.clinicId)]);
        const noticed = open.map((inv) => inv.readOnlyFrom).filter((at): at is number => at !== undefined);
        return {
          clinicId: sub.clinicId,
          clinicName: clinic?.name ?? "Clinic",
          clinicNumber: clinic?.clinicNumber ?? null,
          status: sub.status === "read_only" ? ("read_only" as const) : ("past_due" as const),
          planName: planName(sub.plan),
          owedKobo: open.reduce((sum, inv) => sum + inv.amountKobo, 0),
          openInvoices: open.length,
          oldestDueAt: open.length ? Math.min(...open.map((inv) => inv.dueAt)) : null,
          readOnlyFrom: noticed.length ? Math.min(...noticed) : null,
          readOnlySince: sub.readOnlySince ?? null,
        };
      })
    );
  },
});
