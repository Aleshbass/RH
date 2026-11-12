/**
 * A clinic patient's payment taken outside Paystack (cash, POS, bank transfer). Shared by
 * "Mark as paid" on a payment request and "Record payment" for money the clinic already has,
 * so both count the same in billing, commissions, admin alerts and undo. Nothing is sent to
 * the patient: they paid in person or by transfer and already know.
 */
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { closeInvoicePaymentLinks } from "./paymentLinks";
import { recordInvoicePartnerCommission } from "./partnerLedger";
import { alertAdminsOfPayment } from "./adminPaymentAlerts";

export type ClinicOfflineMethod = "cash" | "bank_transfer" | "pos";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A phone clock a little ahead of the server is fine */
const CLOCK_SKEW_MS = 10 * 60 * 1000;

export const REFERRAL_PAYS_ONLINE =
  "Rehabify referred this patient, so they pay online with the payment link. Send them the link instead.";

/** When the money arrived: now, or an earlier day the clinic picked (never the future, at most a year back). */
export function offlinePaidAt(requested: number | undefined): number {
  const now = Date.now();
  if (requested === undefined) return now;
  if (!Number.isFinite(requested)) throw new ConvexError("Pick a valid payment date");
  if (requested > now + CLOCK_SKEW_MS) throw new ConvexError("The payment date can't be in the future");
  if (requested < now - 366 * DAY_MS) throw new ConvexError("Pick a payment date within the last 12 months");
  return Math.min(requested, now);
}

/** Marks the invoice paid in full by hand and runs the follow-ups (closes links, commission, admin alert). */
export async function settleClinicInvoiceOffline(
  ctx: MutationCtx,
  clinic: Doc<"clinics">,
  invoice: Doc<"invoices">,
  method: ClinicOfflineMethod,
  paidAt: number
) {
  // A patient Rehabify referred pays online, so Rehabify's share is collected with the payment
  if (invoice.patientSource === "rehabify_referral") {
    throw new ConvexError(REFERRAL_PAYS_ONLINE);
  }
  await ctx.db.patch(invoice._id, {
    status: "paid",
    paymentMethod: method,
    paymentDate: paidAt,
    paidAmount: invoice.totalAmount,
  });
  // Paid in person: the online link must not collect a second time
  await closeInvoicePaymentLinks(ctx, invoice._id);
  // A referred patient's partner or doctor earns on this too, once an admin approves it
  // (Rehabify didn't see the money arrive). After an undo (clinicBilling.undoMarkInvoicePaid) the
  // first reference's commission is reversed, so this payment earns under its own reference,
  // which the undo finds again through paymentDate.
  const earlier = await ctx.db
    .query("partnerCommissions")
    .withIndex("by_payment_reference", (q) => q.eq("paymentReference", `manual:${invoice._id}`))
    .first();
  await recordInvoicePartnerCommission(ctx, {
    invoice,
    paidKobo: invoice.subtotalAmount > 0 ? invoice.subtotalAmount : invoice.totalAmount,
    paymentReference: earlier?.status === "reversed" ? `manual:${invoice._id}:${paidAt}` : `manual:${invoice._id}`,
    verified: false,
  });
  // The team sees money taken outside Rehabify
  await alertAdminsOfPayment(ctx, {
    amountKobo: Math.max(0, invoice.totalAmount - (invoice.paidAmount ?? 0)),
    description: `invoice ${invoice.invoiceNumber ?? ""}`.trim(),
    relationship: "clinic",
    payerUserId: invoice.patientId,
    recordedOutside: { by: clinic.name ?? "A clinic", method },
  });
}
