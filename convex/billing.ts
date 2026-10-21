import { query, mutation, internalMutation, internalQuery, QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { publicAppUrl } from "./helpers/appUrl";
import { closeInvoicePaymentLinks } from "./helpers/paymentLinks";
import { getAuthenticatedUser } from "./auth";
import { isServerCaller } from "./helpers/serverSecret";
import { insertClinicInvoice } from "./clinicTools";

/**
 * True when the signed-in caller is a party to the invoice: its patient, its
 * physiotherapist, a physiotherapist of its clinic (they see clinic invoices on their
 * billing page), the clinic owner, or an admin. Signed-out callers are never parties.
 */
async function isInvoiceParty(ctx: QueryCtx | MutationCtx, invoice: Doc<"invoices">): Promise<boolean> {
  const viewer = await getAuthenticatedUser(ctx).catch(() => null);
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  if (viewer._id === invoice.patientId || viewer._id === invoice.physiotherapistId) return true;
  if (!invoice.clinicId) return false;
  const clinic = await ctx.db.get(invoice.clinicId);
  if (clinic && clinic.ownerId === viewer._id) return true;
  if (viewer.role === "physiotherapist") {
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", viewer._id))
      .first();
    return profile?.clinicId === invoice.clinicId;
  }
  return false;
}

// Billing Flow according to PRD:
// 1. PT completes session → can create invoice
// 2. Invoice sent to patient → 'sent'
// 3. Patient views invoice → status remains 'sent'
// 4. Patient pays → 'paid'
// 5. Automated reminders for unpaid invoices

/**
 * Create an invoice for a patient session
 * Following PRD: Generate, send, track payments
 */
export const createInvoice = mutation({
  args: {
    patientId: v.id("users"),
    appointmentIds: v.array(v.id("appointments")),
    items: v.array(v.object({
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      totalPrice: v.number(),
    })),
    discountAmount: v.optional(v.number()),
    notes: v.optional(v.string()),
    dueDate: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
    invoiceId: v.optional(v.id("invoices")),
    invoiceNumber: v.optional(v.string()),
    message: v.string(),
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
      throw new ConvexError("Only physiotherapists can create invoices");
    }

    // Get physiotherapist profile to find clinic
    const physiotherapistProfile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", physiotherapist._id))
      .first();

    if (!physiotherapistProfile) {
      throw new ConvexError("Physiotherapist profile not found");
    }

    // Determine if physiotherapist is independent or clinic-based
    // A physiotherapist is clinic-based ONLY if they accepted a clinic invitation
    const isIndependentPractice = !physiotherapistProfile.clinicId;
    const clinicId = physiotherapistProfile.clinicId; // undefined for independent physiotherapists

    // Verify patient relationship exists
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q: any) =>
        q.eq("patientId", args.patientId).eq("physiotherapistId", physiotherapist._id)
      )
      .filter((q: any) => q.eq(q.field("status"), "active"))
      .first();

    if (!relationship) {
      throw new ConvexError("No active relationship with this patient");
    }

    // A due date the page couldn't read (e.g. left blank) would break every invoice list
    if (!Number.isFinite(args.dueDate) || args.dueDate < Date.now() - 24 * 60 * 60 * 1000) {
      throw new ConvexError("Pick a due date from today onwards.");
    }
    if (args.items.length === 0 || args.items.some((item) => !item.description.trim() || !(item.totalPrice > 0))) {
      throw new ConvexError("Each item needs a description and an amount.");
    }
    // A payment request can be for specific visits: they must be this patient's visits with you
    for (const appointmentId of args.appointmentIds) {
      const appointment = await ctx.db.get(appointmentId);
      if (!appointment || appointment.patientId !== args.patientId || appointment.physiotherapistId !== physiotherapist._id) {
        throw new ConvexError("That visit isn't one of this patient's visits with you.");
      }
    }

    // Clinic clinicians bill for their clinic: the clinic's fee split, and its payout account
    if (clinicId && (!relationship.clinicId || relationship.clinicId === clinicId)) {
      const clinic = await ctx.db.get(clinicId);
      if (clinic) {
        const created = await insertClinicInvoice(ctx, clinic, {
          patientId: args.patientId,
          items: args.items.map((item) => ({
            description: item.description.trim(),
            quantity: item.quantity,
            unitPrice: Math.round(item.unitPrice * 100),
            totalPrice: Math.round(item.totalPrice * 100),
          })),
          notes: args.notes,
          dueDate: args.dueDate,
          appointmentIds: args.appointmentIds,
        });
        return {
          success: true,
          invoiceId: created.invoiceId,
          invoiceNumber: created.invoiceNumber,
          message: `Payment request sent for ${clinic.name}`,
        };
      }
    }

    // Calculate totals - ALL amounts should be in Naira from the UI
    // Convert ALL amounts to kobo (multiply by 100)
    const convertedItems = args.items.map(item => {
      // Always convert from Naira to kobo
      const unitPriceInKobo = Math.round(item.unitPrice * 100);
      const totalPriceInKobo = Math.round(item.totalPrice * 100);
      
      return {
        ...item,
        unitPrice: unitPriceInKobo,
        totalPrice: totalPriceInKobo,
      };
    });

    // Calculate totals in kobo
    const subtotalAmount = convertedItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const discountAmount = Math.round((args.discountAmount || 0) * 100); // Convert from Naira to kobo
    
    // Fee calculations:
    // Platform fee: ₦1,000 flat fee
    const platformFeeAmount = 100000; // ₦1,000 in kobo
    
    // Calculate base amount after discount (this is the physiotherapist-set amount)
    const baseAmount = subtotalAmount - discountAmount;
    
    // Paystack fees: 1.5% + ₦100 (applied to base + platform fee)
    const paystackPercentageFee = Math.round((baseAmount + platformFeeAmount) * 0.015); // 1.5%
    const paystackFlatFee = 10000; // ₦100 in kobo
    const paystackFeeAmount = paystackPercentageFee + paystackFlatFee;
    
    // Patient payable total (for checkout) = base + platform fee + paystack fee
    const totalPayableAmount = baseAmount + platformFeeAmount + paystackFeeAmount;
    
    // The invoice totalAmount should reflect the physiotherapist-entered amount only (base)
    const totalAmount = baseAmount;
    
    // Calculate shares
    const physiotherapistShare = baseAmount; // They get the base amount after discount
    const platformShare = platformFeeAmount; // Platform gets fixed ₦1,000

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(ctx, clinicId);

    // Validate clinic ID exists
    console.log("Invoice creation details:", {
      userId: physiotherapist._id,
      clinicId: clinicId,
      isIndependentPractice: isIndependentPractice,
      hasClinicId: !!clinicId
    });

    // Create invoice object with all required fields and fee breakdown
    const invoiceData = {
      invoiceNumber,
      patientId: args.patientId,
      clinicId: clinicId, // Can be undefined for independent physiotherapists
      physiotherapistId: physiotherapist._id,
      issueDate: Date.now(),
      dueDate: args.dueDate,
      items: convertedItems, // Use converted items with proper kobo amounts
      subtotalAmount,
      discountAmount,
      platformFeeAmount,
      paystackFeeAmount,
      totalAmount,
      physiotherapistShare,
      platformShare,
      currency: "NGN",
      status: "sent" as const,
      notes: args.notes || "",
      relatedAppointmentIds: args.appointmentIds || [],
      // Fee breakdown for transparency
      feeBreakdown: {
        subtotal: subtotalAmount,
        discount: discountAmount,
        platformFee: platformFeeAmount,
        paystackPercentage: paystackPercentageFee,
        paystackFlat: paystackFlatFee,
        total: totalPayableAmount,
        physiotherapistEarnings: physiotherapistShare,
      },
    };

    console.log("Creating invoice with data:", JSON.stringify(invoiceData, null, 2));
    console.log("Invoice data validation check:", {
      hasClinicId: !!invoiceData.clinicId,
      hasPlatformFee: !!invoiceData.platformFeeAmount,
      platformFeeValue: invoiceData.platformFeeAmount,
      totalAmount: invoiceData.totalAmount,
      practiceType: isIndependentPractice ? "Independent" : "Clinic-based"
    });

    // Insert invoice into database
    const invoiceId = await ctx.db.insert("invoices", invoiceData);

    // Get patient and clinic details for notification
    const patient = await ctx.db.get(args.patientId);
    const clinic = clinicId ? await ctx.db.get(clinicId) : null;
    
        // Create enhanced notification for patient
    const practitionerName = clinic?.name || `${physiotherapist.firstName} ${physiotherapist.lastName}`;
    
    await ctx.db.insert("notifications", {
      userId: args.patientId,
      type: "invoice_created" as any,
      priority: "high",
      status: "pending",
      payload: {
        title: "New Invoice Received",
        body: `${practitionerName} has sent you an invoice #${invoiceNumber} for ₦${(totalAmount / 100).toLocaleString()}. Due date: ${new Date(args.dueDate).toLocaleDateString()}`,
        data: {
          entityId: invoiceId,
          entityType: "invoice",
          actionUrl: `/dashboard/patient/invoices/${invoiceId}`,
          invoiceNumber,
          totalAmount,
          dueDate: args.dueDate,
          clinicName: practitionerName,
        },
      },
      createdAt: Date.now(),
    });

    // Create notification for physiotherapist
    await ctx.db.insert("notifications", {
      userId: physiotherapist._id,
      type: "invoice_sent" as any,
      priority: "medium",
      status: "pending",
      payload: {
        title: "Invoice Sent Successfully",
        body: `Invoice #${invoiceNumber} for ₦${(totalAmount / 100).toLocaleString()} has been sent to ${patient?.firstName} ${patient?.lastName}`,
        data: {
          entityId: invoiceId,
          entityType: "invoice",
          actionUrl: `/dashboard/physiotherapist/billing`,
          invoiceNumber,
          patientName: `${patient?.firstName} ${patient?.lastName}`,
        },
      },
      createdAt: Date.now(),
    });

    return {
      success: true,
      invoiceId,
      invoiceNumber,
      message: "Invoice created and sent to patient successfully",
    };
  },
});

/**
 * Generate invoice PDF (returns a shareable URL for now)
 */
export const generateInvoicePDF = mutation({
  args: { invoiceId: v.id("invoices") },
  returns: v.object({
    success: v.boolean(),
    pdfUrl: v.optional(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || !(await isInvoiceParty(ctx, invoice))) {
      throw new ConvexError("Invoice not found");
    }
    // For now, reuse the share page (parties only) as a printable/downloadable view
    const baseUrl = publicAppUrl();
    const pdfUrl = `${baseUrl}/invoices/shared/${args.invoiceId}?download=pdf`;
    return { success: true, pdfUrl, message: "PDF generated successfully" };
  },
});

/**
 * Send an invoice to a patient (marks status as 'sent' and notifies)
 */
export const sendInvoice = mutation({
  args: { invoiceId: v.id("invoices") },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);

    const invoice = await ctx.db.get(args.invoiceId);
    // Only the physio who issued it can (re)send an invoice
    if (!invoice || invoice.physiotherapistId !== caller._id) throw new ConvexError("Invoice not found");

    if (invoice.status === "paid") {
      return { success: false, message: "Invoice already paid" };
    }
    // A cancelled invoice stays cancelled; issue a new one instead
    if (invoice.status === "void") {
      return { success: false, message: "This invoice was cancelled. Create a new one instead." };
    }

    // Mark as sent
    await ctx.db.patch(args.invoiceId, {
      status: "sent",
      issueDate: (invoice as any).issueDate || Date.now(),
    });

    // Notify patient
    await ctx.db.insert("notifications", {
      userId: invoice.patientId,
      type: "invoice_sent" as any,
      priority: "medium",
      status: "pending",
      payload: {
        title: "Invoice Sent",
        body: `Invoice #${invoice.invoiceNumber} for ₦${(invoice.totalAmount / 100).toLocaleString()} has been sent`,
        data: { entityId: args.invoiceId, entityType: "invoice" },
      },
      createdAt: Date.now(),
    });

    return { success: true, message: "Invoice sent successfully" };
  },
});

/**
 * Send payment reminders for one or more invoices
 */
export const sendPaymentReminders = mutation({
  args: { invoiceIds: v.array(v.id("invoices")) },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    count: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    let count = 0;
    for (const id of args.invoiceIds) {
      const invoice = await ctx.db.get(id);
      if (!invoice || invoice.status === "paid") continue;

      await ctx.db.insert("notifications", {
        userId: invoice.patientId,
        type: "payment_reminder" as any,
        priority: "medium",
        status: "pending",
        payload: {
          title: "Payment Reminder",
          body: `Reminder: Invoice #${invoice.invoiceNumber} of ₦${(invoice.totalAmount / 100).toLocaleString()} is due on ${new Date(invoice.dueDate).toLocaleDateString()}`,
          data: { entityId: id, entityType: "invoice" },
        },
        createdAt: Date.now(),
      });
      count++;
    }

    return { success: true, message: `Sent ${count} reminder(s)`, count };
  },
});

/**
 * Get invoice details for patient view
 */
const patientPaymentFields = {
  /** What checkout charges, in kobo (the invoice amount plus any fees the patient pays) */
  payableAmount: v.number(),
  patientFees: v.array(v.object({ label: v.string(), amount: v.number() })),
  lastPaymentStatus: v.optional(v.string()),
  lastPaymentAt: v.optional(v.number()),
  paymentReference: v.optional(v.string()),
};

/**
 * What the patient sees about paying an invoice: the amount checkout will charge (feeBreakdown.total,
 * which payments.ts checks every payment against), the fees inside it, and the latest attempt.
 */
async function patientPaymentView(ctx: QueryCtx, invoice: Doc<"invoices">) {
  const payableAmount = invoice.feeBreakdown?.total ?? invoice.totalAmount;
  const extra = Math.max(0, payableAmount - invoice.totalAmount);
  const serviceFee = Math.min(extra, invoice.feeBreakdown?.platformFee ?? 0);
  const patientFees = [
    ...(serviceFee > 0 ? [{ label: "Rehabify service fee", amount: serviceFee }] : []),
    ...(extra - serviceFee > 0 ? [{ label: "Payment processing", amount: extra - serviceFee }] : []),
  ];
  const lastAttempt = await ctx.db
    .query("payments")
    .withIndex("by_invoice_id", (q: any) => q.eq("invoiceId", invoice._id))
    .order("desc")
    .first();
  return {
    payableAmount,
    patientFees,
    lastPaymentStatus: lastAttempt?.status,
    lastPaymentAt: lastAttempt?.updatedAt,
    paymentReference: invoice.status === "paid" ? invoice.paymentReference : undefined,
  };
}

export const getInvoiceForPatient = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.union(
    v.null(),
    v.object({
      ...patientPaymentFields,
      _id: v.id("invoices"),
      invoiceNumber: v.string(),
      clinicName: v.optional(v.string()),
      items: v.array(v.object({
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
        totalPrice: v.number(),
      })),
      subtotalAmount: v.number(),
      discountAmount: v.optional(v.number()),
      platformFeeAmount: v.number(),
      totalAmount: v.number(),
      status: v.string(),
      issueDate: v.number(),
      dueDate: v.number(),
      notes: v.optional(v.string()),
      isOverdue: v.boolean(),
      canPay: v.boolean(),
      currency: v.string(),
      paymentMethod: v.optional(v.string()),
      paymentDate: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if user has access to this invoice
    let hasAccess = false;
    if (user.role === "patient") {
      hasAccess = user._id === invoice.patientId;
    } else if (user.role === "physiotherapist") {
      // Check if physiotherapist has relationship with patient
      const relationship = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient_and_physiotherapist", (q: any) =>
          q.eq("patientId", invoice.patientId).eq("physiotherapistId", user._id)
        )
        .first();
      hasAccess = !!relationship;
    }

    if (!hasAccess) {
      throw new ConvexError("Access denied");
    }

    // Get clinic details
    let clinicName: string | undefined;
    if (invoice.clinicId) {
      const clinic = invoice.clinicId ? await ctx.db.get(invoice.clinicId as Id<"clinics">) : null;
      clinicName = clinic?.name;
    }

    const isOverdue = Date.now() > invoice.dueDate && invoice.status !== "paid" && invoice.status !== "void";
    const canPay = invoice.status !== "paid" && invoice.status !== "void";

    return {
      ...(await patientPaymentView(ctx, invoice)),
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      clinicName,
      items: invoice.items,
      subtotalAmount: invoice.subtotalAmount,
      discountAmount: invoice.discountAmount,
      platformFeeAmount: invoice.platformFeeAmount || 100000, // Default 1000 naira in kobo
      totalAmount: invoice.totalAmount,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      notes: invoice.notes,
      isOverdue,
      canPay,
      currency: invoice.currency,
      paymentMethod: invoice.paymentMethod,
      paymentDate: invoice.paymentDate,
    };
  },
});

/**
 * Process payment for an invoice
 */
/**
 * Who may mark an invoice paid without a card payment (cash, transfer): an admin, the
 * physiotherapist who issued it, or the owner/team of the clinic it belongs to.
 */
async function assertCanRecordManualPayment(ctx: any, user: Doc<"users">, invoice: Doc<"invoices">) {
  if (invoice.status === "void") {
    throw new ConvexError("This invoice was voided and can't be paid.");
  }
  if (user.role === "admin") return;
  if (invoice.physiotherapistId && invoice.physiotherapistId === user._id) return;
  if (invoice.clinicId) {
    const clinic = await ctx.db.get(invoice.clinicId);
    if (clinic && clinic.ownerId === user._id) return;
    if (
      user.clinicId === invoice.clinicId &&
      (user.role === "physiotherapist" || user.role === "clinic_staff")
    ) {
      return;
    }
  }
  throw new ConvexError("Only the clinic or physiotherapist who issued this invoice can record a payment.");
}

export const processPayment = mutation({
  args: {
    invoiceId: v.id("invoices"),
    paymentMethod: v.string(),
    paymentReference: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }

    if (invoice.status === "paid") {
      return {
        success: false,
        message: "This invoice has already been paid",
      };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Recording a payment by hand is for staff only. Patients pay through Paystack, which
    // verifies the money arrived before the invoice is marked paid.
    await assertCanRecordManualPayment(ctx, user, invoice);

    // Update invoice with payment details
    await ctx.db.patch(args.invoiceId, {
      status: "paid",
      paymentMethod: args.paymentMethod,
      paymentDate: Date.now(),
    });
    // Recorded by hand: the online payment link must not collect a second time
    await closeInvoicePaymentLinks(ctx, args.invoiceId);

    // Create payment confirmation notification
    await ctx.db.insert("notifications", {
      userId: invoice.patientId,
      type: "payment_confirmed" as any,
      priority: "medium",
      status: "pending",
      payload: {
        title: "Payment Confirmed",
        body: `Payment for invoice ${invoice.invoiceNumber} has been processed successfully`,
        data: {
          actionUrl: `/invoices/${args.invoiceId}`,
        },
      },
      createdAt: Date.now(),
    });

    return {
      success: true,
      message: "Payment processed successfully",
    };
  },
});

/**
 * Get invoices for a physiotherapist
 */
/** Invoices a physiotherapist can see: their clinic's, or their own when independent. */
async function myInvoiceScope(ctx: any, physiotherapistId: Id<"users">, clinicId?: Id<"clinics">): Promise<Doc<"invoices">[]> {
  if (clinicId) {
    return await ctx.db
      .query("invoices")
      .withIndex("by_clinic_id", (q: any) => q.eq("clinicId", clinicId))
      .collect();
  }
  return await ctx.db
    .query("invoices")
    .withIndex("by_physiotherapist_id", (q: any) => q.eq("physiotherapistId", physiotherapistId))
    .collect();
}

export const getMyInvoices = query({
  args: {
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("paid"),
      v.literal("overdue"),
      v.literal("void")
    )),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    _id: v.id("invoices"),
    invoiceNumber: v.string(),
    patientId: v.id("users"),
    patientName: v.string(),
    patientEmail: v.optional(v.string()),
    patientPhone: v.optional(v.string()),
    totalAmount: v.number(),
    currency: v.string(),
    status: v.string(),
    issueDate: v.number(),
    dueDate: v.number(),
    paymentDate: v.optional(v.number()),
    isOverdue: v.boolean(),
    /** The latest checkout attempt, so a failed or pending payment shows here as it does to the patient */
    lastPaymentStatus: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const physiotherapist = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!physiotherapist || physiotherapist.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can view invoices");
    }

    // Get physiotherapist's clinic
    const physiotherapistProfile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", physiotherapist._id))
      .unique();

    // Clinic physios see their clinic's invoices; independent physios own theirs directly
    // (they have no clinicId, so a clinic-only lookup returned nothing for them)
    const scoped = await myInvoiceScope(ctx, physiotherapist._id, physiotherapistProfile?.clinicId);
    const now = Date.now();
    const invoices = scoped
      .filter((invoice) => {
        if (!args.status) return true;
        if (args.status === "overdue") return invoice.status !== "paid" && invoice.dueDate < now;
        return invoice.status === args.status;
      })
      .sort((a, b) => b.issueDate - a.issueDate)
      .slice(0, args.limit || 50);

    const invoicesWithDetails = await Promise.all(
      invoices.map(async (invoice) => {
        const patientUser = await ctx.db.get(invoice.patientId);

        const isOverdue = Date.now() > invoice.dueDate && invoice.status !== "paid" && invoice.status !== "void";
        const lastAttempt = await ctx.db
          .query("payments")
          .withIndex("by_invoice_id", (q: any) => q.eq("invoiceId", invoice._id))
          .order("desc")
          .first();

        return {
          _id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          patientId: invoice.patientId,
          patientName: `${patientUser?.firstName || "Unknown"} ${patientUser?.lastName || "Patient"}`,
          patientEmail: patientUser?.email,
          patientPhone: patientUser?.phoneNumber,
          totalAmount: invoice.totalAmount,
          currency: invoice.currency || "NGN",
          status: invoice.status,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          paymentDate: invoice.paymentDate,
          isOverdue,
          lastPaymentStatus: lastAttempt?.status,
        };
      })
    );

    return invoicesWithDetails;
  },
});

/**
 * Get invoices for the authenticated patient
 */
export const getPatientInvoices = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({
    ...patientPaymentFields,
    _id: v.id("invoices"),
    invoiceNumber: v.string(),
    clinicName: v.optional(v.string()),
    items: v.array(v.object({
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      totalPrice: v.number(),
    })),
    subtotalAmount: v.number(),
    discountAmount: v.optional(v.number()),
    platformFeeAmount: v.number(),
    totalAmount: v.number(),
    status: v.string(),
    issueDate: v.number(),
    dueDate: v.number(),
    paymentDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    currency: v.string(),
    isOverdue: v.boolean(),
    canPay: v.boolean(),
  })),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || user.role !== "patient") throw new Error("Only patients can view their invoices");

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_patient_id", (q: any) => q.eq("patientId", user._id))
      .order("desc")
      .collect();

    const mapped = await Promise.all(invoices.map(async (inv) => {
      let clinicName: string | undefined;
      if (inv.clinicId) {
        const clinic = await ctx.db.get(inv.clinicId as Id<"clinics">);
        clinicName = clinic?.name;
      }
      const isOverdue = Date.now() > inv.dueDate && inv.status !== "paid" && inv.status !== "void";
      const canPay = inv.status !== "paid" && inv.status !== "void";
      return {
        ...(await patientPaymentView(ctx, inv)),
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        clinicName,
        items: inv.items || [],
        subtotalAmount: inv.subtotalAmount,
        discountAmount: inv.discountAmount,
        platformFeeAmount: inv.platformFeeAmount || 100000,
        totalAmount: inv.totalAmount,
        status: inv.status,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        paymentDate: inv.paymentDate,
        notes: inv.notes,
        currency: inv.currency,
        isOverdue,
        canPay,
      };
    }));

    return mapped.slice(0, args.limit || 50);
  },
});

const invoicePaymentView = v.union(
  v.null(),
  v.object({
    _id: v.id("invoices"),
    invoiceNumber: v.string(),
    totalAmount: v.number(),
    status: v.string(),
    patientId: v.id("users"),
    physiotherapistId: v.optional(v.id("users")),
    patientEmail: v.optional(v.string()),
    platformFeeAmount: v.optional(v.number()),
    paystackFeeAmount: v.optional(v.number()),
    feeBreakdown: v.optional(v.object({
      subtotal: v.number(),
      discount: v.number(),
      platformFee: v.number(),
      paystackPercentage: v.number(),
      paystackFlat: v.number(),
      total: v.number(),
      physiotherapistEarnings: v.number(),
    })),
  })
);

async function loadInvoicePaymentView(ctx: QueryCtx, invoice: Doc<"invoices">) {
  const patient = await ctx.db.get(invoice.patientId);
  return {
    _id: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    totalAmount: invoice.totalAmount,
    status: invoice.status,
    patientId: invoice.patientId,
    physiotherapistId: (invoice as any).physiotherapistId,
    patientEmail: patient?.email,
    platformFeeAmount: (invoice as any).platformFeeAmount,
    paystackFeeAmount: (invoice as any).paystackFeeAmount,
    feeBreakdown: (invoice as any).feeBreakdown,
  };
}

/**
 * Lightweight fetch of an invoice by ID for payment initialization.
 * Our server (CONVEX_SERVER_SECRET) or a signed-in party to the invoice; otherwise null.
 * /api/payments/initiate calls this as the signed-in patient.
 */
export const getInvoiceById = query({
  args: { invoiceId: v.id("invoices"), serverSecret: v.optional(v.string()) },
  returns: invoicePaymentView,
  handler: async (ctx, args) => {
    const fromServer = isServerCaller(args.serverSecret);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    if (!fromServer && !(await isInvoiceParty(ctx, invoice))) return null;
    return await loadInvoicePaymentView(ctx, invoice);
  },
});

/** Same data as getInvoiceById, for Convex actions (convex/payments.ts). */
export const getInvoiceByIdInternal = internalQuery({
  args: { invoiceId: v.id("invoices") },
  returns: invoicePaymentView,
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    return await loadInvoicePaymentView(ctx, invoice);
  },
});

type EarningsInvoice = { invoiceNumber?: string; payoutRoute?: string; physiotherapistShare?: number; totalAmount: number; paidAmount?: number };

/** Rehabify marketplace invoices carry the patient's full charge; the physio earns physiotherapistShare. */
function isMarketplaceInvoice(invoice: EarningsInvoice): boolean {
  return Boolean(invoice.invoiceNumber?.startsWith("INV-MKT-")) || invoice.payoutRoute === "held_by_platform";
}

/** What the physio earned from a paid invoice, in kobo. */
export function physioPaidKobo(invoice: EarningsInvoice): number {
  const received = invoice.paidAmount || invoice.totalAmount;
  return isMarketplaceInvoice(invoice) ? invoice.physiotherapistShare ?? received : received;
}

/** What the physio is still owed on an unpaid invoice, in kobo. */
export function physioOutstandingKobo(invoice: EarningsInvoice): number {
  const outstanding = invoice.totalAmount - (invoice.paidAmount || 0);
  return isMarketplaceInvoice(invoice) ? invoice.physiotherapistShare ?? outstanding : outstanding;
}

/**
 * Get billing statistics for physiotherapist dashboard
 */
export const getBillingStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || user.role !== "physiotherapist") throw new Error("Access denied");

    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", user._id))
      .unique();
    const allInvoices = await myInvoiceScope(ctx, user._id, profile?.clinicId);

    const now = Date.now();
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    const totalRevenue = allInvoices.filter(i => i.status === "paid")
      .reduce((sum, i) => sum + physioPaidKobo(i), 0);
    const pendingPayments = allInvoices
      .filter(i => i.status === "sent" || i.status === "partial_payment")
      .reduce((sum, i) => sum + physioOutstandingKobo(i), 0);
    const overdueInvoices = allInvoices
      .filter(i => i.status !== "paid" && i.dueDate < now).length;
    const paidInvoices = allInvoices.filter(i => i.status === "paid").length;
    const monthlyRevenue = allInvoices
      .filter(i => i.status === "paid" && i.paymentDate && i.paymentDate >= startOfMonth)
      .reduce((sum, i) => sum + physioPaidKobo(i), 0);

    return { totalRevenue, pendingPayments, overdueInvoices, paidInvoices, monthlyRevenue };
  },
});

/**
 * Invoice share page (/invoices/shared/[id]). Links carry only the invoice id, so the
 * viewer must be signed in and a party to the invoice (or an admin); otherwise null.
 */
export const getShareableInvoice = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("invoices"),
      invoiceNumber: v.string(),
      clinicName: v.optional(v.string()),
      patientEmail: v.optional(v.string()),
      patientPhone: v.optional(v.string()),
      clinicAddress: v.optional(v.string()),
      clinicPhone: v.optional(v.string()),
      patientName: v.string(),
      items: v.array(v.object({
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
        totalPrice: v.number(),
      })),
      subtotalAmount: v.number(),
      discountAmount: v.optional(v.number()),
      platformFeeAmount: v.number(),
      totalAmount: v.number(),
      status: v.string(),
      issueDate: v.number(),
      dueDate: v.number(),
      notes: v.optional(v.string()),
      isOverdue: v.boolean(),
      currency: v.string(),
      paymentMethod: v.optional(v.string()),
      paymentDate: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || !(await isInvoiceParty(ctx, invoice))) {
      return null;
    }

    // Get clinic and patient details for the share page
    const clinic = invoice.clinicId ? await ctx.db.get(invoice.clinicId as Id<"clinics">) : null;
    const patient = await ctx.db.get(invoice.patientId);
    
    const isOverdue = Date.now() > invoice.dueDate && invoice.status !== "paid";
    
    return {
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      clinicName: clinic?.name,
      clinicAddress: clinic?.address,
      clinicPhone: clinic?.contactPhone,
      patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Patient',
      patientEmail: patient?.email,
      patientPhone: patient?.phoneNumber,
      items: invoice.items,
      subtotalAmount: invoice.subtotalAmount,
      discountAmount: invoice.discountAmount,
      platformFeeAmount: invoice.platformFeeAmount || 100000, // Default 1000 naira in kobo
      totalAmount: invoice.totalAmount,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      notes: invoice.notes,
      isOverdue,
      currency: invoice.currency,
      paymentMethod: invoice.paymentMethod,
      paymentDate: invoice.paymentDate,
    };
  },
});

/**
 * Enhanced payment processing with notifications
 */
export const processPatientPayment = mutation({
  args: {
    invoiceId: v.id("invoices"),
    paymentMethod: v.string(),
    paymentReference: v.string(),
    paymentAmount: v.optional(v.number()), // For partial payments
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }

    if (invoice.status === "paid") {
      throw new Error("This invoice has already been paid");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Recording a payment by hand is for staff only. Patients pay through Paystack, which
    // verifies the money arrived before the invoice is marked paid.
    await assertCanRecordManualPayment(ctx, user, invoice);

    const paymentAmount = args.paymentAmount || invoice.totalAmount;
    const isFullPayment = paymentAmount >= invoice.totalAmount;
    
    // Update invoice with payment details
    const updates: any = {
      paymentMethod: args.paymentMethod,
      paymentDate: Date.now(),
      paidAmount: (invoice.paidAmount || 0) + paymentAmount,
    };

    if (isFullPayment) {
      updates.status = "paid";
    } else {
      updates.status = "partial_payment";
    }

    await ctx.db.patch(args.invoiceId, updates);

    // Get clinic and patient details for notifications
    const patient = await ctx.db.get(invoice.patientId);
    const clinic = invoice.clinicId ? await ctx.db.get(invoice.clinicId as Id<"clinics">) : null;

    // Get physiotherapist details from clinic
    const physiotherapistProfile = invoice.clinicId
      ? await ctx.db
          .query("physiotherapistProfiles")
          .withIndex("by_clinic_id", (q) => q.eq("clinicId", invoice.clinicId as Id<"clinics">))
          .first()
      : null;

    // Create payment confirmation notification for patient
    await ctx.db.insert("notifications", {
      userId: invoice.patientId,
      type: "payment_confirmed" as any,
      priority: "medium",
      status: "pending",
      payload: {
        title: isFullPayment ? "Payment Confirmed" : "Partial Payment Received",
        body: `Your ${isFullPayment ? 'payment' : 'partial payment'} of ₦${(paymentAmount / 100).toLocaleString()} for invoice #${invoice.invoiceNumber} has been processed successfully`,
        data: {
          entityId: args.invoiceId,
          entityType: "invoice",
          actionUrl: `/dashboard/patient/invoices/${args.invoiceId}`,
          paymentAmount,
          isFullPayment,
        },
      },
      createdAt: Date.now(),
    });

    // Create notification for physiotherapist if found
    if (physiotherapistProfile) {
      await ctx.db.insert("notifications", {
        userId: physiotherapistProfile.userId,
        type: "payment_received" as any,
        priority: "medium",
        status: "pending",
        payload: {
          title: "Payment Received",
          body: `${patient?.firstName} ${patient?.lastName} paid ₦${(paymentAmount / 100).toLocaleString()} for invoice #${invoice.invoiceNumber}`,
          data: {
            entityId: args.invoiceId,
            entityType: "invoice",
            actionUrl: `/dashboard/physiotherapist/billing`,
            paymentAmount,
            patientName: `${patient?.firstName} ${patient?.lastName}`,
          },
        },
        createdAt: Date.now(),
      });
    }

    return {
      success: true,
      message: isFullPayment ? "Payment processed successfully" : "Partial payment recorded",
      isFullPayment,
      remainingAmount: isFullPayment ? 0 : invoice.totalAmount - (invoice.paidAmount || 0) - paymentAmount,
    };
  },
});

/**
 * Record a payment from the physiotherapist dashboard (full or partial)
 * Proxies to processPatientPayment to reuse validation and notifications.
 */
export const recordPayment = mutation({
  args: {
    invoiceId: v.id("invoices"),
    paymentAmount: v.number(),
    paymentMethod: v.string(),
    paymentReference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Authenticate and ensure physiotherapist role
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || user.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can record payments");
    }

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found");

    // Optionally ensure this invoice belongs to the physiotherapist or their clinic
    if (invoice.physiotherapistId && invoice.physiotherapistId !== user._id) {
      // If invoice tracked physiotherapistId, enforce match
      throw new Error("You do not have permission to modify this invoice");
    }

    const ref = args.paymentReference || `REC-${Date.now()}`;
    const alreadyPaid = invoice.paidAmount || 0;
    const remaining = Math.max(0, invoice.totalAmount - alreadyPaid);
    const amt = Math.max(0, Math.min(args.paymentAmount, remaining));
    const isFullPayment = amt >= remaining;

    // Update invoice
    const updates: any = {
      paymentMethod: args.paymentMethod,
      paymentReference: ref,
      paymentDate: Date.now(),
      paidAmount: alreadyPaid + amt,
      status: isFullPayment ? "paid" : "partial_payment",
    };
    await ctx.db.patch(args.invoiceId, updates);

    // Notifications
    const patient = await ctx.db.get(invoice.patientId);
    const physiotherapistProfile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q: any) => q.eq("userId", user._id))
      .unique();

    await ctx.db.insert("notifications", {
      userId: invoice.patientId,
      type: "payment_confirmed" as any,
      priority: "medium",
      status: "pending",
      payload: {
        title: isFullPayment ? "Payment Confirmed" : "Partial Payment Recorded",
        body: `Your ${isFullPayment ? 'payment' : 'partial payment'} of ₦${(amt / 100).toLocaleString()} for invoice #${invoice.invoiceNumber} has been recorded`,
        data: {
          entityId: args.invoiceId,
          entityType: "invoice",
          paymentAmount: amt,
          isFullPayment,
        },
      },
      createdAt: Date.now(),
    });

    if (physiotherapistProfile) {
      await ctx.db.insert("notifications", {
        userId: user._id,
        type: "payment_received" as any,
        priority: "medium",
        status: "pending",
        payload: {
          title: "Payment Recorded",
          body: `${patient?.firstName || 'Patient'} ${patient?.lastName || ''} paid ₦${(amt / 100).toLocaleString()} for invoice #${invoice.invoiceNumber}`,
          data: {
            entityId: args.invoiceId,
            entityType: "invoice",
            paymentAmount: amt,
          },
        },
        createdAt: Date.now(),
      });
    }

    return { success: true, paymentReference: ref, isFullPayment } as const;
  },
});

/**
 * Helper function to generate unique invoice number
 */
async function generateInvoiceNumber(ctx: any, clinicId?: string) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  
  // Get clinic prefix or use default
  let prefix = "RH";
  if (clinicId) {
    const clinic = await ctx.db.get(clinicId);
    if (clinic?.name) {
      prefix = clinic.name.substring(0, 2).toUpperCase();
    }
  }
  
  // Find the next sequential number for this month
  const startOfMonth = new Date(year, now.getMonth(), 1).getTime();
  const endOfMonth = new Date(year, now.getMonth() + 1, 0, 23, 59, 59).getTime();
  
  const existingInvoices = await ctx.db
    .query("invoices")
    .filter((q: any) => 
      q.and(
        q.gte(q.field("issueDate"), startOfMonth),
        q.lte(q.field("issueDate"), endOfMonth)
      )
    )
    .collect();
  
  const sequenceNumber = String(existingInvoices.length + 1).padStart(4, '0');
  
  return `${prefix}-${year}${month}-${sequenceNumber}`;
}

/**
 * Update invoice status after payment
 */
export const updateInvoiceStatus = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    status: v.union(v.literal("paid"), v.literal("failed"), v.literal("sent")),
    paymentReference: v.optional(v.string()),
    paidAmount: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const updateData: any = {
      status: args.status
    };

    if (args.paymentReference) {
      updateData.paymentReference = args.paymentReference;
    }

    if (args.status === "paid" && args.paidAmount) {
      updateData.paidAmount = args.paidAmount;
      updateData.paymentDate = Date.now();
    }

    await ctx.db.patch(args.invoiceId, updateData);

    return { success: true };
  }
});