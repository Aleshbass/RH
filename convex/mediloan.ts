import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Log a loan that was just initiated via the /api/myitura/initiate route.
 * Called by the Next.js API route after a successful MyItura SDK call.
 */
export const logInitiatedLoan = mutation({
    args: {
        patientId: v.optional(v.id("users")),
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
        status: v.string(),
        expiresAt: v.string(),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");

        const initiator = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!initiator) throw new Error("User not found");

        const loanId = await ctx.db.insert("loanApplications", {
            patientId: args.patientId,
            initiatedBy: initiator._id,
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

        return loanId;
    },
});

/**
 * Called by the /api/myitura/webhook route when MyItura sends status updates.
 * Finds the loan by SDK reference or client reference and updates its status.
 */
export const updateLoanFromWebhook = mutation({
    args: {
        sdkReference: v.optional(v.string()),
        clientReference: v.optional(v.string()),
        status: v.string(),
        disbursedAt: v.optional(v.number()),
        repaymentStatus: v.optional(v.string()),
        webhookPayload: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        let loan = null;

        // Try SDK ref first, then client ref
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
            console.error(
                `[MediLoan Webhook] Loan not found for sdkRef=${args.sdkReference}, clientRef=${args.clientReference}`
            );
            throw new Error("Loan application not found");
        }

        const updates: Record<string, any> = {
            status: args.status,
            updatedAt: Date.now(),
            lastWebhookPayload: args.webhookPayload,
        };

        if (args.disbursedAt) updates.disbursedAt = args.disbursedAt;
        if (args.repaymentStatus) updates.repaymentStatus = args.repaymentStatus;

        await ctx.db.patch(loan._id, updates);
        return loan._id;
    },
});

/**
 * Get all loan applications — for admin dashboard
 */
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

/**
 * Get loans initiated by the current user (physio/clinic) — for their dashboard
 */
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
