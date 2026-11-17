/**
 * Safety net for missed Paystack webhooks.
 *
 * Every 10 minutes, checkouts that started 10 minutes to 48 hours ago and are still unpaid
 * are looked up with Paystack (/transaction/verify). A payment that did go through is applied
 * with the same idempotent handler the webhook would have used, so a lost or rejected webhook
 * never leaves a patient charged with nothing to show for it:
 *  - Joy bookings and specialist reviews (they have no browser-side verification);
 *  - marketplace bookings (MKT_ references recorded when checkout starts);
 *  - Rehabify Learn registrations;
 *  - invoice payments (patient checkout, clinic and physio payment links);
 *  - Flex / Flex Max (FLEX_ checkouts and renewals recorded when they start);
 *  - Individual Pro, Scribe top-ups and Joy months (PHYSIOPRO_ checkouts and saved-card charges);
 *  - clinic plan invoices (every CLINICSUB_ reference started for an open invoice) and clinic
 *    card checks (CLINICSUB_CARD_, recorded when "Add a card" opens).
 *
 * Each kind has its own share of a run (PER_KIND, newest first), so a pile of abandoned checkouts
 * of one kind never stops the others being checked.
 */
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { paystackEvidence } from "./payments";

// By name: the generated api type is at TypeScript's depth limit (TS2589)
const flexCompleteRef = makeFunctionReference<"mutation", { reference: string; amountKobo: number; currency: string; channel?: string }, unknown>(
  "exercisePrograms:completeVerifiedFlexPayment"
);
const flexCardRef = makeFunctionReference<"mutation", { reference: string; metadata: unknown; authorization: unknown; email?: string }, unknown>(
  "exercisePrograms:saveVerifiedFlexCard"
);
const proSettleRef = makeFunctionReference<
  "mutation",
  { reference: string; amountKobo: number; currency: string; channel?: string; authorization?: unknown; email?: string },
  unknown
>("physioPlans:settlePayment");

const clinicPaidRef = makeFunctionReference<"mutation", { reference: string; amountKobo: number; currency: string }, unknown>(
  "clinicBilling:completeVerifiedSubscriptionPayment"
);
const clinicCardRef = makeFunctionReference<
  "mutation",
  { reference: string; amountKobo: number; metadata: unknown; authorization: unknown; email?: string },
  boolean
>("clinicBilling:saveVerifiedClinicCard");

const MIN_AGE_MS = 10 * 60_000;
const MAX_AGE_MS = 48 * 60 * 60_000;
/** Checks per kind per run (newest first) */
const PER_KIND = 12;
/** Paystack lookups at once */
const BATCH = 6;

type Check =
  | { kind: "joy_booking" | "joy_review" | "learn" | "invoice" | "flex" | "physio_pro" | "clinic_invoice" | "clinic_card_check"; reference: string }
  | { kind: "marketplace"; reference: string; bookingId: Id<"marketplaceBookings"> };

/** When a Rehabify reference (…_<milliseconds>) was started, or null. */
const startedAt = (reference: string) => {
  const ms = Number(/_(\d{12,})$/.exec(reference)?.[1]);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
};

export const unconfirmedCheckouts = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }): Promise<Check[]> => {
    const from = now - MAX_AGE_MS;
    const to = now - MIN_AGE_MS;
    const inWindow = (t: number) => t >= from && t <= to;
    const checks: Check[] = [];
    // Each kind adds at most PER_KIND (newest first)
    const add = (items: Check[]) => checks.push(...items.slice(0, PER_KIND));

    const joyBookings: Check[] = [];
    const joyReviews: Check[] = [];
    for (const status of ["initializing", "initialized"] as const) {
      const bookings = await ctx.db
        .query("joyPaymentAttempts")
        .withIndex("by_status_created", (q) => q.eq("status", status).gte("createdAt", from).lte("createdAt", to))
        .order("desc")
        .take(PER_KIND);
      joyBookings.push(...bookings.map((a) => ({ kind: "joy_booking" as const, reference: a.reference })));
      const reviews = await ctx.db
        .query("joySpecialistReviewPaymentAttempts")
        .withIndex("by_status_created", (q) => q.eq("status", status).gte("createdAt", from).lte("createdAt", to))
        .order("desc")
        .take(PER_KIND);
      joyReviews.push(...reviews.map((a) => ({ kind: "joy_review" as const, reference: a.reference })));
    }
    add(joyBookings);
    add(joyReviews);

    const pendingBookings = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_booking_status", (q) => q.eq("bookingStatus", "pending_payment"))
      .order("desc")
      .take(300);
    const marketplace: Check[] = [];
    for (const booking of pendingBookings) {
      if (booking.sourceSystem === "joy_ai" || booking.paymentStatus !== "pending" || !inWindow(booking.createdAt)) continue;
      // The latest two checkouts cover a retry after an abandoned first attempt
      for (const reference of (booking.checkoutReferences ?? []).slice(-2)) {
        marketplace.push({ kind: "marketplace", reference, bookingId: booking._id });
      }
    }
    add(marketplace);

    const registrations = await ctx.db
      .query("learnRegistrations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(200);
    add(
      registrations
        .filter((r) => r.paymentReference && inWindow(r.lastAttemptAt ?? r.createdAt))
        .map((r) => ({ kind: "learn" as const, reference: r.paymentReference as string }))
    );

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(200);
    add(
      payments
        .filter((p) => /^(INV|CLN|PHY)_/.test(p.paystackReference ?? "") && inWindow(p.createdAt))
        .map((p) => ({ kind: "invoice" as const, reference: p.paystackReference as string }))
    );

    const flex = await ctx.db
      .query("flexCheckouts")
      .withIndex("by_status_created", (q) => q.eq("status", "pending").gte("createdAt", from).lte("createdAt", to))
      .order("desc")
      .take(PER_KIND);
    add(flex.map((f) => ({ kind: "flex" as const, reference: f.reference })));

    // Pro checkouts and saved-card charges (a charge whose answer was lost is applied here too)
    const pro = await ctx.db.query("physioPlanPayments").order("desc").take(300);
    add(pro.filter((p) => p.status === "pending" && inWindow(p.createdAt)).map((p) => ({ kind: "physio_pro" as const, reference: p.reference })));

    // Clinic plan invoices: every reference started for an open invoice (older checkout links,
    // card pages and saved-card charges), not only the latest
    const openInvoices = await ctx.db
      .query("clinicSubscriptionInvoices")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(300);
    const clinicRefs: Check[] = [];
    for (const inv of openInvoices) {
      const refs = inv.paystackReferences ?? (inv.paystackReference ? [inv.paystackReference] : []);
      for (const reference of refs) {
        const t = startedAt(reference);
        if (t !== null && inWindow(t)) clinicRefs.push({ kind: "clinic_invoice", reference });
      }
    }
    add(clinicRefs.sort((a, b) => (startedAt(b.reference) ?? 0) - (startedAt(a.reference) ?? 0)));

    // Clinic card checks whose card wasn't saved (the webhook may have been lost)
    const subs = await ctx.db.query("clinicSubscriptions").order("desc").take(500);
    const cardChecks: Check[] = [];
    for (const sub of subs) {
      const recent = (sub.cardCheckReferences ?? []).filter((r) => {
        const t = startedAt(r);
        return t !== null && inWindow(t);
      });
      if (!recent.length) continue;
      const cards = await ctx.db
        .query("clinicBillingCards")
        .withIndex("by_clinic_status", (q) => q.eq("clinicId", sub.clinicId))
        .order("desc")
        .take(10);
      for (const reference of recent) {
        if (!cards.some((c) => c.checkReference === reference)) cardChecks.push({ kind: "clinic_card_check", reference });
      }
    }
    add(cardChecks);

    return checks;
  },
});

type PaystackTransaction = {
  id?: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  channel?: string;
  fees?: number;
  [key: string]: unknown;
};

async function verifyWithPaystack(secret: string, reference: string): Promise<PaystackTransaction | null> {
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => null)) as { status?: boolean; data?: PaystackTransaction } | null;
    if (!response.ok || !data?.status || !data.data || data.data.reference !== reference) return null;
    return data.data;
  } catch {
    return null;
  }
}

export const reconcilePaystackPayments = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number; settled: number }> => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return { checked: 0, settled: 0 };
    const checks: Check[] = await ctx.runQuery(internal.paymentReconciliation.unconfirmedCheckouts, { now: Date.now() });
    let settled = 0;

    // A few lookups at a time: quick, and well inside Paystack's rate limits
    const verified: { check: Check; tx: PaystackTransaction | null }[] = [];
    for (let i = 0; i < checks.length; i += BATCH) {
      const batch = checks.slice(i, i + BATCH);
      verified.push(...(await Promise.all(batch.map(async (check) => ({ check, tx: await verifyWithPaystack(secret, check.reference) })))));
    }

    for (const { check, tx } of verified) {
      if (!tx || tx.status !== "success") continue;
      const amountKobo = Number(tx.amount) || 0;
      const currency = String(tx.currency || "");
      try {
        switch (check.kind) {
          case "joy_booking":
            await ctx.runMutation(internal.joyIntegration.recordJoyPaymentWebhook, {
              reference: check.reference, amountKobo, currency, paystackEventId: `reconcile-${tx.id ?? check.reference}`,
            });
            break;
          case "joy_review":
            await ctx.runMutation(internal.joyIntegration.recordJoySpecialistReviewPaymentWebhook, {
              reference: check.reference, amountKobo, currency, paystackEventId: `reconcile-${tx.id ?? check.reference}`,
            });
            break;
          case "marketplace":
            // The payment must have been started for this booking (our checkout puts its id in metadata)
            if ((tx.metadata as { bookingId?: unknown } | undefined)?.bookingId !== check.bookingId) {
              console.error("reconcile_marketplace_booking_mismatch", { reference: check.reference });
              break;
            }
            await ctx.runMutation(internal.marketplace.booking.completeVerifiedMarketplacePayment, {
              bookingId: check.bookingId, reference: check.reference, amountKobo, currency,
              feesKobo: typeof tx.fees === "number" ? tx.fees : undefined,
            });
            break;
          case "learn":
            await ctx.runMutation(internal.learn.completeVerifiedPayment, {
              reference: check.reference, amountKobo, currency, channel: typeof tx.channel === "string" ? tx.channel : undefined,
            });
            break;
          case "invoice":
            await ctx.runMutation(internal.payments.updatePaymentStatus, {
              paystackReference: check.reference, status: "completed", paystackData: paystackEvidence(tx),
            });
            break;
          case "flex": {
            const channel = typeof tx.channel === "string" ? tx.channel : undefined;
            await ctx.runMutation(flexCompleteRef, { reference: check.reference, amountKobo, currency, channel });
            // "Renew automatically" ticked: keep the card, as the webhook would have
            await ctx.runMutation(flexCardRef, {
              reference: check.reference,
              metadata: tx.metadata ?? null,
              authorization: tx.authorization ?? null,
              email: typeof (tx.customer as { email?: unknown } | undefined)?.email === "string" ? (tx.customer as { email: string }).email : undefined,
            });
            break;
          }
          case "clinic_invoice": {
            await ctx.runMutation(clinicPaidRef, { reference: check.reference, amountKobo, currency });
            // Paid on the "Add a card" page: keep the card, as the webhook would have
            await ctx.runMutation(clinicCardRef, {
              reference: check.reference,
              amountKobo,
              metadata: tx.metadata ?? null,
              authorization: tx.authorization ?? null,
              email: typeof (tx.customer as { email?: unknown } | undefined)?.email === "string" ? (tx.customer as { email: string }).email : undefined,
            });
            break;
          }
          case "clinic_card_check":
            await ctx.runMutation(clinicCardRef, {
              reference: check.reference,
              amountKobo,
              metadata: tx.metadata ?? null,
              authorization: tx.authorization ?? null,
              email: typeof (tx.customer as { email?: unknown } | undefined)?.email === "string" ? (tx.customer as { email: string }).email : undefined,
            });
            break;
          case "physio_pro":
            await ctx.runMutation(proSettleRef, {
              reference: check.reference,
              amountKobo,
              currency,
              channel: typeof tx.channel === "string" ? tx.channel : undefined,
              authorization: tx.authorization ?? undefined,
              email: typeof (tx.customer as { email?: unknown } | undefined)?.email === "string" ? (tx.customer as { email: string }).email : undefined,
            });
            break;
        }
        settled++;
        console.warn("paystack_payment_reconciled", { kind: check.kind, reference: check.reference });
      } catch (error) {
        console.error("paystack_reconcile_failed", { kind: check.kind, reference: check.reference, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { checked: checks.length, settled };
  },
});
