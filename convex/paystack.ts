import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Create a Paystack subaccount for a physiotherapist
 * This allows split payments where the physiotherapist gets their share directly
 */
export const createPhysiotherapistSubaccount = action({
    args: {
        physiotherapistId: v.id("users"),
        businessName: v.string(),
        bankCode: v.string(),
        accountNumber: v.string(),
        percentageCharge: v.optional(v.number()), // Percentage for the platform, Defaults to 0 since we use flat fees
        accountName: v.optional(v.string()), // Holder name as resolved by verifyBankAccount
    },
    returns: v.object({
        success: v.boolean(),
        subaccountId: v.optional(v.string()), // This will hold Paystack's subaccount_code
        message: v.string(),
    }),
    handler: async (ctx, args): Promise<{ success: boolean; subaccountId?: string; message: string }> => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            return { success: false, message: "Unauthorized" };
        }

        const callerId = await ctx.runQuery(api.users.getUserById as any, { userId: args.physiotherapistId });
        if (!callerId || (callerId.clerkId !== identity.subject && callerId.role !== "admin")) {
            return { success: false, message: "Unauthorized" };
        }

        const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

        if (!PAYSTACK_SECRET) {
            return { success: false, message: "Payment service not configured" };
        }

        try {
            // Fetch physiotherapist user to provide business email (optional for Paystack)
            const physiotherapistUser: any = await ctx.runQuery(api.users.getUserById as any, {
                userId: args.physiotherapistId,
            });
            const businessEmail: string = physiotherapistUser?.email || "info@physioaroundme.com";
            const businessMobile: string = physiotherapistUser?.phone || "";

            // Create subaccount on Paystack
            const response: Response = await fetch("https://api.paystack.co/subaccount", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${PAYSTACK_SECRET}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    business_name: args.businessName,
                    settlement_bank: args.bankCode,
                    account_number: args.accountNumber,
                    percentage_charge: args.percentageCharge || 0, // We use flat fee on transaction initialisation
                    primary_contact_email: businessEmail,
                    primary_contact_phone: businessMobile,
                    description: `Physiotherapist ${args.physiotherapistId}`
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                return { success: false, message: `Failed to create subaccount (HTTP ${response.status})` };
            }

            const data: any = await response.json();

            if (data?.status && data?.data?.subaccount_code) {
                // Save subaccount details to database
                await ctx.runMutation(internal.paystack.savePhysiotherapistBankDetails as any, {
                    physiotherapistId: args.physiotherapistId,
                    subaccountId: data.data.subaccount_code, // Save subaccount_code
                    bankCode: args.bankCode,
                    accountNumber: args.accountNumber,
                    bankName: data.data.settlement_bank || "",
                    accountName: args.accountName || args.businessName,
                });

                return {
                    success: true,
                    subaccountId: data.data.subaccount_code,
                    message: "Bank account connected successfully"
                };
            } else {
                return {
                    success: false,
                    message: data.message || "Failed to create subaccount"
                };
            }
        } catch (error) {
            console.error("Paystack subaccount creation error:", error);
            return {
                success: false,
                message: "Failed to connect bank account"
            };
        }
    }
});

/**
 * Verify bank account details before creating subaccount
 */
export const verifyBankAccount = action({
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
        // Resolves account holder names through Paystack: signed-in users only, so it
        // cannot be used as an anonymous name-lookup service.
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            return { success: false, message: "Please sign in to verify a bank account." };
        }
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
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                return { success: false, message: `Account verification failed (HTTP ${response.status})` };
            }

            const data = await response.json();

            if (data.status && data.data) {
                return {
                    success: true,
                    accountName: data.data.account_name,
                    message: "Account verified successfully"
                };
            } else {
                return {
                    success: false,
                    message: data.message || "Account verification failed"
                };
            }
        } catch (error) {
            console.error("Bank verification error:", error);
            return {
                success: false,
                message: "Failed to verify account"
            };
        }
    }
});

/**
 * Get list of Nigerian banks from Paystack
 */
export const getBankList = action({
    args: {},
    returns: v.array(v.object({
        name: v.string(),
        code: v.string(),
    })),
    handler: async (ctx) => {
        const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

        if (!PAYSTACK_SECRET) {
            console.error("Paystack secret key not configured");
            throw new Error("Paystack configuration missing: PAYSTACK_SECRET_KEY");
        }

        try {
            const response = await fetch("https://api.paystack.co/bank?country=nigeria", {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${PAYSTACK_SECRET}`
                }
            });

            if (!response.ok) {
                return [];
            }

            const data = await response.json();

            if (data.status && data.data) {
                return data.data.map((bank: any) => ({
                    name: bank.name,
                    code: bank.code
                }));
            }

            return [];
        } catch (error) {
            console.error("Failed to fetch bank list:", error);
            return [];
        }
    }
});

/**
 * Internal mutation to save physiotherapist bank details
 */
export const savePhysiotherapistBankDetails = internalMutation({
    args: {
        physiotherapistId: v.id("users"),
        subaccountId: v.string(), // Paystack subaccount_code
        bankCode: v.string(),
        accountNumber: v.string(),
        bankName: v.string(),
        accountName: v.string(),
    },
    handler: async (ctx, args) => {
        // Check if bank details already exist
        const existing = await ctx.db
            .query("physiotherapistBankAccounts")
            .withIndex("by_physiotherapist_id", (q: any) => q.eq("physiotherapistId", args.physiotherapistId))
            .unique();

        if (existing) {
            // Update existing record
            await ctx.db.patch(existing._id, {
                subaccountCode: args.subaccountId,
                bankCode: args.bankCode,
                accountNumber: args.accountNumber,
                bankName: args.bankName,
                accountName: args.accountName,
                isVerified: true,
                updatedAt: Date.now(),
                paymentProvider: "paystack",
            });
        } else {
            // Create new record
            await ctx.db.insert("physiotherapistBankAccounts", {
                physiotherapistId: args.physiotherapistId,
                subaccountCode: args.subaccountId,
                bankCode: args.bankCode,
                accountNumber: args.accountNumber,
                bankName: args.bankName,
                accountName: args.accountName,
                isDefault: true,
                isVerified: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                paymentProvider: "paystack",
            });
        }
    }
});

/**
 * Query to get a physiotherapist's verified paystack subaccount for split payments
 */
export const getPhysiotherapistBankDetails = query({
    args: {
        physiotherapistId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const account = await ctx.db
            .query("physiotherapistBankAccounts")
            .withIndex("by_physiotherapist_id", (q: any) => q.eq("physiotherapistId", args.physiotherapistId))
            .first();

        // Only the Paystack subaccount code is needed to split a payment; account
        // numbers and names are never returned from this public query.
        if (account && account.isVerified && account.subaccountCode) {
            return { subaccountCode: account.subaccountCode as string };
        }
        return null;
    }
});

/**
 * Query to get physiotherapist's bank accounts
 */
export const getMyBankAccounts = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user || user.role !== "physiotherapist") {
            throw new Error("Only physiotherapists can view bank accounts");
        }

        const accounts = await ctx.db
            .query("physiotherapistBankAccounts")
            .withIndex("by_physiotherapist_id", (q: any) => q.eq("physiotherapistId", user._id))
            .collect();

        return accounts.map(account => ({
            _id: account._id,
            bankName: account.bankName,
            accountNumber: account.accountNumber,
            accountName: account.accountName,
            isDefault: account.isDefault,
            isVerified: account.isVerified,
            createdAt: account.createdAt,
            paymentProvider: account.paymentProvider || "paystack",
        }));
    }
});

/**
 * Mutation to delete a bank account
 */
export const deleteBankAccount = mutation({
    args: {
        accountId: v.id("physiotherapistBankAccounts"),
    },
    handler: async (ctx: any, args: any) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user || user.role !== "physiotherapist") {
            throw new Error("Only physiotherapists can delete bank accounts");
        }

        const account = await ctx.db.get(args.accountId);
        if (!account || account.physiotherapistId !== user._id) {
            throw new Error("Bank account not found");
        }

        await ctx.db.delete(args.accountId);
    }
});
