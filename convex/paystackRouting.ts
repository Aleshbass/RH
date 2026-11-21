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
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ensureUserRole } from "./auth";
import { paystackRequest } from "./clinicBilling";
import { currentPaystackMode, type PaystackMode } from "./helpers/paystackMode";
import { assertServerCaller } from "./helpers/serverSecret";
import { checkoutRoutingOf, heldBookingSplitFrom, routingRow, splitProblemText, type CheckoutRouting, type PaystackSplit } from "./helpers/paystackRouting";

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
    },
    null
  >("paystackRouting:saveRehabifyAccount"),
};

const personName = (user: { firstName?: string; lastName?: string; email?: string } | null) =>
  user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "An admin" : null;

// ── For checkouts ────────────────────────────────────────────────────────────

/** Checkout actions read the routing through this (helpers/paystackRouting.ts loadRouting). */
export const routingForCheckout = internalQuery({
  args: {},
  handler: async (ctx): Promise<CheckoutRouting> => checkoutRoutingOf(await routingRow(ctx)),
});

/** Kept on the settings row so the Money routing page shows that Paystack refused a routed checkout. */
export const recordSplitProblem = internalMutation({
  args: { source: v.string(), message: v.string() },
  handler: async (ctx, args) => {
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
  args: { serverSecret: v.string(), source: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    assertServerCaller(args.serverSecret);
    const row = await routingRow(ctx);
    if (!row) return null;
    await ctx.db.patch(row._id, {
      lastSplitProblem: { at: Date.now(), source: args.source.slice(0, 60), message: splitProblemText(args.message) },
    });
    return null;
  },
});

/**
 * The split for a Rehabify Care booking checkout (app/api/payments/marketplace and the Joy booking
 * payment route): the physio's fixed share stays in the main account (the balance that pays
 * payout runs), the rest goes to Rehabify's sub-account (helpers/paystackRouting.ts). Server
 * routes only. `keyMode` is the Paystack mode of Convex's key: the route only uses the split
 * when its own key is in the same mode, since the sub-account only exists in that mode.
 * Anything unexpected returns no split, so the checkout is exactly as before.
 */
export const bookingCheckoutSplit = query({
  args: { serverSecret: v.string(), bookingId: v.id("marketplaceBookings"), amountKobo: v.number() },
  handler: async (ctx, args): Promise<{ split: PaystackSplit; keyMode: PaystackMode }> => {
    assertServerCaller(args.serverSecret);
    const keyMode = currentPaystackMode();
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.paymentStatus !== "pending") return { split: {}, keyMode };
    // Only for the amount this booking really charges (the web route charges serviceAmount, Joy
    // totalAmount; with all-inclusive prices they're the same)
    const amount = Math.round(args.amountKobo);
    if (amount <= 0 || (amount !== booking.serviceAmount && amount !== booking.totalAmount)) return { split: {}, keyMode };
    // The physio's fixed payout (plus their travel share), the amount payout runs will send them
    return { split: heldBookingSplitFrom(checkoutRoutingOf(await routingRow(ctx)), booking.physiotherapistEarnings, amount), keyMode };
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
      return { currentMode, account: null, routingOn: false, routingActive: false, routingChangedAt: null, routingChangedByName: null, lastSplitProblem: null };
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
    };
  },
});

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
    await ctx.runMutation(refs.save, {
      userId,
      subaccountCode,
      bankCode,
      bankName: args.bankName.trim().slice(0, 120) || "Bank",
      accountName,
      accountNumberLast4: args.accountNumber.slice(-4),
      // Made just now with the current key, so it belongs to this Paystack mode
      paystackMode: currentPaystackMode(),
    });
    return { accountName };
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
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await routingRow(ctx);
    const { userId, subaccountCode, ...account } = args;
    if (row) {
      // The old code is kept so payments started with it are still known as Rehabify's own
      const previous = [row.rehabifySubaccountCode, ...(row.previousSubaccountCodes ?? [])]
        .filter((code, i, all) => code !== subaccountCode && all.indexOf(code) === i)
        .slice(0, 20);
      await ctx.db.patch(row._id, {
        ...account,
        rehabifySubaccountCode: subaccountCode,
        previousSubaccountCodes: previous,
        // A new account starts switched off
        routingOn: false,
        ...(row.routingOn ? { routingChangedAt: now, routingChangedBy: userId } : {}),
        lastSplitProblem: undefined,
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("paystackRouting", {
        ...account,
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
    await ctx.db.patch(row._id, { routingOn: args.on, routingChangedAt: now, routingChangedBy: admin._id, updatedAt: now });
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
