// @ts-nocheck
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";

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
    percentageCharge: v.optional(v.number()), // Percentage of each transaction for the physiotherapist
  },
  returns: v.object({
    success: v.boolean(),
    subaccountCode: v.optional(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    
    if (!PAYSTACK_SECRET) {
      return { success: false, message: "Payment service not configured" };
    }

    try {
      // Fetch physiotherapist user to provide business email (required by Paystack)
      const physiotherapistUser = await ctx.runQuery(api.users.getUserById as any, {
        userId: args.physiotherapistId,
      });
      const businessEmail = (physiotherapistUser as any)?.email || "noreply@rehabifyhealth.com";

      // Create subaccount on Paystack
      const response = await fetch("https://api.paystack.co/subaccount", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          business_name: args.businessName,
          // Paystack expects 'settlement_bank' for subaccount creation
          settlement_bank: args.bankCode,
          account_number: args.accountNumber,
          primary_contact_email: businessEmail,
          percentage_charge: args.percentageCharge || 0, // 0 means we'll use split payments
          description: `Physiotherapist account for ${args.businessName}`,
          metadata: {
            physiotherapistId: args.physiotherapistId,
            type: "physiotherapist"
          }
        })
      });

      const data = await response.json();

      if (data.status) {
        // Save subaccount details to database
        await ctx.runMutation(api.paystack.savePhysiotherapistBankDetails, {
          physiotherapistId: args.physiotherapistId,
          subaccountCode: data.data.subaccount_code,
          bankCode: args.bankCode,
          accountNumber: args.accountNumber,
          bankName: data.data.bank_name || "",
          accountName: data.data.account_name || args.businessName,
        });

        return {
          success: true,
          subaccountCode: data.data.subaccount_code,
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
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    
    if (!PAYSTACK_SECRET) {
      return { success: false, message: "Payment service not configured" };
    }

    try {
      const response = await fetch(
        `https://api.paystack.co/bank/resolve?account_number=${args.accountNumber}&bank_code=${args.bankCode}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${PAYSTACK_SECRET}`
          }
        }
      );

      const data = await response.json();

      if (data.status) {
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
    slug: v.string(),
  })),
  handler: async (ctx) => {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    
    if (!PAYSTACK_SECRET) {
      console.error("Paystack secret key not configured");
      return [];
    }

    try {
      const response = await fetch("https://api.paystack.co/bank?country=nigeria", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${PAYSTACK_SECRET}`
        }
      });

      const data = await response.json();

      if (data.status && data.data) {
        return data.data.map((bank: any) => ({
          name: bank.name,
          code: bank.code,
          slug: bank.slug
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
    authorizationUrl: v.optional(v.string()),
    reference: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    
    if (!PAYSTACK_SECRET) {
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
    let subaccountCode: string | null = null;
    if (invoice.physiotherapistId) {
      const bankDetails = await ctx.runQuery(api.paystack.getPhysiotherapistBankDetails, {
        physiotherapistId: invoice.physiotherapistId
      });
      subaccountCode = bankDetails?.subaccountCode || null;
    }

    // Generate unique payment reference
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const reference = `INV_${invoice.invoiceNumber}_${timestamp}_${random}`;

    // Calculate amounts
    const feeBreakdown = invoice.feeBreakdown;
    if (!feeBreakdown) {
      return { success: false, error: "Invoice fee breakdown not found" };
    }

    const totalPayable = feeBreakdown.total; // Total amount patient pays
    const physiotherapistShare = feeBreakdown.physiotherapistEarnings; // What physiotherapist gets
    const platformShare = feeBreakdown.platformFee; // Platform fee

    try {
      // Prepare split configuration if subaccount exists
      let splitConfig = null;
      if (subaccountCode) {
        // Create split payment configuration
        splitConfig = {
          type: "percentage",
          currency: "NGN",
          subaccounts: [
            {
              subaccount: subaccountCode,
              share: Math.round((physiotherapistShare / totalPayable) * 10000) / 100 // Convert to percentage
            }
          ],
          bearer_type: "account", // Physiotherapist bears the transaction charges
          bearer_subaccount: subaccountCode
        };
      }

      // Initialize payment
      const paymentData: any = {
        reference,
        amount: totalPayable, // Amount in kobo
        email: invoice.patientEmail || "patient@rehabify.com",
        metadata: {
          invoiceId: args.invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          patientId: invoice.patientId,
          physiotherapistId: invoice.physiotherapistId || null,
          physiotherapistShare,
          platformShare,
          custom_fields: [
            {
              display_name: "Invoice Number",
              variable_name: "invoice_number",
              value: invoice.invoiceNumber
            }
          ]
        },
        callback_url: args.redirectUrl,
        channels: ["card", "bank", "ussd", "mobile_money", "bank_transfer"]
      };

      // Add split configuration if available
      if (splitConfig && subaccountCode) {
        paymentData.subaccount = subaccountCode;
        // Collect platform fee on the platform (master) account; physiotherapist gets the rest
        paymentData.transaction_charge = platformShare; // in kobo
        paymentData.bearer = "subaccount"; // Subaccount bears Paystack processing fee
      }

      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(paymentData)
      });

      const data = await response.json();

      if (data.status) {
        // Create payment record
        await ctx.runMutation(api.payments.createPaymentRecord, {
          invoiceId: args.invoiceId,
          reference,
          amount: totalPayable,
          paymentMethod: "paystack"
        });

        return {
          success: true,
          authorizationUrl: data.data.authorization_url,
          reference: data.data.reference
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
 * Internal mutation to save physiotherapist bank details
 */
export const savePhysiotherapistBankDetails = mutation({
  args: {
    physiotherapistId: v.id("users"),
    subaccountCode: v.string(),
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
        subaccountCode: args.subaccountCode,
        bankCode: args.bankCode,
        accountNumber: args.accountNumber,
        bankName: args.bankName,
        accountName: args.accountName,
        isVerified: true,
        updatedAt: Date.now(),
      });
    } else {
      // Create new record
      await ctx.db.insert("physiotherapistBankAccounts", {
        physiotherapistId: args.physiotherapistId,
        subaccountCode: args.subaccountCode,
        bankCode: args.bankCode,
        accountNumber: args.accountNumber,
        bankName: args.bankName,
        accountName: args.accountName,
        isDefault: true,
        isVerified: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
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
