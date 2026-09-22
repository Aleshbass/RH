import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/**
 * Verify a bank account via Paystack's /bank/resolve API.
 * Returns the resolved account name for instant partner verification.
 */
export const verifyPartnerBankAccount = action({
  args: {
    bankCode: v.string(),
    accountNumber: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    accountName: v.optional(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

    if (!PAYSTACK_SECRET) {
      return { success: false, message: "Payment service not configured" };
    }

    try {
      const url = `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(args.accountNumber)}&bank_code=${encodeURIComponent(args.bankCode)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${PAYSTACK_SECRET}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Paystack bank resolve error:", errorText);
        return { success: false, message: `Account verification failed (HTTP ${response.status})` };
      }

      const data = await response.json();

      if (data.status && data.data) {
        return {
          success: true,
          accountName: data.data.account_name,
          message: "Account verified successfully",
        };
      } else {
        return {
          success: false,
          message: data.message || "Account verification failed",
        };
      }
    } catch (error) {
      console.error("Bank verification error:", error);
      return {
        success: false,
        message: "Failed to verify account. Please try again.",
      };
    }
  },
});

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

/**
 * Get list of Nigerian banks from Paystack for the bank selector dropdown.
 */
export const getPartnerBankList = action({
  args: {},
  returns: v.array(
    v.object({
      name: v.string(),
      code: v.string(),
    })
  ),
  handler: async (ctx) => {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

    if (!PAYSTACK_SECRET) {
      return FALLBACK_BANKS;
    }

    try {
      const response = await fetch("https://api.paystack.co/bank?country=nigeria", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${PAYSTACK_SECRET}`,
        },
      });

      if (!response.ok) {
        return FALLBACK_BANKS;
      }

      const data = await response.json();

      if (data.status && data.data && data.data.length > 0) {
        return data.data
          .map((bank: any) => ({
            name: bank.name,
            code: bank.code,
          }))
          .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
      }

      return FALLBACK_BANKS;
    } catch (error) {
      console.error("Failed to fetch bank list:", error);
      return FALLBACK_BANKS;
    }
  },
});

/**
 * Create a Paystack transfer recipient for a partner's bank account.
 * This enables automated transfers from Paystack Dashboard.
 */
export const createPartnerTransferRecipient = action({
  args: {
    partnerCode: v.string(),
    accountName: v.string(),
    bankCode: v.string(),
    accountNumber: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    recipientCode: v.optional(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

    if (!PAYSTACK_SECRET) {
      return { success: false, message: "Payment service not configured" };
    }

    try {
      const response = await fetch("https://api.paystack.co/transferrecipient", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "nuban",
          name: args.accountName,
          account_number: args.accountNumber,
          bank_code: args.bankCode,
          currency: "NGN",
          description: `Partner payout account: ${args.partnerCode}`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Paystack transfer recipient error:", errorText);
        return { success: false, message: `Failed to create transfer recipient (HTTP ${response.status})` };
      }

      const data = await response.json();

      if (data.status && data.data?.recipient_code) {
        return {
          success: true,
          recipientCode: data.data.recipient_code,
          message: "Transfer recipient created successfully",
        };
      } else {
        return {
          success: false,
          message: data.message || "Failed to create transfer recipient",
        };
      }
    } catch (error) {
      console.error("Transfer recipient creation error:", error);
      return { success: false, message: "Failed to create transfer recipient" };
    }
  },
});

/**
 * Save a verified partner bank account to the database.
 * If the partner already has a default account, marks the new one as default and unsets the old one.
 */
export const savePartnerBankAccount = mutation({
  args: {
    partnerCode: v.string(),
    bankCode: v.string(),
    bankName: v.string(),
    accountNumber: v.string(),
    accountName: v.string(),
    paystackRecipientCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing accounts for this partner
    const existingAccounts = await ctx.db
      .query("partnerBankAccounts")
      .withIndex("by_partner_code", (q: any) => q.eq("partnerCode", args.partnerCode))
      .collect();

    // Check if this exact account already exists
    const duplicate = existingAccounts.find(
      (a) => a.accountNumber === args.accountNumber && a.bankCode === args.bankCode
    );

    if (duplicate) {
      // Update existing record
      await ctx.db.patch(duplicate._id, {
        accountName: args.accountName,
        bankName: args.bankName,
        isVerified: true,
        isDefault: true,
        paystackRecipientCode: args.paystackRecipientCode || duplicate.paystackRecipientCode,
        updatedAt: now,
      });

      // Unset other defaults
      for (const acct of existingAccounts) {
        if (acct._id !== duplicate._id && acct.isDefault) {
          await ctx.db.patch(acct._id, { isDefault: false, updatedAt: now });
        }
      }

      return { success: true, accountId: duplicate._id, isUpdate: true };
    }

    // Unset existing defaults
    for (const acct of existingAccounts) {
      if (acct.isDefault) {
        await ctx.db.patch(acct._id, { isDefault: false, updatedAt: now });
      }
    }

    // Create new record
    const accountId = await ctx.db.insert("partnerBankAccounts", {
      partnerCode: args.partnerCode,
      bankCode: args.bankCode,
      bankName: args.bankName,
      accountNumber: args.accountNumber,
      accountName: args.accountName,
      isVerified: true,
      isDefault: true,
      paystackRecipientCode: args.paystackRecipientCode,
      addedBy: args.partnerCode,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, accountId, isUpdate: false };
  },
});

/**
 * Query to get bank accounts for a specific partner.
 */
export const getPartnerBankAccounts = query({
  args: {
    partnerCode: v.string(),
  },
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query("partnerBankAccounts")
      .withIndex("by_partner_code", (q: any) => q.eq("partnerCode", args.partnerCode))
      .collect();

    return accounts.map((a) => ({
      _id: a._id,
      partnerCode: a.partnerCode,
      bankCode: a.bankCode,
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      accountName: a.accountName,
      isVerified: a.isVerified,
      isDefault: a.isDefault,
      paystackRecipientCode: a.paystackRecipientCode,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));
  },
});

/**
 * Delete a partner bank account.
 */
export const deletePartnerBankAccount = mutation({
  args: {
    accountId: v.id("partnerBankAccounts"),
    partnerCode: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Bank account not found");
    }

    if (account.partnerCode !== args.partnerCode) {
      throw new Error("Unauthorized: this bank account does not belong to your partner organization");
    }

    await ctx.db.delete(args.accountId);

    // If the deleted account was default, promote the next one
    if (account.isDefault) {
      const remaining = await ctx.db
        .query("partnerBankAccounts")
        .withIndex("by_partner_code", (q: any) => q.eq("partnerCode", args.partnerCode))
        .first();

      if (remaining) {
        await ctx.db.patch(remaining._id, { isDefault: true, updatedAt: Date.now() });
      }
    }

    return { success: true };
  },
});
