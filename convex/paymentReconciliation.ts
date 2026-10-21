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
 *  - invoice payments (patient checkout, clinic and physio payment links).
 */
import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { paystackEvidence } from "./payments";

const MIN_AGE_MS = 10 * 60_000;
const MAX_AGE_MS = 48 * 60 * 60_000;
const PER_RUN = 40;

type Check =
  | { kind: "joy_booking" | "joy_review" | "learn" | "invoice"; reference: string }
  | { kind: "marketplace"; reference: string; bookingId: Id<"marketplaceBookings"> };

export const unconfirmedCheckouts = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }): Promise<Check[]> => {
    const from = now - MAX_AGE_MS;
    const to = now - MIN_AGE_MS;
    const inWindow = (t: number) => t >= from && t <= to;
    const checks: Check[] = [];

    for (const status of ["initializing", "initialized"] as const) {
      const bookings = await ctx.db
        .query("joyPaymentAttempts")
        .withIndex("by_status_created", (q) => q.eq("status", status).gte("createdAt", from).lte("createdAt", to))
        .take(PER_RUN);
      checks.push(...bookings.map((a) => ({ kind: "joy_booking" as const, reference: a.reference })));
      const reviews = await ctx.db
        .query("joySpecialistReviewPaymentAttempts")
        .withIndex("by_status_created", (q) => q.eq("status", status).gte("createdAt", from).lte("createdAt", to))
        .take(PER_RUN);
      checks.push(...reviews.map((a) => ({ kind: "joy_review" as const, reference: a.reference })));
    }

    const pendingBookings = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_booking_status", (q) => q.eq("bookingStatus", "pending_payment"))
      .order("desc")
      .take(300);
    for (const booking of pendingBookings) {
      if (booking.sourceSystem === "joy_ai" || booking.paymentStatus !== "pending" || !inWindow(booking.createdAt)) continue;
      // The latest two checkouts cover a retry after an abandoned first attempt
      for (const reference of (booking.checkoutReferences ?? []).slice(-2)) {
        checks.push({ kind: "marketplace", reference, bookingId: booking._id });
      }
    }

    const registrations = await ctx.db
      .query("learnRegistrations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(200);
    for (const registration of registrations) {
      if (registration.paymentReference && inWindow(registration.lastAttemptAt ?? registration.createdAt)) {
        checks.push({ kind: "learn", reference: registration.paymentReference });
      }
    }

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(200);
    for (const payment of payments) {
      const reference = payment.paystackReference ?? "";
      if (/^(INV|CLN|PHY)_/.test(reference) && inWindow(payment.createdAt)) checks.push({ kind: "invoice", reference });
    }

    return checks.slice(0, PER_RUN);
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

    for (const check of checks) {
      const tx = await verifyWithPaystack(secret, check.reference);
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
