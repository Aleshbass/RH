import { mutation, query, action, internalMutation, MutationCtx, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { internal } from "./_generated/api";
import { closeInvoicePaymentLinks } from "./helpers/paymentLinks";
import { recordInvoicePartnerCommission } from "./helpers/partnerLedger";

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
    if (invoice.status === "paid" || invoice.status === "void") {
      return { success: false, message: "This invoice can't be paid" };
    }
    // The checkout route's reference format, used once, for at least what the invoice is owed:
    // the record can't be pointed at someone else's payment or set below the amount due.
    if (!/^INV_[A-Za-z0-9_-]+$/.test(args.reference)) {
      return { success: false, message: "Invalid payment reference" };
    }
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_paystack_reference", (q) => q.eq("paystackReference", args.reference))
      .first();
    if (existing) {
      return { success: false, message: "This payment reference is already in use" };
    }
    if (!Number.isInteger(args.amount) || args.amount < invoiceMinimumDueKobo(invoice)) {
      return { success: false, message: "Payment amount doesn't match the invoice" };
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
 * Verify an invoice payment with Paystack (the /payment/callback page calls this, so it works
 * even if the webhook is late). Only invoice references (INV_/CLN_/PHY_) are handled, the
 * amount is checked against the invoice, and only the invoice id is returned.
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
  // Annotated so the generated api type doesn't depend on itself through runMutation
  handler: async (ctx, args): Promise<{ success: boolean; status?: string; amount?: number; metadata?: any; error?: string }> => {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

    if (!PAYSTACK_SECRET) {
      console.error("Paystack secret key not configured");
      return { success: false, error: "Payment service not configured" };
    }
    const reference = args.reference.trim();
    if (!isInvoicePaymentReference(reference)) {
      return { success: false, error: "Unknown payment reference" };
    }

    try {
      const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${PAYSTACK_SECRET}`
        },
        signal: AbortSignal.timeout(15_000),
      });

      const data = await response.json();

      if (data.status && data.data) {
        const transaction = data.data;

        if (transaction.status === "success" || transaction.status === "failed") {
          const result = await ctx.runMutation(internal.payments.updatePaymentStatus, {
            paystackReference: reference,
            status: transaction.status === "success" ? "completed" : "failed",
            paystackData: paystackEvidence(transaction),
          });
          if (transaction.status === "success" && !result.success) {
            return { success: false, status: "under_review", error: "We received your payment but couldn't match it to the invoice. Our team will check it." };
          }
          return {
            success: true,
            status: transaction.status,
            amount: transaction.amount,
            metadata: result.invoiceId ? { invoiceId: result.invoiceId } : undefined,
          };
        }

        // pending / ongoing / processing (bank transfer, USSD): not final yet
        return { success: true, status: transaction.status, amount: transaction.amount };
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
      return await applyPaymentStatus(ctx, {
        paystackReference: reference,
        status: "completed",
        paystackData: paystackEvidence(data),
      });
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

/** The fields of a Paystack transaction (webhook data or /transaction/verify) we act on. */
export function paystackEvidence(data: any): PaystackEvidence {
  const subaccount = typeof data?.subaccount?.subaccount_code === "string" ? data.subaccount.subaccount_code : "";
  return {
    amount: typeof data?.amount === "number" ? data.amount : undefined,
    currency: typeof data?.currency === "string" ? data.currency : undefined,
    channel: typeof data?.channel === "string" ? data.channel : undefined,
    paid_at: typeof data?.paid_at === "string" ? data.paid_at : undefined,
    customer_email: typeof data?.customer?.email === "string" ? data.customer.email : undefined,
    subaccount_code: subaccount || undefined,
    metadata_invoice_id: typeof data?.metadata?.invoiceId === "string" ? data.metadata.invoiceId : undefined,
    status: typeof data?.status === "string" ? data.status : undefined,
  };
}

/** References of invoice payments (patient checkout, clinic and physio payment links). */
const INVOICE_REFERENCE = /^(INV|CLN|PHY)_[A-Za-z0-9_-]+$/;

export function isInvoicePaymentReference(reference: string): boolean {
  return INVOICE_REFERENCE.test(reference);
}

/** The least a genuine checkout for this invoice can charge (kobo). */
function invoiceMinimumDueKobo(invoice: Doc<"invoices">): number {
  const total = invoice.feeBreakdown?.total ?? invoice.totalAmount;
  return Math.max(0, Math.round(total - (invoice.paidAmount ?? 0)));
}

export type PaystackEvidence = {
  amount?: number; // kobo actually charged
  currency?: string;
  channel?: string;
  paid_at?: string;
  customer_email?: string;
  /** Set when Paystack split the payment to the provider's subaccount */
  subaccount_code?: string;
  /** The invoiceId our server put in the checkout metadata */
  metadata_invoice_id?: string;
  status?: string;
};

async function logPaymentProblem(ctx: MutationCtx, action: string, reference: string, details: Record<string, unknown>) {
  console.error(`invoice_payment_${action}`, { reference, ...details });
  await ctx.db.insert("systemLogs", {
    type: "payment",
    timestamp: Date.now(),
    action: `invoice_payment_${action}`,
    targetEntityType: "payment_reference",
    targetEntityId: reference,
    details,
  });
}

/**
 * Applies verified Paystack evidence (webhook or server-side verify) to an invoice payment.
 * Idempotent: a payment is completed once; repeats and late "failed" events change nothing.
 * A "completed" result needs the charged amount and currency, so a payment row can never
 * mark an invoice paid for less than it owes.
 */
async function applyPaymentStatus(
  ctx: MutationCtx,
  args: { paystackReference: string; status: string; paystackData?: PaystackEvidence }
) {
  const payment = await ctx.db
    .query("payments")
    .withIndex("by_paystack_reference", (q) => q.eq("paystackReference", args.paystackReference))
    .first();

  if (!payment) {
    console.error("Payment not found for reference:", args.paystackReference);
    return { success: false, message: "Payment not found" };
  }

  // Already settled: Paystack retries and repeat verifications are no-ops
  if (payment.status === "completed") {
    return { success: true, message: "Payment already recorded", paymentId: payment._id, invoiceId: payment.invoiceId };
  }

  const evidence = args.paystackData ?? {};
  const now = Date.now();

  if (args.status !== "completed") {
    if (args.status === "failed" && (payment.status === "pending" || payment.status === "processing")) {
      await ctx.db.patch(payment._id, { status: "failed", updatedAt: now, metadata: { status: evidence.status } });
    }
    return { success: true, message: "Payment status updated", paymentId: payment._id, invoiceId: payment.invoiceId };
  }

  const invoice = (await ctx.db.get(payment.invoiceId as Id<"invoices">)) as Doc<"invoices"> | null;
  if (!invoice) {
    await logPaymentProblem(ctx, "invoice_missing", args.paystackReference, { paymentId: payment._id });
    return { success: false, message: "Invoice not found" };
  }

  const paidKobo = typeof evidence.amount === "number" ? Math.round(evidence.amount) : NaN;
  const minimumDue = invoiceMinimumDueKobo(invoice);
  if (evidence.currency !== "NGN" || !Number.isFinite(paidKobo) || paidKobo < payment.amount || paidKobo < minimumDue) {
    await logPaymentProblem(ctx, "amount_mismatch", args.paystackReference, {
      invoiceId: invoice._id,
      paidKobo,
      currency: evidence.currency,
      expectedKobo: Math.max(payment.amount, minimumDue),
    });
    return { success: false, message: "Paid amount doesn't cover the invoice" };
  }
  if (evidence.metadata_invoice_id && evidence.metadata_invoice_id !== String(invoice._id)) {
    await logPaymentProblem(ctx, "invoice_mismatch", args.paystackReference, {
      invoiceId: invoice._id,
      checkoutInvoiceId: evidence.metadata_invoice_id,
    });
    return { success: false, message: "Payment belongs to another invoice" };
  }

  await ctx.db.patch(payment._id, {
    status: "completed",
    updatedAt: now,
    metadata: {
      amount: paidKobo,
      currency: evidence.currency,
      channel: evidence.channel,
      paid_at: evidence.paid_at,
      customer_email: evidence.customer_email,
      subaccount_code: evidence.subaccount_code,
    },
  });

  // Money arrived for an invoice that was voided or already settled another way: keep the
  // payment on record for a refund instead of re-marking the invoice.
  if (invoice.status === "void" || invoice.status === "paid") {
    await logPaymentProblem(ctx, invoice.status === "void" ? "paid_after_void" : "paid_twice", args.paystackReference, {
      invoiceId: invoice._id,
      paidKobo,
    });
    return { success: true, message: "Payment recorded; invoice was already settled", paymentId: payment._id, invoiceId: payment.invoiceId };
  }

  await ctx.db.patch(invoice._id, {
    status: "paid" as const,
    paymentDate: now,
    paymentMethod: payment.paymentMethod,
    paymentReference: args.paystackReference,
    paidAmount: (invoice.paidAmount ?? 0) + paidKobo,
    // Paystack names the subaccount when it split the payment to the provider's bank
    payoutRoute: evidence.subaccount_code ? "split_to_provider" : "held_by_platform",
  });
  // A physio's own invoice (not Rehabify Care, not a clinic's) that Paystack couldn't split to
  // their bank: that money is entirely theirs, so it's owed now rather than when a linked
  // session is completed (appointments.ts skips invoices that already have a payout)
  const ownInvoice = !invoice.clinicId && invoice.physiotherapistId && !invoice.invoiceNumber?.startsWith("INV-MKT-");
  if (ownInvoice && !evidence.subaccount_code && invoice.physiotherapistId && (invoice.physiotherapistShare ?? 0) > 0) {
    const existingPayout = await ctx.db
      .query("payouts")
      .withIndex("by_payout_invoice_id", (q) => q.eq("invoiceId", invoice._id))
      .first();
    if (!existingPayout) {
      await ctx.db.insert("payouts", {
        invoiceId: invoice._id,
        paymentId: payment._id,
        amount: Math.min(invoice.physiotherapistShare ?? 0, paidKobo),
        status: "pending",
        type: "physiotherapist_earning",
        userId: invoice.physiotherapistId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  // Any other open link for this invoice must not collect again
  await closeInvoicePaymentLinks(ctx, invoice._id, { keepReference: args.paystackReference });
  await applyPatientBalanceUpdate(ctx, { invoiceId: invoice._id, amountPaid: paidKobo });
  // A patient a partner or referring doctor sent us earns them a commission here too (e.g. a
  // referral routed to a clinic, paid on the clinic's invoice). Charged on the service, not fees.
  await recordInvoicePartnerCommission(ctx, {
    invoice,
    paidKobo: invoice.subtotalAmount > 0 ? Math.min(paidKobo, invoice.subtotalAmount) : paidKobo,
    paymentReference: args.paystackReference,
    verified: true,
  });

  if (invoice.physiotherapistId) {
    await ctx.db.insert("notifications", {
      userId: invoice.physiotherapistId,
      type: "payment_received",
      priority: "high",
      status: "pending",
      payload: {
        title: "Payment Received",
        body: `Invoice #${invoice.invoiceNumber} has been paid (₦${(paidKobo / 100).toLocaleString()})`,
        data: {
          entityId: invoice._id,
          entityType: "invoice",
          actionUrl: invoice.clinicId ? `/dashboard/clinic/billing` : `/dashboard/physiotherapist/billing`,
          invoiceNumber: invoice.invoiceNumber,
          amount: paidKobo,
        },
      },
      createdAt: now,
    });
  }

  await ctx.db.insert("notifications", {
    userId: invoice.patientId,
    type: "payment_confirmed",
    priority: "medium",
    status: "pending",
    payload: {
      title: "Payment Confirmed",
      body: `Your payment for invoice #${invoice.invoiceNumber} has been confirmed`,
      data: {
        entityId: invoice._id,
        entityType: "invoice",
        actionUrl: `/dashboard/patient/invoices/${invoice._id}`,
        invoiceNumber: invoice.invoiceNumber,
      },
    },
    createdAt: now,
  });

  // Email the patient a receipt (the printable one is on their invoice page). This runs once:
  // the payment is now "completed", so retries and repeat verifications return early above.
  const patient = await ctx.db.get(invoice.patientId);
  if (patient?.email) {
    const provider = invoice.clinicId ? await ctx.db.get(invoice.clinicId) : null;
    const physio = invoice.physiotherapistId ? await ctx.db.get(invoice.physiotherapistId) : null;
    const patientName = `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() || "Patient";
    await ctx.scheduler.runAfter(0, internal.actions.emails.sendPaymentReceiptEmail.sendPaymentReceiptEmail as any, {
      to: patient.email,
      recipientName: patientName,
      patientName,
      physiotherapistName:
        (provider as Doc<"clinics"> | null)?.name ??
        (`${physio?.firstName ?? ""} ${physio?.lastName ?? ""}`.trim() || "Rehabify"),
      amount: paidKobo,
      currency: "NGN",
      paymentReference: args.paystackReference,
      date: now,
      bookingId: invoice.invoiceNumber,
      patientEmail: patient.email,
      patientPhone: patient.phoneNumber,
      role: "patient",
      subjectOverride: `Payment receipt: invoice #${invoice.invoiceNumber}`,
    });
  }

  return { success: true, message: "Payment status updated", paymentId: payment._id, invoiceId: payment.invoiceId };
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
    } else if (user.role === "admin" && !args.userId) {
      // Platform-wide history is for admins only
      payments = await ctx.db.query("payments")
        .order("desc")
        .take(args.limit || 50);
    } else {
      // Everyone else (and an admin looking at one user) sees that user's own payments
      payments = await ctx.db.query("payments")
        .withIndex("by_user_id", (q: any) => q.eq("userId", targetUserId))
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
