// @ts-nocheck
/**
 * @deprecated — Payment processing has been migrated to Paystack.
 * See: lib/payments/paystack.ts, app/api/payments/initiate/route.ts
 *
 * This file is KEPT because the bank account management functions
 * (savePhysiotherapistBankDetails, getPhysiotherapistBankDetails,
 * getMyBankAccounts, deleteBankAccount) are still actively used.
 *
 * TODO: Migrate bank account functions to a dedicated file and
 * switch subaccount creation to Paystack's subaccount API.
 */
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";

/**
 * Create a Flutterwave subaccount for a physiotherapist
 * This allows split payments where the physiotherapist gets their share directly
 */
export const createPhysiotherapistSubaccount = action({
    args: {
        physiotherapistId: v.id("users"),
        businessName: v.string(),
        bankCode: v.string(),
        accountNumber: v.string(),
        splitValue: v.optional(v.number()), // Percentage for the physiotherapist
    },
    returns: v.object({
        success: v.boolean(),
        subaccountId: v.optional(v.string()),
        message: v.string(),
    }),
    handler: async (ctx, args) => {
        const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;

        if (!FLUTTERWAVE_SECRET) {
            return { success: false, message: "Payment service not configured" };
        }

        try {
            // Fetch physiotherapist user to provide business email
            const physiotherapistUser = await ctx.runQuery(api.users.getUserById as any, {
                userId: args.physiotherapistId,
            });
            const businessEmail = (physiotherapistUser as any)?.email || "info@physioaroundme.com";
            const businessMobile = (physiotherapistUser as any)?.phone || "";

            // Create subaccount on Flutterwave
            const response = await fetch("https://api.flutterwave.com/v3/subaccounts", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${FLUTTERWAVE_SECRET}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    business_name: args.businessName,
                    account_bank: args.bankCode,
                    account_number: args.accountNumber,
                    split_type: "percentage",
                    split_value: args.splitValue || 80, // Default 80% to physiotherapist
                    business_email: businessEmail,
                    business_mobile: businessMobile,
                    country: "NG",
                    meta: [
                        {
                            meta_name: "physiotherapistId",
                            meta_value: args.physiotherapistId
                        },
                        {
                            meta_name: "type",
                            meta_value: "physiotherapist"
                        }
                    ]
                })
            });

            const data = await response.json();

            if (data.status === "success") {
                // Save subaccount details to database
                await ctx.runMutation(api.flutterwave.savePhysiotherapistBankDetails, {
                    physiotherapistId: args.physiotherapistId,
                    subaccountId: data.data.subaccount_id,
                    bankCode: args.bankCode,
                    accountNumber: args.accountNumber,
                    bankName: data.data.bank_name || "",
                    accountName: data.data.account_name || args.businessName,
                });

                return {
                    success: true,
                    subaccountId: data.data.subaccount_id,
                    message: "Bank account connected successfully"
                };
            } else {
                return {
                    success: false,
                    message: data.message || "Failed to create subaccount"
                };
            }
        } catch (error) {
            console.error("Flutterwave subaccount creation error:", error);
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
        const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;

        if (!FLUTTERWAVE_SECRET) {
            return { success: false, message: "Payment service not configured" };
        }

        try {
            const response = await fetch("https://api.flutterwave.com/v3/accounts/resolve", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${FLUTTERWAVE_SECRET}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    account_number: args.accountNumber,
                    account_bank: args.bankCode
                })
            });

            const data = await response.json();

            if (data.status === "success") {
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
 * Get list of Nigerian banks from Flutterwave
 */
export const getBankList = action({
    args: {},
    returns: v.array(v.object({
        name: v.string(),
        code: v.string(),
    })),
    handler: async (ctx) => {
        const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;

        if (!FLUTTERWAVE_SECRET) {
            console.error("Flutterwave secret key not configured");
            throw new Error("Flutterwave configuration missing: FLUTTERWAVE_SECRET_KEY");
        }

        try {
            const response = await fetch("https://api.flutterwave.com/v3/banks/NG", {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${FLUTTERWAVE_SECRET}`
                }
            });

            const data = await response.json();

            if (data.status === "success" && data.data) {
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
 * Initialize payment with split configuration
 */
export const initializePaymentWithSplit = action({
    args: {
        invoiceId: v.id("invoices"),
        redirectUrl: v.string(),
    },
    returns: v.object({
        success: v.boolean(),
        paymentLink: v.optional(v.string()),
        txRef: v.optional(v.string()),
        error: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
        const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;

        if (!FLUTTERWAVE_SECRET) {
            return { success: false, error: "Payment service not configured" };
        }

        // Get invoice details
        const invoice = await ctx.runQuery(api.billing.getInvoiceById, {
            invoiceId: args.invoiceId
        });

        if (!invoice) {
            return { success: false, error: "Invoice not found" };
        }

        if (invoice.status === "paid") {
            return { success: false, error: "Invoice is already paid" };
        }

        // Get physiotherapist's subaccount
        let subaccountId: string | null = null;
        if (invoice.physiotherapistId) {
            const bankDetails = await ctx.runQuery(api.flutterwave.getPhysiotherapistBankDetails, {
                physiotherapistId: invoice.physiotherapistId
            });
            subaccountId = bankDetails?.subaccountId || null;
        }

        // Generate unique payment reference
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        const txRef = `FLW_INV_${invoice.invoiceNumber}_${timestamp}_${random}`;

        // Calculate amounts
        const feeBreakdown = invoice.feeBreakdown;
        if (!feeBreakdown) {
            return { success: false, error: "Invoice fee breakdown not found" };
        }

        const totalPayable = feeBreakdown.total; // Total amount patient pays (in kobo)
        const physiotherapistShare = feeBreakdown.physiotherapistEarnings; // What physiotherapist gets
        const platformShare = feeBreakdown.platformFee; // Platform fee

        try {
            // Prepare payment data
            const paymentData: any = {
                tx_ref: txRef,
                amount: totalPayable / 100, // Flutterwave expects amount in Naira, not kobo
                currency: "NGN",
                redirect_url: args.redirectUrl,
                customer: {
                    email: invoice.patientEmail || "patient@rehabify.com",
                    name: invoice.patientName || "Patient"
                },
                meta: {
                    invoiceId: args.invoiceId,
                    invoiceNumber: invoice.invoiceNumber,
                    patientId: invoice.patientId,
                    physiotherapistId: invoice.physiotherapistId || null,
                    physiotherapistShare,
                    platformShare,
                },
                customizations: {
                    title: "Rehabify Health",
                    logo: "https://physioaroundme.com/logo.png",
                    description: `Payment for Invoice #${invoice.invoiceNumber}`
                },
                payment_options: "card, banktransfer, ussd"
            };

            // Add subaccount for split payment if available
            if (subaccountId) {
                paymentData.subaccounts = [
                    {
                        id: subaccountId,
                        transaction_charge_type: "flat",
                        transaction_charge: platformShare / 100 // Platform fee in Naira
                    }
                ];
            }

            const response = await fetch("https://api.flutterwave.com/v3/payments", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${FLUTTERWAVE_SECRET}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(paymentData)
            });

            const data = await response.json();

            if (data.status === "success") {
                // Create payment record
                await ctx.runMutation(api.payments.createPaymentRecord, {
                    invoiceId: args.invoiceId,
                    reference: txRef,
                    amount: totalPayable,
                    paymentMethod: "flutterwave"
                });

                return {
                    success: true,
                    paymentLink: data.data.link,
                    txRef: txRef
                };
            } else {
                return {
                    success: false,
                    error: data.message || "Payment initialization failed"
                };
            }
        } catch (error) {
            console.error("Payment initialization error:", error);
            return {
                success: false,
                error: "Failed to initialize payment"
            };
        }
    }
});

/**
 * Verify a Flutterwave transaction
 */
export const verifyTransaction = action({
    args: {
        transactionId: v.string(),
    },
    returns: v.object({
        success: v.boolean(),
        status: v.optional(v.string()),
        amount: v.optional(v.number()),
        txRef: v.optional(v.string()),
        error: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
        const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;

        if (!FLUTTERWAVE_SECRET) {
            return { success: false, error: "Payment service not configured" };
        }

        try {
            const response = await fetch(
                `https://api.flutterwave.com/v3/transactions/${args.transactionId}/verify`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${FLUTTERWAVE_SECRET}`
                    }
                }
            );

            const data = await response.json();

            if (data.status === "success") {
                return {
                    success: true,
                    status: data.data.status,
                    amount: data.data.amount * 100, // Convert to kobo
                    txRef: data.data.tx_ref
                };
            } else {
                return {
                    success: false,
                    error: data.message || "Transaction verification failed"
                };
            }
        } catch (error) {
            console.error("Transaction verification error:", error);
            return {
                success: false,
                error: "Failed to verify transaction"
            };
        }
    }
});

/**
 * Verify transaction by reference
 */
export const verifyTransactionByRef = action({
    args: {
        txRef: v.string(),
    },
    returns: v.object({
        success: v.boolean(),
        status: v.optional(v.string()),
        amount: v.optional(v.number()),
        transactionId: v.optional(v.string()),
        error: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
        const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;

        if (!FLUTTERWAVE_SECRET) {
            return { success: false, error: "Payment service not configured" };
        }

        try {
            const response = await fetch(
                `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${args.txRef}`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${FLUTTERWAVE_SECRET}`
                    }
                }
            );

            const data = await response.json();

            if (data.status === "success") {
                return {
                    success: true,
                    status: data.data.status,
                    amount: data.data.amount * 100, // Convert to kobo
                    transactionId: String(data.data.id)
                };
            } else {
                return {
                    success: false,
                    error: data.message || "Transaction verification failed"
                };
            }
        } catch (error) {
            console.error("Transaction verification error:", error);
            return {
                success: false,
                error: "Failed to verify transaction"
            };
        }
    }
});

/**
 * Internal mutation to save physiotherapist bank details
 */
export const savePhysiotherapistBankDetails = mutation({
    args: {
        physiotherapistId: v.id("users"),
        subaccountId: v.string(),
        bankCode: v.string(),
        accountNumber: v.string(),
        bankName: v.string(),
        accountName: v.string(),
    },
    handler: async (ctx, args) => {
        // Check if bank details already exist
        const existing = await ctx.db
            .query("physiotherapistBankAccounts")
            .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", args.physiotherapistId))
            .unique();

        if (existing) {
            // Update existing record
            await ctx.db.patch(existing._id, {
                subaccountCode: args.subaccountId, // Store as subaccountCode for compatibility
                subaccountId: args.subaccountId,
                bankCode: args.bankCode,
                accountNumber: args.accountNumber,
                bankName: args.bankName,
                accountName: args.accountName,
                isVerified: true,
                updatedAt: Date.now(),
                paymentProvider: "flutterwave",
            });
        } else {
            // Create new record
            await ctx.db.insert("physiotherapistBankAccounts", {
                physiotherapistId: args.physiotherapistId,
                subaccountCode: args.subaccountId, // For backward compatibility
                subaccountId: args.subaccountId,
                bankCode: args.bankCode,
                accountNumber: args.accountNumber,
                bankName: args.bankName,
                accountName: args.accountName,
                isDefault: true,
                isVerified: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                paymentProvider: "flutterwave",
            });
        }
    }
});

/**
 * Internal query to get physiotherapist bank details
 */
export const getPhysiotherapistBankDetails = query({
    args: {
        physiotherapistId: v.id("users"),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("physiotherapistBankAccounts")
            .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", args.physiotherapistId))
            .filter((q) => q.eq(q.field("isDefault"), true))
            .unique();
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
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user || user.role !== "physiotherapist") {
            throw new Error("Only physiotherapists can view bank accounts");
        }

        const accounts = await ctx.db
            .query("physiotherapistBankAccounts")
            .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", user._id))
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
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
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
