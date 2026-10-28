/**
 * The paid invoice behind every Rehabify-priced booking (web, dashboard and Joy).
 *
 * Funds are held by Rehabify: the invoice records what the patient paid (all-inclusive),
 * Rehabify's share, the absorbed Paystack fee and the physio's payout. The physio's payout row is
 * created from it when the appointment is marked completed (appointments.updateAppointmentStatus).
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getService } from "../../lib/rehabify-services";

/**
 * A Rehabify Care invoice (made by ensureMarketplaceInvoice below). It records what the patient
 * paid Rehabify; the physio only ever sees their payout for it, never that amount.
 */
export function isRehabifyCareInvoice(invoice: { invoiceNumber?: string }): boolean {
  return Boolean(invoice.invoiceNumber?.startsWith("INV-MKT-"));
}

/** The physio's payout (plus travel share) on a Rehabify Care invoice, in kobo. */
export function rehabifyCarePayoutKobo(invoice: {
  physiotherapistShare?: number;
  feeBreakdown?: { physiotherapistEarnings?: number };
}): number {
  return invoice.physiotherapistShare ?? invoice.feeBreakdown?.physiotherapistEarnings ?? 0;
}

export function bookingDescription(booking: Doc<"marketplaceBookings">): string {
  const service = booking.serviceId ? getService(booking.serviceId) : undefined;
  const name = service?.name ?? `Physiotherapy session (${booking.sessionType})`;
  const zone = booking.travelZoneName ? ` · ${booking.travelZoneName}` : "";
  return `${name}, ${booking.sessionDuration} min${zone}`;
}

/** Creates the booking's invoice once, and links it to the appointment. Returns its id. */
export async function ensureMarketplaceInvoice(
  ctx: MutationCtx,
  booking: Doc<"marketplaceBookings">,
  appointmentId: Id<"appointments">,
  payment: { reference: string; method: "paystack" | "bank_transfer" | "free"; paidKobo: number }
): Promise<Id<"invoices"> | null> {
  if (!booking.physiotherapistId) return null;
  if (booking.invoiceId) {
    const existing = await ctx.db.get(booking.invoiceId);
    if (existing) {
      const related = existing.relatedAppointmentIds ?? [];
      if (!related.includes(appointmentId)) {
        await ctx.db.patch(existing._id, { relatedAppointmentIds: [...related, appointmentId] });
      }
      // Re-activated with another physio (the first declined or cancelled): the payout follows
      if (existing.physiotherapistId !== booking.physiotherapistId) {
        await ctx.db.patch(existing._id, { physiotherapistId: booking.physiotherapistId });
      }
      return existing._id;
    }
  }

  const charged = payment.method === "free" ? 0 : payment.paidKobo || booking.serviceAmount;
  const travel = booking.travelSurchargeKobo ?? 0;
  const items = [
    {
      description: bookingDescription(booking).replace(/ · .*$/, ""),
      quantity: 1,
      unitPrice: charged - travel,
      totalPrice: charged - travel,
    },
  ];
  if (travel > 0) {
    items.push({ description: `Home visit travel (${booking.travelZoneName ?? "travel zone"})`, quantity: 1, unitPrice: travel, totalPrice: travel });
  }

  const patient = await ctx.db.get(booking.patientId);
  const patientLabel = booking.guestName || [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") || "Patient";
  const email = booking.guestEmail || patient?.email || "";
  const now = Date.now();
  const rehabifyShare = booking.rehabifyEarnings ?? booking.platformFee;
  const invoiceId = await ctx.db.insert("invoices", {
    patientId: booking.patientId,
    physiotherapistId: booking.physiotherapistId,
    invoiceNumber: `INV-MKT-${String(booking._id).slice(-8).toUpperCase()}-${now}`,
    items,
    subtotalAmount: charged,
    platformFeeAmount: Math.max(0, rehabifyShare),
    paystackFeeAmount: booking.paystackFeeActualKobo ?? booking.paystackFee,
    totalAmount: charged,
    paidAmount: charged,
    currency: "NGN",
    issueDate: now,
    dueDate: now,
    status: "paid",
    paymentDate: now,
    paymentMethod: payment.method === "free" ? "free" : payment.method,
    paymentReference: payment.reference,
    payoutRoute: "held_by_platform",
    physiotherapistShare: booking.physiotherapistEarnings,
    platformShare: rehabifyShare,
    feeBreakdown: {
      subtotal: charged,
      discount: 0,
      platformFee: Math.max(0, rehabifyShare),
      paystackPercentage: 0.015,
      paystackFlat: 10000,
      total: charged,
      physiotherapistEarnings: booking.physiotherapistEarnings,
    },
    notes: `Rehabify booking | ${bookingDescription(booking)} | Patient: ${patientLabel}${email ? ` (${email})` : ""}`,
    relatedAppointmentIds: [appointmentId],
  });
  await ctx.db.patch(booking._id, { invoiceId, updatedAt: now });
  return invoiceId;
}
