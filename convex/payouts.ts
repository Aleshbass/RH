import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

/**
 * Process split payment for completed transactions
 * Distributes funds between platform and physiotherapist/clinic
 */
export const processSplitPayment = mutation({
  args: {
    invoiceId: v.id("invoices"),
    totalAmount: v.number(),
    platformFee: v.number(),
    physiotherapistEarning: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
    platformShare: v.number(),
    physiotherapistShare: v.number(),
    message: v.string()
  }),
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found");

    // Create platform fee payout
    const platformPayout = await ctx.db.insert("payouts", {
      invoiceId: args.invoiceId,
      paymentId: null as any, // Will be updated when payment is processed
      amount: args.platformFee,
      status: "pending",
      type: "platform_fee",
      userId: (invoice as any).userId, // Platform fee goes to platform
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create physiotherapist earnings payout
    const physiotherapistPayout = await ctx.db.insert("payouts", {
      invoiceId: args.invoiceId,
      paymentId: null as any, // Will be updated when payment is processed
      amount: args.physiotherapistEarning,
      status: "pending",
      type: "physiotherapist_earning",
      userId: (invoice as any).physiotherapistId || (invoice as any).physiotherapistProfileId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      success: true,
      platformShare: args.platformFee,
      physiotherapistShare: args.physiotherapistEarning,
      message: "Split payment processed successfully"
    };
  }
});

/**
 * Process bulk payout to physiotherapist/clinic bank account
 */
export const processBulkPayout = mutation({
  args: {
    payoutIds: v.array(v.id("payouts")),
    bankAccountId: v.id("bankAccounts"),
  },
  returns: v.object({
    success: v.boolean(),
    totalAmount: v.number(),
    processedCount: v.number(),
    message: v.string()
  }),
  handler: async (ctx, args) => {
    const payouts = await Promise.all(
      args.payoutIds.map((id) => ctx.db.get(id))
    );

    const validPayouts = payouts.filter((p) => p !== null) as any[];
    const totalAmount = validPayouts.reduce((sum, p) => sum + p.amount, 0);

    const bulkTransfer = await ctx.db.insert("bulkTransfers", {
      userId: validPayouts[0].userId,
      bankAccountId: args.bankAccountId,
      payoutIds: args.payoutIds,
      totalAmount,
      status: "pending" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update all payouts to processing
    await Promise.all(
      args.payoutIds.map((id) =>
        ctx.db.patch(id, { status: "processing" as const, processedAt: Date.now() })
      )
    );

    return {
      success: true,
      totalAmount,
      processedCount: validPayouts.length,
      message: "Bulk payout processed successfully"
    };
  }
});

/**
 * Update payout status
 */
export const updatePayoutStatus = mutation({
  args: {
    payoutId: v.id("payouts"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    failureReason: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean()
  }),
  handler: async (ctx, args) => {
    const updateData: any = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.status === "completed") {
      updateData.completedAt = Date.now();
    }

    if (args.failureReason) {
      updateData.failureReason = args.failureReason;
    }

    await ctx.db.patch(args.payoutId, updateData);

    // Send notification if payout failed
    if (args.status === "failed") {
      const payout = await ctx.db.get(args.payoutId);
      if (payout) {
        await ctx.db.insert("notifications", {
          userId: payout.userId,
          type: "payout_failed",
          title: "Payout Failed",
          message: `Your payout of ₦${payout.amount} failed. ${args.failureReason || ""}`,
          read: false,
          createdAt: Date.now(),
        });
      }
    }

    return { success: true };
  }
});

/**
 * Get payout history for a user
 */
export const getPayoutHistory = query({
  args: { userId: v.id("users") },
  returns: v.array(v.object({
    _id: v.id("payouts"),
    invoiceId: v.id("invoices"),
    amount: v.number(),
    status: v.string(),
    createdAt: v.number(),
    processedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    invoice: v.optional(v.object({
      invoiceNumber: v.string(),
      totalAmount: v.number(),
      serviceType: v.string(),
    })),
    patient: v.optional(v.object({
      firstName: v.string(),
      lastName: v.string(),
      email: v.string(),
    })),
  })),
  handler: async (ctx, args) => {
    const payouts = await ctx.db
      .query("payouts")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .collect();

    const enrichedPayouts = await Promise.all(
      payouts.map(async (payout) => {
        const invoice = await ctx.db.get(payout.invoiceId);
        const patient = invoice ? await ctx.db.get(invoice.patientId) : null;
        const patientUser = patient && invoice ? await ctx.db.get(invoice.patientId) : null;

        return {
          ...payout,
          invoice: {
            invoiceNumber: invoice?.invoiceNumber || "",
            totalAmount: invoice?.totalAmount || 0,
            serviceType: (invoice as any)?.serviceType || "",
          },
          patient: patientUser
            ? {
                firstName: patientUser.firstName || '',
                lastName: patientUser.lastName || '',
                email: patientUser.email || '',
              }
            : undefined,
        };
      })
    );

    return enrichedPayouts;
  },
});

/**
 * Get pending payouts for a user
 */
export const getPendingPayouts = query({
  args: { userId: v.id("users") },
  returns: v.array(v.object({
    _id: v.id("payouts"),
    invoiceId: v.id("invoices"),
    amount: v.number(),
    status: v.string(),
    createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const payouts = await ctx.db
      .query("payouts")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", args.userId).eq("status", "pending")
      )
      .collect();

    return payouts;
  },
});

/**
 * Get payout statistics for dashboard
 */
export const getPayoutStats = query({
  args: { userId: v.id("users") },
  returns: v.object({
    totalPending: v.number(),
    totalProcessing: v.number(),
    totalCompleted: v.number(),
    pendingAmount: v.number(),
    processingAmount: v.number(),
    completedAmount: v.number(),
    lastPayoutDate: v.optional(v.number())
  }),
  handler: async (ctx, args) => {
    const payouts = await ctx.db
      .query("payouts")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .collect();

    let totalPending = 0;
    let totalProcessing = 0;
    let totalCompleted = 0;
    let pendingAmount = 0;
    let processingAmount = 0;
    let completedAmount = 0;
    let lastPayoutDate: number | undefined;

    for (const payout of payouts) {
      switch (payout.status) {
        case "pending":
          totalPending++;
          pendingAmount += payout.amount;
          break;
        case "processing":
          totalProcessing++;
          processingAmount += payout.amount;
          break;
        case "completed":
          totalCompleted++;
          completedAmount += payout.amount;
          if (!lastPayoutDate || (payout.completedAt && payout.completedAt > lastPayoutDate)) {
            lastPayoutDate = payout.completedAt;
          }
          break;
      }
    }

    return {
      totalPending,
      totalProcessing,
      totalCompleted,
      pendingAmount,
      processingAmount,
      completedAmount,
      lastPayoutDate
    };
  }
});
