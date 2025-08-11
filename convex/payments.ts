import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Payment status enum
const paymentStatus = v.union(
  v.literal("pending"),
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
 * Initialize payment for an invoice
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
      patientId: invoice.patientId,
      physiotherapistId: invoice.clinicId ? undefined : await getPhysiotherapistFromInvoice(ctx, args.invoiceId),

      amount: invoice.totalAmount,
      paymentMethod: args.paymentMethod,
      paystackReference,
      status: "pending",
      createdAt: timestamp
    });

    // Log payment initialization
    await ctx.db.insert("analytics_events", {
      type: "payment_initialized",
      userId: user._id,
      metadata: {
        status: "pending",
        details: {
          invoiceId: args.invoiceId,
          amount: invoice.totalAmount,
          paystackReference,
          paymentMethod: args.paymentMethod
        }
      },
      timestamp: timestamp
    });

    return {
      success: true,
      paymentId,
      paystackReference,
      message: "Payment initialized successfully"
    };
  }
});

/**
 * Update payment status (called by webhook)
 */
export const updatePaymentStatus = mutation({
  args: {
    paystackReference: v.string(),
    status: paymentStatus,
    paystackData: v.optional(v.object({
      transactionId: v.optional(v.string()),
      gatewayResponse: v.optional(v.string()),
      paidAt: v.optional(v.number()),
      channel: v.optional(v.string()),
      fees: v.optional(v.number()),
      authorization: v.optional(v.object({
        authorizationCode: v.optional(v.string()),
        bin: v.optional(v.string()),
        last4: v.optional(v.string()),
        expMonth: v.optional(v.string()),
        expYear: v.optional(v.string()),
        cardType: v.optional(v.string()),
        bank: v.optional(v.string())
      }))
    }))
  },
  returns: v.object({
    success: v.boolean(),
    paymentId: v.optional(v.id("payments")),
    invoiceId: v.optional(v.id("invoices")),
    message: v.string()
  }),
  handler: async (ctx, args) => {
    // Find payment by Paystack reference
    const payment = await ctx.db
      .query("payments")
      .filter((q) => q.eq(q.field("paystackReference"), args.paystackReference))
      .unique();

    if (!payment) {
      throw new Error("Payment not found");
    }

    const timestamp = Date.now();

    // Update payment status
    await ctx.db.patch(payment._id, {
      status: args.status,
      ...(args.status === "completed" && args.paystackData?.paidAt && {
        paidAt: args.paystackData.paidAt
      })
    });

    // If payment successful, update invoice status
    if (args.status === "completed") {
      await ctx.db.patch(payment.invoiceId, {
        status: "paid" as const,
        paymentMethod: "paystack" as const,
        paymentDate: timestamp
      });

      // Create success notifications
      await createPaymentNotifications(ctx, payment, "completed");

      // Log successful payment
      await ctx.db.insert("systemLogs", {
        type: "info",
        action: "payment_success",
        userId: payment.patientId,
        timestamp: timestamp,
        details: {
          message: "Payment completed successfully",
          paymentId: payment._id,
          invoiceId: payment.invoiceId,
          amount: payment.amount,
          paystackReference: args.paystackReference,
          transactionId: args.paystackData?.transactionId
        }
      });

      // Track business metrics
      await ctx.db.insert("businessMetrics", {
        type: "payment_completed",
        timestamp: timestamp,
        metadata: {
          status: "success",
          details: {
            paymentMethod: "paystack",
            amount: payment.amount,
            currency: "NGN"
          }
        }
      });
    } else if (args.status === "failed") {
      // Create failure notifications
      await createPaymentNotifications(ctx, payment, "failed");

      // Log failed payment
      await ctx.db.insert("systemLogs", {
        type: "error",
        action: "payment_failed",
        userId: payment.patientId,
        timestamp: timestamp,
        details: {
          message: "Payment failed",
          paymentId: payment._id,
          invoiceId: payment.invoiceId,
          amount: payment.amount,
          paystackReference: args.paystackReference,
          gatewayResponse: args.paystackData?.gatewayResponse
        }
      });
    }

    return {
      success: true,
      paymentId: payment._id,
      invoiceId: payment.invoiceId,
      message: `Payment status updated to ${args.status}`
    };
  }
});

/**
 * Connect physiotherapist bank account
 */
export const connectBankAccount = mutation({
  args: {
    bankCode: v.string(),
    accountNumber: v.string(),
    accountName: v.string(),
    businessName: v.optional(v.string())
  },
  returns: v.object({
    success: v.boolean(),
    subaccountCode: v.optional(v.string()),
    message: v.string()
  }),
  handler: async (ctx, args) => {
    // Get authenticated physiotherapist
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const physiotherapist = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!physiotherapist || physiotherapist.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can connect bank accounts");
    }

    // Check if bank account already connected
    const existingAccount = await ctx.db
      .query("bankAccounts")
      .withIndex("by_user_id", (q: any) => q.eq("userId", physiotherapist._id))
      .first();

    if (existingAccount && existingAccount.status === "active") {
      return {
        success: false,
        message: "Bank account already connected"
      };
    }

    const timestamp = Date.now();
    const businessName = args.businessName || `${physiotherapist.firstName} ${physiotherapist.lastName}`;

    // Create bank account record
    const bankAccountId = await ctx.db.insert("bankAccounts", {
      userId: physiotherapist._id,
      bankCode: args.bankCode,
      accountNumber: args.accountNumber,
      accountName: args.accountName,
      businessName,
      status: "pending_verification",
      createdAt: timestamp,
      updatedAt: timestamp
    });

    // Log bank account connection
    await ctx.db.insert("systemLogs", {
      type: "info",
      action: "bank_account_connect",
      userId: physiotherapist._id,
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
      message: "Bank account connection initiated. Verification in progress."
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
    let payments;
    
    if (user.role === "patient") {
      payments = await ctx.db.query("payments")
        .withIndex("by_patient_id", (q: any) => q.eq("patientId", targetUserId))
        .order("desc")
        .take(args.limit || 50);
    } else if (user.role === "physiotherapist") {
      payments = await ctx.db.query("payments")
        .withIndex("by_physiotherapist_id", (q: any) => q.eq("physiotherapistId", targetUserId))
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

    // Enrich with invoice data
    const enrichedPayments = await Promise.all(
      filteredPayments.map(async (payment) => {
        const invoice = await ctx.db.get(payment.invoiceId);
        return {
          _id: payment._id,
          invoiceId: payment.invoiceId,
          amount: payment.amount,
          status: payment.status,
          paymentMethod: payment.paymentMethod,
          paystackReference: payment.paystackReference || "",
          createdAt: payment.createdAt,
          paidAt: payment.paidAt,
          invoice: {
            invoiceNumber: invoice?.invoiceNumber || "",
            issueDate: invoice?.issueDate || 0,
            dueDate: invoice?.dueDate || 0
          }
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

  // If clinic-based, find the physiotherapist who created the invoice
  // This would require tracking the creator in the invoice
  // For now, return undefined for clinic-based invoices
  return undefined;
}

// Helper function to create payment notifications
async function createPaymentNotifications(ctx: any, payment: any, status: "completed" | "failed") {
  const timestamp = Date.now();
  const invoice = await ctx.db.get(payment.invoiceId);
  const patient = await ctx.db.get(payment.patientId);
  
  if (status === "completed") {
    // Notification to patient
    await ctx.db.insert("notifications", {
      userId: payment.patientId,
      type: "payment_success" as any,
      priority: "high",
      status: "pending",
      payload: {
        title: "Payment Successful",
        body: `Your payment of ₦${(payment.amount / 100).toLocaleString()} for invoice #${invoice?.invoiceNumber} has been processed successfully.`,
        data: {
          entityId: payment.invoiceId,
          entityType: "invoice",
          actionUrl: `/dashboard/patient/invoices/${payment.invoiceId}`,
          paymentId: payment._id,
          amount: payment.amount
        }
      },
      createdAt: timestamp
    });

    // Notification to physiotherapist (if applicable)
    if (payment.physiotherapistId) {
      await ctx.db.insert("notifications", {
        userId: payment.physiotherapistId,
        type: "payment_received" as any,
        priority: "high",
        status: "pending",
        payload: {
          title: "Payment Received",
          body: `Payment of ₦${(payment.physiotherapistShare / 100).toLocaleString()} received from ${patient?.firstName} ${patient?.lastName} for invoice #${invoice?.invoiceNumber}`,
          data: {
            entityId: payment.invoiceId,
            entityType: "invoice",
            actionUrl: `/dashboard/physiotherapist/billing`,
            paymentId: payment._id,
            amount: payment.physiotherapistShare
          }
        },
        createdAt: timestamp
      });
    }
  } else if (status === "failed") {
    // Notification to patient about failed payment
    await ctx.db.insert("notifications", {
      userId: payment.patientId,
      type: "payment_failed" as any,
      priority: "high",
      status: "pending",
      payload: {
        title: "Payment Failed",
        body: `Your payment for invoice #${invoice?.invoiceNumber} could not be processed. Please try again or contact support.`,
        data: {
          entityId: payment.invoiceId,
          entityType: "invoice",
          actionUrl: `/dashboard/patient/invoices/${payment.invoiceId}`,
          paymentId: payment._id
        }
      },
      createdAt: timestamp
    });
  }
}
