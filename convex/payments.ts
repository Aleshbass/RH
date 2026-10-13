import { mutation, query, action, internalMutation, MutationCtx, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { internal } from "./_generated/api";

// Payment status enum (aligned with schema.payments.status)
const paymentStatus = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled")
);

// Payment method enum
const paymentMethod = v.union(
  v.literal("paystack"),
  v.literal("bank_transfer"),
  v.literal("cash")
);

/**
 * Initialize invoice payment with Paystack
 * This is what the UI calls to start payment process
 */
export const initializeInvoicePayment = internalAction({
  args: {
    invoiceId: v.id("invoices"),
    paymentMethod: v.string(),
    redirectUrl: v.string()
  },
  returns: v.object({
    success: v.boolean(),
    authorizationUrl: v.optional(v.string()),
    reference: v.optional(v.string()),
    error: v.optional(v.string())
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    authorizationUrl?: string;
    reference?: string;
    error?: string;
  }> => {
    // Get invoice details
    const invoice = await ctx.runQuery(internal.billing.getInvoiceByIdInternal, {
      invoiceId: args.invoiceId
    });

    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    if (invoice.status === "paid") {
      return { success: false, error: "Invoice is already paid" };
    }

    // Generate unique payment reference
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const reference = `INV_${invoice.invoiceNumber}_${timestamp}_${random}`;

    // Initialize payment in database
    const result = await ctx.runMutation(internal.payments.createPaymentRecord, {
      invoiceId: args.invoiceId,
      reference,
      amount: invoice.totalAmount,
      paymentMethod: args.paymentMethod
    });

    if (!result.success) {
      return { success: false, error: result.message };
    }

    // Determine amount to charge (patient payable): base (invoice.totalAmount) + platform + paystack fees
    const platformFee = (invoice as any).platformFeeAmount ?? 100000; // ₦1,000 in kobo default
    const baseAmount = invoice.totalAmount;
    const paystackFee = (invoice as any).paystackFeeAmount ?? (Math.round((baseAmount + platformFee) * 0.015) + 10000);
    const amountToCharge = ((invoice as any).feeBreakdown?.total) ?? (baseAmount + platformFee + paystackFee);

    // Update pending payment record with the charge amount if different
    if (amountToCharge !== invoice.totalAmount) {
      try {
        const paymentRecord = await ctx.runQuery(api.payments.getPaymentHistory, { limit: 1 });
        // best-effort: patch latest by reference
        await ctx.runMutation(internal.payments.updatePaymentStatus, {
          paystackReference: reference,
          status: "pending",
          paystackData: { amountToCharge }
        });
      } catch (e) {
        console.warn("Could not update payment record with amountToCharge", e);
      }
    }

    // Initialize Paystack payment
    const paystackResult = await ctx.runAction(internal.payments.initializePaystackPayment, {
      reference,
      amount: amountToCharge, // Amount in kobo
      email: invoice.patientEmail || "patient@example.com",
      metadata: {
        invoiceId: args.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        patientId: invoice.patientId,
        physiotherapistId: invoice.physiotherapistId || null
      },
      callback_url: args.redirectUrl
    });

    return paystackResult;
  }
});

/**
 * Internal mutation to create payment record
 */
export const createPaymentRecord = mutation({
  args: {
    invoiceId: v.id("invoices"),
    reference: v.string(),
    amount: v.number(),
    paymentMethod: v.string()
  },
  returns: v.object({
    success: v.boolean(),
    paymentId: v.optional(v.id("payments")),
    message: v.string()
  }),
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { success: false, message: "Not authenticated" };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return { success: false, message: "User not found" };
    }

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || (invoice.patientId !== user._id && user.role !== "admin")) {
      return { success: false, message: "Invoice not found" };
    }

    // Create payment record
    const paymentId = await ctx.db.insert("payments", {
      invoiceId: args.invoiceId,
      userId: user._id,
      amount: args.amount,
      currency: "NGN",
      paymentMethod: args.paymentMethod as any,
      status: "pending" as const,
      paystackReference: args.reference,
      transactionReference: args.reference,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Update invoice with payment reference
    await ctx.db.patch(args.invoiceId, {
      paymentReference: args.reference
    });

    return {
      success: true,
      paymentId,
      message: "Payment record created"
    };
  }
});

/**
 * Initialize Paystack payment (Server Action)
 */
export const initializePaystackPayment = internalAction({
  args: {
    reference: v.string(),
    amount: v.number(), // In kobo
    email: v.string(),
    metadata: v.any(),
    callback_url: v.string()
  },
  returns: v.object({
    success: v.boolean(),
    authorizationUrl: v.optional(v.string()),
    reference: v.optional(v.string()),
    error: v.optional(v.string())
  }),
  handler: async (ctx, args) => {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

    if (!PAYSTACK_SECRET) {
      console.error("Paystack secret key not configured");
      return { success: false, error: "Payment service not configured" };
    }

    try {
      // Optional split to physiotherapist subaccount
      let subaccountCode: string | null = null;
      let platformShareKobo = 0;
      try {
        const invoiceId = (args.metadata as any)?.invoiceId;
        if (invoiceId) {
          const invoice = await ctx.runQuery(internal.billing.getInvoiceByIdInternal, { invoiceId });
          if (invoice && invoice.physiotherapistId) {
            const bankDetails = await ctx.runQuery(api.paystack.getPhysiotherapistBankDetails, {
              physiotherapistId: invoice.physiotherapistId,
            });
            subaccountCode = bankDetails?.subaccountCode || null;
          }
          // Determine platform fee (kobo)
          platformShareKobo = (invoice as any)?.feeBreakdown?.platformFee || (invoice as any)?.platformFeeAmount || 100000;
        }
      } catch (e) {
        console.warn("initializePayment: could not resolve subaccount/platform fee", e);
      }

      // Build Paystack payload
      const payload: any = {
        reference: args.reference,
        amount: args.amount, // native kobo
        email: args.email,
        callback_url: args.callback_url,
        metadata: {
          ...args.metadata,
          custom_fields: []
        }
      };

      if (subaccountCode) {
        payload.subaccount = subaccountCode;
        payload.transaction_charge = platformShareKobo; // Flat platform fee in kobo
      }

      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.status) {
        return {
          success: true,
          authorizationUrl: data.data.authorization_url,
          reference: data.data.reference || args.reference
        };
      } else {
        console.error("Paystack initialization failed:", data);
        return {
          success: false,
          error: data.message || "Payment initialization failed"
        };
      }
    } catch (error) {
      console.error("Paystack API error:", error);
      return {
        success: false,
        error: "Payment service unavailable"
      };
    }
  }
});

/**
 * Verify Paystack transaction
 */
export const verifyPaystackTransaction = action({
  args: {
    reference: v.string()
  },
  returns: v.object({
    success: v.boolean(),
    status: v.optional(v.string()),
    amount: v.optional(v.number()),
    metadata: v.optional(v.any()),
    error: v.optional(v.string())
  }),
  handler: async (ctx, args) => {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

    if (!PAYSTACK_SECRET) {
      console.error("Paystack secret key not configured");
      return { success: false, error: "Payment service not configured" };
    }

    try {
      const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(args.reference)}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${PAYSTACK_SECRET}`
        }
      });

      const data = await response.json();

      if (data.status && data.data) {
        const transaction = data.data;

        // Update payment and invoice status based on transaction status
        if (transaction.status === "success") {
          await ctx.runMutation(internal.payments.updatePaymentStatus, {
            paystackReference: args.reference,
            status: "completed",
            paystackData: transaction
          })

          // Update patient balance automatically
          if (transaction.metadata?.invoiceId) {
            await ctx.runMutation(internal.payments.updatePatientBalance, {
              invoiceId: transaction.metadata.invoiceId,
              amountPaid: transaction.amount // Already in kobo
            })
          }
        } else if (transaction.status === "failed") {
          await ctx.runMutation(internal.payments.updatePaymentStatus, {
            paystackReference: args.reference,
            status: "failed",
            paystackData: transaction
          })
        }

        return {
          success: true,
          status: transaction.status, // paystack returns "success" directly
          amount: transaction.amount, // native kobo
          metadata: transaction.metadata
        };
      } else {
        return {
          success: false,
          error: data.message || "Verification failed"
        };
      }
    } catch (error) {
      console.error("Paystack verification error:", error);
      return {
        success: false,
        error: "Verification service unavailable"
      };
    }
  }
});

/**
 * Update patient balance after successful payment (internal: only called after a verified payment)
 */
export const updatePatientBalance = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    amountPaid: v.number()
  },
  handler: async (ctx, args) => {
    await applyPatientBalanceUpdate(ctx, args);
  }
});

async function applyPatientBalanceUpdate(
  ctx: MutationCtx,
  args: { invoiceId: Id<"invoices">; amountPaid: number }
) {
  {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return;

    // Patient balances are derived from invoices; patientProfiles has no balance field, and
    // patching one would fail schema validation and roll back the payment that triggered it.
    // Only record the event.
    await ctx.db.insert("analytics_events", {
      type: "balance_updated",
      userId: invoice.patientId,
      clinicId: invoice.clinicId,
      timestamp: Date.now(),
      metadata: {
        status: "completed",
        details: {
          invoiceId: args.invoiceId,
          amountPaid: args.amountPaid,
        }
      }
    });
  }
}

const paymentStatusResult = v.object({
  success: v.boolean(),
  message: v.string(),
  paymentId: v.optional(v.id("payments")),
  invoiceId: v.optional(v.id("invoices"))
});

/**
 * Update payment and invoice status (internal: callers must have verified the payment first)
 */
export const updatePaymentStatus = internalMutation({
  args: {
    paystackReference: v.string(),
    status: v.string(),
    paystackData: v.optional(v.any())
  },
  returns: paymentStatusResult,
  handler: async (ctx, args) => applyPaymentStatus(ctx, args),
});

async function verifyPaystackSignature(rawBody: string, signature: string) {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Record a Paystack charge webhook. The raw body and Paystack signature are verified here,
 * inside Convex, so this public entry point cannot be used to mark arbitrary payments paid.
 */
export const recordPaystackChargeWebhook = mutation({
  args: {
    rawBody: v.string(),
    signature: v.string(),
  },
  returns: paymentStatusResult,
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
    if (!reference) {
      return { success: false, message: "Missing payment reference" };
    }

    if (payload.event === "charge.success") {
      const result = await applyPaymentStatus(ctx, {
        paystackReference: reference,
        status: "completed",
        paystackData: {
          amount: data.amount,
          currency: data.currency,
          channel: data.channel,
          paid_at: data.paid_at,
          customer_email: data.customer?.email,
        },
      });
      const invoiceId = data.metadata?.invoiceId;
      if (result.success && typeof invoiceId === "string") {
        const normalized = ctx.db.normalizeId("invoices", invoiceId);
        if (normalized) {
          await applyPatientBalanceUpdate(ctx, { invoiceId: normalized, amountPaid: data.amount });
          // Paystack names the subaccount when it split the payment to the provider's bank
          const splitToProvider = typeof data.subaccount?.subaccount_code === "string" && data.subaccount.subaccount_code !== "";
          await ctx.db.patch(normalized, {
            payoutRoute: splitToProvider ? "split_to_provider" : "held_by_platform",
          });
        }
      }
      return result;
    }

    if (payload.event === "charge.failed") {
      return await applyPaymentStatus(ctx, {
        paystackReference: reference,
        status: "failed",
        paystackData: { status: data.status },
      });
    }

    return { success: false, message: `Unhandled event ${payload.event}` };
  },
});

async function applyPaymentStatus(
  ctx: MutationCtx,
  args: { paystackReference: string; status: string; paystackData?: any }
) {
  {
    // Find payment by reference
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_paystack_reference", (q) => q.eq("paystackReference", args.paystackReference))
      .first();

    if (!payment) {
      console.error("Payment not found for reference:", args.paystackReference);
      return {
        success: false,
        message: "Payment not found"
      };
    }

    // Update payment status
    await ctx.db.patch(payment._id, {
      status: args.status as any,
      updatedAt: Date.now(),
      metadata: args.paystackData
    });

    // If payment is completed, update invoice
    if (args.status === "completed") {
      const invoice = await ctx.db.get(payment.invoiceId as Id<"invoices">) as Doc<"invoices"> | null;
      if (invoice) {
        await ctx.db.patch(payment.invoiceId, {
          status: "paid" as const,
          paymentDate: Date.now(),
          paymentMethod: payment.paymentMethod,
          paidAmount: payment.amount
        });

        // Create notification for physiotherapist if physiotherapistId exists
        if ((invoice as any).physiotherapistId) {
          await ctx.db.insert("notifications", {
            userId: (invoice as any).physiotherapistId,
            type: "payment_received" as any,
            priority: "high",
            status: "pending",
            payload: {
              title: "Payment Received",
              body: `Invoice #${invoice.invoiceNumber} has been paid (₦${(payment.amount / 100).toLocaleString()})`,
              data: {
                entityId: invoice._id,
                entityType: "invoice",
                actionUrl: invoice.clinicId ? `/dashboard/clinic/billing` : `/dashboard/physiotherapist/billing`,
                invoiceNumber: invoice.invoiceNumber,
                amount: payment.amount
              }
            },
            createdAt: Date.now()
          });
        }

        // Create notification for patient
        await ctx.db.insert("notifications", {
          userId: invoice.patientId,
          type: "payment_confirmed" as any,
          priority: "medium",
          status: "pending",
          payload: {
            title: "Payment Confirmed",
            body: `Your payment for invoice #${invoice.invoiceNumber} has been confirmed`,
            data: {
              entityId: invoice._id,
              entityType: "invoice",
              actionUrl: `/dashboard/patient/invoices/${invoice._id}`,
              invoiceNumber: invoice.invoiceNumber
            }
          },
          createdAt: Date.now()
        });
      }
    }

    return {
      success: true,
      message: "Payment status updated",
      paymentId: payment._id,
      invoiceId: payment.invoiceId
    };
  }
}

/**
 * Initialize payment for an invoice (DEPRECATED - use initializeInvoicePayment)
 * Creates payment record and prepares for Paystack processing
 */
export const initializePayment = mutation({
  args: {
    invoiceId: v.id("invoices"),
    paymentMethod: paymentMethod,
    metadata: v.optional(v.object({
      userAgent: v.optional(v.string()),
      ipAddress: v.optional(v.string()),
      deviceInfo: v.optional(v.string())
    }))
  },
  returns: v.object({
    success: v.boolean(),
    paymentId: v.optional(v.id("payments")),
    paystackReference: v.optional(v.string()),
    message: v.string()
  }),
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Get invoice details
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }

    // Verify user can pay this invoice
    if (invoice.patientId !== user._id && user.role !== "admin") {
      throw new Error("Unauthorized to pay this invoice");
    }

    // Check if invoice is already paid
    if (invoice.status === "paid") {
      return {
        success: false,
        message: "Invoice is already paid"
      };
    }

    // Generate payment reference
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const paystackReference = `RH_${timestamp}_${random}`;

    // Create payment record
    const paymentId = await ctx.db.insert("payments", {
      invoiceId: args.invoiceId,
      userId: user._id,
      amount: invoice.totalAmount,
      currency: "NGN",
      paymentMethod: args.paymentMethod,
      status: "pending" as const,
      paystackReference,
      transactionReference: paystackReference,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Log payment initialization with correct metadata structure
    await ctx.db.insert("analytics_events", {
      type: "payment_initialized",
      userId: invoice.patientId,
      timestamp: Date.now(),
      metadata: {
        status: "pending",
        details: {
          invoiceId: args.invoiceId,
          paymentId: paymentId,
          paymentMethod: args.paymentMethod,
          amount: invoice.totalAmount,
          clientIP: args.metadata?.ipAddress || "unknown",
        }
      },
    });

    return {
      success: true,
      paymentId,
      paystackReference,
      message: "Payment initialized successfully"
    };
  }
});

// Removed duplicate updatePaymentStatus - using the one defined earlier

/**
 * Connect physiotherapist bank account
 */
export const connectBankAccount = mutation({
  args: {
    bankCode: v.string(),
    accountNumber: v.string(),
    accountName: v.string(),
    businessName: v.optional(v.string()),
    subaccountCode: v.optional(v.string())
  },
  returns: v.object({
    success: v.boolean(),
    bankAccountId: v.optional(v.id("bankAccounts")),
    message: v.string()
  }),
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Allow physiotherapists and clinic owners to connect bank accounts
    if (user.role !== "physiotherapist" && user.role !== "clinic_owner") {
      throw new Error("Only physiotherapists and clinic owners can connect bank accounts");
    }

    // Check if bank account already connected
    const existingAccount = await ctx.db
      .query("bankAccounts")
      .withIndex("by_user_id", (q: any) => q.eq("userId", user._id))
      .first();

    if (existingAccount && existingAccount.status === "active") {
      return {
        success: false,
        message: "Bank account already connected"
      };
    }

    const timestamp = Date.now();
    const businessName = args.businessName || `${user.firstName} ${user.lastName}`;

    // Create or update bank account record
    const status = args.subaccountCode ? "active" : "pending" as const;

    let bankAccountId: Id<"bankAccounts">;
    if (existingAccount) {
      await ctx.db.patch(existingAccount._id, {
        bankCode: args.bankCode,
        accountNumber: args.accountNumber,
        accountName: args.accountName,
        businessName,
        paystackRecipientCode: args.subaccountCode || "",
        status,
        updatedAt: timestamp
      });
      bankAccountId = existingAccount._id;
    } else {
      bankAccountId = await ctx.db.insert("bankAccounts", {
        userId: user._id,
        bankCode: args.bankCode,
        accountNumber: args.accountNumber,
        accountName: args.accountName,
        businessName,
        bankName: "", // Add missing bankName
        paystackRecipientCode: args.subaccountCode || "",
        status,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }

    // Log bank account connection
    await ctx.db.insert("systemLogs", {
      type: "info",
      action: "bank_account_connect",
      userId: user._id,
      timestamp: timestamp,
      details: {
        message: "Bank account connection initiated",
        bankAccountId,
        bankCode: args.bankCode,
        accountNumber: args.accountNumber,
        businessName
      }
    });

    return {
      success: true,
      bankAccountId,
      message: args.subaccountCode ? "Bank account connected successfully" : "Bank account connection initiated. Verification in progress."
    };
  }
});

/**
 * Get payment history for user
 */
export const getPaymentHistory = query({
  args: {
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    status: v.optional(paymentStatus)
  },
  returns: v.array(v.object({
    _id: v.id("payments"),
    invoiceId: v.id("invoices"),
    amount: v.number(),
    status: paymentStatus,
    paymentMethod: paymentMethod,
    paystackReference: v.string(),
    createdAt: v.number(),
    paidAt: v.optional(v.number()),
    invoice: v.object({
      invoiceNumber: v.string(),
      issueDate: v.number(),
      dueDate: v.number()
    })
  })),
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const targetUserId = args.userId || user._id;

    // Verify access permissions
    if (targetUserId !== user._id && user.role !== "admin") {
      throw new Error("Unauthorized access");
    }

    // Query payments based on user role
    let payments: any[];

    if (user.role === "patient") {
      payments = await ctx.db.query("payments")
        .withIndex("by_user_id", (q: any) => q.eq("userId", targetUserId))
        .order("desc")
        .take(args.limit || 50);
    } else if (user.role === "physiotherapist") {
      payments = await ctx.db.query("payments")
        .withIndex("by_user_id", (q: any) => q.eq("userId", targetUserId))
        .order("desc")
        .take(args.limit || 50);
    } else {
      payments = await ctx.db.query("payments")
        .order("desc")
        .take(args.limit || 50);
    }

    // Filter by status if provided
    const filteredPayments = args.status
      ? payments.filter(p => p.status === args.status)
      : payments;

    // Enrich with invoice data (and match declared return shape)
    const enrichedPayments = await Promise.all(
      filteredPayments.map(async (payment: any) => {
        const invoice = await ctx.db.get(payment.invoiceId as Id<"invoices">) as Doc<"invoices"> | null;
        return {
          _id: payment._id,
          invoiceId: payment.invoiceId as Id<"invoices">,
          amount: payment.amount,
          status: payment.status,
          paymentMethod: payment.paymentMethod,
          paystackReference: payment.paystackReference,
          createdAt: payment.createdAt,
          paidAt: payment.paidAt,
          invoice: invoice ? {
            invoiceNumber: invoice.invoiceNumber,
            issueDate: invoice.issueDate,
            dueDate: invoice.dueDate,
          } : {
            invoiceNumber: "",
            issueDate: 0,
            dueDate: 0,
          },
        };
      })
    );

    return enrichedPayments;
  }
});

// Helper function to get physiotherapist from invoice
async function getPhysiotherapistFromInvoice(ctx: any, invoiceId: Id<"invoices">) {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice) return undefined;

  // Return physiotherapist ID if exists
  return (invoice as any).physiotherapistId;
}

// Removed duplicate initializeInvoicePayment - using the action defined earlier
