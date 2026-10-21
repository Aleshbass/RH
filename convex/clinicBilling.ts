import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { ensureClinicApproved, getOwnerClinic, getOwnerClinicOrPreview, requireClinicWrite } from "./clinicTools";
import { getAuthenticatedUser } from "./auth";
import { publicAppUrl } from "./helpers/appUrl";
import { activePaymentLink, closeInvoicePaymentLinks, PAYMENT_LINK_TTL_MS } from "./helpers/paymentLinks";

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
    const auth = await getOwnerClinicOrPreview(ctx);
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
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("clinicPayoutAccounts", { ...args, createdAt: now, updatedAt: now });
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
    const subaccount = await paystackRequest("/subaccount", {
      method: "POST",
      body: JSON.stringify({
        business_name: owner.clinicName,
        settlement_bank: args.bankCode,
        account_number: args.accountNumber,
        // The Rehabify fee is taken per transaction (transaction_charge), not as a percentage here
        percentage_charge: 0,
        primary_contact_email: owner.email || undefined,
        description: `Rehabify clinic ${owner.clinicId}`,
      }),
    });
    await ctx.runMutation(internal.clinicBilling.savePayoutAccount, {
      clinicId: owner.clinicId,
      subaccountCode: subaccount.subaccount_code,
      bankCode: args.bankCode,
      bankName: args.bankName,
      bankSlug: args.bankSlug,
      accountNumber: args.accountNumber,
      accountName: resolved.account_name,
    });
    return { accountName: resolved.account_name as string };
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
      subaccountCode = payout?.subaccountCode ?? null;
    } else if (invoice.physiotherapistId) {
      const account = await ctx.db
        .query("physiotherapistBankAccounts")
        .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", invoice.physiotherapistId!))
        .first();
      subaccountCode = account?.isVerified ? account.subaccountCode : null;
    }
    return {
      subaccountCode,
      platformFeeKobo: invoice.feeBreakdown?.platformFee ?? invoice.platformFeeAmount,
      mainAccountChargeKobo: mainAccountChargeKobo(invoice),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Payment links
// ─────────────────────────────────────────────────────────────────────────────

export const getInvoiceForPaymentLink = internalQuery({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const member = await requireClinicWrite(ctx, "billing");
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
    return {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      totalKobo: invoice.feeBreakdown?.total ?? invoice.totalAmount,
      mainAccountChargeKobo: mainAccountChargeKobo(invoice),
      // Expired or out-of-date links are replaced with a fresh one
      paymentLink: activePaymentLink(invoice),
      patientId: invoice.patientId,
      patientEmail: patient?.email || null,
      fallbackEmail: clinic.contactEmail || user.email || null,
      clinicName: clinic.name,
      subaccountCode: payout?.subaccountCode ?? null,
    };
  },
});

export const recordPaymentLink = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    patientId: v.id("users"),
    reference: v.string(),
    amountKobo: v.number(),
    paymentLink: v.string(),
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
    });
  },
});

/**
 * Create a Paystack checkout link for a clinic invoice. The patient pays from the link
 * without needing a Rehabify account; the Paystack webhook then marks the invoice paid.
 */
export const createPaymentLink = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<{ paymentLink: string }> => {
    const invoice = await ctx.runQuery(internal.clinicBilling.getInvoiceForPaymentLink, {
      invoiceId: args.invoiceId,
    });
    if (invoice.status === "paid") {
      throw new ConvexError("This invoice is already paid");
    }
    if (invoice.status === "void") {
      throw new ConvexError("This invoice was cancelled");
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
    if (invoice.subaccountCode) {
      payload.subaccount = invoice.subaccountCode;
      // The clinic's subaccount receives exactly its share (stamp duty is deducted from it on payout);
      // Rehabify's account keeps the rest and pays Paystack's fee out of it (see convex/clinicFees.ts)
      payload.transaction_charge = invoice.mainAccountChargeKobo;
      payload.bearer = "account";
    }

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
    });

    return { paymentLink: data.authorization_url as string };
  },
});

/** Record a payment taken outside Paystack (cash, POS, bank transfer). */
export const markInvoicePaid = mutation({
  args: {
    invoiceId: v.id("invoices"),
    method: v.union(v.literal("cash"), v.literal("bank_transfer"), v.literal("pos")),
  },
  handler: async (ctx, args) => {
    const member = await requireClinicWrite(ctx, "billing");
    const { user, clinic } = member;
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.clinicId !== clinic._id) {
      throw new ConvexError("Invoice not found");
    }
    if (invoice.status === "paid") {
      return { success: true };
    }
    await ctx.db.patch(args.invoiceId, {
      status: "paid",
      paymentMethod: args.method,
      paymentDate: Date.now(),
      paidAmount: invoice.totalAmount,
    });
    // Paid in person: the online link must not collect a second time
    await closeInvoicePaymentLinks(ctx, args.invoiceId);
    return { success: true };
  },
});

/** Cancel an unpaid invoice. */
export const voidInvoice = mutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const member = await requireClinicWrite(ctx, "billing");
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
