/**
 * Refund requests. Anything that owes a patient money back (a cancellation, a physio declining,
 * a Flex refund, a clinic credit) files a request here; an admin approves every one on the
 * Refunds page (the owner's rule), which sends it through Paystack. The refund receipt is issued
 * when Paystack confirms it. One open request per payment and reason.
 */
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { issueReceipt } from "./receipts";

export type RefundRequestInput = {
  /** What it's for, e.g. "marketplace_booking", "flex", "clinic_subscription" */
  relatedType: string;
  relatedId: string;
  /** The original Paystack payment reference */
  reference: string;
  amountKobo: number;
  /** Rule code, e.g. "patient_cancel_24h", "patient_cancel_late_50", "physio_declined", "flex_48h" */
  reason: string;
  /** Plain words for the admin and the patient */
  reasonText: string;
  requestedBy: Doc<"refundRequests">["requestedBy"];
  payerUserId?: Id<"users">;
};

/** Files a refund request, or returns the open one already filed for the same payment and reason. */
export async function createRefundRequest(ctx: MutationCtx, input: RefundRequestInput): Promise<Id<"refundRequests">> {
  if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) throw new ConvexError("A refund needs an amount.");
  const existing = await ctx.db
    .query("refundRequests")
    .withIndex("by_related", (q) => q.eq("relatedType", input.relatedType).eq("relatedId", input.relatedId))
    .collect();
  const open = existing.find((row) => row.reason === input.reason && row.status !== "declined" && row.status !== "failed");
  if (open) return open._id;

  // Never more back than was paid for this payment
  const alreadyOwed = existing
    .filter((row) => row.reference === input.reference && row.status !== "declined" && row.status !== "failed")
    .reduce((sum, row) => sum + row.amountKobo, 0);
  const now = Date.now();
  return ctx.db.insert("refundRequests", {
    ...input,
    amountKobo: input.amountKobo,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    ...(alreadyOwed > 0 ? { decisionNote: `Another refund of ₦${(alreadyOwed / 100).toLocaleString("en-NG")} is already filed for this payment.` } : {}),
  });
}

/** Open requests for one booking or purchase, newest first (for showing "refund requested"). */
export async function refundRequestsFor(ctx: MutationCtx | { db: MutationCtx["db"] }, relatedType: string, relatedId: string) {
  const rows = await ctx.db
    .query("refundRequests")
    .withIndex("by_related", (q) => q.eq("relatedType", relatedType).eq("relatedId", relatedId))
    .collect();
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Paystack confirmed a refund (webhook): mark the matching request refunded and send the refund
 * receipt. A refund made straight in the Paystack dashboard, with no request, still gets a
 * receipt when the payer is known.
 */
export async function settleRefundRequest(
  ctx: MutationCtx,
  refund: { reference: string; amountKobo: number; refundKey: string; payerUserId?: Id<"users">; relatedType?: string; relatedId?: string }
) {
  const requests = await ctx.db
    .query("refundRequests")
    .withIndex("by_reference", (q) => q.eq("reference", refund.reference))
    .collect();
  const match =
    requests.find((r) => r.status === "processing" && r.amountKobo === refund.amountKobo) ??
    requests.find((r) => (r.status === "processing" || r.status === "pending") && r.amountKobo === refund.amountKobo);
  const now = Date.now();
  if (match) {
    await ctx.db.patch(match._id, { status: "refunded", paystackRefundId: match.paystackRefundId ?? refund.refundKey, updatedAt: now });
  }
  const payerUserId = match?.payerUserId ?? refund.payerUserId;
  const payer = payerUserId ? await ctx.db.get(payerUserId) : null;
  if (!payer) return;
  await issueReceipt(ctx, {
    kind: "refund",
    payerUserId: payer._id,
    email: payer.email,
    name: [payer.firstName, payer.lastName].filter(Boolean).join(" ") || undefined,
    relatedType: match?.relatedType ?? refund.relatedType ?? "payment",
    relatedId: match?.relatedId ?? refund.relatedId ?? refund.reference,
    description: match?.reasonText ? `your refund: ${match.reasonText.replace(/\.$/, "")}` : "your refund",
    lines: [{ label: "Refund", amountKobo: refund.amountKobo }],
    reference: refund.reference,
    dedupeKey: refund.refundKey,
    paidAt: now,
  });
}
