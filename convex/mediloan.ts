import { mutation, query, action } from "./_generated/server";
import { v } from "convex/values";

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
// ADMIN + PHYSIO: Log a completed MyItura SDK initiation → loanApplications
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called by /api/myitura/initiate after a successful MyItura SDK call.
 * Creates the loanApplication record and links it back to the loanRequest.
 * Requires the caller to be authenticated (admin or physio).
 */
export const logInitiatedLoan = mutation({
    args: {
        loanRequestId: v.optional(v.id("loanRequests")),
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
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        let initiator = null;

        if (identity) {
            initiator = await ctx.db
                .query("users")
                .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
                .unique();
        } else if (args.initiatorClerkId) {
            const clerkId = args.initiatorClerkId;
            initiator = await ctx.db
                .query("users")
                .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
                .unique();
        }

        const loanId = await ctx.db.insert("loanApplications", {
            loanRequestId: args.loanRequestId,
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
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        // If this originated from a loan request, update its status
        if (args.loanRequestId) {
            await ctx.db.patch(args.loanRequestId, {
                status: "initiated",
                loanApplicationId: loanId,
                initiatedByAdminId: initiator ? initiator._id : undefined,
                initiatedAt: Date.now(),
                updatedAt: Date.now(),
            });
        }

        return loanId;
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK: Update loan status from MyItura webhook events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called by /api/myitura/webhook when MyItura sends status updates.
 * Matches the loan by sdkReference or clientReference and updates its status.
 * Auth/signature verification is handled upstream in the Next.js API route.
 */
export const updateLoanFromWebhook = mutation({
    args: {
        sdkReference: v.optional(v.string()),
        clientReference: v.optional(v.string()),
        status: v.string(),
        disbursedAt: v.optional(v.number()),
        repaymentStatus: v.optional(v.string()),
        lastWebhookPayload: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        let loan = null;

        if (args.sdkReference) {
            loan = await ctx.db
                .query("loanApplications")
                .withIndex("by_myituraSdkRef", (q) => q.eq("myituraSdkRef", args.sdkReference!))
                .unique();
        }
        if (!loan && args.clientReference) {
            loan = await ctx.db
                .query("loanApplications")
                .withIndex("by_clientReference", (q) => q.eq("clientReference", args.clientReference!))
                .unique();
        }
        if (!loan) {
            console.error(`[MediLoan Webhook] Loan not found — sdkRef=${args.sdkReference}, clientRef=${args.clientReference}`);
            throw new Error("Loan application not found");
        }

        const updates: Record<string, any> = {
            status: args.status,
            updatedAt: Date.now(),
            lastWebhookPayload: args.lastWebhookPayload,
        };
        if (args.disbursedAt) updates.disbursedAt = args.disbursedAt;
        if (args.repaymentStatus) updates.repaymentStatus = args.repaymentStatus;

        await ctx.db.patch(loan._id, updates);
        return loan._id;
    },
});

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
