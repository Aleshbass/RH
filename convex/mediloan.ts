import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertServerCaller } from "./helpers/serverSecret";
import { completeMarketplaceBookingCore } from "./marketplace/booking";
import { getService } from "../lib/rehabify-services";
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
            v.literal("awaiting_invoice"),
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
// What a loan can pay for: an unpaid invoice or an unpaid marketplace booking
// ─────────────────────────────────────────────────────────────────────────────

/** Loans that still count as live for an invoice or booking (so a second one isn't started). */
const OPEN_LOAN_STATUSES = new Set(["initiated", "pending", "approved", "offer_accepted", "disbursed", "defaulted", "repaid"]);

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
const personName = (user: Doc<"users"> | null | undefined) =>
    user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Your physiotherapist" : "Your physiotherapist";

async function hasOpenLoan(ctx: QueryCtx, target: { invoiceId?: Id<"invoices">; bookingId?: Id<"marketplaceBookings"> }) {
    const loans = target.invoiceId
        ? await ctx.db.query("loanApplications").withIndex("by_invoice", (q) => q.eq("invoiceId", target.invoiceId)).collect()
        : target.bookingId
          ? await ctx.db.query("loanApplications").withIndex("by_booking", (q) => q.eq("bookingId", target.bookingId)).collect()
          : [];
    return loans.some((loan) => OPEN_LOAN_STATUSES.has(loan.status));
}

/** An invoice that can still be financed: not paid, not void, not a marketplace receipt. */
function financeableInvoice(invoice: Doc<"invoices">) {
    if (invoice.status === "paid" || invoice.status === "void" || invoice.status === "failed") return false;
    if (invoice.invoiceNumber.startsWith("INV-MKT-")) return false;
    return invoice.totalAmount - (invoice.paidAmount ?? 0) > 0;
}

/** A marketplace booking still waiting for its payment. */
function financeableBooking(booking: Doc<"marketplaceBookings">) {
    return booking.sourceSystem !== "joy_ai" && booking.bookingStatus === "pending_payment" && booking.paymentStatus === "pending" && booking.serviceAmount > 0;
}

function bookingLabel(booking: Doc<"marketplaceBookings">) {
    const service = booking.serviceId ? getService(booking.serviceId)?.name : undefined;
    return service ?? booking.sessionType ?? "Physiotherapy session";
}

/**
 * For /api/myitura/initiate: what the loan pays for, with its patient and amount, after
 * checking the caller may finance it.
 *  - Patients: their own unpaid invoice or booking.
 *  - Physiotherapists: their own unpaid invoices.
 *  - Admins: any.
 * The amount is what's still owed; nobody chooses it.
 */
export const getFinancingForServer = query({
    args: {
        invoiceId: v.optional(v.id("invoices")),
        bookingId: v.optional(v.id("marketplaceBookings")),
        callerClerkId: v.string(),
        serverSecret: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        assertServerCaller(args.serverSecret);
        const caller = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.callerClerkId))
            .unique();
        if (!caller) throw new ConvexError("Your account wasn't found.");
        const isAdmin = caller.role === "admin";

        let patientId: Id<"users">;
        let physiotherapistId: Id<"users"> | undefined;
        let outstandingKobo: number;
        let reference: string;
        let treatment: string;

        if (args.invoiceId) {
            const invoice = await ctx.db.get(args.invoiceId);
            if (!invoice) throw new ConvexError("Invoice not found.");
            const allowed = isAdmin || invoice.physiotherapistId === caller._id || invoice.patientId === caller._id;
            if (!allowed) throw new ConvexError("You can only use MediLoan for your own invoices.");
            if (!financeableInvoice(invoice)) {
                throw new ConvexError(invoice.status === "paid" ? "This invoice is already paid." : "This invoice can't be paid with MediLoan.");
            }
            if (await hasOpenLoan(ctx, { invoiceId: invoice._id })) throw new ConvexError("A MediLoan has already been started for this invoice.");
            patientId = invoice.patientId;
            physiotherapistId = invoice.physiotherapistId ?? undefined;
            outstandingKobo = Math.round(invoice.totalAmount - (invoice.paidAmount ?? 0));
            reference = invoice.invoiceNumber;
            treatment = `Physiotherapy (invoice ${invoice.invoiceNumber})`;
        } else if (args.bookingId) {
            const booking = await ctx.db.get(args.bookingId);
            if (!booking) throw new ConvexError("Booking not found.");
            if (!isAdmin && booking.patientId !== caller._id) throw new ConvexError("You can only use MediLoan for your own bookings.");
            if (!financeableBooking(booking)) throw new ConvexError("This booking is already paid or no longer open.");
            if (await hasOpenLoan(ctx, { bookingId: booking._id })) throw new ConvexError("A MediLoan has already been started for this booking.");
            patientId = booking.patientId;
            physiotherapistId = booking.physiotherapistId ?? undefined;
            outstandingKobo = Math.round(booking.serviceAmount);
            reference = `BOOKING-${String(booking._id).slice(-8).toUpperCase()}`;
            treatment = bookingLabel(booking);
        } else {
            throw new ConvexError("Choose an invoice or a booking to pay with MediLoan.");
        }

        const patient = await ctx.db.get(patientId);
        if (!patient) throw new ConvexError("The patient wasn't found.");
        return {
            kind: args.invoiceId ? ("invoice" as const) : ("booking" as const),
            invoiceId: args.invoiceId,
            bookingId: args.bookingId,
            reference,
            treatment,
            outstandingKobo,
            physiotherapistId,
            patient: {
                id: patient._id,
                firstName: patient.firstName ?? "",
                lastName: patient.lastName ?? "",
                email: patient.email && !patient.email.endsWith("@patients.physioaroundme.com") ? patient.email : undefined,
                phone: patient.phoneNumber?.trim() || undefined,
            },
        };
    },
});

/** The same phone written the ways people type Nigerian numbers. */
function phoneVariants(phone: string): string[] {
    const digits = phone.replace(/\D/g, "");
    const local = digits.startsWith("234") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
    if (local.length !== 10) return [phone.trim()];
    return [`0${local}`, `+234${local}`, `234${local}`, phone.trim()];
}

/** The patient a loan request belongs to: the signed-in account, or one with the same phone. */
async function requestPatients(ctx: QueryCtx, request: Doc<"loanRequests">): Promise<Doc<"users">[]> {
    if (request.patientUserId) {
        const user = await ctx.db.get(request.patientUserId);
        return user ? [user] : [];
    }
    const found = new Map<string, Doc<"users">>();
    for (const phone of new Set(phoneVariants(request.patientPhone))) {
        const users = await ctx.db
            .query("users")
            .withIndex("by_phone_number", (q) => q.eq("phoneNumber", phone))
            .take(5);
        for (const user of users) if (!user.role || user.role === "patient") found.set(user._id, user);
    }
    return [...found.values()];
}

async function assertAdmin(ctx: QueryCtx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Please sign in.");
    const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
    if (!user || user.role !== "admin") throw new ConvexError("Admins only.");
    return user;
}

/**
 * For the admin "Initiate loan" dialog: the patient's unpaid invoices and bookings a loan
 * from this request could pay for. Ones with the physio the patient asked about come first.
 */
export const getFinancingOptionsForRequest = query({
    args: { requestId: v.id("loanRequests") },
    handler: async (ctx, args) => {
        await assertAdmin(ctx);
        const request = await ctx.db.get(args.requestId);
        if (!request) return null;
        const patients = await requestPatients(ctx, request);
        const physio = request.physiotherapistId ? await ctx.db.get(request.physiotherapistId) : null;

        const options: Array<{
            kind: "invoice" | "booking";
            id: string;
            label: string;
            detail: string;
            amountKobo: number;
            physioName: string;
            matchesRequestPhysio: boolean;
            hasOpenLoan: boolean;
            createdAt: number;
        }> = [];
        for (const patient of patients) {
            const invoices = await ctx.db
                .query("invoices")
                .withIndex("by_patient_id", (q) => q.eq("patientId", patient._id))
                .order("desc")
                .take(50);
            for (const invoice of invoices.filter(financeableInvoice)) {
                const provider = invoice.physiotherapistId ? await ctx.db.get(invoice.physiotherapistId) : null;
                options.push({
                    kind: "invoice",
                    id: invoice._id,
                    label: `Invoice ${invoice.invoiceNumber}`,
                    detail: `${personName(patient)} · due ${new Date(invoice.dueDate).toLocaleDateString("en-NG")}`,
                    amountKobo: Math.round(invoice.totalAmount - (invoice.paidAmount ?? 0)),
                    physioName: personName(provider),
                    matchesRequestPhysio: Boolean(request.physiotherapistId && invoice.physiotherapistId === request.physiotherapistId),
                    hasOpenLoan: await hasOpenLoan(ctx, { invoiceId: invoice._id }),
                    createdAt: invoice._creationTime,
                });
            }
            const bookings = await ctx.db
                .query("marketplaceBookings")
                .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
                .order("desc")
                .take(50);
            for (const booking of bookings.filter(financeableBooking)) {
                const provider = booking.physiotherapistId ? await ctx.db.get(booking.physiotherapistId) : null;
                options.push({
                    kind: "booking",
                    id: booking._id,
                    label: bookingLabel(booking),
                    detail: booking.sessionDate
                        ? `Booked for ${new Date(booking.sessionDate).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}`
                        : "Booking waiting for payment",
                    amountKobo: Math.round(booking.serviceAmount),
                    physioName: personName(provider),
                    matchesRequestPhysio: Boolean(request.physiotherapistId && booking.physiotherapistId === request.physiotherapistId),
                    hasOpenLoan: await hasOpenLoan(ctx, { bookingId: booking._id }),
                    createdAt: booking._creationTime,
                });
            }
        }
        options.sort((a, b) => Number(b.matchesRequestPhysio) - Number(a.matchesRequestPhysio) || b.createdAt - a.createdAt);
        return {
            patientFound: patients.length > 0,
            physio: physio ? { id: physio._id, name: personName(physio) } : null,
            options,
        };
    },
});

/**
 * No invoice or booking to finance yet: ask the physio the patient chose to invoice them. The
 * request waits; it's linked automatically when a MediLoan starts for that patient.
 */
export const askPhysioToInvoice = mutation({
    args: { requestId: v.id("loanRequests") },
    handler: async (ctx, args) => {
        await assertAdmin(ctx);
        const request = await ctx.db.get(args.requestId);
        if (!request) throw new ConvexError("Request not found.");
        if (!request.physiotherapistId) throw new ConvexError("This request doesn't say which physiotherapist the patient chose.");
        const now = Date.now();
        await ctx.db.patch(request._id, { status: "awaiting_invoice", invoiceRequestedAt: now, updatedAt: now });
        const patientName = `${request.patientFirstName} ${request.patientLastName}`.trim();
        await ctx.db.insert("notifications", {
            userId: request.physiotherapistId,
            type: "system_alert",
            priority: "high",
            status: "pending",
            payload: {
                title: "Invoice needed for a MediLoan",
                body: `${patientName} (${request.patientPhone}) wants to pay for "${request.treatment}" with MediLoan. Send them an invoice, then press MediLoan on it.`,
                data: { actionUrl: "/dashboard/physiotherapist/billing", entityType: "loan_request", entityId: request._id },
            },
            createdAt: now,
        });
        return { success: true };
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// SERVER: Record a loan MyItura created (after /api/myitura/initiate checked the caller)
// ─────────────────────────────────────────────────────────────────────────────

export const logInitiatedLoan = mutation({
    args: {
        loanRequestId: v.optional(v.id("loanRequests")),
        invoiceId: v.optional(v.id("invoices")),
        bookingId: v.optional(v.id("marketplaceBookings")),
        physiotherapistId: v.optional(v.id("users")),
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

        // A patient's waiting MediLoan request (from a booking page) is fulfilled by this loan,
        // whoever started it: matched by account, or by phone for requests made signed out
        let loanRequestId = args.loanRequestId;
        if (!loanRequestId && args.patientId) {
            const waiting = (
                await Promise.all(
                    (["pending", "awaiting_invoice"] as const).map((status) =>
                        ctx.db.query("loanRequests").withIndex("by_status", (q) => q.eq("status", status)).take(200)
                    )
                )
            ).flat();
            const phones = new Set(phoneVariants(args.patientPhone));
            loanRequestId = waiting
                .filter((r) => r.patientUserId === args.patientId || phoneVariants(r.patientPhone).some((p) => phones.has(p)))
                .sort((a, b) => b.createdAt - a.createdAt)[0]?._id;
        }

        const loanId = await ctx.db.insert("loanApplications", {
            loanRequestId,
            invoiceId: args.invoiceId,
            bookingId: args.bookingId,
            physiotherapistId: args.physiotherapistId,
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

        if (loanRequestId) {
            await ctx.db.patch(loanRequestId, {
                status: "initiated",
                loanApplicationId: loanId,
                initiatedByAdminId: initiator?.role === "admin" ? initiator._id : undefined,
                initiatedAt: now,
                updatedAt: now,
            });
        }

        // The patient sees it on their dashboard, with the link to continue
        if (args.patientId && args.patientId !== initiator?._id) {
            await ctx.db.insert("notifications", {
                userId: args.patientId,
                type: "system_alert",
                priority: "high",
                status: "pending",
                payload: {
                    title: "Your MediLoan application has started",
                    body: `MyItura is texting you a link to apply for ${naira(args.amount)} for ${args.treatment}. You can also continue from your dashboard.`,
                    data: { actionUrl: "/dashboard/patient", entityType: "loan_application", entityId: loanId },
                },
                createdAt: now,
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
            const disbursed = fresh.amountApproved ?? fresh.amount;
            if (fresh.invoiceId) await settleInvoiceFromLoan(ctx, fresh, disbursed);
            else if (fresh.bookingId) await settleBookingFromLoan(ctx, fresh, disbursed);
            // Older loans from booking-page requests pay for nothing in particular
            else await flagLoan(ctx, fresh, `Paid out (${naira(disbursed)}) but not linked to an invoice or booking. Match it to the patient's care by hand.`);
        }
        if (moves && next && loan.patientId) await notifyPatientOfLoan(ctx, loan, next);

        return {
            result: moves ? ("updated" as const) : next ? ("unchanged" as const) : ("recorded" as const),
            status: moves && next ? next : current,
        };
    },
});

/** Records why a payout needs a person, and tells the admins. */
async function flagLoan(ctx: MutationCtx, loan: Doc<"loanApplications">, reason: string) {
    const now = Date.now();
    await ctx.db.patch(loan._id, { attentionReason: reason, updatedAt: now });
    await ctx.db.insert("systemLogs", {
        type: "payment",
        timestamp: now,
        action: "mediloan_needs_attention",
        targetEntityType: "loan_application",
        targetEntityId: String(loan._id),
        details: { clientReference: loan.clientReference, reason },
    });
    const admins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .collect();
    for (const admin of admins) {
        await ctx.db.insert("notifications", {
            userId: admin._id,
            type: "system_alert",
            priority: "high",
            status: "pending",
            payload: {
                title: "MediLoan needs attention",
                body: `${loan.patientFirstName} ${loan.patientLastName}: ${reason}`,
                data: { actionUrl: "/dashboard/admin/loans", entityType: "loan_application", entityId: loan._id },
            },
            createdAt: now,
        });
    }
}

/** What the patient hears at each step (the payout itself is announced by the invoice or booking). */
async function notifyPatientOfLoan(ctx: MutationCtx, loan: Doc<"loanApplications">, status: MediLoanStatus) {
    const messages: Partial<Record<MediLoanStatus, { title: string; body: string }>> = {
        approved: {
            title: "Your MediLoan was approved",
            body: `MyItura approved your loan for ${loan.treatment}. Accept the terms in MediLoan to finish.`,
        },
        declined: {
            title: "Your MediLoan wasn't approved",
            body: `MyItura didn't approve the loan for ${loan.treatment}. You can still pay another way from your dashboard.`,
        },
        expired: {
            title: "Your MediLoan link expired",
            body: `The application for ${loan.treatment} wasn't finished in 7 days. You can start a new one from your dashboard.`,
        },
        cancelled: {
            title: "Your MediLoan application was cancelled",
            body: `The application for ${loan.treatment} was cancelled. You can pay another way from your dashboard.`,
        },
    };
    const message = messages[status];
    if (!message || !loan.patientId) return;
    await ctx.db.insert("notifications", {
        userId: loan.patientId,
        type: "system_alert",
        priority: "medium",
        status: "pending",
        payload: { ...message, data: { actionUrl: "/dashboard/patient", entityType: "loan_application", entityId: loan._id } },
        createdAt: Date.now(),
    });
}

/**
 * MyItura paid Rehabify for a marketplace booking: the booking completes exactly as if the
 * patient had paid (appointment, invoice, physio payout, partner commission), or is flagged if
 * the money doesn't cover it or the booking was cancelled meanwhile.
 */
async function settleBookingFromLoan(ctx: MutationCtx, loan: Doc<"loanApplications">, disbursedKobo: number) {
    if (!loan.bookingId) return;
    const reference = `MEDILOAN_${loan.myituraLoanId ?? loan.clientReference}`;
    const result = (await completeMarketplaceBookingCore(ctx, loan.bookingId, {
        paymentReference: reference,
        // The money reaches Rehabify by bank transfer from MyItura; the reference says it's a MediLoan
        paymentMethod: "bank_transfer",
        paidAmountKobo: Math.round(disbursedKobo),
    })) as { success: boolean; reason?: string; cancelled?: boolean; needsNewTime?: boolean };

    if (!result.success && result.reason === "amount_mismatch") {
        await flagLoan(ctx, loan, `MyItura paid ${naira(disbursedKobo)}, less than the booking. Collect the difference or refund before confirming.`);
    } else if (result.cancelled) {
        await flagLoan(ctx, loan, "Paid out after the booking was cancelled. Rebook the patient or arrange a refund with MyItura.");
    } else if (result.needsNewTime) {
        await flagLoan(ctx, loan, "Paid out, but the booked time was taken meanwhile. Agree a new time with the patient.");
    }
}

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
        await flagLoan(ctx, loan, `Paid out (${naira(disbursedKobo)}) for invoice ${invoice.invoiceNumber}, which was cancelled. Refund or reassign the money.`);
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

    const paidLabel = naira(received);
    if (!fullyPaid) {
        await flagLoan(ctx, loan, `MyItura paid ${paidLabel}, less than the ${naira(outstanding)} owed on invoice ${invoice.invoiceNumber}. The rest is still due from the patient.`);
    }
    if (invoice.physiotherapistId) {
        await ctx.db.insert("notifications", {
            userId: invoice.physiotherapistId,
            type: "payment_received",
            priority: "high",
            status: "pending",
            payload: {
                title: "Paid by MediLoan",
                body: `Invoice #${invoice.invoiceNumber} was paid by the patient's MediLoan (${paidLabel}).`,
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
            body: `MediLoan paid ${paidLabel} towards invoice #${invoice.invoiceNumber}. You repay MyItura on the schedule you agreed.`,
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

async function signedInUser(ctx: QueryCtx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
}

/** Whether the application link can still be used (MyItura links last 7 days). */
function linkIsLive(loan: Doc<"loanApplications">) {
    if (loan.status !== "initiated" && loan.status !== "pending") return false;
    const expires = loan.expiresAt ? Date.parse(loan.expiresAt) : NaN;
    return Number.isNaN(expires) || expires > Date.now();
}

/**
 * The signed-in patient's MediLoans, newest first: what each pays for, where it stands and,
 * while the application is open, the link to continue it. No MyItura payloads or notes.
 */
export const getMyLoans = query({
    args: {},
    handler: async (ctx) => {
        const user = await signedInUser(ctx);
        if (!user) return [];
        const loans = await ctx.db
            .query("loanApplications")
            .withIndex("by_patient", (q) => q.eq("patientId", user._id))
            .order("desc")
            .take(20);
        return Promise.all(
            loans.map(async (loan) => {
                const physio = loan.physiotherapistId ? await ctx.db.get(loan.physiotherapistId) : null;
                const invoice = loan.invoiceId ? await ctx.db.get(loan.invoiceId) : null;
                return {
                    _id: loan._id,
                    status: loan.status,
                    treatment: loan.treatment,
                    amountKobo: loan.amount,
                    amountApprovedKobo: loan.amountApproved ?? null,
                    physioName: physio ? personName(physio) : null,
                    invoiceId: loan.invoiceId ?? null,
                    invoiceNumber: invoice?.invoiceNumber ?? loan.invoiceReference ?? null,
                    bookingId: loan.bookingId ?? null,
                    applicationUrl: linkIsLive(loan) ? loan.applicationUrl ?? null : null,
                    expiresAt: loan.expiresAt ?? null,
                    repaymentStatus: loan.repaymentStatus ?? null,
                    disbursedAt: loan.disbursedAt ?? null,
                    createdAt: loan.createdAt,
                    updatedAt: loan.updatedAt,
                };
            })
        );
    },
});

/** The physio's invoices that have a MediLoan, with its status (for the billing list). */
export const getMyInvoiceLoans = query({
    args: {},
    handler: async (ctx) => {
        const user = await signedInUser(ctx);
        if (!user) return [];
        const loans = await ctx.db
            .query("loanApplications")
            .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id))
            .order("desc")
            .take(200);
        const latest = new Map<string, { invoiceId: Id<"invoices">; status: string; updatedAt: number }>();
        for (const loan of loans) {
            if (!loan.invoiceId || latest.has(loan.invoiceId)) continue;
            latest.set(loan.invoiceId, { invoiceId: loan.invoiceId, status: loan.status, updatedAt: loan.updatedAt });
        }
        return [...latest.values()];
    },
});
