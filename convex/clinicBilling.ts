import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { ensureClinicOwnerApproved, getOwnerClinic, getOwnerClinicOrPreview } from "./clinicTools";
import { getAuthenticatedUser } from "./auth";

/**
 * Clinic billing: payout account (Paystack subaccount), shareable payment links,
 * and manual "mark as paid" for cash or transfer payments.
 *
 * Money flow for a payment link:
 *   patient pays the invoice total → Paystack splits it: the clinic's subaccount receives
 *   the total minus the Rehabify fee (transaction_charge); Rehabify's main account bears
 *   Paystack's processing fee. Without a payout account the full amount settles to Rehabify
 *   and the clinic's share is paid out manually.
 */

const PAYSTACK_API = "https://api.paystack.co";

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://physioaroundme.com").replace(/\/$/, "");
}

async function paystackRequest(path: string, init: RequestInit = {}) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new Error("Payments are not configured yet. Please contact Rehabify support.");
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
    throw new Error(data?.message || `Paystack request failed (HTTP ${response.status})`);
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
      accountName: account.accountName,
      accountNumberLast4: account.accountNumber.slice(-4),
      updatedAt: account.updatedAt,
    };
  },
});

export const resolveOwnerClinicForAction = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    return { userId: user._id, clinicId: clinic._id, clinicName: clinic.name, email: clinic.contactEmail || user.email || "" };
  },
});

export const savePayoutAccount = internalMutation({
  args: {
    clinicId: v.id("clinics"),
    subaccountCode: v.string(),
    bankCode: v.string(),
    bankName: v.string(),
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
      throw new Error("Account number must be 10 digits");
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
  args: { bankCode: v.string(), bankName: v.string(), accountNumber: v.string() },
  handler: async (ctx, args): Promise<{ accountName: string }> => {
    const owner = await ctx.runQuery(internal.clinicBilling.resolveOwnerClinicForAction, {});
    if (!/^\d{10}$/.test(args.accountNumber)) {
      throw new Error("Account number must be 10 digits");
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
      accountNumber: args.accountNumber,
      accountName: resolved.account_name,
    });
    return { accountName: resolved.account_name as string };
  },
});

/** Nigerian banks supported by Paystack, for the payout account picker. */
export const listBanks = action({
  args: {},
  handler: async (): Promise<{ name: string; code: string }[]> => {
    const banks = await paystackRequest("/bank?country=nigeria&perPage=200", { method: "GET" });
    const seen = new Set<string>();
    return (banks as any[])
      .filter((bank) => bank.active !== false && !seen.has(bank.code) && seen.add(bank.code))
      .map((bank) => ({ name: bank.name as string, code: bank.code as string }))
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
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Payment links
// ─────────────────────────────────────────────────────────────────────────────

export const getInvoiceForPaymentLink = internalQuery({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.clinicId !== clinic._id) {
      throw new Error("Invoice not found");
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
      platformFeeKobo: invoice.feeBreakdown?.platformFee ?? invoice.platformFeeAmount,
      paymentLink: invoice.paymentLink ?? null,
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
      throw new Error("This invoice is already paid");
    }
    if (invoice.status === "void") {
      throw new Error("This invoice was cancelled");
    }
    if (invoice.paymentLink) {
      return { paymentLink: invoice.paymentLink };
    }

    const email = invoice.patientEmail || invoice.fallbackEmail;
    if (!email) {
      throw new Error("Add an email address for the patient or your clinic before creating a payment link");
    }

    const reference = `CLN_${invoice.invoiceNumber}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload: Record<string, unknown> = {
      reference,
      amount: invoice.totalKobo,
      email,
      currency: "NGN",
      callback_url: `${appUrl()}/payment/callback`,
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
      payload.transaction_charge = invoice.platformFeeKobo; // Rehabify fee, in kobo
      payload.bearer = "account"; // Rehabify covers Paystack's processing fee
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
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.clinicId !== clinic._id) {
      throw new Error("Invoice not found");
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
    return { success: true };
  },
});

/** Cancel an unpaid invoice. */
export const voidInvoice = mutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const { user, clinic } = await getOwnerClinic(ctx);
    await ensureClinicOwnerApproved(ctx, user);
    const invoice: Doc<"invoices"> | null = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.clinicId !== clinic._id) {
      throw new Error("Invoice not found");
    }
    if (invoice.status === "paid") {
      throw new Error("Paid invoices cannot be cancelled");
    }
    await ctx.db.patch(args.invoiceId, { status: "void" });
    return { success: true, invoiceId: invoice._id as Id<"invoices"> };
  },
});
