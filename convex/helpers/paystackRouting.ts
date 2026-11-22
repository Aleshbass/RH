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
 * The payout pool (bottom of this file, and the Money routing page) keeps the pool whole:
 *   - Refunds: Paystack takes a refund of a split payment from the main balance, i.e. from the
 *     clinicians' pool, although Rehabify's part went to the bank. Every routed checkout is
 *     recorded (paystackRoutedPayments) with what it left in the balance, and a refund that takes
 *     more than that is recorded as a refund_shortfall Rehabify owes the pool (top-ups pay it).
 *   - Clinic and independent-physio invoices: Rehabify's fee (their transaction_charge, less the
 *     Paystack fee the main account bears) stays in the balance; it is recorded as fee_earned and
 *     an admin moves it to Rehabify's bank with a Paystack transfer (fee_sweep).
 *   - Partner commissions are paid from the balance but belong to Rehabify's share: those paid
 *     since the switch went on are taken off Rehabify's money in the balance.
 *   - Money collected before the switch went on has already settled to the bank; it doesn't move,
 *     and refunds or payouts of it aren't counted here.
 */
import { makeFunctionReference } from "convex/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { currentPaystackMode, usableSubaccount, type PaystackMode } from "./paystackMode";

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
const recordSplitProblemRef = makeFunctionReference<"mutation", { source: string; message: string; reference?: string }, null>(
  "paystackRouting:recordSplitProblem"
);
const recordRoutedPaymentRef = makeFunctionReference<
  "mutation",
  { reference: string; amountKobo: number; keptKobo: number; subaccountCode: string; source: string },
  null
>("paystackRouting:recordRoutedPayment");

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
export function worstCaseFeeKobo(totalKobo: number): number {
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

/**
 * Notes on the Money routing page (and in the logs) that Paystack refused a routed checkout, and
 * forgets that payment's routing record: it goes ahead without the split.
 */
async function noteSplitProblem(ctx: ActionCtx, source: string, err: unknown, reference: string) {
  const message = splitProblemText(err);
  // No keys, emails or bank details: the product and Paystack's reason only
  console.warn("paystack_routing_split_refused", { source, message });
  try {
    await ctx.runMutation(recordSplitProblemRef, { source, message, reference });
  } catch {
    // The payment matters more than the note
  }
}

/** The payment a routed checkout is about to start (its reference and amount). */
export type RoutedPaymentInfo = { reference: string; amountKobo: number };

/**
 * Records, before the checkout is sent, that this payment is split and what it leaves in the main
 * account (the payout pool), so a later refund knows how much of it the pool can't cover. Written
 * first because a refund can only follow a payment, which can only follow this. False when it
 * can't be written: the caller then sends the checkout without the split (no record, no split).
 */
async function noteRoutedPayment(ctx: ActionCtx, source: string, split: PaystackSplit, payment: RoutedPaymentInfo): Promise<boolean> {
  try {
    await ctx.runMutation(recordRoutedPaymentRef, {
      reference: payment.reference,
      amountKobo: Math.round(payment.amountKobo),
      keptKobo: Math.round(split.transaction_charge ?? 0),
      subaccountCode: split.subaccount ?? "",
      source,
    });
    return true;
  } catch (err) {
    console.warn("paystack_routing_record_failed", { source, message: splitProblemText(err) });
    return false;
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
  payment: RoutedPaymentInfo,
  send: (split: PaystackSplit) => Promise<T>
): Promise<T> {
  if (!split.subaccount) return await send({});
  if (!(await noteRoutedPayment(ctx, source, split, payment))) return await send({});
  try {
    return await send(split);
  } catch (err) {
    await noteSplitProblem(ctx, source, err, payment.reference);
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
 * "outcome unknown, check before trying again" handling still applies (and the routing record
 * stays, since the charge may have gone through with the split).
 */
export async function chargeWithRouting<T>(
  ctx: ActionCtx,
  source: string,
  split: PaystackSplit,
  payment: RoutedPaymentInfo,
  send: (split: PaystackSplit) => Promise<T>
): Promise<T> {
  if (!split.subaccount) return await send({});
  if (!(await noteRoutedPayment(ctx, source, split, payment))) return await send({});
  try {
    return await send(split);
  } catch (err) {
    if (!SPLIT_REFUSAL.test(splitProblemText(err))) throw err;
    await noteSplitProblem(ctx, source, err, payment.reference);
    return await send({});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The payout pool: what Rehabify owes the clinicians' money in the balance, and what of
// Rehabify's own money is waiting there (paystackPoolLedger). Only rows from the current
// Paystack mode count, so test payments never move live figures.
// ─────────────────────────────────────────────────────────────────────────────

const LEDGER_READ_CAP = 5000;
/** Kobo as plain naira for notes, e.g. "4,200" */
const naira = (kobo: number) => (kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 });
const PARTNER_TRANSFER_CAP = 2000;
const PAYOUT_READ_CAP = 4000;
const ROUTED_READ_CAP = 1000;
/** Partner payouts that have left, or may still leave, the balance */
const PARTNER_SENT = ["initiated", "otp_required", "pending", "success"] as const;
/** Sweeps that have moved, or may still move, money out of the balance (failed/reversed didn't) */
const SWEEP_COUNTS = new Set(["sending", "pending", "otp_required", "success"]);

/**
 * Paystack's fee for one Naira transfer, taken from the balance on top of the amount (published
 * pricing: ₦10 up to ₦5,000, ₦25 up to ₦50,000, ₦50 above). Kept aside when moving fees out.
 */
export function transferFeeKobo(amountKobo: number): number {
  if (amountKobo <= 500_000) return 1_000;
  if (amountKobo <= 5_000_000) return 2_500;
  return 5_000;
}

export type PoolPosition = {
  mode: PaystackMode;
  routingOnSince: number | null;
  /** Rehabify's fees from clinic/physio invoices that stayed in the balance */
  feesEarnedKobo: number;
  /** Fees moved to the bank (or on their way) */
  sweptKobo: number;
  /** Refunds that took more from the balance than their payments left there */
  shortfallKobo: number;
  /** Top-ups admins recorded */
  topupKobo: number;
  /** Partner payouts since the switch went on (Rehabify's share, paid from the balance) */
  partnerPaidKobo: number;
  /** What Rehabify owes the pool now: top up this much */
  owedKobo: number;
  /** Rehabify's own money in the balance by the ledger (before the live-balance cap) */
  movableKobo: number;
};

async function ledgerTotal(ctx: QueryCtx | MutationCtx, kind: Doc<"paystackPoolLedger">["kind"], mode: PaystackMode) {
  const rows = await ctx.db
    .query("paystackPoolLedger")
    .withIndex("by_kind", (q) => q.eq("kind", kind))
    .order("desc")
    .take(LEDGER_READ_CAP);
  return rows
    .filter((r) => r.paystackMode === mode && (kind !== "fee_sweep" || SWEEP_COUNTS.has(r.status ?? "sending")))
    .reduce((sum, r) => sum + r.amountKobo, 0);
}

/**
 * Rehabify's position in the Paystack balance, by the ledger:
 *   what the pool is owed = refund shortfalls + partner payouts since the switch went on − top-ups
 *     (top-ups only ever cancel what's owed: a bigger top-up stays with the clinicians, it never
 *     becomes money Rehabify can move out);
 *   Rehabify's fees still in the balance (earned − moved) cover that first;
 *   whatever is left over is Rehabify's to move (owedKobo 0), or what's still uncovered is owed
 *   (movableKobo 0).
 */
export async function poolPosition(ctx: QueryCtx | MutationCtx): Promise<PoolPosition> {
  const mode = currentPaystackMode();
  const row = await routingRow(ctx);
  const routingOnSince = row && row.paystackMode === mode ? row.routingOnSince ?? null : null;
  const [feesEarnedKobo, sweptKobo, shortfallKobo, topupKobo] = await Promise.all([
    ledgerTotal(ctx, "fee_earned", mode),
    ledgerTotal(ctx, "fee_sweep", mode),
    ledgerTotal(ctx, "refund_shortfall", mode),
    ledgerTotal(ctx, "topup", mode),
  ]);
  let partnerPaidKobo = 0;
  if (routingOnSince !== null) {
    for (const status of PARTNER_SENT) {
      const transfers = await ctx.db
        .query("partnerPayoutTransfers")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(PARTNER_TRANSFER_CAP);
      // The gross commission: the net sent plus the fees taken from it, so the balance is never overcounted
      partnerPaidKobo += transfers.filter((t) => t.createdAt >= routingOnSince).reduce((s, t) => s + Math.max(t.grossCommissionKobo, t.amountKobo), 0);
    }
  }
  const uncovered = Math.max(0, shortfallKobo + partnerPaidKobo - topupKobo);
  const feesInBalance = feesEarnedKobo - sweptKobo;
  return {
    mode,
    routingOnSince,
    feesEarnedKobo,
    sweptKobo,
    shortfallKobo,
    topupKobo,
    partnerPaidKobo,
    owedKobo: Math.max(0, uncovered - feesInBalance),
    movableKobo: Math.max(0, feesInBalance - uncovered),
  };
}

/**
 * Clinicians' money the balance must keep, beyond the ledger: payouts not yet sent (pending, or
 * sending), and the kept share of routed bookings whose payout row doesn't exist yet (the session
 * is still to come). Moving fees out never touches this.
 */
export async function cliniciansMoneyInBalanceKobo(ctx: QueryCtx | MutationCtx): Promise<{ unpaidPayoutsKobo: number; upcomingKeptKobo: number }> {
  const mode = currentPaystackMode();
  let unpaidPayoutsKobo = 0;
  for (const status of ["pending", "processing"] as const) {
    const rows = await ctx.db
      .query("payouts")
      .withIndex("by_status", (q) => q.eq("status", status))
      .take(PAYOUT_READ_CAP);
    // Payouts of test payments (admin/testPayments.ts) moved no real money
    unpaidPayoutsKobo += rows.filter((p) => mode === "test" || p.paystackMode !== "test").reduce((s, p) => s + p.amount, 0);
  }
  let upcomingKeptKobo = 0;
  const routed = await ctx.db.query("paystackRoutedPayments").order("desc").take(ROUTED_READ_CAP);
  for (const r of routed) {
    if (r.kind !== "held_booking" || r.paystackMode !== mode || !r.bookingId) continue;
    const booking = await ctx.db.get(r.bookingId);
    // Unpaid checkouts left nothing; refunded ones are settled through the refund shortfall
    if (!booking || booking.paymentStatus !== "completed" || booking.paymentReference !== r.reference) continue;
    const payout = booking.invoiceId
      ? await ctx.db
          .query("payouts")
          .withIndex("by_payout_invoice_id", (q) => q.eq("invoiceId", booking.invoiceId!))
          .first()
      : null;
    // A payout row is counted above (unpaid) or has been paid; without one the share is still owed
    if (!payout) upcomingKeptKobo += r.keptKobo;
  }
  return { unpaidPayoutsKobo, upcomingKeptKobo };
}

/**
 * What a routed booking's clinician still takes from the pool for this payment: payouts made or
 * owed for it (failed ones count unless dropped for the refund, since they'll be sent again). A
 * booking that still stands owes at least the share it kept, as the payout may not exist yet.
 */
async function clinicianClaimKobo(ctx: MutationCtx, booking: Doc<"marketplaceBookings"> | null, keptKobo: number): Promise<number> {
  if (!booking) return keptKobo;
  const payouts = booking.invoiceId
    ? await ctx.db
        .query("payouts")
        .withIndex("by_payout_invoice_id", (q) => q.eq("invoiceId", booking.invoiceId!))
        .collect()
    : [];
  const owed = payouts
    .filter((p) => !(p.status === "failed" && /refunded/i.test(p.failureReason ?? "")))
    .reduce((s, p) => s + p.amount, 0);
  const undone = booking.bookingStatus === "cancelled" || booking.paymentStatus === "refunded";
  return undone ? owed : Math.max(keptKobo, owed);
}

/**
 * A refund of a payment (helpers/paymentRefunds.ts, called for every Paystack refund once). Paystack
 * takes it from the main balance. When that payment was split by routing, or its Rehabify fee was
 * counted as left in the balance, records how much of the refund the pool can't cover:
 *   - Rehabify-only product (nothing stayed in the balance): all of the refund;
 *   - Rehabify Care booking: refunded so far + what the physio still takes − what the payment kept
 *     (e.g. ₦6,000 refunded, ₦4,200 kept, no payout → ₦1,800; a late cancellation refunding
 *     ₦3,000 while the physio still gets ₦2,100 → ₦900);
 *   - clinic/physio invoice whose provider share went to their own bank: all of the refund (their
 *     share isn't in the balance; Rehabify's fee row already counts what was).
 * Cumulative per payment, so partial refunds add up and a repeat adds nothing.
 */
export async function recordRefundShortfall(
  ctx: MutationCtx,
  refund: { reference: string; refundKey: string; refundedTotalKobo: number }
): Promise<void> {
  const routed = await ctx.db
    .query("paystackRoutedPayments")
    .withIndex("by_reference", (q) => q.eq("reference", refund.reference))
    .first();
  let cumulative = 0;
  let mode: PaystackMode;
  let bookingId: Id<"marketplaceBookings"> | undefined;
  let invoiceId: Id<"invoices"> | undefined;
  let note: string;
  if (routed) {
    mode = routed.paystackMode;
    bookingId = routed.bookingId;
    if (routed.kind === "rehabify_only") {
      cumulative = refund.refundedTotalKobo;
      note = "Rehabify's own product: all of it had gone to Rehabify's bank";
    } else {
      const booking = routed.bookingId ? await ctx.db.get(routed.bookingId) : null;
      const claim = await clinicianClaimKobo(ctx, booking, routed.keptKobo);
      cumulative = Math.max(0, refund.refundedTotalKobo + claim - routed.keptKobo);
      note = `Rehabify Care booking: kept ₦${naira(routed.keptKobo)} for the physio, who still takes ₦${naira(claim)}`;
    }
  } else {
    const fee = (
      await ctx.db
        .query("paystackPoolLedger")
        .withIndex("by_payment_reference", (q) => q.eq("paymentReference", refund.reference))
        .collect()
    ).find((r) => r.kind === "fee_earned");
    if (!fee) return; // Not routed and paid before the switch: not counted here
    mode = fee.paystackMode;
    invoiceId = fee.invoiceId;
    cumulative = refund.refundedTotalKobo;
    note = "Invoice paid to a clinic or physio's own account: the refund came from the balance";
  }
  const already = (
    await ctx.db
      .query("paystackPoolLedger")
      .withIndex("by_payment_reference", (q) => q.eq("paymentReference", refund.reference))
      .collect()
  )
    .filter((r) => r.kind === "refund_shortfall")
    .reduce((s, r) => s + r.amountKobo, 0);
  const add = Math.round(cumulative - already);
  if (add <= 0) return;
  await ctx.db.insert("paystackPoolLedger", {
    kind: "refund_shortfall",
    amountKobo: add,
    paystackMode: mode,
    paymentReference: refund.reference,
    refundKey: refund.refundKey,
    bookingId,
    invoiceId,
    note,
    createdAt: Date.now(),
  });
}

/**
 * A clinic or independent-physio invoice paid with their own sub-account split while routing is
 * on: the main account kept Rehabify's fee (transaction_charge) and paid Paystack's fee from it
 * (bearer "account"). From then on the main account's settlements stay in the balance, so the
 * net fee is Rehabify's money waiting there. Paystack's actual fee is used when the payment
 * reported it, else the worst case, so the figure is never too high. Once per payment.
 */
export async function recordProviderSplitFee(
  ctx: MutationCtx,
  payment: { reference: string; invoiceId: Id<"invoices">; mainChargeKobo: number; paidKobo: number; paystackFeeKobo?: number }
): Promise<void> {
  if (!activeRehabifySubaccount(checkoutRoutingOf(await routingRow(ctx)))) return;
  const charge = Math.round(payment.mainChargeKobo);
  const fee =
    typeof payment.paystackFeeKobo === "number" && Number.isFinite(payment.paystackFeeKobo) && payment.paystackFeeKobo >= 0
      ? Math.round(payment.paystackFeeKobo)
      : worstCaseFeeKobo(payment.paidKobo);
  const net = charge - fee;
  if (!Number.isFinite(net) || net <= 0) return;
  const existing = await ctx.db
    .query("paystackPoolLedger")
    .withIndex("by_payment_reference", (q) => q.eq("paymentReference", payment.reference))
    .collect();
  if (existing.some((r) => r.kind === "fee_earned")) return;
  await ctx.db.insert("paystackPoolLedger", {
    kind: "fee_earned",
    amountKobo: net,
    paystackMode: currentPaystackMode(),
    paymentReference: payment.reference,
    invoiceId: payment.invoiceId,
    note: `Rehabify's fee ₦${naira(charge)} less Paystack's fee ₦${naira(fee)}${typeof payment.paystackFeeKobo === "number" ? "" : " (estimated)"}`,
    createdAt: Date.now(),
  });
}

export type SweepState = "pending" | "otp_required" | "success" | "failed" | "reversed";

/** The fee move (fee_sweep) with this Paystack transfer reference, if any. */
export async function feeSweepByReference(ctx: QueryCtx | MutationCtx, reference: string) {
  const exact = await ctx.db
    .query("paystackPoolLedger")
    .withIndex("by_transfer_reference", (q) => q.eq("transferReference", reference))
    .first();
  const row =
    exact ??
    (await ctx.db
      .query("paystackPoolLedger")
      .withIndex("by_transfer_reference", (q) => q.eq("transferReference", reference.toLowerCase()))
      .first());
  return row && row.kind === "fee_sweep" ? row : null;
}

/**
 * The one place a fee move changes state (the move itself, "Check on Paystack", the OTP, and the
 * transfer webhook via payouts.recordPayoutTransferWebhook). Failed and reversed are final: that
 * money counts as still in the balance again. Returns whether anything changed.
 */
export async function settleFeeSweep(
  ctx: MutationCtx,
  row: Doc<"paystackPoolLedger">,
  state: SweepState,
  info: { transferCode?: string; reason?: string } = {}
): Promise<boolean> {
  if (row.kind !== "fee_sweep") return false;
  if (row.status === "failed" || row.status === "reversed") return false;
  if (row.status === "success" && state !== "reversed") return false;
  const now = Date.now();
  const final = state === "success" || state === "failed" || state === "reversed";
  await ctx.db.patch(row._id, {
    status: state,
    transferCode: info.transferCode ?? row.transferCode,
    failureReason:
      state === "failed" || state === "reversed"
        ? (info.reason ?? (state === "reversed" ? "The bank sent the transfer back." : "Paystack reported that the transfer failed."))
        : info.reason ?? row.failureReason,
    ...(final ? { completedAt: now } : {}),
    updatedAt: now,
  });
  return true;
}
