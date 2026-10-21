import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { currentPaystackMode } from "./helpers/paystackMode";

/**
 * Create a Paystack subaccount for a referring doctor
 * This allows commission payouts directly to the doctor
 */
export const createDoctorSubaccount = action({
    args: {
        doctorId: v.id("users"),
        businessName: v.string(),
        bankCode: v.string(),
        accountNumber: v.string(),
        percentageCharge: v.optional(v.number()), // Percentage for the platform, Defaults to 0 since we use flat fees
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

        // The caller must be this doctor, or an admin acting for them
        const caller = await ctx.runQuery(api.users.getMyUser as any, {});
        const target = await ctx.runQuery(api.users.getUserById as any, { userId: args.doctorId });
        if (!caller || !target || (target.clerkId !== identity.subject && caller.role !== "admin")) {
            return { success: false, message: "Unauthorized" };
        }

        const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

        if (!PAYSTACK_SECRET) {
            return { success: false, message: "Payment service not configured" };
        }

        try {
            // Fetch doctor user to provide business email
            const doctorUser: any = await ctx.runQuery(api.users.getUserById as any, {
                userId: args.doctorId,
            });
            const businessEmail: string = doctorUser?.email || "info@physioaroundme.com";
            const businessMobile: string = doctorUser?.phone || "";

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
                    description: `Doctor ${args.doctorId}`
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                return { success: false, message: `Failed to create subaccount (HTTP ${response.status})` };
            }

            const data: any = await response.json();

            if (data?.status && data?.data?.subaccount_code) {
                // Save subaccount details to database
                await ctx.runMutation(internal.paystackDoctor.saveDoctorBankDetails as any, {
                    doctorId: args.doctorId,
                    subaccountId: data.data.subaccount_code, // Save subaccount_code
                    bankCode: args.bankCode,
                    accountNumber: args.accountNumber,
                    bankName: data.data.settlement_bank || "",
                    accountName: args.businessName, // We can use business name for account name
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
            console.error("Paystack doctor subaccount creation error:", error);
            return {
                success: false,
                message: "Failed to connect bank account"
            };
        }
    }
});

/**
 * Internal mutation to save doctor bank details
 */
export const saveDoctorBankDetails = internalMutation({
    args: {
        doctorId: v.id("users"),
        subaccountId: v.string(), // Paystack subaccount_code
        bankCode: v.string(),
        accountNumber: v.string(),
        bankName: v.string(),
        accountName: v.string(),
    },
    handler: async (ctx, args) => {
        // Check if bank details already exist
        const existing = await ctx.db
            .query("doctorBankAccounts")
            .withIndex("by_doctor_id", (q: any) => q.eq("doctorId", args.doctorId))
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
                paystackMode: currentPaystackMode(),
            });
        } else {
            // Create new record
            await ctx.db.insert("doctorBankAccounts", {
                doctorId: args.doctorId,
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
                paystackMode: currentPaystackMode(),
            });
        }
    }
});

/**
 * Query to get doctor's bank accounts
 */
export const getMyDoctorBankAccounts = query({
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

        if (!user || user.role !== "doctor") {
            throw new Error("Only doctors can view these bank accounts");
        }

        const accounts = await ctx.db
            .query("doctorBankAccounts")
            .withIndex("by_doctor_id", (q: any) => q.eq("doctorId", user._id))
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
 * Mutation to delete a doctor bank account
 */
export const deleteDoctorBankAccount = mutation({
    args: {
        accountId: v.id("doctorBankAccounts"),
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

        if (!user || user.role !== "doctor") {
            throw new Error("Only doctors can delete bank accounts");
        }

        const account = await ctx.db.get(args.accountId);
        if (!account || account.doctorId !== user._id) {
            throw new Error("Bank account not found");
        }

        await ctx.db.delete(args.accountId);
    }
});
