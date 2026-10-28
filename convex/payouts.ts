import { insertNotification } from "./helpers/pushNotify";
import { action, mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ensureUserRole } from "./auth";
import { isIndependentPractice } from "./physioSetup";
import { paystackRequest } from "./clinicBilling";
import { bookingDescription } from "./helpers/marketplaceInvoices";
import { verifyPaystackSignature } from "./helpers/paystackSignature";
import { currentPaystackMode } from "./helpers/paystackMode";
import { randomString } from "./helpers/partnerShared";
import { appLink } from "./helpers/appUrl";
import { formatLagos } from "./helpers/lagosTime";
import {
  CONCERN_WINDOW_MS,
  NOTE_DUE_MS,
  PATIENT_CONCERN_REASON,
  firstSessionNoteAt,
  fridayOnOrAfter,
  lagosDayToMs,
  nextRunFriday,
  openConcernFor,
  payoutNeedsNote,
  stageOf,
} from "./helpers/payoutStage";

/**
 * Payouts: what Rehabify owes a physiotherapist (or clinic owner) for a paid invoice.
 * Rows are created when an appointment linked to a paid invoice is completed, and for late
 * cancellations and no-shows. All amounts are in kobo, and a payout is always the amount on its
 * row: no platform fees, card fees or fines are ever taken from it (Payout Policy).
 *
 * Lifecycle (helpers/payoutStage.ts): waiting for the session note → Pending (48 h) → Available
 * (or On hold) → the Friday run → paid by a Paystack transfer an admin starts with Pay all.
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
  extra: {
    failureReason?: string;
    transferReference?: string;
    adminNote?: string;
    updatedBy?: Id<"users">;
    /** False when the caller sends one message for a whole transfer (the Friday run). */
    notify?: boolean;
  } = {}
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

  if (payout.type === "platform_fee" || extra.notify === false) return;

  if (status === "failed") {
    await insertNotification(ctx, {
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
    await insertNotification(ctx, {
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
          heldReason: p.heldAt !== undefined ? (p.heldReason ?? "On hold") : null,
          inRun: Boolean(p.runId),
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
    const touchedRuns = new Set<Id<"payoutRuns">>();
    for (const p of payouts as Doc<"payouts">[]) {
      await applyPayoutStatus(ctx, p, "completed", { transferReference, adminNote, updatedBy: admin._id });
      // Paid by hand: it leaves a draft run it was waiting in (a run's own transfers keep it)
      if (p.runId && !p.runTransferId) {
        await ctx.db.patch(p._id, { runId: undefined });
        touchedRuns.add(p.runId);
      }
      totalKobo += p.amount;
    }
    for (const runId of touchedRuns) await refreshRunTotals(ctx, runId);
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
    // Back in the queue: it goes into the next Friday run (or retry its transfer from the run instead)
    if (payout.runId || payout.runTransferId) await ctx.db.patch(payout._id, { runId: undefined, runTransferId: undefined });
    return { success: true };
  },
});

// ─── Lifecycle: weekly runs, holds, patient concerns and statements ──────────
//
// Every Friday at 07:00 Lagos time a cron prepares the week's run: each physio's Available
// payouts, grouped with totals. An admin reviews it (removes or holds a line) and presses Pay
// all, which sends one Paystack transfer per physio for their total. Nothing is ever sent
// without that click. transfer.success / failed / reversed webhooks settle each transfer; a
// successful one marks its payouts paid and emails the physio their statement.

const PHYSIO_BILLING = "/dashboard/physiotherapist/billing";
const PHYSIO_PAYOUT_SETTINGS = "/dashboard/physiotherapist/settings/payout";
const ADMIN_PAYOUTS = "/dashboard/admin/payouts";
const PROFESSIONAL_FOOTNOTE =
  "You're receiving this because Rehabify pays you for your sessions. Questions? Write to hello@myrehabifyhealth.com.";
const PAYSTACK_API = "https://api.paystack.co";
const REFERENCE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const RUN_READ_CAP = 2000;
const SEND_CONCURRENCY = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

const sendEmail = makeFunctionReference<
  "action",
  {
    to: string;
    subject: string;
    greetingName?: string;
    heading: string;
    paragraphs: string[];
    buttonLabel?: string;
    buttonUrl?: string;
    footnote?: string;
  }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

type TransferState = "pending" | "otp_required" | "success" | "failed" | "reversed";

/** One physio's transfer, as the Pay all action needs it. */
type SendItem = {
  transferId: Id<"payoutRunTransfers">;
  userId: Id<"users">;
  name: string;
  reference: string;
  amountKobo: number;
  weekOf: string;
  bank: { accountName: string; accountNumber: string; bankCode: string };
  recipientCode: string | null;
};

type Skipped = { name: string; reason: string };

// Self-references by name (not the generated api), so this module's types never depend on itself
const refs = {
  beginRunPayment: makeFunctionReference<"mutation", { runId: Id<"payoutRuns"> }, { items: SendItem[]; skipped: Skipped[] }>(
    "payouts:beginRunPayment"
  ),
  beginTransferRetry: makeFunctionReference<"mutation", { transferId: Id<"payoutRunTransfers"> }, SendItem>("payouts:beginTransferRetry"),
  savePayoutRecipient: makeFunctionReference<
    "mutation",
    { userId: Id<"users">; bankCode: string; accountNumber: string; recipientCode: string },
    null
  >("payouts:savePayoutRecipient"),
  recordRunTransferState: makeFunctionReference<
    "mutation",
    { transferId: Id<"payoutRunTransfers">; state: TransferState; transferCode?: string; reason?: string },
    null
  >("payouts:recordRunTransferState"),
  getRunTransferForAdmin: makeFunctionReference<"query", { transferId: Id<"payoutRunTransfers"> }, Doc<"payoutRunTransfers"> | null>(
    "payouts:getRunTransferForAdmin"
  ),
};

const REASON_LABEL = { late_cancellation: "Late cancellation (50%)", no_show: "Missed session (no-show)" } as const;

function personName(user: Doc<"users"> | null) {
  return user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Unnamed" : "Unknown";
}

/** "Ade O.": how a patient appears on a physio's statement. */
function patientShort(user: Doc<"users"> | null) {
  const first = user?.firstName?.trim();
  if (!first) return "Patient";
  const initial = user?.lastName?.trim()?.[0];
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

const shortDate = (ms: number) => formatLagos(ms, { day: "numeric", month: "short", year: "numeric" }, "en-GB");
const fridayLabel = (weekOf: string) => formatLagos(lagosDayToMs(weekOf), { weekday: "long", day: "numeric", month: "long" }, "en-GB");
const sumKobo = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);
const errorMessage = (error: unknown) =>
  error instanceof ConvexError ? String(error.data) : error instanceof Error ? error.message : String(error);

/** The session behind a payout: patient, service and when it was. */
async function describePayout(ctx: QueryCtx | MutationCtx, payout: Doc<"payouts">) {
  const appointment = payout.appointmentId ? await ctx.db.get(payout.appointmentId) : null;
  const booking = payout.bookingId
    ? await ctx.db.get(payout.bookingId)
    : appointment
      ? await ctx.db
          .query("marketplaceBookings")
          .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
          .first()
      : null;
  const invoice = booking && appointment ? null : await ctx.db.get(payout.invoiceId);
  const patientId = appointment?.patientId ?? booking?.patientId ?? invoice?.patientId;
  const patient = patientId ? await ctx.db.get(patientId) : null;
  const what = booking ? bookingDescription(booking) : appointment?.serviceType || invoice?.items[0]?.description || "Physiotherapy session";
  const reason = payout.reason && payout.reason !== "session" ? REASON_LABEL[payout.reason] : null;
  return {
    appointment,
    patient,
    service: reason ? `${reason} · ${what}` : what,
    sessionAt: payout.sessionAt ?? appointment?.startTime ?? null,
  };
}

/** The physio's verified payout account (Settings → Payouts). */
async function payoutBankAccount(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const accounts = await ctx.db
    .query("physiotherapistBankAccounts")
    .withIndex("by_physiotherapist_id", (q) => q.eq("physiotherapistId", userId))
    .take(10);
  return accounts.find((a) => a.isDefault && a.isVerified) ?? accounts.find((a) => a.isVerified) ?? null;
}

async function savedRecipient(ctx: QueryCtx | MutationCtx, userId: Id<"users">, bank: { bankCode: string; accountNumber: string }) {
  const rows = await ctx.db
    .query("payoutRecipients")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(20);
  const mode = currentPaystackMode();
  return (
    rows.find((r) => r.bankCode === bank.bankCode && r.accountNumber === bank.accountNumber && r.paystackMode === mode)?.recipientCode ??
    null
  );
}

const newReference = (weekOf: string) => `rhpo_${weekOf.replace(/-/g, "")}_${randomString(12, REFERENCE_ALPHABET)}`;

async function notifyUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  type: string,
  title: string,
  body: string,
  actionUrl: string,
  priority: "high" | "medium" | "low" = "medium"
) {
  const now = Date.now();
  await insertNotification(ctx, {
    userId,
    type,
    priority,
    status: "pending",
    payload: { title, body, data: { entityType: "payout", actionUrl } },
    createdAt: now,
    updatedAt: now,
  });
}

async function notifyAdmins(ctx: MutationCtx, title: string, body: string, actionUrl: string) {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .take(50);
  for (const admin of admins) await notifyUser(ctx, admin._id, "system_alert", title, body, actionUrl, "high");
}

/** Recounts a run: a draft from its lines, a paid one from its transfers (which also set its status). */
async function refreshRunTotals(ctx: MutationCtx, runId: Id<"payoutRuns">) {
  const run = await ctx.db.get(runId);
  if (!run) return;
  const now = Date.now();
  if (run.status === "draft") {
    const lines = (
      await ctx.db
        .query("payouts")
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .take(RUN_READ_CAP)
    ).filter((p) => p.status === "pending");
    await ctx.db.patch(runId, {
      totalKobo: sumKobo(lines),
      lineCount: lines.length,
      physioCount: new Set(lines.map((p) => p.userId)).size,
      updatedAt: now,
    });
    return;
  }
  const transfers = await ctx.db
    .query("payoutRunTransfers")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .take(500);
  const inFlight = transfers.some((t) => t.status === "sending" || t.status === "pending" || t.status === "otp_required");
  const failed = transfers.filter((t) => t.status === "failed" || t.status === "reversed");
  const status = inFlight ? "paying" : failed.length > 0 ? "partially_failed" : "paid";
  await ctx.db.patch(runId, {
    status,
    totalKobo: transfers.reduce((s, t) => s + t.amountKobo, 0),
    paidKobo: transfers.filter((t) => t.status === "success").reduce((s, t) => s + t.amountKobo, 0),
    failedKobo: failed.reduce((s, t) => s + t.amountKobo, 0),
    lineCount: transfers.reduce((s, t) => s + t.payoutIds.length, 0),
    physioCount: transfers.length,
    paidAt: status === "paid" ? (run.paidAt ?? now) : run.paidAt,
    updatedAt: now,
  });
}

async function draftRun(ctx: QueryCtx | MutationCtx) {
  return ctx.db
    .query("payoutRuns")
    .withIndex("by_status", (q) => q.eq("status", "draft"))
    .order("desc")
    .first();
}

/** This Friday, or next Friday when this Friday's run has already been paid. */
async function openWeek(ctx: MutationCtx, now: number) {
  const friday = fridayOnOrAfter(now);
  const runs = await ctx.db
    .query("payoutRuns")
    .withIndex("by_week", (q) => q.eq("weekOf", friday))
    .take(5);
  return runs.some((r) => r.status !== "draft") ? fridayOnOrAfter(lagosDayToMs(friday) + DAY_MS) : friday;
}

/**
 * Prepares (or refreshes) the one draft run: every Available physio payout not already in it,
 * minus any an admin took out. Lines that stopped being Available (a concern, a hold) leave it.
 */
async function prepareRun(ctx: MutationCtx, now: number) {
  const weekOf = await openWeek(ctx, now);
  let run = await draftRun(ctx);
  if (run && run.weekOf < weekOf) {
    // A draft nobody paid rolls into this week's run
    await ctx.db.patch(run._id, { weekOf, updatedAt: now });
  }
  if (!run) {
    const runId = await ctx.db.insert("payoutRuns", {
      weekOf,
      status: "draft",
      totalKobo: 0,
      physioCount: 0,
      lineCount: 0,
      preparedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    run = (await ctx.db.get(runId))!;
  }

  const pending = await ctx.db
    .query("payouts")
    .withIndex("by_status", (q) => q.eq("status", "pending"))
    .take(RUN_READ_CAP);
  for (const payout of pending) {
    if (payout.type !== "physiotherapist_earning") continue;
    const inThisRun = payout.runId === run._id;
    if (!inThisRun && payout.skipRunId === run._id) continue;
    const { stage } = await stageOf(ctx, payout, now);
    if (stage !== "available") {
      if (inThisRun) await ctx.db.patch(payout._id, { runId: undefined });
      continue;
    }
    if (inThisRun) continue;
    const invoice = await ctx.db.get(payout.invoiceId);
    if (invoice?.status === "void") continue; // refunded
    await ctx.db.patch(payout._id, { runId: run._id, updatedAt: now });
  }
  await ctx.db.patch(run._id, { preparedAt: now });
  await refreshRunTotals(ctx, run._id);
  const fresh = (await ctx.db.get(run._id))!;
  return { runId: fresh._id, weekOf: fresh.weekOf, lineCount: fresh.lineCount, physioCount: fresh.physioCount, totalKobo: fresh.totalKobo };
}

/** Holds a pending payout; it leaves a draft run it was in. */
async function placeOnHold(
  ctx: MutationCtx,
  payout: Doc<"payouts">,
  hold: { reason: string; source: "admin" | "patient_concern"; by?: Id<"users"> }
) {
  const now = Date.now();
  const leavesRun = payout.runId && !payout.runTransferId ? payout.runId : null;
  await ctx.db.patch(payout._id, {
    heldAt: now,
    heldReason: hold.reason,
    heldSource: hold.source,
    heldBy: hold.by,
    releasedAt: undefined,
    releasedBy: undefined,
    ...(leavesRun ? { runId: undefined } : {}),
    updatedAt: now,
  });
  if (leavesRun) await refreshRunTotals(ctx, leavesRun);
}

/** The lines on a transfer's statement (patient as first name and initial). */
async function statementLines(ctx: QueryCtx | MutationCtx, transfer: Doc<"payoutRunTransfers">) {
  const rows = (await Promise.all(transfer.payoutIds.map((id) => ctx.db.get(id)))).filter(
    (p): p is Doc<"payouts"> => p !== null && p.runTransferId === transfer._id
  );
  return Promise.all(
    rows.map(async (p) => {
      const d = await describePayout(ctx, p);
      return { payoutId: p._id, patient: patientShort(d.patient), service: d.service, sessionAt: d.sessionAt, amountKobo: p.amount };
    })
  );
}

async function emailStatement(ctx: MutationCtx, transfer: Doc<"payoutRunTransfers">) {
  const user = await ctx.db.get(transfer.userId);
  if (!user?.email) return;
  const run = await ctx.db.get(transfer.runId);
  const lines = await statementLines(ctx, transfer);
  const paidAt = transfer.completedAt ?? Date.now();
  await ctx.scheduler.runAfter(0, sendEmail, {
    to: user.email,
    subject: `Your Rehabify payout: ${koboToNaira(transfer.amountKobo)}`,
    greetingName: user.firstName ?? undefined,
    heading: "Your payout has been sent",
    paragraphs: [
      `We've sent ${koboToNaira(transfer.amountKobo)} to your ${transfer.bankName ?? "bank"} account${transfer.accountLast4 ? ` ending ${transfer.accountLast4}` : ""}. Here's your statement.`,
      `Payout run: ${run ? fridayLabel(run.weekOf) : shortDate(paidAt)}. Sent ${shortDate(paidAt)}.`,
      ...lines.map((l) => `${l.patient} · ${l.service} · ${l.sessionAt ? shortDate(l.sessionAt) : "No date"} · ${koboToNaira(l.amountKobo)}`),
      `Total: ${koboToNaira(transfer.amountKobo)}. Paid in full, with no fees or deductions.`,
      `Transfer reference: ${transfer.reference}`,
    ],
    buttonLabel: "View your payouts",
    buttonUrl: appLink(`${PHYSIO_BILLING}#payouts`),
    footnote: PROFESSIONAL_FOOTNOTE,
  });
  await ctx.db.patch(transfer._id, { statementEmailedAt: Date.now() });
}

/**
 * The one place a run transfer changes state (Pay all, retries, checks, OTP and webhooks).
 * Success marks its payouts paid and emails the statement; failed or reversed marks them failed.
 * A failed transfer is final for its reference: a retry sends a new one.
 */
async function settleRunTransfer(
  ctx: MutationCtx,
  transfer: Doc<"payoutRunTransfers">,
  state: TransferState,
  info: { transferCode?: string; reason?: string } = {}
) {
  if (transfer.status === "failed" || transfer.status === "reversed") return false;
  if (transfer.status === "success" && state !== "reversed") return false;
  const now = Date.now();
  const transferCode = info.transferCode ?? transfer.transferCode;

  if (state === "pending" || state === "otp_required") {
    await ctx.db.patch(transfer._id, { status: state, transferCode, failureReason: info.reason ?? transfer.failureReason, updatedAt: now });
    await refreshRunTotals(ctx, transfer.runId);
    return true;
  }

  const reason =
    state === "success"
      ? undefined
      : (info.reason ?? (state === "reversed" ? "The bank sent the transfer back." : "Paystack reported that the transfer failed."));
  await ctx.db.patch(transfer._id, { status: state, transferCode, failureReason: reason, completedAt: now, updatedAt: now });
  const rows = (await Promise.all(transfer.payoutIds.map((id) => ctx.db.get(id)))).filter(
    (p): p is Doc<"payouts"> => p !== null && p.runTransferId === transfer._id
  );
  for (const row of rows) {
    if (state === "success") {
      if (row.status !== "completed") await applyPayoutStatus(ctx, row, "completed", { transferReference: transfer.reference, notify: false });
    } else if (row.status !== "failed") {
      await applyPayoutStatus(ctx, row, "failed", { failureReason: reason, notify: false });
    }
  }

  const amount = koboToNaira(transfer.amountKobo);
  if (state === "success") {
    await notifyUser(
      ctx,
      transfer.userId,
      "payout_completed",
      "Payout sent",
      `We've sent you ${amount} for ${rows.length} ${rows.length === 1 ? "session" : "sessions"}. Reference: ${transfer.reference}. Your statement is in Invoices.`,
      `${PHYSIO_BILLING}#payouts`
    );
    if (!transfer.statementEmailedAt) await emailStatement(ctx, (await ctx.db.get(transfer._id))!);
  } else {
    // The physio sees a plain message; the exact reason is for admins
    await notifyUser(
      ctx,
      transfer.userId,
      "payout_failed",
      "Payout didn't go through",
      `Your payout of ${amount} didn't reach your bank. We're sorting it out and will send it again. If your bank details have changed, update them in Settings → Payouts.`,
      PHYSIO_PAYOUT_SETTINGS,
      "high"
    );
  }
  await refreshRunTotals(ctx, transfer.runId);
  return true;
}

// ── Crons ──

/** Fridays, 07:00 Lagos: prepare the week's run for an admin to review and pay. */
export const prepareWeeklyPayoutRun = internalMutation({
  args: {},
  handler: async (ctx) => {
    const result = await prepareRun(ctx, Date.now());
    if (result.lineCount > 0) {
      await notifyAdmins(
        ctx,
        "This week's payout run is ready",
        `${result.physioCount} ${result.physioCount === 1 ? "physio" : "physios"}, ${koboToNaira(result.totalKobo)} in total. Review it and press Pay all.`,
        ADMIN_PAYOUTS
      );
    }
    return result;
  },
});

/** Hourly: one reminder when a session note is more than 24 hours late. */
export const sendPayoutNoteNudges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("payouts")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(RUN_READ_CAP);
    let nudged = 0;
    for (const payout of pending) {
      if (nudged >= 200) break;
      if (!payoutNeedsNote(payout) || payout.noteNudgedAt || now < payout.createdAt + NOTE_DUE_MS) continue;
      const appointment = payout.appointmentId ? await ctx.db.get(payout.appointmentId) : null;
      // Checked once either way: a note already written needs no reminder
      await ctx.db.patch(payout._id, { noteNudgedAt: now });
      if (!appointment || (await firstSessionNoteAt(ctx, appointment)) !== null) continue;
      const patient = await ctx.db.get(appointment.patientId);
      await notifyUser(
        ctx,
        payout.userId,
        "payout_note_due",
        "Write your session note",
        `Your note for ${patientShort(patient)}'s session on ${shortDate(appointment.startTime)} is overdue. Write it so your payout of ${koboToNaira(payout.amount)} can move on: it's paid 48 hours after the note, in the next Friday run.`,
        `/dashboard/physiotherapist/patients/${appointment.patientId}?tab=notes`,
        "high"
      );
      nudged += 1;
    }
    return { nudged };
  },
});

// ── Admin: the run ──

/** Prepare or refresh the draft run now (the cron does this every Friday). */
export const adminPrepareRun = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    return prepareRun(ctx, Date.now());
  },
});

/**
 * A run with each physio's lines and total: the draft by default, else the newest run, or the
 * run asked for. Patients are shown by Rehabify ID, as on every finance screen.
 */
export const adminGetRun = query({
  args: { runId: v.optional(v.id("payoutRuns")) },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const now = Date.now();
    const run = args.runId
      ? await ctx.db.get(args.runId)
      : ((await draftRun(ctx)) ?? (await ctx.db.query("payoutRuns").order("desc").first()));
    const nextFriday = nextRunFriday(now);
    if (!run) return { run: null, groups: [], nextFriday };

    const lines = await ctx.db
      .query("payouts")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .take(RUN_READ_CAP);
    const transfers = await ctx.db
      .query("payoutRunTransfers")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .take(500);

    const describeLine = async (p: Doc<"payouts">) => {
      const d = await describePayout(ctx, p);
      return {
        _id: p._id,
        amountKobo: p.amount,
        status: p.status,
        reason: p.reason ?? "session",
        service: d.service,
        sessionAt: d.sessionAt,
        patientUserId: d.patient?._id ?? null,
        patientNumber: d.patient?.patientNumber ?? null,
      };
    };
    const physio = async (userId: Id<"users">) => {
      const user = await ctx.db.get(userId);
      return { userId, name: personName(user), email: user?.email ?? "" };
    };

    let groups;
    if (run.status === "draft") {
      const byUser = new Map<Id<"users">, Doc<"payouts">[]>();
      for (const p of lines) {
        if (p.status !== "pending") continue;
        byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);
      }
      groups = await Promise.all(
        [...byUser.entries()].map(async ([userId, rows]) => {
          const bank = await payoutBankAccount(ctx, userId);
          return {
            ...(await physio(userId)),
            totalKobo: sumKobo(rows),
            bank: bank ? { bankName: bank.bankName, accountName: bank.accountName, last4: bank.accountNumber.slice(-4) } : null,
            lines: await Promise.all(rows.sort((a, b) => (a.sessionAt ?? a.createdAt) - (b.sessionAt ?? b.createdAt)).map(describeLine)),
            transfer: null,
          };
        })
      );
    } else {
      const byId = new Map(lines.map((p) => [p._id, p]));
      groups = await Promise.all(
        transfers.map(async (t) => {
          const rows = t.payoutIds.map((id) => byId.get(id)).filter((p): p is Doc<"payouts"> => Boolean(p && p.runTransferId === t._id));
          return {
            ...(await physio(t.userId)),
            totalKobo: t.amountKobo,
            bank: t.bankName ? { bankName: t.bankName, accountName: t.accountName ?? "", last4: t.accountLast4 ?? "" } : null,
            lines: await Promise.all(rows.map(describeLine)),
            transfer: {
              _id: t._id,
              status: t.status,
              reference: t.reference,
              failureReason: t.failureReason ?? null,
              attempts: t.attempts,
              sentAt: t.sentAt ?? null,
              completedAt: t.completedAt ?? null,
              statementEmailedAt: t.statementEmailedAt ?? null,
            },
          };
        })
      );
    }
    groups.sort((a, b) => b.totalKobo - a.totalKobo);
    const paidBy = run.paidBy ? await ctx.db.get(run.paidBy) : null;
    return {
      run: { ...run, paidByName: paidBy ? personName(paidBy) : null },
      groups,
      nextFriday,
    };
  },
});

/** Past and current runs, newest first. */
export const adminListRuns = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const runs = await ctx.db.query("payoutRuns").order("desc").take(40);
    return runs.map((r) => ({
      _id: r._id,
      weekOf: r.weekOf,
      status: r.status,
      totalKobo: r.totalKobo,
      paidKobo: r.paidKobo ?? 0,
      failedKobo: r.failedKobo ?? 0,
      physioCount: r.physioCount,
      lineCount: r.lineCount,
      payStartedAt: r.payStartedAt ?? null,
      paidAt: r.paidAt ?? null,
    }));
  },
});

/** Payouts not in the draft run: waiting for a note, in their 48 hours, on hold, or newly Available. */
export const adminListWaiting = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const now = Date.now();
    const draft = await draftRun(ctx);
    const pending = (
      await ctx.db
        .query("payouts")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .take(1000)
    ).filter((p) => p.type === "physiotherapist_earning" && !(draft && p.runId === draft._id));
    const users = new Map<Id<"users">, Doc<"users"> | null>();
    const getUser = async (id: Id<"users">) => {
      if (!users.has(id)) users.set(id, await ctx.db.get(id));
      return users.get(id) ?? null;
    };
    const rows = await Promise.all(
      pending.map(async (p) => {
        const info = await stageOf(ctx, p, now);
        const d = await describePayout(ctx, p);
        const physio = await getUser(p.userId);
        return {
          _id: p._id,
          stage: info.stage,
          amountKobo: p.amount,
          reason: p.reason ?? "session",
          service: d.service,
          sessionAt: d.sessionAt,
          createdAt: p.createdAt,
          noteDueAt: info.noteDueAt,
          noteOverdue: info.noteOverdue,
          availableAt: info.availableAt,
          heldReason: info.heldReason,
          heldSource: p.heldSource ?? (info.concern ? "patient_concern" : null),
          heldAt: p.heldAt ?? info.concern?.createdAt ?? null,
          concern: info.concern ? { message: info.concern.message, createdAt: info.concern.createdAt } : null,
          takenOutOfRun: Boolean(draft && p.skipRunId === draft._id),
          physio: { userId: p.userId, name: personName(physio), email: physio?.email ?? "" },
          patientUserId: d.patient?._id ?? null,
          patientNumber: d.patient?.patientNumber ?? null,
        };
      })
    );
    return { rows, draftRunId: draft?._id ?? null, nextFriday: nextRunFriday(now) };
  },
});

async function requireDraftLine(ctx: MutationCtx, payoutId: Id<"payouts">) {
  const payout = await ctx.db.get(payoutId);
  if (!payout) throw new ConvexError("Payout not found.");
  const run = payout.runId ? await ctx.db.get(payout.runId) : null;
  if (!run || run.status !== "draft" || payout.status !== "pending") throw new ConvexError("This payout isn't in a run you can still change.");
  return { payout, run };
}

/** Take a line out of the draft run. It stays Available and goes into next week's run. */
export const adminRemoveFromRun = mutation({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const { payout, run } = await requireDraftLine(ctx, args.payoutId);
    await ctx.db.patch(payout._id, { runId: undefined, skipRunId: run._id, updatedBy: admin._id, updatedAt: Date.now() });
    await refreshRunTotals(ctx, run._id);
    return { success: true };
  },
});

/** Put an Available payout into the draft run (e.g. one taken out, or released after a hold). */
export const adminAddToRun = mutation({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const payout = await ctx.db.get(args.payoutId);
    if (!payout || payout.type !== "physiotherapist_earning") throw new ConvexError("Payout not found.");
    const run = await draftRun(ctx);
    if (!run) throw new ConvexError("There's no run waiting to be paid. Prepare one first.");
    const { stage } = await stageOf(ctx, payout, Date.now());
    if (stage !== "available") throw new ConvexError("Only Available payouts can go into a run.");
    await ctx.db.patch(payout._id, { runId: run._id, skipRunId: undefined, updatedBy: admin._id, updatedAt: Date.now() });
    await refreshRunTotals(ctx, run._id);
    return { success: true };
  },
});

/** Hold a payout with a reason the physio sees. It leaves the draft run until released. */
export const adminHoldPayout = mutation({
  args: { payoutId: v.id("payouts"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new ConvexError("Payout not found.");
    if (payout.status !== "pending") throw new ConvexError("Only payouts that haven't been sent can be held.");
    if (payout.heldAt !== undefined) throw new ConvexError("This payout is already on hold.");
    const reason = cleanText(args.reason, 300);
    if (!reason) throw new ConvexError("Say why it's on hold. The physio sees this.");
    await placeOnHold(ctx, payout, { reason, source: "admin", by: admin._id });
    const d = await describePayout(ctx, payout);
    await notifyUser(
      ctx,
      payout.userId,
      "payout_on_hold",
      "Payout on hold",
      `Your payout of ${koboToNaira(payout.amount)}${d.sessionAt ? ` for the session on ${shortDate(d.sessionAt)}` : ""} is on hold: ${reason}`,
      `${PHYSIO_BILLING}#payouts`,
      "high"
    );
    return { success: true };
  },
});

/** Release a held payout (an admin's hold or a patient's concern, which is resolved with it). */
export const adminReleasePayout = mutation({
  args: { payoutId: v.id("payouts"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new ConvexError("Payout not found.");
    if (payout.status !== "pending") throw new ConvexError("Only payouts that haven't been sent can be released.");
    const concern = await openConcernFor(ctx, payout.appointmentId);
    if (payout.heldAt === undefined && !concern) throw new ConvexError("This payout isn't on hold.");
    const now = Date.now();
    const release = {
      heldAt: undefined,
      heldReason: undefined,
      heldBy: undefined,
      heldSource: undefined,
      releasedAt: now,
      releasedBy: admin._id,
      updatedAt: now,
    };
    await ctx.db.patch(payout._id, release);
    if (concern) {
      await ctx.db.patch(concern._id, { status: "resolved", resolution: cleanText(args.note, 500), resolvedAt: now, resolvedBy: admin._id });
      // Anything else held for the same session's concern is released with it
      const siblings = await ctx.db
        .query("payouts")
        .withIndex("by_appointment", (q) => q.eq("appointmentId", concern.appointmentId))
        .take(10);
      for (const p of siblings) {
        if (p._id !== payout._id && p.status === "pending" && p.heldSource === "patient_concern") await ctx.db.patch(p._id, release);
      }
    }
    await notifyUser(
      ctx,
      payout.userId,
      "payout_released",
      "Payout no longer on hold",
      `Your payout of ${koboToNaira(payout.amount)} is no longer on hold. It's paid in a Friday run once it's Available.`,
      `${PHYSIO_BILLING}#payouts`
    );
    // Available already and a run is waiting: it joins that run
    const fresh = (await ctx.db.get(payout._id))!;
    const { stage } = await stageOf(ctx, fresh, now);
    const draft = stage === "available" ? await draftRun(ctx) : null;
    if (draft) {
      await ctx.db.patch(payout._id, { runId: draft._id, skipRunId: undefined });
      await refreshRunTotals(ctx, draft._id);
    }
    return { success: true, stage, joinedRun: Boolean(draft) };
  },
});

// ── Admin: Pay all ──

/** Locks the draft run and creates one transfer per physio. Called by adminPayRun only. */
export const beginRunPayment = internalMutation({
  args: { runId: v.id("payoutRuns") },
  handler: async (ctx, args): Promise<{ items: SendItem[]; skipped: Skipped[] }> => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const run = await ctx.db.get(args.runId);
    if (!run) throw new ConvexError("Run not found.");
    if (run.status !== "draft") throw new ConvexError("This run has already been paid, or is being paid now.");
    const now = Date.now();

    // Check every line again: a concern or a hold since the run was prepared takes it out
    const lines = await ctx.db
      .query("payouts")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .take(RUN_READ_CAP);
    const byUser = new Map<Id<"users">, Doc<"payouts">[]>();
    for (const p of lines) {
      if (p.status !== "pending") continue;
      const { stage } = await stageOf(ctx, p, now);
      if (stage !== "available") {
        await ctx.db.patch(p._id, { runId: undefined });
        continue;
      }
      byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);
    }
    if (byUser.size === 0) throw new ConvexError("There's nothing to pay in this run.");

    const items: SendItem[] = [];
    const skipped: Skipped[] = [];
    const leaveRun: Doc<"payouts">[] = [];
    for (const [userId, rows] of byUser) {
      const user = await ctx.db.get(userId);
      const name = personName(user);
      const bank = await payoutBankAccount(ctx, userId);
      const amountKobo = sumKobo(rows);
      if (!bank || amountKobo <= 0) {
        // Stays Available for the next run once they add an account
        skipped.push({ name, reason: bank ? "Nothing to pay" : "No verified payout account" });
        leaveRun.push(...rows);
        continue;
      }
      const reference = newReference(run.weekOf);
      const transferId = await ctx.db.insert("payoutRunTransfers", {
        runId: run._id,
        userId,
        payoutIds: rows.map((p) => p._id),
        amountKobo,
        status: "sending",
        reference,
        attempts: 1,
        bankName: bank.bankName,
        accountName: bank.accountName,
        accountLast4: bank.accountNumber.slice(-4),
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      });
      for (const p of rows) {
        await applyPayoutStatus(ctx, p, "processing", { transferReference: reference, updatedBy: admin._id, notify: false });
        await ctx.db.patch(p._id, { runTransferId: transferId });
      }
      items.push({
        transferId,
        userId,
        name,
        reference,
        amountKobo,
        weekOf: run.weekOf,
        bank: { accountName: bank.accountName, accountNumber: bank.accountNumber, bankCode: bank.bankCode },
        recipientCode: await savedRecipient(ctx, userId, bank),
      });
    }
    if (items.length === 0) {
      throw new ConvexError(`No one in this run has a verified payout account: ${skipped.map((s) => s.name).join(", ")}.`);
    }
    for (const p of leaveRun) await ctx.db.patch(p._id, { runId: undefined });
    await ctx.db.patch(run._id, { status: "paying", payStartedAt: now, paidBy: admin._id, updatedAt: now });
    await refreshRunTotals(ctx, run._id);
    return { items, skipped };
  },
});

/** Sends a failed transfer again with a new reference. Called by adminRetryRunTransfer only. */
export const beginTransferRetry = internalMutation({
  args: { transferId: v.id("payoutRunTransfers") },
  handler: async (ctx, args): Promise<SendItem> => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) throw new ConvexError("Transfer not found.");
    if (transfer.status !== "failed" && transfer.status !== "reversed") throw new ConvexError("Only failed transfers can be retried.");
    const run = await ctx.db.get(transfer.runId);
    if (!run) throw new ConvexError("Run not found.");
    const rows = (await Promise.all(transfer.payoutIds.map((id) => ctx.db.get(id)))).filter(
      (p): p is Doc<"payouts"> => p !== null && p.runTransferId === transfer._id && p.status === "failed"
    );
    if (rows.length === 0) throw new ConvexError("These payouts were moved back to the queue. They'll be paid in the next run.");
    const user = await ctx.db.get(transfer.userId);
    const bank = await payoutBankAccount(ctx, transfer.userId);
    if (!bank) throw new ConvexError(`${personName(user)} has no verified payout account. Ask them to add one in Settings → Payouts.`);
    const now = Date.now();
    const reference = newReference(run.weekOf);
    const amountKobo = sumKobo(rows);
    await ctx.db.patch(transfer._id, {
      status: "sending",
      reference,
      payoutIds: rows.map((p) => p._id),
      amountKobo,
      attempts: transfer.attempts + 1,
      transferCode: undefined,
      failureReason: undefined,
      completedAt: undefined,
      bankName: bank.bankName,
      accountName: bank.accountName,
      accountLast4: bank.accountNumber.slice(-4),
      sentAt: now,
      updatedAt: now,
    });
    for (const p of rows) {
      await applyPayoutStatus(ctx, p, "processing", { transferReference: reference, updatedBy: admin._id, notify: false });
      await ctx.db.patch(p._id, { failureReason: undefined });
    }
    await refreshRunTotals(ctx, run._id);
    return {
      transferId: transfer._id,
      userId: transfer.userId,
      name: personName(user),
      reference,
      amountKobo,
      weekOf: run.weekOf,
      bank: { accountName: bank.accountName, accountNumber: bank.accountNumber, bankCode: bank.bankCode },
      recipientCode: await savedRecipient(ctx, transfer.userId, bank),
    };
  },
});

export const savePayoutRecipient = internalMutation({
  args: { userId: v.id("users"), bankCode: v.string(), accountNumber: v.string(), recipientCode: v.string() },
  handler: async (ctx, args) => {
    if (await savedRecipient(ctx, args.userId, args)) return null;
    await ctx.db.insert("payoutRecipients", { ...args, paystackMode: currentPaystackMode(), createdAt: Date.now() });
    return null;
  },
});

export const recordRunTransferState = internalMutation({
  args: {
    transferId: v.id("payoutRunTransfers"),
    state: v.union(v.literal("pending"), v.literal("otp_required"), v.literal("success"), v.literal("failed"), v.literal("reversed")),
    transferCode: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const transfer = await ctx.db.get(args.transferId);
    if (transfer) await settleRunTransfer(ctx, transfer, args.state, { transferCode: args.transferCode, reason: args.reason });
    return null;
  },
});

export const getRunTransferForAdmin = internalQuery({
  args: { transferId: v.id("payoutRunTransfers") },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    return ctx.db.get(args.transferId);
  },
});

const paystackSecret = () => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new ConvexError("Payments aren't set up yet (PAYSTACK_SECRET_KEY is missing).");
  return secret;
};

/** Paystack's transfer status in our words. */
function transferStateFrom(status: string | undefined): TransferState {
  if (status === "success") return "success";
  if (status === "otp") return "otp_required";
  if (status === "reversed") return "reversed";
  if (status === "failed" || status === "abandoned" || status === "blocked" || status === "rejected") return "failed";
  return "pending"; // pending, queued, received, processing
}

/**
 * Sends one physio's transfer. Never throws: every outcome is recorded on the transfer. Only a
 * clear refusal from Paystack (a 4xx answer) counts as failed; a timeout or 5xx may still have
 * gone through, so it stays pending for the webhook or "Check on Paystack".
 */
async function sendRunTransfer(ctx: ActionCtx, item: SendItem): Promise<TransferState> {
  const record = async (state: TransferState, extra: { transferCode?: string; reason?: string } = {}) => {
    try {
      await ctx.runMutation(refs.recordRunTransferState, { transferId: item.transferId, state, ...extra });
    } catch (error) {
      console.error("payout_transfer_record_failed", { transferId: item.transferId, state, error: errorMessage(error) });
    }
    return state;
  };

  let secret: string;
  try {
    secret = paystackSecret();
  } catch (error) {
    return record("failed", { reason: errorMessage(error) });
  }

  let recipient = item.recipientCode;
  if (!recipient) {
    try {
      const data = await paystackRequest("/transferrecipient", {
        method: "POST",
        body: JSON.stringify({
          type: "nuban",
          name: item.bank.accountName,
          account_number: item.bank.accountNumber,
          bank_code: item.bank.bankCode,
          currency: "NGN",
          description: "Rehabify physio payouts",
        }),
      });
      recipient = typeof data?.recipient_code === "string" ? data.recipient_code : null;
      if (!recipient) throw new Error("Paystack didn't return a transfer recipient.");
      await ctx.runMutation(refs.savePayoutRecipient, {
        userId: item.userId,
        bankCode: item.bank.bankCode,
        accountNumber: item.bank.accountNumber,
        recipientCode: recipient,
      });
    } catch (error) {
      // Nothing was sent
      return record("failed", { reason: `Couldn't set up the bank account on Paystack: ${errorMessage(error)}` });
    }
  }

  let response: Response;
  let data: { status?: boolean; message?: string; data?: { status?: string; transfer_code?: string } } | null;
  try {
    response = await fetch(`${PAYSTACK_API}/transfer`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        source: "balance",
        currency: "NGN",
        amount: item.amountKobo,
        recipient,
        reference: item.reference,
        reason: `Rehabify payouts, ${fridayLabel(item.weekOf)}`,
      }),
    });
    data = await response.json().catch(() => null);
  } catch (error) {
    return record("pending", { reason: `Outcome unknown (${errorMessage(error)}). Check it on Paystack before paying again.` });
  }
  if (!response.ok || !data?.status) {
    const refused = data !== null && response.status >= 400 && response.status < 500;
    return refused
      ? record("failed", { reason: data?.message || `Paystack refused the transfer (HTTP ${response.status}).` })
      : record("pending", { reason: `Outcome unknown (HTTP ${response.status}). Check it on Paystack before paying again.` });
  }
  const state = transferStateFrom(data.data?.status);
  return record(state, {
    transferCode: data.data?.transfer_code,
    reason: state === "failed" ? data.message || "Paystack reported that the transfer failed." : undefined,
  });
}

type PayResult = {
  sent: number;
  pending: number;
  otp: number;
  failed: number;
  skipped: Skipped[];
  message: string;
};

function summarise(states: TransferState[], skipped: Skipped[]): PayResult {
  const count = (pick: (s: TransferState) => boolean) => states.filter(pick).length;
  const sent = count((s) => s === "success");
  const pending = count((s) => s === "pending");
  const otp = count((s) => s === "otp_required");
  const failed = count((s) => s === "failed" || s === "reversed");
  const parts = [
    sent && `${sent} sent`,
    pending && `${pending} waiting for the bank`,
    otp && `${otp} need an OTP`,
    failed && `${failed} failed`,
    skipped.length && `${skipped.length} skipped (no payout account)`,
  ].filter(Boolean);
  return { sent, pending, otp, failed, skipped, message: parts.join(", ") || "Nothing was sent." };
}

/**
 * Pay all: one Paystack transfer per physio in the run, for their total. Payouts are marked paid
 * only when Paystack confirms each transfer, never just because it was requested.
 */
export const adminPayRun = action({
  args: { runId: v.id("payoutRuns") },
  handler: async (ctx, args): Promise<PayResult> => {
    paystackSecret();
    const begun = await ctx.runMutation(refs.beginRunPayment, { runId: args.runId });
    const states: TransferState[] = [];
    for (let i = 0; i < begun.items.length; i += SEND_CONCURRENCY) {
      const batch = begun.items.slice(i, i + SEND_CONCURRENCY);
      states.push(...(await Promise.all(batch.map((item) => sendRunTransfer(ctx, item)))));
    }
    return summarise(states, begun.skipped);
  },
});

/** Send a failed transfer again (new reference), e.g. after topping up the balance or a bank fix. */
export const adminRetryRunTransfer = action({
  args: { transferId: v.id("payoutRunTransfers") },
  handler: async (ctx, args): Promise<PayResult> => {
    paystackSecret();
    const item = await ctx.runMutation(refs.beginTransferRetry, { transferId: args.transferId });
    return summarise([await sendRunTransfer(ctx, item)], []);
  },
});

/** Ask Paystack what happened to a transfer that's still waiting (no webhook, or a timeout). */
export const adminCheckRunTransfer = action({
  args: { transferId: v.id("payoutRunTransfers") },
  handler: async (ctx, args): Promise<{ state: TransferState; message: string }> => {
    const secret = paystackSecret();
    const transfer = await ctx.runQuery(refs.getRunTransferForAdmin, { transferId: args.transferId });
    if (!transfer) throw new ConvexError("Transfer not found.");
    if (transfer.status === "success" || transfer.status === "failed" || transfer.status === "reversed") {
      return { state: transfer.status, message: "This transfer is already settled." };
    }
    const response = await fetch(`${PAYSTACK_API}/transfer/verify/${encodeURIComponent(transfer.reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
      data?: { status?: string; transfer_code?: string };
    } | null;
    if (response.status === 404 || (data?.status === false && /not found/i.test(data.message ?? ""))) {
      await ctx.runMutation(refs.recordRunTransferState, {
        transferId: transfer._id,
        state: "failed",
        reason: "Paystack has no record of this transfer, so nothing was sent.",
      });
      return { state: "failed", message: "Paystack has no record of it, so nothing was sent. You can retry it." };
    }
    if (!response.ok || !data?.status) throw new ConvexError(data?.message || `Paystack returned HTTP ${response.status}.`);
    const state = transferStateFrom(data.data?.status);
    await ctx.runMutation(refs.recordRunTransferState, { transferId: transfer._id, state, transferCode: data.data?.transfer_code });
    return { state, message: `Paystack says this transfer is ${data.data?.status ?? "unknown"}.` };
  },
});

/** Authorise a transfer with the OTP Paystack sent (only when OTP for transfers is switched on). */
export const adminFinalizeRunTransfer = action({
  args: { transferId: v.id("payoutRunTransfers"), otp: v.string() },
  handler: async (ctx, args): Promise<{ state: TransferState }> => {
    paystackSecret();
    const transfer = await ctx.runQuery(refs.getRunTransferForAdmin, { transferId: args.transferId });
    if (!transfer || transfer.status !== "otp_required" || !transfer.transferCode) {
      throw new ConvexError("This transfer isn't waiting for an OTP.");
    }
    const data = await paystackRequest("/transfer/finalize_transfer", {
      method: "POST",
      body: JSON.stringify({ transfer_code: transfer.transferCode, otp: args.otp.trim() }),
    });
    const state = transferStateFrom(typeof data?.status === "string" ? data.status : undefined);
    const settled: TransferState = state === "otp_required" ? "pending" : state;
    await ctx.runMutation(refs.recordRunTransferState, { transferId: transfer._id, state: settled });
    return { state: settled };
  },
});

/**
 * Paystack transfer webhooks for physio payouts ("rhpo_" references; partner payouts go to
 * monthlySettlements). The signature is checked here, inside Convex.
 */
export const recordPayoutTransferWebhook = mutation({
  args: { rawBody: v.string(), signature: v.string() },
  handler: async (ctx, args) => {
    if (!(await verifyPaystackSignature(args.rawBody, args.signature))) throw new Error("Invalid Paystack webhook signature");
    let payload: { event?: string; data?: Record<string, unknown> };
    try {
      payload = JSON.parse(args.rawBody);
    } catch {
      throw new Error("Invalid webhook payload");
    }
    const event = payload.event ?? "";
    const data = payload.data ?? {};
    const reference = typeof data.reference === "string" ? data.reference : "";
    if (!["transfer.success", "transfer.failed", "transfer.reversed"].includes(event) || !reference) return { handled: false };
    const transfer =
      (await ctx.db
        .query("payoutRunTransfers")
        .withIndex("by_reference", (q) => q.eq("reference", reference))
        .first()) ??
      (await ctx.db
        .query("payoutRunTransfers")
        .withIndex("by_reference", (q) => q.eq("reference", reference.toLowerCase()))
        .first());
    if (!transfer) return { handled: false };
    const state: TransferState = event === "transfer.success" ? "success" : event === "transfer.reversed" ? "reversed" : "failed";
    const changed = await settleRunTransfer(ctx, transfer, state, {
      transferCode: typeof data.transfer_code === "string" ? data.transfer_code : undefined,
    });
    return { handled: true, kind: "physio_payout", state, changed };
  },
});

// ── Physio: their payouts screen ──

/**
 * The signed-in physio's payouts by stage, and their statements. Only payout amounts, never what
 * the patient paid. Independent physios never see Rehabify payouts, so they get null.
 */
export const getMyPayouts = query({
  args: {},
  handler: async (ctx) => {
    const user = await ensureUserRole(ctx, ["physiotherapist"]);
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();
    if (isIndependentPractice(profile)) return null;
    const now = Date.now();

    const rows = (
      await ctx.db
        .query("payouts")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(300)
    ).filter((p) => p.type === "physiotherapist_earning");
    const draft = await draftRun(ctx);
    // Payouts being sent or failed in a Friday run show on that run's statement instead
    const open = rows.filter((p) => p.status === "pending" || !p.runTransferId).filter((p) => p.status !== "completed");
    // Paid by hand (not in a run): listed with the statements
    const paidByHand = rows.filter((p) => p.status === "completed" && !p.runTransferId).slice(0, 20);

    const lines = await Promise.all(
      [...open, ...paidByHand].map(async (p) => {
        const info = await stageOf(ctx, p, now);
        const d = await describePayout(ctx, p);
        return {
          _id: p._id,
          stage: info.stage,
          amountKobo: p.amount,
          reason: p.reason ?? "session",
          patient: patientShort(d.patient),
          service: d.service,
          sessionAt: d.sessionAt,
          noteDueAt: info.noteDueAt,
          noteOverdue: info.noteOverdue,
          availableAt: info.availableAt,
          heldReason: info.heldReason,
          runWeekOf: draft && p.runId === draft._id ? draft.weekOf : null,
          writeNoteHref:
            info.stage === "awaiting_note" && d.appointment ? `/dashboard/physiotherapist/patients/${d.appointment.patientId}?tab=notes` : null,
          completedAt: p.completedAt ?? null,
          transferReference: p.transferReference ?? null,
        };
      })
    );

    const transfers = await ctx.db
      .query("payoutRunTransfers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(12);
    const statements = await Promise.all(
      transfers.map(async (t) => {
        const run = await ctx.db.get(t.runId);
        return {
          _id: t._id,
          weekOf: run?.weekOf ?? null,
          status: t.status,
          amountKobo: t.amountKobo,
          reference: t.reference,
          sentAt: t.sentAt ?? null,
          completedAt: t.completedAt ?? null,
          bankName: t.bankName ?? null,
          accountLast4: t.accountLast4 ?? null,
          lines: (await statementLines(ctx, t)).map(({ patient, service, sessionAt, amountKobo }) => ({ patient, service, sessionAt, amountKobo })),
        };
      })
    );

    const bank = await payoutBankAccount(ctx, user._id);
    return {
      bank: bank ? { bankName: bank.bankName, accountName: bank.accountName, last4: bank.accountNumber.slice(-4) } : null,
      nextRunFriday: nextRunFriday(now),
      lines,
      statements,
    };
  },
});

// ── Patient: a concern about a session (Payment Policy 4.6) ──

async function concernTarget(ctx: QueryCtx | MutationCtx, appointmentId: Id<"appointments">, patientId: Id<"users">) {
  const appointment = await ctx.db.get(appointmentId);
  if (!appointment || appointment.patientId !== patientId || appointment.status !== "completed") return null;
  const booking = await ctx.db
    .query("marketplaceBookings")
    .withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId))
    .first();
  const payouts = await ctx.db
    .query("payouts")
    .withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId))
    .take(10);
  // Rehabify Care: booked through Rehabify, or Rehabify holds a payout for it
  if (!booking && !payouts.some((p) => p.type === "physiotherapist_earning")) return null;
  return { appointment, booking, payouts };
}

/** Whether the patient can still report a problem with this visit. */
export const getSessionConcernState = query({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => {
    const user = await ensureUserRole(ctx, ["patient"]);
    const target = await concernTarget(ctx, args.appointmentId, user._id);
    if (!target) return null;
    const existing = await ctx.db
      .query("sessionConcerns")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", args.appointmentId))
      .first();
    const deadline = target.appointment.endTime + CONCERN_WINDOW_MS;
    return { reported: Boolean(existing), canReport: !existing && Date.now() <= deadline, deadline };
  },
});

/** The patient reports a problem with a completed Rehabify Care visit: its payout is held and admins are told. */
export const reportSessionProblem = mutation({
  args: { appointmentId: v.id("appointments"), message: v.string() },
  handler: async (ctx, args) => {
    const user = await ensureUserRole(ctx, ["patient"]);
    const target = await concernTarget(ctx, args.appointmentId, user._id);
    if (!target) throw new ConvexError("You can only report a problem with a completed Rehabify Care visit.");
    const { appointment, booking } = target;
    const now = Date.now();
    if (now > appointment.endTime + CONCERN_WINDOW_MS) throw new ConvexError("Problems can be reported up to 7 days after a visit.");
    const existing = await ctx.db
      .query("sessionConcerns")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
      .first();
    if (existing) throw new ConvexError("You've already reported a problem with this visit. We'll be in touch.");
    const message = cleanText(args.message, 1000);
    if (!message || message.length < 5) throw new ConvexError("Tell us briefly what went wrong.");

    await ctx.db.insert("sessionConcerns", {
      appointmentId: appointment._id,
      patientId: user._id,
      physiotherapistId: appointment.physiotherapistId,
      message,
      status: "open",
      createdAt: now,
    });

    // Hold the session's payout: rows for this appointment, and older rows on the booking's invoice
    const linked = [...target.payouts];
    if (booking?.invoiceId) {
      const invoiceId = booking.invoiceId;
      const onInvoice = await ctx.db
        .query("payouts")
        .withIndex("by_payout_invoice_id", (q) => q.eq("invoiceId", invoiceId))
        .take(10);
      for (const p of onInvoice) if (!p.appointmentId && !linked.some((l) => l._id === p._id)) linked.push(p);
    }
    let held = 0;
    let alreadySent = false;
    for (const p of linked) {
      if (p.type !== "physiotherapist_earning") continue;
      if (p.status === "pending") {
        if (p.heldAt === undefined) await placeOnHold(ctx, p, { reason: PATIENT_CONCERN_REASON, source: "patient_concern" });
        held += 1;
        await notifyUser(
          ctx,
          p.userId,
          "payout_on_hold",
          "Payout on hold",
          `Your payout of ${koboToNaira(p.amount)} for the session on ${shortDate(appointment.startTime)} is on hold. ${PATIENT_CONCERN_REASON}`,
          `${PHYSIO_BILLING}#payouts`,
          "high"
        );
      } else if (p.status === "processing" || p.status === "completed") {
        alreadySent = true;
      }
    }

    const physio = appointment.physiotherapistId ? await ctx.db.get(appointment.physiotherapistId) : null;
    const payoutNote = held
      ? "The payout is on hold until you release it."
      : alreadySent
        ? "The payout was already sent."
        : "There's no payout for it yet; it will show as on hold when it's created.";
    await notifyAdmins(
      ctx,
      "A patient reported a problem with a session",
      `Patient ${user.patientNumber ?? "(no ID)"} reported a problem with their session on ${shortDate(appointment.startTime)} with ${personName(physio)}: "${message.slice(0, 200)}". ${payoutNote}`,
      `${ADMIN_PAYOUTS}?tab=waiting`
    );
    return { success: true, message: "Thanks for telling us. The Rehabify team will look into it and get back to you." };
  },
});
