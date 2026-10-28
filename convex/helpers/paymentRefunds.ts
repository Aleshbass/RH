/**
 * Paystack refunds (refund.processed), for every kind of payment.
 *
 * Each refund is recorded once in paymentRefunds, so a repeated webhook changes nothing and
 * several partial refunds add up. When the total refunded reaches what was paid, the purchase
 * is undone:
 *  - marketplace / Joy booking: cancelled, its invoice voided, any unpaid payout dropped, the
 *    partner commission reversed and a Rehabify Access session given back;
 *  - invoice (INV_/CLN_/PHY_): payment cancelled, invoice voided, unpaid payout dropped and
 *    any partner commission reversed;
 *  - Learn registration: marked refunded;
 *  - verification badge: transaction refunded and the badge it bought switched off;
 *  - Joy specialist review: marked refunded and cancelled unless already done;
 *  - Flex / Flex Max (FLEX_): the 30-day period marked refunded (premium features stop, Basic stays);
 *  - clinic subscription invoice (CLINICSUB_): the refund is recorded on the invoice and the team
 *    alerted; the invoice stays paid, so the clinic is never sent back to past due or read-only.
 * A partial refund keeps the purchase active: the refunded amount is recorded on it and the
 * team is alerted (systemLogs) to decide on any payout or commission adjustment.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { reverseCommissionsForPayment } from "./partnerLedger";
import { transitionReferral } from "./partnerEvents";
import { toPublicStatus } from "./partnerShared";
import { returnAwardSession } from "./accessAwards";
import { settleRefundRequest } from "./refunds";
import { notifyRefundIssued } from "../pushAlerts";

type RefundKind = "marketplace" | "invoice" | "learn" | "verification" | "specialist_review" | "flex" | "clinic_subscription" | "unknown";

export type RefundResult = {
  handled: boolean;
  duplicate?: boolean;
  kind?: RefundKind;
  full?: boolean;
  refundedKobo?: number;
  paidKobo?: number;
};

function refundReference(data: any): string {
  return (
    (typeof data?.transaction_reference === "string" && data.transaction_reference) ||
    (typeof data?.transaction?.reference === "string" && data.transaction.reference) ||
    ""
  );
}

async function alert(ctx: MutationCtx, action: string, reference: string, details: Record<string, unknown>) {
  await ctx.db.insert("systemLogs", {
    type: "payment",
    timestamp: Date.now(),
    action,
    targetEntityType: "payment_reference",
    targetEntityId: reference,
    details,
  });
}

/** Unpaid payouts for a refunded invoice are dropped; one already sent is flagged for recovery. */
async function dropInvoicePayouts(ctx: MutationCtx, invoiceId: Id<"invoices">, reference: string) {
  const payouts = await ctx.db.query("payouts").withIndex("by_payout_invoice_id", (q) => q.eq("invoiceId", invoiceId)).collect();
  for (const payout of payouts) {
    if (payout.status === "pending") {
      await ctx.db.delete(payout._id);
    } else if (payout.status === "failed") {
      await ctx.db.patch(payout._id, { failureReason: "Payment refunded: do not retry", updatedAt: Date.now() });
    } else {
      await alert(ctx, "refund_after_payout", reference, { payoutId: payout._id, amount: payout.amount, status: payout.status });
    }
  }
}

async function voidInvoiceForRefund(ctx: MutationCtx, invoice: Doc<"invoices">, refundedKobo: number, reference: string) {
  await ctx.db.patch(invoice._id, {
    status: "void",
    refundedAmount: refundedKobo,
    paidAmount: Math.max(0, (invoice.paidAmount ?? invoice.totalAmount) - refundedKobo),
    notes: `${invoice.notes ?? ""} | Refunded`.replace(/^ \| /, ""),
  });
  await dropInvoicePayouts(ctx, invoice._id, reference);
  if (invoice.payoutRoute === "split_to_provider") {
    // Paystack already settled the provider's share to their own bank
    await alert(ctx, "refund_of_split_payment", reference, { invoiceId: invoice._id, refundedKobo });
  }
}

async function refundBooking(ctx: MutationCtx, booking: Doc<"marketplaceBookings">, total: number, full: boolean, reference: string) {
  if (!full) {
    await ctx.db.patch(booking._id, {
      refundedAmountKobo: total,
      adminAttentionReason: `Partly refunded (₦${Math.round(total / 100).toLocaleString("en-NG")}). The booking stands; check the physio's payout and any partner commission.`,
      updatedAt: Date.now(),
    });
    return;
  }
  if (booking.paymentStatus === "refunded") return;
  await ctx.db.patch(booking._id, {
    paymentStatus: "refunded",
    refundedAmountKobo: total,
    bookingStatus: booking.bookingStatus === "completed" ? booking.bookingStatus : "cancelled",
    cancellationReason: booking.cancellationReason ?? "Payment refunded",
    updatedAt: Date.now(),
  });
  if (booking.appointmentId) {
    const appointment = await ctx.db.get(booking.appointmentId);
    if (appointment && appointment.status !== "completed" && !String(appointment.status).startsWith("cancelled")) {
      await ctx.db.patch(appointment._id, { status: "cancelled_by_therapist", cancellationReason: "Payment refunded" });
    }
  }
  const invoice = booking.invoiceId
    ? await ctx.db.get(booking.invoiceId)
    : await ctx.db.query("invoices").withIndex("by_payment_reference", (q) => q.eq("paymentReference", reference)).first();
  if (invoice) await voidInvoiceForRefund(ctx, invoice, total, reference);
  if (booking.accessAwardId) await returnAwardSession(ctx, booking.accessAwardId);
  if (booking.referralId) {
    const referral = await ctx.db.get(booking.referralId);
    if (referral && toPublicStatus(referral.status) !== "completed" && toPublicStatus(referral.status) !== "cancelled") {
      await transitionReferral(ctx, referral._id, "refunded", { actorType: "system", actorId: "paystack_refund", metadata: { reference } });
    }
  }
}

export async function applyPaystackRefund(ctx: MutationCtx, data: any): Promise<RefundResult> {
  const reference = refundReference(data);
  if (!reference) return { handled: false };
  const amountKobo = Math.round(Number(data?.amount) || 0);
  if (amountKobo <= 0) return { handled: false };
  const refundKey = String(data?.id ?? data?.refund_reference ?? `${reference}:${amountKobo}:${data?.refunded_at ?? data?.createdAt ?? ""}`);

  const seen = await ctx.db.query("paymentRefunds").withIndex("by_refund_key", (q) => q.eq("refundKey", refundKey)).first();
  if (seen) return { handled: true, duplicate: true, kind: seen.kind as RefundKind };

  const previous = await ctx.db.query("paymentRefunds").withIndex("by_reference", (q) => q.eq("reference", reference)).collect();
  const total = previous.reduce((sum, r) => sum + r.amountKobo, 0) + amountKobo;
  const currency = typeof data?.currency === "string" ? data.currency : undefined;

  let kind: RefundKind = "unknown";
  let paidKobo = 0;
  let full = false;
  // Who to tell that their patient was refunded (pushAlerts.ts)
  let refundedFor: { physioId?: Id<"users">; clinicId?: Id<"clinics">; patientId?: Id<"users"> } | null = null;

  const booking = await ctx.db
    .query("marketplaceBookings")
    .withIndex("by_payment_reference", (q) => q.eq("paymentReference", reference))
    .first();
  if (booking) {
    kind = "marketplace";
    paidKobo = booking.paidAmountKobo ?? booking.serviceAmount;
    full = total >= paidKobo;
    await refundBooking(ctx, booking, total, full, reference);
    const appointment = booking.appointmentId ? await ctx.db.get(booking.appointmentId) : null;
    refundedFor = { physioId: booking.physiotherapistId, clinicId: appointment?.clinicId, patientId: booking.patientId };
    if (full) {
      await reverseCommissionsForPayment(ctx, reference, "Patient payment refunded");
    } else {
      await alert(ctx, "partial_refund_needs_review", reference, { bookingId: booking._id, refundedKobo: total, paidKobo });
    }
  } else if (/^(INV|CLN|PHY|RH)_/.test(reference)) {
    const payment = await ctx.db.query("payments").withIndex("by_paystack_reference", (q) => q.eq("paystackReference", reference)).first();
    const invoice = payment ? await ctx.db.get(payment.invoiceId) : null;
    if (payment && invoice) {
      kind = "invoice";
      paidKobo = Number((payment.metadata as { amount?: number } | undefined)?.amount) || payment.amount;
      full = total >= paidKobo;
      refundedFor = { physioId: invoice.physiotherapistId, clinicId: invoice.clinicId, patientId: invoice.patientId };
      await ctx.db.patch(payment._id, {
        status: full ? "cancelled" : payment.status,
        metadata: { ...(payment.metadata ?? {}), refundedKobo: total },
        updatedAt: Date.now(),
      });
      if (full) {
        await voidInvoiceForRefund(ctx, invoice, total, reference);
        // Any partner or referring-doctor commission earned on this invoice
        await reverseCommissionsForPayment(ctx, reference, "Patient payment refunded");
      } else {
        await ctx.db.patch(invoice._id, {
          refundedAmount: total,
          paidAmount: Math.max(0, (invoice.paidAmount ?? invoice.totalAmount) - amountKobo),
        });
        await alert(ctx, "partial_refund_needs_review", reference, { invoiceId: invoice._id, refundedKobo: total, paidKobo });
      }
    }
  } else if (reference.startsWith("LEARN_")) {
    const match = /^LEARN_([a-z0-9]+)_\d+$/.exec(reference);
    const registrationId = match ? ctx.db.normalizeId("learnRegistrations", match[1]) : null;
    const registration = registrationId ? await ctx.db.get(registrationId) : null;
    if (registration && registration.paidReference === reference) {
      kind = "learn";
      paidKobo = registration.paidAmountKobo ?? registration.amountKobo;
      full = total >= paidKobo;
      if (full && registration.status === "paid") {
        await ctx.db.patch(registration._id, { status: "refunded", updatedAt: Date.now() });
      } else if (!full) {
        await alert(ctx, "partial_refund_needs_review", reference, { registrationId: registration._id, refundedKobo: total, paidKobo });
      }
    }
  } else if (reference.startsWith("VERIFICATION_")) {
    const transaction = await ctx.db
      .query("marketplaceTransactions")
      .withIndex("by_payment_reference", (q) => q.eq("paymentReference", reference))
      .first();
    if (transaction) {
      kind = "verification";
      paidKobo = transaction.amount;
      full = total >= paidKobo;
      if (full && transaction.status === "completed") {
        await ctx.db.patch(transaction._id, { status: "refunded", updatedAt: Date.now() });
        const profile = await ctx.db
          .query("physiotherapistProfiles")
          .withIndex("by_user_id", (q) => q.eq("userId", transaction.userId))
          .first();
        // Only switch off the badge this payment bought (not a later renewal)
        const badge = profile?.verificationBadge;
        if (profile && badge && badge.status !== "none" && badge.paidAt !== undefined && transaction.completedAt !== undefined && Math.abs(badge.paidAt - transaction.completedAt) < 60_000) {
          await ctx.db.patch(profile._id, { verificationBadge: { ...badge, status: "none", expiresAt: Date.now() } });
        } else {
          await alert(ctx, "verification_refund_check_badge", reference, { transactionId: transaction._id, userId: transaction.userId });
        }
      } else if (!full) {
        await alert(ctx, "partial_refund_needs_review", reference, { transactionId: transaction._id, refundedKobo: total, paidKobo });
      }
    }
  } else if (reference.startsWith("JOYREV_")) {
    const review = await ctx.db
      .query("joySpecialistReviews")
      .withIndex("by_payment_reference", (q) => q.eq("paymentReference", reference))
      .first();
    if (review) {
      kind = "specialist_review";
      paidKobo = review.priceKobo;
      full = total >= paidKobo;
      if (full && review.paymentStatus === "completed") {
        await ctx.db.patch(review._id, {
          paymentStatus: "refunded",
          reviewStatus: review.reviewStatus === "completed" ? review.reviewStatus : "cancelled",
          updatedAt: Date.now(),
        });
      } else if (!full) {
        await alert(ctx, "partial_refund_needs_review", reference, { reviewId: review._id, refundedKobo: total, paidKobo });
      }
    }
  } else if (reference.startsWith("FLEX_")) {
    // Flex / Flex Max (exercisePrograms.ts): one 30-day period per payment reference
    const period = await ctx.db
      .query("patientPlanEntitlements")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .first();
    if (period) {
      kind = "flex";
      paidKobo = period.amountKobo;
      full = total >= paidKobo;
      if (full && period.status !== "refunded") {
        await ctx.db.patch(period._id, { status: "refunded", refundedAt: Date.now() });
      } else if (!full) {
        await alert(ctx, "partial_refund_needs_review", reference, { entitlementId: period._id, refundedKobo: total, paidKobo });
      }
    }
  } else if (reference.startsWith("CLINICSUB_")) {
    // Rehabify's invoice to a clinic (clinicBilling.ts). The reference carries the invoice id; a
    // refund of a second (duplicate) payment matches the invoice too.
    const match = /^CLINICSUB_([a-z0-9]+)_\d+$/.exec(reference);
    const invoiceId = match ? ctx.db.normalizeId("clinicSubscriptionInvoices", match[1]) : null;
    const invoice = invoiceId ? await ctx.db.get(invoiceId) : null;
    if (invoice) {
      kind = "clinic_subscription";
      const paidThis = invoice.paidReference === reference;
      paidKobo = paidThis ? (invoice.paidAmountKobo ?? invoice.amountKobo) : amountKobo;
      full = total >= paidKobo;
      if (paidThis) {
        await ctx.db.patch(invoice._id, { refundedKobo: total, updatedAt: Date.now() });
        await alert(ctx, full ? "clinic_subscription_refunded" : "partial_refund_needs_review", reference, {
          clinicSubscriptionInvoiceId: invoice._id,
          refundedKobo: total,
          paidKobo,
        });
      }
    }
  }

  if (kind === "unknown") {
    await alert(ctx, "refund_unmatched", reference, { refundedKobo: amountKobo, currency });
  }
  if (refundedFor) {
    await notifyRefundIssued(ctx, { ...refundedFor, patientName: booking?.guestName, amountKobo, full, refundKey });
  }
  // The admin-approved request (if any) is settled and the patient gets a refund receipt
  await settleRefundRequest(ctx, {
    reference,
    amountKobo,
    refundKey,
    payerUserId: booking?.patientId,
    relatedType: booking ? "marketplace_booking" : undefined,
    relatedId: booking?._id,
  });
  await ctx.db.insert("paymentRefunds", {
    refundKey,
    reference,
    kind,
    amountKobo,
    currency,
    full,
    createdAt: Date.now(),
  });
  return { handled: true, kind, full, refundedKobo: total, paidKobo };
}
