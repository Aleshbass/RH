import { mutation, query, type MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { assertServerCaller } from "./helpers/serverSecret";
import { closeInvoicePaymentLinks } from "./helpers/paymentLinks";
import { recordInvoicePartnerCommission } from "./helpers/partnerLedger";
import {
    MEDILOAN_EVENT_STATUS,
    MEDILOAN_REPAYMENT_EVENTS,
    canMoveMediLoan,
    statusFromMyItura,
    type MediLoanStatus,
} from "./helpers/mediloanStatus";

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT-FACING: Submit a loan interest request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called when a patient fills the "Seek MediLoan" form on the booking page.
 * Creates a loanRequest record with status "pending" so that a Rehabify admin
 * can review it and initiate the actual MyItura SDK call.
 *
 * No SDK keys are used here — this is purely a Convex DB write + notification trigger.
 */
export const submitLoanRequest = mutation({
    args: {
        patientFirstName: v.string(),
        patientLastName: v.string(),
        patientPhone: v.string(),
        patientEmail: v.optional(v.string()),
        treatment: v.string(),
        treatmentAmount: v.number(),
        physiotherapistId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        // Optionally link to a signed-in patient user
        let patientUserId = undefined;
        const identity = await ctx.auth.getUserIdentity();
        if (identity) {
            const user = await ctx.db
                .query("users")
                .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
                .unique();
            if (user) patientUserId = user._id;
        }

        const cleanPhone = args.patientPhone.trim();
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

        // Rate limit / deduplication safeguard: if a pending request was submitted within 10 mins, return existing ID
        const existingRecent = await ctx.db
            .query("loanRequests")
            .filter((q) =>
                q.and(
                    q.eq(q.field("patientPhone"), cleanPhone),
                    q.eq(q.field("status"), "pending"),
                    q.gt(q.field("createdAt"), tenMinutesAgo)
                )
            )
            .first();

        if (existingRecent) {
            return existingRecent._id;
        }

        const requestId = await ctx.db.insert("loanRequests", {
            patientFirstName: args.patientFirstName,
            patientLastName: args.patientLastName,
            patientPhone: args.patientPhone,
            patientEmail: args.patientEmail,
            patientUserId,
            treatment: args.treatment,
            treatmentAmount: args.treatmentAmount,
            physiotherapistId: args.physiotherapistId,
            status: "pending",
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        return requestId;
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Query loan requests
// ─────────────────────────────────────────────────────────────────────────────

/** All loan requests (admin only) — ordered newest first */
export const getAllLoanRequests = query({
    args: {
        status: v.optional(v.union(
            v.literal("pending"),
            v.literal("initiated"),
            v.literal("cancelled"),
        )),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();
        if (!user || user.role !== "admin") throw new Error("Unauthorized");

        if (args.status) {
            return await ctx.db
                .query("loanRequests")
                .withIndex("by_status", (q) => q.eq("status", args.status!))
                .order("desc")
                .collect();
        }
        return await ctx.db.query("loanRequests").order("desc").collect();
    },
});

/** Cancel a loan request (admin only) */
export const cancelLoanRequest = mutation({
    args: {
        requestId: v.id("loanRequests"),
        adminNotes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();
        if (!user || user.role !== "admin") throw new Error("Unauthorized");

        await ctx.db.patch(args.requestId, {
            status: "cancelled",
            adminNotes: args.adminNotes,
            updatedAt: Date.now(),
        });
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// SERVER: What a physio (or admin) may finance for an invoice
// ─────────────────────────────────────────────────────────────────────────────

/** Loans that still count as live for an invoice (so a second one isn't started). */
const OPEN_LOAN_STATUSES = new Set(["initiated", "pending", "approved", "offer_accepted", "disbursed", "defaulted", "repaid"]);

/**
 * For /api/myitura/initiate: the invoice a loan would pay, with its patient, after checking
 * the caller may finance it. Physios only for their own unpaid invoices; admins for any.
 * The amount is what's still owed on the invoice; the caller can't choose it.
 */
export const getInvoiceForMediLoan = query({
    args: { invoiceId: v.id("invoices"), callerClerkId: v.string(), serverSecret: v.optional(v.string()) },
    handler: async (ctx, args) => {
        assertServerCaller(args.serverSecret);
        const caller = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.callerClerkId))
            .unique();
        if (!caller) throw new ConvexError("Your account wasn't found.");
        const invoice = await ctx.db.get(args.invoiceId);
        if (!invoice) throw new ConvexError("Invoice not found.");
        if (caller.role !== "admin" && invoice.physiotherapistId !== caller._id) {
            throw new ConvexError("You can only start MediLoan for your own invoices.");
        }
        if (invoice.status === "paid" || invoice.status === "void") {
            throw new ConvexError(invoice.status === "paid" ? "This invoice is already paid." : "This invoice was cancelled.");
        }
        const outstandingKobo = Math.round(invoice.totalAmount - (invoice.paidAmount ?? 0));
        if (outstandingKobo <= 0) throw new ConvexError("Nothing is owed on this invoice.");

        const existing = await ctx.db
            .query("loanApplications")
            .withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
            .collect();
        if (existing.some((loan) => OPEN_LOAN_STATUSES.has(loan.status))) {
            throw new ConvexError("A MediLoan has already been started for this invoice.");
        }

        const patient = await ctx.db.get(invoice.patientId);
        if (!patient) throw new ConvexError("The patient on this invoice wasn't found.");
        const phone = patient.phoneNumber?.trim();
        return {
            invoiceId: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            outstandingKobo,
            patient: {
                id: patient._id,
                firstName: patient.firstName ?? "",
                lastName: patient.lastName ?? "",
                email: patient.email && !patient.email.endsWith("@patients.physioaroundme.com") ? patient.email : undefined,
                phone: phone || undefined,
            },
        };
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// SERVER: Record a loan MyItura created (after /api/myitura/initiate checked the caller)
// ─────────────────────────────────────────────────────────────────────────────

export const logInitiatedLoan = mutation({
    args: {
        loanRequestId: v.optional(v.id("loanRequests")),
        invoiceId: v.optional(v.id("invoices")),
        patientId: v.optional(v.id("users")),
        initiatorClerkId: v.optional(v.string()),
        clientReference: v.string(),
        invoiceReference: v.optional(v.string()),
        myituraSdkRef: v.string(),
        treatment: v.string(),
        amount: v.number(),
        patientFirstName: v.string(),
        patientLastName: v.string(),
        patientPhone: v.string(),
        patientEmail: v.optional(v.string()),
        applicationUrl: v.string(),
        expiresAt: v.string(),
        serverSecret: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        assertServerCaller(args.serverSecret);
        const initiator = args.initiatorClerkId
            ? await ctx.db
                .query("users")
                .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.initiatorClerkId!))
                .unique()
            : null;

        const now = Date.now();
        const loanId = await ctx.db.insert("loanApplications", {
            loanRequestId: args.loanRequestId,
            invoiceId: args.invoiceId,
            patientId: args.patientId,
            initiatedBy: initiator ? initiator._id : undefined,
            clientReference: args.clientReference,
            invoiceReference: args.invoiceReference,
            myituraSdkRef: args.myituraSdkRef,
            treatment: args.treatment,
            amount: args.amount,
            patientFirstName: args.patientFirstName,
            patientLastName: args.patientLastName,
            patientPhone: args.patientPhone,
            patientEmail: args.patientEmail,
            applicationUrl: args.applicationUrl,
            status: "initiated" as const,
            expiresAt: args.expiresAt,
            createdAt: now,
            updatedAt: now,
        });

        if (args.loanRequestId) {
            await ctx.db.patch(args.loanRequestId, {
                status: "initiated",
                loanApplicationId: loanId,
                initiatedByAdminId: initiator ? initiator._id : undefined,
                initiatedAt: now,
                updatedAt: now,
            });
        }
        return loanId;
    },
});

/** For the admin refresh/cancel routes: the references needed to reach the loan at MyItura. */
export const getLoanForServer = query({
    args: { loanApplicationId: v.id("loanApplications"), serverSecret: v.optional(v.string()) },
    handler: async (ctx, args) => {
        assertServerCaller(args.serverSecret);
        const loan = await ctx.db.get(args.loanApplicationId);
        if (!loan) return null;
        return {
            _id: loan._id,
            status: loan.status,
            clientReference: loan.clientReference,
            myituraSdkRef: loan.myituraSdkRef ?? null,
            myituraLoanId: loan.myituraLoanId ?? null,
        };
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// SERVER: Apply a MyItura update (webhook, status refresh or cancel)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies a MediLoan update from a webhook (event) or a status lookup (myituraStatus).
 * Matches the loan by MyItura loan id, sdkReference or our clientReference. Statuses only move
 * forward (helpers/mediloanStatus.ts) and a delivery id is processed once. When the loan
 * disburses, the invoice it pays for is settled (see settleInvoiceFromLoan).
 */
export const applyMediLoanUpdate = mutation({
    args: {
        loanApplicationId: v.optional(v.id("loanApplications")),
        sdkReference: v.optional(v.string()),
        clientReference: v.optional(v.string()),
        myituraLoanId: v.optional(v.string()),
        event: v.optional(v.string()),
        myituraStatus: v.optional(v.string()),
        deliveryId: v.optional(v.string()),
        amountApprovedKobo: v.optional(v.number()),
        payload: v.optional(v.string()),
        serverSecret: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        assertServerCaller(args.serverSecret);
        const now = Date.now();

        if (args.deliveryId) {
            const seen = await ctx.db
                .query("mediloanWebhookDeliveries")
                .withIndex("by_delivery_id", (q) => q.eq("deliveryId", args.deliveryId!))
                .first();
            if (seen) return { result: "duplicate" as const };
        }

        let loan = args.loanApplicationId ? await ctx.db.get(args.loanApplicationId) : null;
        if (!loan && args.myituraLoanId) {
            loan = await ctx.db
                .query("loanApplications")
                .withIndex("by_myituraLoanId", (q) => q.eq("myituraLoanId", args.myituraLoanId))
                .first();
        }
        if (!loan && args.sdkReference) {
            loan = await ctx.db
                .query("loanApplications")
                .withIndex("by_myituraSdkRef", (q) => q.eq("myituraSdkRef", args.sdkReference))
                .first();
        }
        if (!loan && args.clientReference) {
            loan = await ctx.db
                .query("loanApplications")
                .withIndex("by_clientReference", (q) => q.eq("clientReference", args.clientReference!))
                .first();
        }

        if (args.deliveryId) {
            await ctx.db.insert("mediloanWebhookDeliveries", {
                deliveryId: args.deliveryId,
                event: args.event ?? args.myituraStatus ?? "",
                loanApplicationId: loan?._id,
                receivedAt: now,
            });
        }
        if (!loan) return { result: "loan_not_found" as const };

        const patch: Partial<Doc<"loanApplications">> = { updatedAt: now };
        if (args.myituraLoanId && !loan.myituraLoanId) patch.myituraLoanId = args.myituraLoanId;
        if (args.amountApprovedKobo !== undefined) patch.amountApproved = Math.round(args.amountApprovedKobo);
        if (args.payload) patch.lastWebhookPayload = args.payload.slice(0, 20_000);
        if (args.event) {
            patch.lastEvent = args.event;
            patch.lastEventAt = now;
        }

        const repayment = args.event ? MEDILOAN_REPAYMENT_EVENTS[args.event] : undefined;
        if (repayment) patch.repaymentStatus = repayment;

        const next = args.event ? MEDILOAN_EVENT_STATUS[args.event] : statusFromMyItura(args.myituraStatus);
        const current = loan.status as MediLoanStatus;
        const moves = Boolean(next && canMoveMediLoan(current, next));
        if (next && moves) {
            patch.status = next;
            if (next === "disbursed") patch.disbursedAt = now;
            if (next === "repaid") patch.repaymentStatus = "Fully repaid";
        }
        await ctx.db.patch(loan._id, patch);

        if (next === "disbursed" && moves) {
            const fresh = (await ctx.db.get(loan._id))!;
            await settleInvoiceFromLoan(ctx, fresh, fresh.amountApproved ?? fresh.amount);
        }

        return {
            result: moves ? ("updated" as const) : next ? ("unchanged" as const) : ("recorded" as const),
            status: moves && next ? next : current,
        };
    },
});

/**
 * MyItura paid Rehabify: the invoice the loan was for is paid ("MediLoan"), the money sits with
 * Rehabify (held_by_platform), and the provider's share is queued for payout. Invoices tied to
 * appointments get their payout when the appointment is completed, as for any other payment.
 * A referring partner or doctor earns their commission on it too.
 */
async function settleInvoiceFromLoan(ctx: MutationCtx, loan: Doc<"loanApplications">, disbursedKobo: number) {
    if (!loan.invoiceId) return;
    const invoice = await ctx.db.get(loan.invoiceId);
    if (!invoice || invoice.status === "paid") return;
    const now = Date.now();
    if (invoice.status === "void") {
        // Money arrived for a cancelled invoice: the team decides whether to refund or reassign it
        await ctx.db.insert("systemLogs", {
            type: "payment",
            timestamp: now,
            action: "mediloan_disbursed_for_void_invoice",
            targetEntityType: "invoice",
            targetEntityId: String(invoice._id),
            details: { loanApplicationId: loan._id, clientReference: loan.clientReference, invoiceNumber: invoice.invoiceNumber, disbursedKobo },
        });
        return;
    }

    const outstanding = Math.max(0, invoice.totalAmount - (invoice.paidAmount ?? 0));
    const received = Math.min(Math.max(0, Math.round(disbursedKobo)), outstanding);
    if (received <= 0) return;
    const fullyPaid = received >= outstanding;
    const reference = `MEDILOAN_${loan.myituraLoanId ?? loan.clientReference}`;

    await ctx.db.patch(invoice._id, {
        status: fullyPaid ? "paid" : "partial_payment",
        paidAmount: (invoice.paidAmount ?? 0) + received,
        paymentDate: now,
        paymentMethod: "mediloan",
        paymentReference: reference,
        payoutRoute: "held_by_platform",
    });
    await closeInvoicePaymentLinks(ctx, invoice._id);

    // The provider's share, for invoices not tied to appointments (those pay out on completion)
    if (fullyPaid && !(invoice.relatedAppointmentIds?.length)) {
        const existingPayout = await ctx.db
            .query("payouts")
            .withIndex("by_payout_invoice_id", (q) => q.eq("invoiceId", invoice._id))
            .first();
        const clinic = invoice.clinicId ? await ctx.db.get(invoice.clinicId) : null;
        const recipient = clinic?.ownerId ?? invoice.physiotherapistId;
        const share = invoice.feeBreakdown?.physiotherapistEarnings ?? invoice.physiotherapistShare ?? invoice.totalAmount - (invoice.platformFeeAmount ?? 0);
        if (!existingPayout && recipient && share > 0) {
            await ctx.db.insert("payouts", {
                invoiceId: invoice._id,
                amount: Math.round(share),
                status: "pending",
                type: clinic ? "clinic_earning" : "physiotherapist_earning",
                userId: recipient,
                createdAt: now,
                updatedAt: now,
            });
        }
    }

    await recordInvoicePartnerCommission(ctx, {
        invoice,
        paidKobo: invoice.subtotalAmount > 0 ? Math.min(received, invoice.subtotalAmount) : received,
        paymentReference: reference,
        verified: true,
    });

    const naira = `₦${Math.round(received / 100).toLocaleString("en-NG")}`;
    if (invoice.physiotherapistId) {
        await ctx.db.insert("notifications", {
            userId: invoice.physiotherapistId,
            type: "payment_received",
            priority: "high",
            status: "pending",
            payload: {
                title: "Paid by MediLoan",
                body: `Invoice #${invoice.invoiceNumber} was paid by the patient's MediLoan (${naira}).`,
                data: {
                    entityId: invoice._id,
                    entityType: "invoice",
                    actionUrl: invoice.clinicId ? "/dashboard/clinic/billing" : "/dashboard/physiotherapist/billing",
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
            title: "Your MediLoan paid your invoice",
            body: `MediLoan paid ${naira} towards invoice #${invoice.invoiceNumber}. You repay MyItura on the schedule you agreed.`,
            data: { entityId: invoice._id, entityType: "invoice", actionUrl: `/dashboard/patient/invoices/${invoice._id}` },
        },
        createdAt: now,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────────────────────

/** All loan applications (admin only) */
export const getAllLoans = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();
        if (!user || user.role !== "admin") throw new Error("Unauthorized");
        return await ctx.db.query("loanApplications").order("desc").collect();
    },
});

/** Loans initiated by the current physio/admin */
export const getMyInitiatedLoans = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();
        if (!user) throw new Error("User not found");
        return await ctx.db
            .query("loanApplications")
            .filter((q) => q.eq(q.field("initiatedBy"), user._id))
            .order("desc")
            .collect();
    },
});

/** Loans for the current patient */
export const getMyLoans = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();
        if (!user) throw new Error("User not found");
        return await ctx.db
            .query("loanApplications")
            .withIndex("by_patient", (q) => q.eq("patientId", user._id))
            .order("desc")
            .collect();
    },
});
