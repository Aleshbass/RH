/**
 * Money routing settings (Admin › Finance › Money routing). The rules for which checkout sends
 * what where are in helpers/paystackRouting.ts; this module keeps the one settings row:
 *   - Rehabify's own bank account as a Paystack sub-account (made here, percentage_charge 0);
 *   - the switch "Send Rehabify's share to this bank account" (off by default; it only turns on
 *     when the sub-account was made with the current Paystack key).
 * Full admins only (scripts/admin-access/gen-function-pages.mjs FULL_ONLY): this decides where
 * Rehabify's revenue is paid, so restricted admins can't change it.
 *
 * Turn the switch on only after Paystack keeps the main account's settlements in the Paystack
 * balance (a Paystack setting, or ask Paystack support). Until then the main account's part still
 * settles to the bank, so both shares end up in the same bank account and nothing is gained.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ensureUserRole } from "./auth";
import { paystackRequest } from "./clinicBilling";
import { currentPaystackMode, type PaystackMode } from "./helpers/paystackMode";
import { assertServerCaller } from "./helpers/serverSecret";
import { adminAccessOf } from "./helpers/adminAccess";
import { insertNotification } from "./helpers/pushNotify";
import { randomString } from "./helpers/partnerShared";
import { zonedDateKey } from "./helpers/lagosTime";
import { plainTransferFailure } from "./helpers/transferFailure";
import {
  checkoutRoutingOf,
  cliniciansMoneyInBalanceKobo,
  heldBookingSplitFrom,
  poolPosition,
  routingRow,
  settleFeeSweep,
  splitProblemText,
  transferFeeKobo,
  type CheckoutRouting,
  type PaystackSplit,
  type PoolPosition,
  type SweepState,
} from "./helpers/paystackRouting";

// Self-references by name (the generated api type is at TypeScript's depth limit)
const refs = {
  access: makeFunctionReference<"query", Record<string, never>, { userId: Id<"users"> }>("paystackRouting:adminRoutingAccess"),
  save: makeFunctionReference<
    "mutation",
    {
      userId: Id<"users">;
      subaccountCode: string;
      bankCode: string;
      bankName: string;
      accountName: string;
      accountNumberLast4: string;
      paystackMode: PaystackMode;
      transferRecipientCode?: string;
    },
    null
  >("paystackRouting:saveRehabifyAccount"),
  accountForRecipient: makeFunctionReference<
    "query",
    Record<string, never>,
    { bankCode: string; accountName: string; last4: string; paystackMode: PaystackMode } | null
  >("paystackRouting:accountForRecipient"),
  saveRecipient: makeFunctionReference<"mutation", { userId: Id<"users">; recipientCode: string }, null>("paystackRouting:saveTransferRecipient"),
  sweepInfo: makeFunctionReference<"query", Record<string, never>, SweepInfo>("paystackRouting:feeSweepInfo"),
  beginSweep: makeFunctionReference<"mutation", { userId: Id<"users">; amountKobo: number }, { ledgerId: Id<"paystackPoolLedger">; reference: string }>(
    "paystackRouting:beginFeeSweep"
  ),
  sweepState: makeFunctionReference<
    "mutation",
    { ledgerId: Id<"paystackPoolLedger">; state: SweepState; transferCode?: string; reason?: string },
    null
  >("paystackRouting:recordFeeSweepState"),
  sweepForAdmin: makeFunctionReference<"query", { ledgerId: Id<"paystackPoolLedger"> }, Doc<"paystackPoolLedger"> | null>(
    "paystackRouting:feeSweepForAdmin"
  ),
};

const personName = (user: { firstName?: string; lastName?: string; email?: string } | null) =>
  user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "An admin" : null;

// ── For checkouts ────────────────────────────────────────────────────────────

/** Checkout actions read the routing through this (helpers/paystackRouting.ts loadRouting). */
export const routingForCheckout = internalQuery({
  args: {},
  handler: async (ctx): Promise<CheckoutRouting> => checkoutRoutingOf(await routingRow(ctx)),
});

/** Paystack refused a routed checkout, so it went ahead without the split: forget its routing record. */
async function forgetRoutedPayment(ctx: MutationCtx, reference: string | undefined) {
  if (!reference) return;
  const routed = await ctx.db
    .query("paystackRoutedPayments")
    .withIndex("by_reference", (q) => q.eq("reference", reference))
    .collect();
  for (const row of routed) await ctx.db.delete(row._id);
}

/** Kept on the settings row so the Money routing page shows that Paystack refused a routed checkout. */
export const recordSplitProblem = internalMutation({
  args: { source: v.string(), message: v.string(), reference: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await forgetRoutedPayment(ctx, args.reference);
    const row = await routingRow(ctx);
    if (!row) return null;
    await ctx.db.patch(row._id, {
      lastSplitProblem: { at: Date.now(), source: args.source.slice(0, 60), message: args.message.slice(0, 200) },
    });
    return null;
  },
});

/** The same, from our Next.js checkout routes (server secret). */
export const reportSplitProblem = mutation({
  args: { serverSecret: v.string(), source: v.string(), message: v.string(), reference: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertServerCaller(args.serverSecret);
    await forgetRoutedPayment(ctx, args.reference);
    const row = await routingRow(ctx);
    if (!row) return null;
    await ctx.db.patch(row._id, {
      lastSplitProblem: { at: Date.now(), source: args.source.slice(0, 60), message: splitProblemText(args.message) },
    });
    return null;
  },
});

/**
 * Records a checkout about to be sent with Rehabify's split (helpers/paystackRouting.ts
 * initializeWithRouting / chargeWithRouting), with what it leaves in the main account.
 */
export const recordRoutedPayment = internalMutation({
  args: { reference: v.string(), amountKobo: v.number(), keptKobo: v.number(), subaccountCode: v.string(), source: v.string() },
  handler: async (ctx, args) => {
    await insertRoutedPayment(ctx, { ...args });
    return null;
  },
});

async function insertRoutedPayment(
  ctx: MutationCtx,
  payment: { reference: string; amountKobo: number; keptKobo: number; subaccountCode: string; source: string; bookingId?: Id<"marketplaceBookings"> }
) {
  const existing = await ctx.db
    .query("paystackRoutedPayments")
    .withIndex("by_reference", (q) => q.eq("reference", payment.reference))
    .first();
  const row = {
    reference: payment.reference,
    // Something kept in the main account is a clinician's share; nothing kept is all Rehabify's
    kind: payment.keptKobo > 0 ? ("held_booking" as const) : ("rehabify_only" as const),
    amountKobo: Math.round(payment.amountKobo),
    keptKobo: Math.max(0, Math.round(payment.keptKobo)),
    subaccountCode: payment.subaccountCode,
    source: payment.source.slice(0, 60),
    paystackMode: currentPaystackMode(),
    bookingId: payment.bookingId,
    createdAt: Date.now(),
  };
  if (existing) await ctx.db.patch(existing._id, row);
  else await ctx.db.insert("paystackRoutedPayments", row);
}

/**
 * Superseded by bookingCheckoutRouting (which also records the split, so refunds of it are
 * counted). Kept so checkout routes deployed before it keep working, now without a split.
 */
export const bookingCheckoutSplit = query({
  args: { serverSecret: v.string(), bookingId: v.id("marketplaceBookings"), amountKobo: v.number() },
  handler: async (ctx, args): Promise<{ split: PaystackSplit; keyMode: PaystackMode }> => {
    assertServerCaller(args.serverSecret);
    return { split: {}, keyMode: currentPaystackMode() };
  },
});

/**
 * The split for a Rehabify Care booking checkout (app/api/payments/marketplace and the Joy booking
 * payment route), recorded before the route sends it: the physio's fixed share stays in the main
 * account (the balance that pays payout runs), the rest goes to Rehabify's sub-account
 * (helpers/paystackRouting.ts). Server routes only. `serverKeyMode` is the Paystack mode of the
 * route's own key: the split is only used when it matches Convex's key, since the sub-account
 * only exists in that mode. Anything unexpected returns no split (and records nothing), so the
 * checkout is exactly as before. If Paystack then refuses it, reportSplitProblem forgets it.
 */
export const bookingCheckoutRouting = mutation({
  args: {
    serverSecret: v.string(),
    bookingId: v.id("marketplaceBookings"),
    amountKobo: v.number(),
    reference: v.string(),
    source: v.string(),
    serverKeyMode: v.union(v.literal("test"), v.literal("live")),
  },
  handler: async (ctx, args): Promise<{ split: PaystackSplit }> => {
    assertServerCaller(args.serverSecret);
    if (args.serverKeyMode !== currentPaystackMode()) return { split: {} };
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.paymentStatus !== "pending") return { split: {} };
    // Only for the amount this booking really charges (the web route charges serviceAmount, Joy
    // totalAmount; with all-inclusive prices they're the same)
    const amount = Math.round(args.amountKobo);
    if (amount <= 0 || (amount !== booking.serviceAmount && amount !== booking.totalAmount)) return { split: {} };
    if (!/^[A-Za-z0-9_-]{6,100}$/.test(args.reference)) return { split: {} };
    // The physio's fixed payout (plus their travel share), the amount payout runs will send them
    const split = heldBookingSplitFrom(checkoutRoutingOf(await routingRow(ctx)), booking.physiotherapistEarnings, amount);
    if (!split.subaccount) return { split: {} };
    await insertRoutedPayment(ctx, {
      reference: args.reference,
      amountKobo: amount,
      keptKobo: split.transaction_charge ?? 0,
      subaccountCode: split.subaccount,
      source: args.source,
      bookingId: booking._id,
    });
    return { split };
  },
});

// ── Admin ────────────────────────────────────────────────────────────────────

/** Admin check for the actions below (actions can't read the user's role themselves). */
export const adminRoutingAccess = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await ensureUserRole(ctx, ["admin"], "paystackRouting:adminRoutingAccess");
    return { userId: user._id };
  },
});

/** What the Money routing page shows. No full account number: only the last 4 digits are stored. */
export const adminGetRouting = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"], "paystackRouting:adminGetRouting");
    const currentMode = currentPaystackMode();
    const row = await routingRow(ctx);
    if (!row) {
      return {
        currentMode,
        account: null,
        routingOn: false,
        routingActive: false,
        routingChangedAt: null,
        routingChangedByName: null,
        lastSplitProblem: null,
        routingOnSince: null,
        transfersReady: false,
      };
    }
    const usable = row.paystackMode === currentMode;
    const savedBy = row.updatedBy ? await ctx.db.get(row.updatedBy) : null;
    const changedBy = row.routingChangedBy ? await ctx.db.get(row.routingChangedBy) : null;
    return {
      currentMode,
      account: {
        bankName: row.bankName,
        accountName: row.accountName,
        last4: row.accountNumberLast4,
        paystackMode: row.paystackMode,
        savedAt: row.updatedAt,
        savedByName: personName(savedBy),
        // Made with the other Paystack key: checkouts can't use it until it's saved again
        usable,
      },
      routingOn: row.routingOn,
      // What checkouts actually do now
      routingActive: row.routingOn && usable,
      routingChangedAt: row.routingChangedAt ?? null,
      routingChangedByName: personName(changedBy),
      lastSplitProblem: row.lastSplitProblem ?? null,
      // Counted from here: fees waiting in the balance and partner payouts taken from it
      routingOnSince: usable ? row.routingOnSince ?? null : null,
      // Fees can be moved to this account by a Paystack transfer (recipient made with the current key)
      transfersReady: usableRecipient(row) !== null,
    };
  },
});

/** The transfer recipient for Rehabify's account, if it was made with the current Paystack key. */
function usableRecipient(row: Doc<"paystackRouting"> | null): string | null {
  if (!row?.transferRecipientCode || row.transferRecipientMode !== currentPaystackMode()) return null;
  return row.transferRecipientCode;
}

/** A Paystack transfer recipient for Rehabify's own bank account (for moving fees out of the balance). */
async function createRehabifyRecipient(account: { accountName: string; accountNumber: string; bankCode: string }): Promise<string> {
  const data = await paystackRequest("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "nuban",
      name: account.accountName,
      account_number: account.accountNumber,
      bank_code: account.bankCode,
      currency: "NGN",
      description: "Rehabify revenue (fees moved from the Paystack balance)",
    }),
  });
  const code = typeof data?.recipient_code === "string" ? data.recipient_code : "";
  if (!code) throw new ConvexError("Paystack didn't set up the account for transfers. Please try again.");
  return code;
}

const ACCOUNT_NUMBER = /^\d{10}$/;
const cleanBankCode = (code: string) => {
  const trimmed = code.trim();
  if (!/^[0-9A-Za-z-]{2,20}$/.test(trimmed)) throw new ConvexError("Choose the bank again.");
  return trimmed;
};

/** Looks up the account holder's name so the admin can confirm it before saving. */
export const adminResolveRehabifyAccount = action({
  args: { bankCode: v.string(), accountNumber: v.string() },
  handler: async (ctx, args): Promise<{ accountName: string }> => {
    await ctx.runQuery(refs.access, {});
    const bankCode = cleanBankCode(args.bankCode);
    if (!ACCOUNT_NUMBER.test(args.accountNumber)) throw new ConvexError("Account number must be 10 digits.");
    const data = await paystackRequest(
      `/bank/resolve?account_number=${encodeURIComponent(args.accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
      { method: "GET" }
    );
    const accountName = typeof data?.account_name === "string" ? data.account_name : "";
    if (!accountName) throw new ConvexError("Paystack couldn't find that account. Check the bank and number.");
    return { accountName };
  },
});

/**
 * "Save as Rehabify's account": makes a Paystack sub-account for Rehabify's bank account with the
 * current key, and stores its code. The switch goes off whenever the account changes, so an admin
 * turns it on again knowingly for the new account.
 */
export const adminSaveRehabifyAccount = action({
  args: { bankCode: v.string(), bankName: v.string(), accountNumber: v.string() },
  handler: async (ctx, args): Promise<{ accountName: string }> => {
    const { userId } = await ctx.runQuery(refs.access, {});
    const bankCode = cleanBankCode(args.bankCode);
    if (!ACCOUNT_NUMBER.test(args.accountNumber)) throw new ConvexError("Account number must be 10 digits.");
    // The name is looked up again here: never taken from the browser
    const resolved = await paystackRequest(
      `/bank/resolve?account_number=${encodeURIComponent(args.accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
      { method: "GET" }
    );
    const accountName = typeof resolved?.account_name === "string" ? resolved.account_name : "";
    if (!accountName) throw new ConvexError("Paystack couldn't find that account. Check the bank and number.");
    const subaccount = await paystackRequest("/subaccount", {
      method: "POST",
      body: JSON.stringify({
        business_name: "Rehabify revenue",
        settlement_bank: bankCode,
        account_number: args.accountNumber,
        // The main account's part is set per checkout (transaction_charge), never a percentage here
        percentage_charge: 0,
        description: "Rehabify's own revenue (Admin > Finance > Money routing)",
      }),
    });
    const subaccountCode = typeof subaccount?.subaccount_code === "string" ? subaccount.subaccount_code : "";
    if (!subaccountCode) throw new ConvexError("Paystack didn't create the sub-account. Please try again.");
    // The same account as a transfer recipient, so Rehabify's fees can later be moved to it from the
    // balance. Not needed to save: if it fails, the page offers "Set up transfers" again.
    let transferRecipientCode: string | undefined;
    try {
      transferRecipientCode = await createRehabifyRecipient({ accountName, accountNumber: args.accountNumber, bankCode });
    } catch (err) {
      console.warn("money_routing_recipient_failed", err instanceof Error ? err.message.slice(0, 200) : "unknown");
    }
    await ctx.runMutation(refs.save, {
      userId,
      subaccountCode,
      bankCode,
      bankName: args.bankName.trim().slice(0, 120) || "Bank",
      accountName,
      accountNumberLast4: args.accountNumber.slice(-4),
      // Made just now with the current key, so it belongs to this Paystack mode
      paystackMode: currentPaystackMode(),
      ...(transferRecipientCode ? { transferRecipientCode } : {}),
    });
    return { accountName };
  },
});

/**
 * "Set up transfers to this account" for an account saved before transfers existed (or when
 * Paystack didn't set it up then): the admin types the account number again (only its last 4
 * digits are stored), it must match the saved account, and Paystack makes a transfer recipient.
 */
export const adminSetupFeeTransfers = action({
  args: { accountNumber: v.string() },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { userId } = await ctx.runQuery(refs.access, {});
    if (!ACCOUNT_NUMBER.test(args.accountNumber)) throw new ConvexError("Account number must be 10 digits.");
    const account = await ctx.runQuery(refs.accountForRecipient, {});
    if (!account) throw new ConvexError("Save Rehabify's bank account first.");
    if (account.paystackMode !== currentPaystackMode()) throw new ConvexError("Save Rehabify's account again for the current Paystack keys first.");
    if (args.accountNumber.slice(-4) !== account.last4) throw new ConvexError(`That isn't the saved account (it ends ${account.last4}).`);
    // Paystack's name for the number must match the saved account's name too
    const resolved = await paystackRequest(
      `/bank/resolve?account_number=${encodeURIComponent(args.accountNumber)}&bank_code=${encodeURIComponent(account.bankCode)}`,
      { method: "GET" }
    );
    const name = typeof resolved?.account_name === "string" ? resolved.account_name : "";
    if (name.trim().toLowerCase() !== account.accountName.trim().toLowerCase()) {
      throw new ConvexError("That number belongs to a different account name than the saved one. Check it, or save the account again.");
    }
    const recipientCode = await createRehabifyRecipient({ accountName: account.accountName, accountNumber: args.accountNumber, bankCode: account.bankCode });
    await ctx.runMutation(refs.saveRecipient, { userId, recipientCode });
    return { ok: true };
  },
});

export const accountForRecipient = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await routingRow(ctx);
    return row ? { bankCode: row.bankCode, accountName: row.accountName, last4: row.accountNumberLast4, paystackMode: row.paystackMode } : null;
  },
});

export const saveTransferRecipient = internalMutation({
  args: { userId: v.id("users"), recipientCode: v.string() },
  handler: async (ctx, args) => {
    const row = await routingRow(ctx);
    if (!row) return null;
    const now = Date.now();
    await ctx.db.patch(row._id, { transferRecipientCode: args.recipientCode, transferRecipientMode: currentPaystackMode(), updatedAt: now });
    await ctx.db.insert("systemLogs", {
      type: "payment",
      timestamp: now,
      action: "money_routing_transfers_set_up",
      actorUserId: args.userId,
      targetEntityType: "paystack_routing",
      details: { accountNumberLast4: row.accountNumberLast4, paystackMode: currentPaystackMode() },
    });
    return null;
  },
});

export const saveRehabifyAccount = internalMutation({
  args: {
    userId: v.id("users"),
    subaccountCode: v.string(),
    bankCode: v.string(),
    bankName: v.string(),
    accountName: v.string(),
    accountNumberLast4: v.string(),
    paystackMode: v.union(v.literal("test"), v.literal("live")),
    transferRecipientCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await routingRow(ctx);
    const { userId, subaccountCode, transferRecipientCode, ...account } = args;
    // Transfers go to the account just saved, never an earlier one
    const recipient = transferRecipientCode
      ? { transferRecipientCode, transferRecipientMode: args.paystackMode }
      : { transferRecipientCode: undefined, transferRecipientMode: undefined };
    if (row) {
      // The old code is kept so payments started with it are still known as Rehabify's own
      const previous = [row.rehabifySubaccountCode, ...(row.previousSubaccountCodes ?? [])]
        .filter((code, i, all) => code !== subaccountCode && all.indexOf(code) === i)
        .slice(0, 20);
      await ctx.db.patch(row._id, {
        ...account,
        ...recipient,
        rehabifySubaccountCode: subaccountCode,
        previousSubaccountCodes: previous,
        // A new account starts switched off
        routingOn: false,
        ...(row.routingOn ? { routingChangedAt: now, routingChangedBy: userId } : {}),
        // The pool's figures belong to one Paystack mode: a switch to other keys starts afresh
        ...(row.paystackMode !== args.paystackMode ? { routingOnSince: undefined } : {}),
        lastSplitProblem: undefined,
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("paystackRouting", {
        ...account,
        ...(transferRecipientCode ? recipient : {}),
        rehabifySubaccountCode: subaccountCode,
        routingOn: false,
        createdAt: now,
        updatedAt: now,
        updatedBy: userId,
      });
    }
    await ctx.db.insert("systemLogs", {
      type: "payment",
      timestamp: now,
      action: "money_routing_account_saved",
      actorUserId: userId,
      targetEntityType: "paystack_routing",
      // Bank and last 4 digits only, never the full account number
      details: { bankName: args.bankName, accountNumberLast4: args.accountNumberLast4, paystackMode: args.paystackMode, routingOn: false },
    });
    return null;
  },
});

/** "Send Rehabify's share to this bank account": on only with a sub-account from the current Paystack mode. */
export const adminSetRouting = mutation({
  args: { on: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"], "paystackRouting:adminSetRouting");
    const row = await routingRow(ctx);
    if (!row) {
      if (args.on) throw new ConvexError("Save Rehabify's bank account first.");
      return { routingOn: false };
    }
    if (args.on && row.paystackMode !== currentPaystackMode()) {
      throw new ConvexError(
        `Rehabify's account was saved with Paystack ${row.paystackMode} keys, but payments now run on ${currentPaystackMode()} keys. Save the account again first.`
      );
    }
    if (row.routingOn === args.on) return { routingOn: row.routingOn };
    const now = Date.now();
    await ctx.db.patch(row._id, {
      routingOn: args.on,
      routingChangedAt: now,
      routingChangedBy: admin._id,
      // The first time it goes on: fees waiting in the balance and partner payouts count from here
      ...(args.on && !row.routingOnSince ? { routingOnSince: now } : {}),
      updatedAt: now,
    });
    await ctx.db.insert("systemLogs", {
      type: "payment",
      timestamp: now,
      action: args.on ? "money_routing_on" : "money_routing_off",
      actorUserId: admin._id,
      targetEntityType: "paystack_routing",
      details: { paystackMode: row.paystackMode },
    });
    return { routingOn: args.on };
  },
});

// ── The payout pool, top-ups and moving Rehabify's fees to the bank ──────────
// The figures come from helpers/paystackRouting.ts (poolPosition); only rows from the current
// Paystack mode count. Nothing here moves money except adminMoveFeesToBank, which an admin
// presses and confirms; there is no automatic sweep.

type SweepInfo = {
  position: PoolPosition;
  unpaidPayoutsKobo: number;
  upcomingKeptKobo: number;
  recipientCode: string | null;
  sweepInProgress: boolean;
};

const PAYSTACK_API = "https://api.paystack.co";
const ADMIN_ROUTING_PAGE = "/dashboard/admin/money-routing";
const SWEEP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
/** Smaller moves aren't worth a transfer fee */
const MIN_SWEEP_KOBO = 100_000;
/** The weekly reminder only speaks up above ₦10,000 */
const REMINDER_THRESHOLD_KOBO = 1_000_000;
/** No single top-up record above ₦50m (a typo guard) */
const MAX_TOPUP_KOBO = 5_000_000_000;
const SWEEP_OPEN = new Set(["sending", "pending", "otp_required"]);

const nairaText = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/** The Payouts page (any admin with Payouts): what Rehabify owes the payout pool, for its balance line. */
export const adminPoolOwed = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"], "paystackRouting:adminPoolOwed");
    const position = await poolPosition(ctx);
    return { owedKobo: position.owedKobo };
  },
});

/** The Money routing page: the pool's totals, refunds taken from it, top-ups, fees and fee moves. */
export const adminPoolLedger = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"], "paystackRouting:adminPoolLedger");
    const position = await poolPosition(ctx);
    const clinicians = await cliniciansMoneyInBalanceKobo(ctx);
    const row = await routingRow(ctx);
    const recent = async (kind: Doc<"paystackPoolLedger">["kind"]) =>
      (
        await ctx.db
          .query("paystackPoolLedger")
          .withIndex("by_kind", (q) => q.eq("kind", kind))
          .order("desc")
          .take(30)
      ).filter((r) => r.paystackMode === position.mode);
    const [shortfalls, topups, sweeps, fees] = await Promise.all([recent("refund_shortfall"), recent("topup"), recent("fee_sweep"), recent("fee_earned")]);
    const names = new Map<string, string | null>();
    const nameOf = async (id: Id<"users"> | undefined) => {
      if (!id) return null;
      if (!names.has(id)) names.set(id, personName(await ctx.db.get(id)));
      return names.get(id) ?? null;
    };
    const view = async (r: Doc<"paystackPoolLedger">) => ({
      _id: r._id,
      amountKobo: r.amountKobo,
      createdAt: r.createdAt,
      paymentReference: r.paymentReference ?? null,
      note: r.note ?? null,
      status: r.status ?? null,
      transferReference: r.transferReference ?? null,
      failureReason: r.failureReason ?? null,
      completedAt: r.completedAt ?? null,
      byName: await nameOf(r.createdBy),
    });
    return {
      ...position,
      ...clinicians,
      transfersReady: usableRecipient(row) !== null,
      shortfalls: await Promise.all(shortfalls.map(view)),
      topups: await Promise.all(topups.map(view)),
      sweeps: await Promise.all(sweeps.map(view)),
      fees: await Promise.all(fees.map(view)),
    };
  },
});

/** "Record top-up": an admin topped the balance up from Rehabify's bank; it reduces what's owed. */
export const adminRecordTopUp = mutation({
  args: { amountKobo: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"], "paystackRouting:adminRecordTopUp");
    const amount = Math.round(args.amountKobo);
    if (!Number.isFinite(amount) || amount < 100) throw new ConvexError("Enter the amount you topped up.");
    if (amount > MAX_TOPUP_KOBO) throw new ConvexError("That's more than ₦50,000,000. Check the amount.");
    const now = Date.now();
    const note = args.note?.trim().slice(0, 300) || undefined;
    await ctx.db.insert("paystackPoolLedger", {
      kind: "topup",
      amountKobo: amount,
      paystackMode: currentPaystackMode(),
      note,
      createdBy: admin._id,
      createdAt: now,
    });
    await ctx.db.insert("systemLogs", {
      type: "payment",
      timestamp: now,
      action: "payout_pool_topup_recorded",
      actorUserId: admin._id,
      targetEntityType: "paystack_routing",
      details: { amountKobo: amount, paystackMode: currentPaystackMode() },
    });
    return { ok: true };
  },
});

/** What "Move fees to the bank" needs to decide how much may leave the balance. */
export const feeSweepInfo = internalQuery({
  args: {},
  handler: async (ctx): Promise<SweepInfo> => {
    const row = await routingRow(ctx);
    const position = await poolPosition(ctx);
    const clinicians = await cliniciansMoneyInBalanceKobo(ctx);
    const recentSweeps = await ctx.db
      .query("paystackPoolLedger")
      .withIndex("by_kind", (q) => q.eq("kind", "fee_sweep"))
      .order("desc")
      .take(20);
    return {
      position,
      ...clinicians,
      recipientCode: usableRecipient(row),
      sweepInProgress: recentSweeps.some((r) => SWEEP_OPEN.has(r.status ?? "sending")),
    };
  },
});

/**
 * Records a fee move before it is sent (the reference rhsweep_<date>_<random> is new each time, and
 * Paystack refuses a reference twice). One move at a time, and never more than the ledger says is
 * Rehabify's: checked again here, in the same transaction that records it.
 */
export const beginFeeSweep = internalMutation({
  args: { userId: v.id("users"), amountKobo: v.number() },
  handler: async (ctx, args) => {
    const recentSweeps = await ctx.db
      .query("paystackPoolLedger")
      .withIndex("by_kind", (q) => q.eq("kind", "fee_sweep"))
      .order("desc")
      .take(20);
    if (recentSweeps.some((r) => SWEEP_OPEN.has(r.status ?? "sending"))) {
      throw new ConvexError("A move is already on its way. Check it on Paystack before moving more.");
    }
    const position = await poolPosition(ctx);
    if (args.amountKobo > position.movableKobo) {
      throw new ConvexError(`Only ${nairaText(position.movableKobo)} of Rehabify's fees can be moved now.`);
    }
    const now = Date.now();
    const reference = `rhsweep_${zonedDateKey(now).replace(/-/g, "")}_${randomString(10, SWEEP_ALPHABET)}`;
    const ledgerId = await ctx.db.insert("paystackPoolLedger", {
      kind: "fee_sweep",
      amountKobo: args.amountKobo,
      paystackMode: currentPaystackMode(),
      status: "sending",
      transferReference: reference,
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("systemLogs", {
      type: "payment",
      timestamp: now,
      action: "payout_pool_fee_sweep_started",
      actorUserId: args.userId,
      targetEntityType: "paystack_routing",
      targetEntityId: reference,
      details: { amountKobo: args.amountKobo },
    });
    return { ledgerId, reference };
  },
});

export const recordFeeSweepState = internalMutation({
  args: {
    ledgerId: v.id("paystackPoolLedger"),
    state: v.union(v.literal("pending"), v.literal("otp_required"), v.literal("success"), v.literal("failed"), v.literal("reversed")),
    transferCode: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.ledgerId);
    if (row) await settleFeeSweep(ctx, row, args.state, { transferCode: args.transferCode, reason: args.reason });
    return null;
  },
});

export const feeSweepForAdmin = internalQuery({
  args: { ledgerId: v.id("paystackPoolLedger") },
  handler: async (ctx, args) => await ctx.db.get(args.ledgerId),
});

/** Paystack's transfer status in our words (as for payout runs). */
function sweepStateFrom(status: string | undefined): SweepState {
  if (status === "success") return "success";
  if (status === "otp") return "otp_required";
  if (status === "reversed") return "reversed";
  if (status === "failed" || status === "abandoned" || status === "blocked" || status === "rejected") return "failed";
  return "pending";
}

function paystackSecret(): string {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new ConvexError("Payments aren't set up yet (PAYSTACK_SECRET_KEY is missing).");
  return secret;
}

/** The live Naira balance. Money only leaves when it can be read, so this throws when it can't. */
async function liveNairaBalanceKobo(secret: string): Promise<number> {
  try {
    const response = await fetch(`${PAYSTACK_API}/balance`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15_000) });
    const data = (await response.json().catch(() => null)) as { status?: boolean; data?: Array<{ currency?: string; balance?: number }> } | null;
    const ngn = response.ok && data?.status && Array.isArray(data.data) ? data.data.find((b) => b.currency === "NGN") : undefined;
    if (ngn && typeof ngn.balance === "number") return ngn.balance;
  } catch {
    // Said plainly below
  }
  throw new ConvexError("We couldn't read the Paystack balance just now, so nothing was moved. Try again.");
}

/**
 * "Move ₦X to Rehabify's bank": one Paystack transfer from the balance to Rehabify's own account,
 * for at most Rehabify's fees by the ledger (less what it owes the pool and partner payouts), and
 * never more than the live balance leaves after every clinician's money (unpaid payouts and shares
 * kept for sessions still to come) and the transfer fee. Like payout runs, only a clear refusal
 * from Paystack counts as failed; an unclear answer stays pending for the webhook or "Check".
 */
export const adminMoveFeesToBank = action({
  args: { amountKobo: v.number() },
  handler: async (ctx, args): Promise<{ state: SweepState; message: string }> => {
    const { userId } = await ctx.runQuery(refs.access, {});
    const amount = Math.floor(args.amountKobo / 100) * 100; // whole naira
    if (!Number.isFinite(amount) || amount < MIN_SWEEP_KOBO) throw new ConvexError(`Move at least ${nairaText(MIN_SWEEP_KOBO)}.`);
    const secret = paystackSecret();
    const info = await ctx.runQuery(refs.sweepInfo, {});
    if (!info.recipientCode) throw new ConvexError("Set up transfers to Rehabify's account first.");
    if (info.sweepInProgress) throw new ConvexError("A move is already on its way. Check it on Paystack before moving more.");
    const balanceKobo = await liveNairaBalanceKobo(secret);
    const limit = Math.min(
      info.position.movableKobo,
      balanceKobo - info.unpaidPayoutsKobo - info.upcomingKeptKobo - transferFeeKobo(amount)
    );
    if (amount > limit) {
      throw new ConvexError(
        limit >= MIN_SWEEP_KOBO
          ? `You can move up to ${nairaText(Math.floor(limit / 100) * 100)} now.`
          : "Nothing can be moved now: the balance has to keep the clinicians' money first."
      );
    }
    const { ledgerId, reference } = await ctx.runMutation(refs.beginSweep, { userId, amountKobo: amount });

    const record = async (state: SweepState, extra: { transferCode?: string; reason?: string } = {}) => {
      await ctx.runMutation(refs.sweepState, { ledgerId, state, ...extra });
      return state;
    };
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
          amount,
          recipient: info.recipientCode,
          reference,
          reason: "Rehabify's fees to Rehabify's bank account",
        }),
      });
      data = await response.json().catch(() => null);
    } catch (error) {
      await record("pending", { reason: `Outcome unknown (${error instanceof Error ? error.message : "no answer"}). Check it on Paystack before moving again.` });
      return { state: "pending", message: "Paystack didn't answer. Press Check on Paystack in a minute." };
    }
    if (!response.ok || !data?.status) {
      const refused = data !== null && response.status >= 400 && response.status < 500;
      if (!refused) {
        await record("pending", { reason: `Outcome unknown (HTTP ${response.status}). Check it on Paystack before moving again.` });
        return { state: "pending", message: "Paystack's answer was unclear. Press Check on Paystack in a minute." };
      }
      const reason = plainTransferFailure(data?.message || `Paystack refused the transfer (HTTP ${response.status}).`);
      await record("failed", { reason });
      return { state: "failed", message: reason };
    }
    const state = sweepStateFrom(data.data?.status);
    await record(state, {
      transferCode: data.data?.transfer_code,
      reason: state === "failed" ? plainTransferFailure(data.message || "Paystack reported that the transfer failed.") : undefined,
    });
    const message =
      state === "success"
        ? `${nairaText(amount)} sent to Rehabify's bank account.`
        : state === "otp_required"
          ? "Paystack sent an OTP. Enter it to finish the move."
          : state === "pending"
            ? `${nairaText(amount)} is on its way to Rehabify's bank account.`
            : "The move didn't go through.";
    return { state, message };
  },
});

/** Ask Paystack what happened to a fee move that's still waiting (no webhook, or a timeout). */
export const adminCheckFeeSweep = action({
  args: { ledgerId: v.id("paystackPoolLedger") },
  handler: async (ctx, args): Promise<{ state: SweepState; message: string }> => {
    await ctx.runQuery(refs.access, {});
    const secret = paystackSecret();
    const row = await ctx.runQuery(refs.sweepForAdmin, { ledgerId: args.ledgerId });
    if (!row || row.kind !== "fee_sweep" || !row.transferReference) throw new ConvexError("Move not found.");
    if (row.status === "success" || row.status === "failed" || row.status === "reversed") {
      return { state: row.status, message: "This move is already settled." };
    }
    const response = await fetch(`${PAYSTACK_API}/transfer/verify/${encodeURIComponent(row.transferReference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: { status?: string; transfer_code?: string } } | null;
    if (response.status === 404 || (data?.status === false && /not found/i.test(data.message ?? ""))) {
      await ctx.runMutation(refs.sweepState, { ledgerId: row._id, state: "failed", reason: "Paystack has no record of this transfer, so nothing was sent." });
      return { state: "failed", message: "Paystack has no record of it, so nothing was sent. You can move the fees again." };
    }
    if (!response.ok || !data?.status) throw new ConvexError(data?.message || `Paystack returned HTTP ${response.status}.`);
    const state = sweepStateFrom(data.data?.status);
    await ctx.runMutation(refs.sweepState, { ledgerId: row._id, state, transferCode: data.data?.transfer_code });
    return { state, message: `Paystack says this transfer is ${data.data?.status ?? "unknown"}.` };
  },
});

/** Authorise a fee move with the OTP Paystack sent (only when OTP for transfers is switched on). */
export const adminFinalizeFeeSweep = action({
  args: { ledgerId: v.id("paystackPoolLedger"), otp: v.string() },
  handler: async (ctx, args): Promise<{ state: SweepState }> => {
    await ctx.runQuery(refs.access, {});
    paystackSecret();
    const row = await ctx.runQuery(refs.sweepForAdmin, { ledgerId: args.ledgerId });
    if (!row || row.kind !== "fee_sweep" || row.status !== "otp_required" || !row.transferCode) {
      throw new ConvexError("This move isn't waiting for an OTP.");
    }
    const data = await paystackRequest("/transfer/finalize_transfer", {
      method: "POST",
      body: JSON.stringify({ transfer_code: row.transferCode, otp: args.otp.trim() }),
    });
    const state = sweepStateFrom(typeof data?.status === "string" ? data.status : undefined);
    const settled: SweepState = state === "otp_required" ? "pending" : state;
    await ctx.runMutation(refs.sweepState, { ledgerId: row._id, state: settled });
    return { state: settled };
  },
});

/**
 * Weekly (Monday morning): tells full admins when more than ₦10,000 of Rehabify's fees are waiting
 * in the balance to be moved, or when Rehabify owes the payout pool. Silent otherwise, and before
 * the switch has ever been on.
 */
export const weeklyFeeSweepReminder = internalMutation({
  args: {},
  handler: async (ctx) => {
    const row = await routingRow(ctx);
    if (!row || !row.routingOnSince || row.paystackMode !== currentPaystackMode()) return { sent: 0 };
    const position = await poolPosition(ctx);
    const lines: string[] = [];
    if (position.movableKobo > REMINDER_THRESHOLD_KOBO) {
      lines.push(`${nairaText(position.movableKobo)} of Rehabify's fees are waiting in the Paystack balance. Move them to Rehabify's bank.`);
    }
    if (position.owedKobo > 0) {
      lines.push(`Rehabify owes the payout pool ${nairaText(position.owedKobo)} (refunds and partner payouts). Top up the Paystack balance.`);
    }
    if (lines.length === 0) return { sent: 0 };
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .take(50);
    const now = Date.now();
    let sent = 0;
    for (const admin of admins) {
      // Money routing is for full admins only
      if (!(await adminAccessOf(ctx, admin._id)).full) continue;
      await insertNotification(ctx, {
        userId: admin._id,
        type: "system_alert",
        priority: "medium",
        status: "pending",
        payload: { title: "Money routing", body: lines.join(" "), data: { entityType: "payout", actionUrl: ADMIN_ROUTING_PAGE } },
        createdAt: now,
        updatedAt: now,
      });
      sent++;
    }
    return { sent };
  },
});
