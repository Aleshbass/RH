/**
 * Finds payments made while Paystack ran on a TEST key and flags them (paystackMode: "test"), so the
 * admin money figures show real money only. Nothing is deleted: the rows stay for the record and
 * every admin total skips them (isTestMoney).
 *
 * Each Paystack reference is checked with Paystack using the live key: a test payment doesn't exist
 * in live mode ("not found"), a real one comes back with domain "live". Anything Paystack can't
 * answer is left alone. Payouts owed from test money are stopped (status failed, with the reason),
 * so no real money is ever sent for them.
 *
 * Run on production, dry run first:
 *   npx convex run --prod admin/testPayments:scan
 *   npx convex run --prod admin/testPayments:scan '{"apply": true}'
 */
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { currentPaystackMode } from "../helpers/paystackMode";

type Table = "invoices" | "marketplaceBookings" | "learnRegistrations" | "joySpecialistReviews";
type Candidate = { table: Table; id: string; reference: string; amountKobo: number; label: string };
type Verdict = Candidate & { mode: "test" | "live" | "unknown"; note?: string };

const SCAN_CAP = 2000;
// Our Paystack reference prefixes (invoices, clinic links, physio links, bookings, Joy, Learn, reviews)
const PAYSTACK_REF = /^(INV|CLN|PHY|MKT|JOY|JOYREV|LEARN|FLEX|CLINICSUB|VERIFICATION)_/;
const MANUAL_METHODS = new Set(["cash", "bank_transfer", "pos", "free"]);

const candidatesRef = makeFunctionReference<"query", Record<string, never>, Candidate[]>("admin/testPayments:candidates");
const markRef = makeFunctionReference<"mutation", { rows: { table: Table; id: string; mode: "test" | "live" }[] }, { flagged: number; payoutsStopped: number }>(
  "admin/testPayments:mark"
);

/** Paid rows with a Paystack reference whose mode isn't known yet. */
export const candidates = internalQuery({
  args: {},
  handler: async (ctx): Promise<Candidate[]> => {
    const out: Candidate[] = [];
    for (const inv of await ctx.db.query("invoices").order("desc").take(SCAN_CAP)) {
      if (inv.paystackMode || (inv.status !== "paid" && inv.status !== "partial_payment")) continue;
      const ref = inv.paymentReference ?? "";
      if (!PAYSTACK_REF.test(ref) || MANUAL_METHODS.has(inv.paymentMethod ?? "")) continue;
      out.push({ table: "invoices", id: inv._id, reference: ref, amountKobo: inv.paidAmount ?? inv.totalAmount, label: inv.invoiceNumber ?? "invoice" });
    }
    for (const b of await ctx.db.query("marketplaceBookings").order("desc").take(SCAN_CAP)) {
      if (b.paystackMode || b.paymentStatus !== "completed" || !b.paymentReference || !PAYSTACK_REF.test(b.paymentReference)) continue;
      out.push({ table: "marketplaceBookings", id: b._id, reference: b.paymentReference, amountKobo: b.totalAmount, label: `booking ${b.bookingCode ?? b._id}` });
    }
    for (const r of await ctx.db.query("learnRegistrations").order("desc").take(SCAN_CAP)) {
      if (r.paystackMode || !r.paidReference) continue;
      out.push({ table: "learnRegistrations", id: r._id, reference: r.paidReference, amountKobo: r.paidAmountKobo ?? 0, label: "Learn registration" });
    }
    for (const r of await ctx.db.query("joySpecialistReviews").order("desc").take(SCAN_CAP)) {
      if (r.paystackMode || !r.paymentReference || !r.paidAt) continue;
      out.push({ table: "joySpecialistReviews", id: r._id, reference: r.paymentReference, amountKobo: 0, label: "Joy specialist review" });
    }
    return out;
  },
});

async function paystackModeOf(reference: string, secret: string): Promise<{ mode: Verdict["mode"]; note?: string }> {
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: { domain?: string; status?: string } } | null;
    if (response.ok && body?.status && body.data) {
      return body.data.domain === "test" ? { mode: "test" } : { mode: "live", note: body.data.status };
    }
    // A test reference doesn't exist in live mode
    if (/not found/i.test(body?.message ?? "")) return { mode: "test", note: "not found in live mode" };
    return { mode: "unknown", note: `${response.status} ${body?.message ?? ""}`.trim() };
  } catch (error) {
    return { mode: "unknown", note: error instanceof Error ? error.message : "request failed" };
  }
}

/** Checks every candidate with Paystack. Dry run unless apply is true. */
export const scan = internalAction({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ apply: boolean; test: Verdict[]; live: number; unknown: Verdict[]; flagged?: number; payoutsStopped?: number }> => {
    const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
    if (currentPaystackMode() !== "live") {
      throw new Error("This deployment's Paystack key isn't live, so test payments can't be told apart. Run it on production.");
    }
    const rows = await ctx.runQuery(candidatesRef, {});
    const verdicts: Verdict[] = [];
    for (const row of rows) {
      verdicts.push({ ...row, ...(await paystackModeOf(row.reference, secret)) });
    }
    const test = verdicts.filter((row) => row.mode === "test");
    const live = verdicts.filter((row) => row.mode === "live");
    const unknown = verdicts.filter((row) => row.mode === "unknown");
    if (!args.apply) return { apply: false, test, live: live.length, unknown };
    const result = await ctx.runMutation(markRef, {
      rows: [...test, ...live].map((row) => ({ table: row.table, id: row.id, mode: row.mode as "test" | "live" })),
    });
    return { apply: true, test, live: live.length, unknown, ...result };
  },
});

const STOPPED_REASON = "Paid with a Paystack test key, so no real money came in and nothing is paid out.";

/** Flags the rows, the Rehabify invoices and receipts that go with them, and stops their payouts. */
export const mark = internalMutation({
  args: {
    rows: v.array(
      v.object({
        table: v.union(v.literal("invoices"), v.literal("marketplaceBookings"), v.literal("learnRegistrations"), v.literal("joySpecialistReviews")),
        id: v.string(),
        mode: v.union(v.literal("test"), v.literal("live")),
      })
    ),
  },
  handler: async (ctx, args) => {
    let flagged = 0;
    let payoutsStopped = 0;
    const now = Date.now();

    const stopPayouts = async (payouts: { _id: Id<"payouts">; status: string; paystackMode?: string }[]) => {
      for (const payout of payouts) {
        if (payout.paystackMode === "test") continue;
        await ctx.db.patch(payout._id, {
          paystackMode: "test",
          ...(payout.status === "pending" ? { status: "failed" as const, failureReason: STOPPED_REASON, updatedAt: now } : {}),
        });
        if (payout.status === "pending") payoutsStopped++;
      }
    };
    const flagReceipts = async (reference: string | undefined) => {
      if (!reference) return;
      for (const kind of ["payment", "refund"] as const) {
        const receipt = await ctx.db
          .query("receipts")
          .withIndex("by_dedupe", (q) => q.eq("dedupeKey", `${kind}:${reference}`))
          .first();
        if (receipt && receipt.paystackMode !== "test") await ctx.db.patch(receipt._id, { paystackMode: "test" });
      }
    };
    const flagInvoice = async (invoiceId: Id<"invoices">) => {
      const invoice = await ctx.db.get(invoiceId);
      if (!invoice) return;
      if (invoice.paystackMode !== "test") await ctx.db.patch(invoice._id, { paystackMode: "test" });
      await stopPayouts(
        await ctx.db
          .query("payouts")
          .withIndex("by_payout_invoice_id", (q) => q.eq("invoiceId", invoice._id))
          .take(50)
      );
      await flagReceipts(invoice.paymentReference);
    };

    for (const row of args.rows) {
      if (row.mode === "live") {
        const live = { paystackMode: "live" as const };
        if (row.table === "invoices") {
          const id = ctx.db.normalizeId("invoices", row.id);
          if (id) await ctx.db.patch(id, live);
        } else if (row.table === "marketplaceBookings") {
          const id = ctx.db.normalizeId("marketplaceBookings", row.id);
          if (id) await ctx.db.patch(id, live);
        } else if (row.table === "learnRegistrations") {
          const id = ctx.db.normalizeId("learnRegistrations", row.id);
          if (id) await ctx.db.patch(id, live);
        } else {
          const id = ctx.db.normalizeId("joySpecialistReviews", row.id);
          if (id) await ctx.db.patch(id, live);
        }
        continue;
      }
      flagged++;
      if (row.table === "invoices") {
        const id = ctx.db.normalizeId("invoices", row.id);
        if (id) await flagInvoice(id);
      } else if (row.table === "marketplaceBookings") {
        const id = ctx.db.normalizeId("marketplaceBookings", row.id);
        const booking = id ? await ctx.db.get(id) : null;
        if (!booking) continue;
        await ctx.db.patch(booking._id, { paystackMode: "test" });
        if (booking.invoiceId) await flagInvoice(booking.invoiceId);
        // Policy payouts (no-show, late cancellation) point at the visit, not the invoice
        if (booking.appointmentId) {
          await stopPayouts(
            await ctx.db
              .query("payouts")
              .withIndex("by_appointment", (q) => q.eq("appointmentId", booking.appointmentId!))
              .take(50)
          );
        }
        await flagReceipts(booking.paymentReference);
      } else if (row.table === "learnRegistrations") {
        const id = ctx.db.normalizeId("learnRegistrations", row.id);
        if (id) await ctx.db.patch(id, { paystackMode: "test" });
      } else {
        const id = ctx.db.normalizeId("joySpecialistReviews", row.id);
        const review = id ? await ctx.db.get(id) : null;
        if (review) {
          await ctx.db.patch(review._id, { paystackMode: "test" });
          await flagReceipts(review.paymentReference);
        }
      }
    }
    return { flagged, payoutsStopped };
  },
});
