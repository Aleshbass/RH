/**
 * Partner payout bank accounts.
 *
 * An account is saved only after Rehabify resolves it with Paystack server-side, and
 * the account name stored is the one Paystack returns (never a client value). Only the
 * organisation owner or an admin can view, add or remove accounts.
 */
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requirePartnerAccess } from "./helpers/partnerAccess";
import { currentPaystackMode } from "./helpers/paystackMode";

const FALLBACK_BANKS = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank (FCMB)", code: "214" },
  { name: "Guaranty Trust Bank (GTBank)", code: "058" },
  { name: "Heritage Bank", code: "030" },
  { name: "Keystone Bank", code: "082" },
  { name: "Kuda Bank", code: "50211" },
  { name: "Moniepoint MFB", code: "50515" },
  { name: "OPay Digital Services (Paycom)", code: "999992" },
  { name: "Palmpay", code: "999991" },
  { name: "Polaris Bank", code: "076" },
  { name: "Providus Bank", code: "101" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Standard Chartered Bank", code: "068" },
  { name: "Sterling Bank", code: "232" },
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank for Africa (UBA)", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
];

function cleanAccountNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{10}$/.test(digits)) throw new ConvexError("Account numbers are 10 digits (NUBAN).");
  return digits;
}

async function paystackResolve(accountNumber: string, bankCode: string): Promise<{ ok: true; accountName: string } | { ok: false; message: string }> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { ok: false, message: "Payment service is not configured." };
  try {
    const response = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    const data = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: { account_name?: string } } | null;
    if (!response.ok || !data?.status || !data.data?.account_name) {
      return { ok: false, message: data?.message || `Account could not be verified (HTTP ${response.status}).` };
    }
    return { ok: true, accountName: data.data.account_name };
  } catch {
    return { ok: false, message: "Could not reach Paystack to verify the account. Please try again." };
  }
}

export const assertBankAccess = internalQuery({
  args: { partnerCode: v.string() },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode, { requireApproved: true });
    return { code: partner.code, name: partner.name };
  },
});

/** Preview: resolves the account name with Paystack (owner/admin only). */
export const verifyPartnerBankAccount = action({
  args: { partnerCode: v.string(), bankCode: v.string(), accountNumber: v.string() },
  returns: v.object({ success: v.boolean(), accountName: v.optional(v.string()), message: v.string() }),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.partnerBankAccounts.assertBankAccess, { partnerCode: args.partnerCode });
    const resolved = await paystackResolve(cleanAccountNumber(args.accountNumber), args.bankCode.trim());
    if (!resolved.ok) return { success: false, message: resolved.message };
    return { success: true, accountName: resolved.accountName, message: "Account verified" };
  },
});

export const getPartnerBankList = action({
  args: {},
  returns: v.array(v.object({ name: v.string(), code: v.string() })),
  handler: async () => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return FALLBACK_BANKS;
    try {
      const response = await fetch("https://api.paystack.co/bank?country=nigeria&perPage=200", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!response.ok) return FALLBACK_BANKS;
      const data = (await response.json()) as { status?: boolean; data?: Array<{ name: string; code: string }> };
      if (!data.status || !data.data?.length) return FALLBACK_BANKS;
      return data.data.map((b) => ({ name: b.name, code: b.code })).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return FALLBACK_BANKS;
    }
  },
});

export const persistVerifiedBankAccount = internalMutation({
  args: {
    partnerCode: v.string(),
    bankCode: v.string(),
    bankName: v.string(),
    accountNumber: v.string(),
    accountName: v.string(),
    paystackRecipientCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { partner, actor } = await requirePartnerAccess(ctx, args.partnerCode, { requireApproved: true });
    const now = Date.now();
    const existing = await ctx.db
      .query("partnerBankAccounts")
      .withIndex("by_partner_code", (q) => q.eq("partnerCode", partner.code))
      .collect();
    for (const account of existing) {
      if (account.isDefault) await ctx.db.patch(account._id, { isDefault: false, updatedAt: now });
    }
    const duplicate = existing.find((a) => a.accountNumber === args.accountNumber && a.bankCode === args.bankCode);
    if (duplicate) {
      await ctx.db.patch(duplicate._id, {
        accountName: args.accountName,
        bankName: args.bankName,
        isVerified: true,
        isDefault: true,
        paystackRecipientCode: args.paystackRecipientCode ?? duplicate.paystackRecipientCode,
        paystackRecipientMode: args.paystackRecipientCode ? currentPaystackMode() : duplicate.paystackRecipientMode,
        updatedAt: now,
      });
      return { accountId: duplicate._id, isUpdate: true };
    }
    const accountId = await ctx.db.insert("partnerBankAccounts", {
      partnerCode: partner.code,
      bankCode: args.bankCode,
      bankName: args.bankName,
      accountNumber: args.accountNumber,
      accountName: args.accountName,
      isVerified: true,
      isDefault: true,
      paystackRecipientCode: args.paystackRecipientCode,
      paystackRecipientMode: args.paystackRecipientCode ? currentPaystackMode() : undefined,
      addedBy: actor,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("partnerActivityLogs", {
      partnerId: partner.code,
      environment: "live",
      eventId: `evt_bank_${now}`,
      eventType: "payout.bank_account_added",
      direction: "inbound",
      url: "/partners/portal",
      method: "POST",
      statusCode: 200,
      latencyMs: 0,
      status: "success",
      requestPayload: { bankName: args.bankName, accountNumber: `****${args.accountNumber.slice(-4)}`, addedBy: actor },
      occurredAt: now,
    });
    return { accountId, isUpdate: false };
  },
});

/**
 * Verifies the account with Paystack, creates the transfer recipient and saves it as
 * the default payout account. The stored account name always comes from Paystack.
 */
export const savePartnerBankAccount = action({
  args: { partnerCode: v.string(), bankCode: v.string(), bankName: v.string(), accountNumber: v.string() },
  handler: async (ctx, args): Promise<{ success: true; accountName: string }> => {
    await ctx.runQuery(internal.partnerBankAccounts.assertBankAccess, { partnerCode: args.partnerCode });
    const accountNumber = cleanAccountNumber(args.accountNumber);
    const bankCode = args.bankCode.trim();
    const resolved = await paystackResolve(accountNumber, bankCode);
    if (!resolved.ok) throw new ConvexError(resolved.message);

    let recipientCode: string | undefined;
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (secret) {
      try {
        const response = await fetch("https://api.paystack.co/transferrecipient", {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "nuban",
            name: resolved.accountName,
            account_number: accountNumber,
            bank_code: bankCode,
            currency: "NGN",
            description: `Partner payout account: ${args.partnerCode}`,
          }),
        });
        const data = (await response.json().catch(() => null)) as { status?: boolean; data?: { recipient_code?: string } } | null;
        if (data?.status && data.data?.recipient_code) recipientCode = data.data.recipient_code;
      } catch {
        // The recipient is created lazily at payout time if this fails.
      }
    }
    await ctx.runMutation(internal.partnerBankAccounts.persistVerifiedBankAccount, {
      partnerCode: args.partnerCode,
      bankCode,
      bankName: args.bankName.trim().slice(0, 120),
      accountNumber,
      accountName: resolved.accountName,
      paystackRecipientCode: recipientCode,
    });
    return { success: true, accountName: resolved.accountName };
  },
});

export const getPartnerBankAccounts = query({
  args: { partnerCode: v.string() },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode);
    const accounts = await ctx.db
      .query("partnerBankAccounts")
      .withIndex("by_partner_code", (q) => q.eq("partnerCode", partner.code))
      .collect();
    return accounts.map((a) => ({
      _id: a._id,
      bankCode: a.bankCode,
      bankName: a.bankName,
      accountNumberMasked: `******${a.accountNumber.slice(-4)}`,
      last4: a.accountNumber.slice(-4),
      accountName: a.accountName,
      isVerified: a.isVerified,
      isDefault: a.isDefault,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));
  },
});

export const deletePartnerBankAccount = mutation({
  args: { accountId: v.id("partnerBankAccounts"), partnerCode: v.string() },
  handler: async (ctx, args) => {
    const { partner } = await requirePartnerAccess(ctx, args.partnerCode, { requireApproved: true });
    const account = await ctx.db.get(args.accountId);
    if (!account || account.partnerCode !== partner.code) throw new ConvexError("Bank account not found.");
    await ctx.db.delete(account._id);
    if (account.isDefault) {
      const remaining = await ctx.db
        .query("partnerBankAccounts")
        .withIndex("by_partner_code", (q) => q.eq("partnerCode", partner.code))
        .first();
      if (remaining) await ctx.db.patch(remaining._id, { isDefault: true, updatedAt: Date.now() });
    }
    return { success: true };
  },
});
