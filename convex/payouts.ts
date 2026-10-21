import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { ensureUserRole } from "./auth";

/**
 * Payouts: what Rehabify owes a physiotherapist (or clinic owner) for a paid invoice.
 * Rows are created when an appointment linked to a paid invoice is completed.
 * All amounts are in kobo (the invoice's physiotherapist share).
 */

type PayoutStatus = Doc<"payouts">["status"];

const payoutStatusV = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed")
);

function koboToNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

/**
 * The one place a payout changes status. Used by the internal mutation and the admin
 * console so notifications and timestamps stay consistent.
 */
async function applyPayoutStatus(
  ctx: MutationCtx,
  payout: Doc<"payouts">,
  status: PayoutStatus,
  extra: { failureReason?: string; transferReference?: string; adminNote?: string; updatedBy?: Id<"users"> } = {}
) {
  const now = Date.now();
  const patch: Partial<Omit<Doc<"payouts">, "_id" | "_creationTime">> = { status, updatedAt: now };
  if (status === "processing") patch.processedAt = now;
  if (status === "completed") patch.completedAt = now;
  if (status === "failed" && extra.failureReason) patch.failureReason = extra.failureReason;
  // A retried payout starts clean
  if (status === "pending") patch.failureReason = undefined;
  if (extra.transferReference) patch.transferReference = extra.transferReference;
  if (extra.adminNote) patch.adminNote = extra.adminNote;
  if (extra.updatedBy) patch.updatedBy = extra.updatedBy;
  await ctx.db.patch(payout._id, patch);

  if (payout.type === "platform_fee") return;

  if (status === "failed") {
    await ctx.db.insert("notifications", {
      userId: payout.userId,
      type: "payout_failed",
      priority: "high",
      status: "pending",
      payload: {
        title: "Payout failed",
        body: `Your payout of ${koboToNaira(payout.amount)} didn't go through.${extra.failureReason ? ` ${extra.failureReason}` : ""} We'll retry it once the issue is fixed.`,
        data: { entityId: payout._id, entityType: "payout", actionUrl: "/dashboard/physiotherapist/settings/payout" },
      },
      createdAt: now,
    });
  } else if (status === "completed") {
    await ctx.db.insert("notifications", {
      userId: payout.userId,
      type: "payout_completed",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Payout sent",
        body: `We've sent you ${koboToNaira(payout.amount)}.${extra.transferReference ? ` Reference: ${extra.transferReference}.` : ""}`,
        data: { entityId: payout._id, entityType: "payout", actionUrl: "/dashboard/physiotherapist/billing" },
      },
      createdAt: now,
    });
  }
}

/**
 * Process split payment for completed transactions
 * Distributes funds between platform and physiotherapist/clinic
 */
export const processSplitPayment = internalMutation({
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
    await ctx.db.insert("payouts", {
      invoiceId: args.invoiceId,
      amount: args.platformFee,
      status: "pending",
      type: "platform_fee",
      userId: (invoice as any).userId, // Platform fee goes to platform
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create physiotherapist earnings payout
    await ctx.db.insert("payouts", {
      invoiceId: args.invoiceId,
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
export const processBulkPayout = internalMutation({
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

    await ctx.db.insert("bulkTransfers", {
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
export const updatePayoutStatus = internalMutation({
  args: {
    payoutId: v.id("payouts"),
    status: payoutStatusV,
    failureReason: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean()
  }),
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new Error("Payout not found");
    await applyPayoutStatus(ctx, payout, args.status, { failureReason: args.failureReason });
    return { success: true };
  }
});

/**
 * Get payout history for a user
 */
export const getPayoutHistory = internalQuery({
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
      .order("desc")
      .take(500);

    const enrichedPayouts = await Promise.all(
      payouts.map(async (payout) => {
        const invoice = await ctx.db.get(payout.invoiceId);
        const patientUser = invoice ? await ctx.db.get(invoice.patientId) : null;

        // Only the fields in the return validator
        return {
          _id: payout._id,
          invoiceId: payout.invoiceId,
          amount: payout.amount,
          status: payout.status,
          createdAt: payout.createdAt,
          processedAt: payout.processedAt,
          completedAt: payout.completedAt,
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
export const getPendingPayouts = internalQuery({
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
      .take(500);

    return payouts.map((p) => ({ _id: p._id, invoiceId: p.invoiceId, amount: p.amount, status: p.status, createdAt: p.createdAt }));
  },
});

/**
 * Get payout statistics for dashboard
 */
export const getPayoutStats = internalQuery({
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
      .take(2000);

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

// ─── Admin console (/dashboard/admin/payouts) ────────────────────────────────

/** Platform-fee rows are Rehabify's own share, not money paid out to anyone. */
const isRecipientPayout = (p: Doc<"payouts">) => p.type !== "platform_fee";

const STATS_READ_CAP = 1000;
const LIST_MAX = 200;

/** Start of the current calendar month in Lagos time (WAT, UTC+1, no DST). */
function startOfMonthWAT(now: number) {
  const hour = 60 * 60 * 1000;
  const wat = new Date(now + hour);
  return Date.UTC(wat.getUTCFullYear(), wat.getUTCMonth(), 1) - hour;
}

function readByStatus(ctx: QueryCtx, status: PayoutStatus, cap: number) {
  return ctx.db
    .query("payouts")
    .withIndex("by_status", (q) => q.eq("status", status))
    .order("desc")
    .take(cap);
}

function sum(rows: Doc<"payouts">[]) {
  return { count: rows.length, amountKobo: rows.reduce((s, p) => s + p.amount, 0) };
}

/** Stat tiles for the payouts page. Amounts in kobo. */
export const adminGetPayoutStats = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const [pending, processing, failed, completed] = await Promise.all([
      readByStatus(ctx, "pending", STATS_READ_CAP),
      readByStatus(ctx, "processing", STATS_READ_CAP),
      readByStatus(ctx, "failed", STATS_READ_CAP),
      readByStatus(ctx, "completed", STATS_READ_CAP),
    ]);
    const monthStart = startOfMonthWAT(Date.now());
    const owed = [...pending, ...processing].filter(isRecipientPayout);
    return {
      pending: sum(pending.filter(isRecipientPayout)),
      processing: sum(processing.filter(isRecipientPayout)),
      failed: sum(failed.filter(isRecipientPayout)),
      paidThisMonth: sum(completed.filter((p) => isRecipientPayout(p) && (p.completedAt ?? 0) >= monthStart)),
      recipientsOwed: new Set(owed.map((p) => p.userId)).size,
      monthStart,
      capped: [pending, processing, failed, completed].some((rows) => rows.length >= STATS_READ_CAP),
    };
  },
});

/**
 * Payouts for the admin list. `open` = everything that still needs action (pending,
 * processing, failed); `history` = paid payouts, newest first.
 */
export const adminListPayouts = query({
  args: {
    tab: v.union(v.literal("open"), v.literal("history")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 100), 1), LIST_MAX);

    let rows: Doc<"payouts">[];
    if (args.tab === "open") {
      const [pending, processing, failed] = await Promise.all([
        readByStatus(ctx, "pending", limit),
        readByStatus(ctx, "processing", limit),
        readByStatus(ctx, "failed", limit),
      ]);
      rows = [...failed, ...processing, ...pending].filter(isRecipientPayout);
    } else {
      rows = (await readByStatus(ctx, "completed", limit))
        .filter(isRecipientPayout)
        .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
    }

    const users = new Map<string, Doc<"users"> | null>();
    const banks = new Map<string, Doc<"physiotherapistBankAccounts"> | null>();
    const getUser = async (id: Id<"users">) => {
      if (!users.has(id)) users.set(id, await ctx.db.get(id));
      return users.get(id) ?? null;
    };
    const getBank = async (id: Id<"users">) => {
      if (!banks.has(id)) {
        const accounts = await ctx.db
          .query("physiotherapistBankAccounts")
          .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", id))
          .take(10);
        banks.set(id, accounts.find((a) => a.isDefault) ?? accounts[0] ?? null);
      }
      return banks.get(id) ?? null;
    };
    const fullName = (u: Doc<"users"> | null) =>
      u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Unnamed" : null;

    return Promise.all(
      rows.map(async (p) => {
        const [recipient, bank, invoice] = await Promise.all([getUser(p.userId), getBank(p.userId), ctx.db.get(p.invoiceId)]);
        const patient = invoice ? await getUser(invoice.patientId) : null;
        return {
          _id: p._id,
          type: p.type,
          status: p.status,
          amountKobo: p.amount,
          createdAt: p.createdAt,
          processedAt: p.processedAt ?? null,
          completedAt: p.completedAt ?? null,
          failureReason: p.failureReason ?? null,
          transferReference: p.transferReference ?? null,
          adminNote: p.adminNote ?? null,
          recipient: recipient
            ? { _id: recipient._id, name: fullName(recipient) ?? "Unnamed", email: recipient.email ?? "", role: recipient.role ?? "" }
            : null,
          bank: bank
            ? { bankName: bank.bankName, accountName: bank.accountName, accountNumber: bank.accountNumber, isVerified: bank.isVerified }
            : null,
          invoice: invoice ? { _id: invoice._id, invoiceNumber: invoice.invoiceNumber, totalAmountKobo: invoice.totalAmount } : null,
          // Patients are identified by Rehabify ID on finance screens, never by name
          patientUserId: patient?._id ?? null,
          patientNumber: patient?.patientNumber ?? null,
        };
      })
    );
  },
});

const cleanText = (value: string | undefined, max: number) => {
  const text = value?.trim();
  return text ? text.slice(0, max) : undefined;
};

/** Record that one or more payouts were paid (e.g. after a manual bank transfer). */
export const adminMarkPayoutsPaid = mutation({
  args: {
    payoutIds: v.array(v.id("payouts")),
    transferReference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const ids = [...new Set(args.payoutIds)];
    if (ids.length === 0) throw new ConvexError("Choose at least one payout.");
    if (ids.length > 100) throw new ConvexError("Mark up to 100 payouts at a time.");

    const payouts = await Promise.all(ids.map((id) => ctx.db.get(id)));
    for (const p of payouts) {
      if (!p) throw new ConvexError("One of these payouts no longer exists.");
      if (p.status === "completed") throw new ConvexError("One of these payouts is already marked paid.");
    }
    const transferReference = cleanText(args.transferReference, 120);
    const adminNote = cleanText(args.note, 500);
    let totalKobo = 0;
    for (const p of payouts as Doc<"payouts">[]) {
      await applyPayoutStatus(ctx, p, "completed", { transferReference, adminNote, updatedBy: admin._id });
      totalKobo += p.amount;
    }
    return { updated: payouts.length, totalKobo };
  },
});

/** Mark a payout as failed (bank rejected it, wrong account, ...). The recipient is told. */
export const adminMarkPayoutFailed = mutation({
  args: { payoutId: v.id("payouts"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new ConvexError("Payout not found.");
    if (payout.status !== "pending" && payout.status !== "processing") {
      throw new ConvexError(`Only pending or processing payouts can be marked failed (this one is ${payout.status}).`);
    }
    const reason = cleanText(args.reason, 500);
    if (!reason) throw new ConvexError("Say why the payout failed.");
    await applyPayoutStatus(ctx, payout, "failed", { failureReason: reason, updatedBy: admin._id });
    return { success: true };
  },
});

/** Mark a payout as in progress (transfer sent, waiting for the bank). */
export const adminMarkPayoutProcessing = mutation({
  args: { payoutId: v.id("payouts"), transferReference: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new ConvexError("Payout not found.");
    if (payout.status !== "pending") throw new ConvexError(`Only pending payouts can be started (this one is ${payout.status}).`);
    await applyPayoutStatus(ctx, payout, "processing", {
      transferReference: cleanText(args.transferReference, 120),
      updatedBy: admin._id,
    });
    return { success: true };
  },
});

/** Put a failed payout back in the queue. */
export const adminRetryPayout = mutation({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new ConvexError("Payout not found.");
    if (payout.status !== "failed") throw new ConvexError("Only failed payouts can be retried.");
    const invoice = await ctx.db.get(payout.invoiceId);
    if (invoice?.status === "void") throw new ConvexError("This booking was refunded, so there's nothing to pay.");
    await applyPayoutStatus(ctx, payout, "pending", { updatedBy: admin._id });
    return { success: true };
  },
});
