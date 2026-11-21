/**
 * Money routing: where each part of a Paystack payment lands.
 *
 * Why (Nov 2026): physio payouts are Paystack transfers from Rehabify's Paystack BALANCE, but
 * patients' payments settled to Rehabify's bank account, so the balance was usually ₦0 and a
 * payout failed with "Your balance is not enough to fulfil this request". The owner's rule:
 * money meant for clinicians stays in Paystack; money meant for Rehabify goes to Rehabify's bank.
 *
 * How: Rehabify's bank account is set up as a Paystack sub-account (Admin › Finance › Money
 * routing). Once Paystack keeps the MAIN account's settlements in the balance (a Paystack setting
 * or support request), a checkout split sends:
 *   - Rehabify-only products (clinic plans, Pro, Learn, Flex…): the whole payment, minus Paystack's
 *     fee, to the sub-account, i.e. Rehabify's bank. Nothing of it stays in the balance.
 *   - Rehabify Care bookings (Rehabify holds the money and pays the physio a fixed payout later):
 *     exactly the physio's share stays in the main account, the balance that pays payout runs; the
 *     rest, minus Paystack's fee, goes to the sub-account. The physio's fixed share never pays the
 *     fee, as today (Rehabify absorbs it).
 * Clinic and independent-physio invoices are never routed here: they already split to the clinic's
 * or physio's own sub-account, and Paystack allows one sub-account per transaction.
 *
 * Everything is OFF until an admin switches it on. Every helper returns {} (no split: the checkout
 * is exactly what it was before) when the switch is off, nothing is set up, the sub-account was made
 * under the other Paystack mode (test vs live keys), the settings can't be read, or the numbers
 * leave no room for Paystack's fee.
 *
 * Known gaps (also on the Money routing page):
 *   - Refunds: Paystack takes a refund of a split payment from the main balance, i.e. from the
 *     clinicians' pool, even though Rehabify's part went to the bank. Top the balance up after one.
 *   - Clinic and independent-physio invoices: Rehabify's fee (their transaction_charge) stays in the
 *     main account, so once settlements are kept in the balance it stays in the balance too. Moving
 *     it to the bank needs a later step (a transfer from the balance to Rehabify's account).
 *   - Money collected before the switch went on has already settled to the bank; it doesn't move.
 *   - Partner commissions are paid from the balance but come out of Rehabify's share, which now
 *     goes to the bank: top the balance up before partner payouts.
 */
import { makeFunctionReference } from "convex/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { usableSubaccount, type PaystackMode } from "./paystackMode";

/** The split fields Paystack accepts on /transaction/initialize and /transaction/charge_authorization. */
export type PaystackSplit = {
  subaccount?: string;
  /** Kobo the MAIN account keeps; the sub-account gets the rest */
  transaction_charge?: number;
  /** Who pays Paystack's fee: "subaccount" here, so the main account's amount is exact */
  bearer?: "account" | "subaccount";
};

/** What a checkout needs to know about routing (no bank details). */
export type CheckoutRouting = {
  subaccountCode: string;
  paystackMode: PaystackMode;
  routingOn: boolean;
} | null;

/** The one settings row (the newest, should there ever be two). */
export async function routingRow(ctx: QueryCtx | MutationCtx): Promise<Doc<"paystackRouting"> | null> {
  return await ctx.db.query("paystackRouting").order("desc").first();
}

export function checkoutRoutingOf(row: Doc<"paystackRouting"> | null): CheckoutRouting {
  return row ? { subaccountCode: row.rehabifySubaccountCode, paystackMode: row.paystackMode, routingOn: row.routingOn } : null;
}

/**
 * Every sub-account code that is Rehabify's own (current and earlier ones), whatever the switch
 * says: a payment Paystack split to one of these is Rehabify's revenue, never a provider's split.
 */
export async function rehabifySubaccountCodes(ctx: QueryCtx | MutationCtx): Promise<Set<string>> {
  const row = await routingRow(ctx);
  if (!row) return new Set();
  return new Set([row.rehabifySubaccountCode, ...(row.previousSubaccountCodes ?? [])]);
}

/**
 * Rehabify's sub-account code when checkouts should use it right now, else null: the switch must
 * be on, and the sub-account must have been made with the current Paystack key (a test-mode
 * sub-account doesn't exist in live mode, and Paystack would refuse the checkout).
 */
export function activeRehabifySubaccount(routing: CheckoutRouting): string | null {
  if (!routing || !routing.routingOn) return null;
  return usableSubaccount({ subaccountCode: routing.subaccountCode, paystackMode: routing.paystackMode });
}

const routingForCheckoutRef = makeFunctionReference<"query", Record<string, never>, CheckoutRouting>(
  "paystackRouting:routingForCheckout"
);
const recordSplitProblemRef = makeFunctionReference<"mutation", { source: string; message: string }, null>(
  "paystackRouting:recordSplitProblem"
);

/** Reads the routing settings from an action, query or mutation. */
async function loadRouting(ctx: ActionCtx | QueryCtx | MutationCtx): Promise<CheckoutRouting> {
  try {
    if ("db" in ctx) return checkoutRoutingOf(await routingRow(ctx));
    return await ctx.runQuery(routingForCheckoutRef, {});
  } catch (err) {
    // Settings that can't be read must never stop a payment: no split, exactly as before
    console.warn("paystack_routing_unavailable", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * The split for a payment that is entirely Rehabify's revenue (plans, courses, Flex…): the whole
 * amount goes to Rehabify's sub-account (its bank), which also bears Paystack's fee, and the main
 * account keeps 0. {} when routing is off or unusable.
 */
export function rehabifyOnlySplitFrom(routing: CheckoutRouting): PaystackSplit {
  const code = activeRehabifySubaccount(routing);
  if (!code) return {};
  return { subaccount: code, transaction_charge: 0, bearer: "subaccount" };
}

export async function rehabifyOnlySplit(ctx: ActionCtx | QueryCtx | MutationCtx): Promise<PaystackSplit> {
  return rehabifyOnlySplitFrom(await loadRouting(ctx));
}

/**
 * The most Paystack can take on a Naira payment, with room to spare: 3.9% + ₦100 (international
 * cards; local cards are 1.5% + ₦100, capped at ₦2,000), plus 10% margin, rounded up. With bearer
 * "subaccount" the fee comes out of Rehabify's part, so Rehabify's part must cover it.
 */
function worstCaseFeeKobo(totalKobo: number): number {
  return Math.ceil((totalKobo * 0.039 + 10000) * 1.1);
}

/**
 * The split for a Rehabify Care booking (Rehabify holds the money, then pays the physio's fixed
 * share in a payout run): the main account, whose settlements stay in the Paystack balance, keeps
 * exactly the clinician's share for payouts; Rehabify's sub-account gets the rest and bears
 * Paystack's fee, as Rehabify absorbs the fee today. No split ({}) when:
 *   - routing is off or unusable;
 *   - the share or total isn't a positive amount;
 *   - Rehabify's part can't cover Paystack's fee, e.g. a Rehabify Access booking where the patient
 *     pays less than the physio's payout: then everything stays in the balance, as before.
 */
export function heldBookingSplitFrom(routing: CheckoutRouting, clinicianShareKobo: number, totalKobo: number): PaystackSplit {
  const code = activeRehabifySubaccount(routing);
  if (!code) return {};
  const share = Math.round(clinicianShareKobo);
  const total = Math.round(totalKobo);
  if (!Number.isFinite(share) || !Number.isFinite(total) || share <= 0 || total <= 0) return {};
  if (total - share < worstCaseFeeKobo(total)) return {};
  return { subaccount: code, transaction_charge: share, bearer: "subaccount" };
}

export async function heldBookingSplit(
  ctx: ActionCtx | QueryCtx | MutationCtx,
  clinicianShareKobo: number,
  totalKobo: number
): Promise<PaystackSplit> {
  return heldBookingSplitFrom(await loadRouting(ctx), clinicianShareKobo, totalKobo);
}

/** Paystack's reason, without anything that looks like an email address, for logs and the admin page. */
export function splitProblemText(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "Paystack refused the request";
  return raw.replace(/[^\s@]+@[^\s@]+/g, "[redacted]").slice(0, 200);
}

/** Notes on the Money routing page (and in the logs) that Paystack refused a routed checkout. */
async function noteSplitProblem(ctx: ActionCtx, source: string, err: unknown) {
  const message = splitProblemText(err);
  // No keys, emails or bank details: the product and Paystack's reason only
  console.warn("paystack_routing_split_refused", { source, message });
  try {
    await ctx.runMutation(recordSplitProblemRef, { source, message });
  } catch {
    // The payment matters more than the note
  }
}

/**
 * Starts a checkout (/transaction/initialize) with the split. If Paystack refuses it, starts it
 * again without the split, exactly as before routing, so a routing problem never stops anyone
 * paying (that money then simply stays in the main account). Safe for initialize only: nothing
 * is charged until the payer completes Paystack's page, and a refused initialize creates no
 * transaction, so the same reference can be sent again.
 */
export async function initializeWithRouting<T>(
  ctx: ActionCtx,
  source: string,
  split: PaystackSplit,
  send: (split: PaystackSplit) => Promise<T>
): Promise<T> {
  if (!split.subaccount) return await send({});
  try {
    return await send(split);
  } catch (err) {
    await noteSplitProblem(ctx, source, err);
    return await send({});
  }
}

/** Paystack refusing a request because of the split fields themselves. */
const SPLIT_REFUSAL = /sub-?account|split|transaction[_ ]charge|bearer/i;

/**
 * Charges a saved card (/transaction/charge_authorization) with the split. Only when Paystack
 * refuses the request because of the split itself (its message names the sub-account, split,
 * transaction_charge or bearer) is it sent again without the split, with the same reference: a
 * refused request charged nothing. Any other error is passed on unchanged, so the caller's own
 * "outcome unknown, check before trying again" handling still applies.
 */
export async function chargeWithRouting<T>(
  ctx: ActionCtx,
  source: string,
  split: PaystackSplit,
  send: (split: PaystackSplit) => Promise<T>
): Promise<T> {
  if (!split.subaccount) return await send({});
  try {
    return await send(split);
  } catch (err) {
    if (!SPLIT_REFUSAL.test(splitProblemText(err))) throw err;
    await noteSplitProblem(ctx, source, err);
    return await send({});
  }
}
