import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Tells Joy (the WhatsApp assistant) that one of its patients' bookings was cancelled, wherever
 * that happened: the patient's or physio's dashboard, a refund request, or the care team. Joy
 * stops that booking's reminders and messages the patient. Queued in the same outbox as Joy's
 * other events (joyIntegration.queueJoyEvent), so a failed delivery is retried by the cron.
 * Only bookings made through Joy (sourceSystem "joy_ai") are sent; others are ignored.
 */
export async function queueJoyBookingCancelled(
  ctx: MutationCtx,
  booking: Doc<"marketplaceBookings">,
  details: {
    cancelledBy: "patient" | "physiotherapist" | "care_team" | "system";
    refundStatus?: "none" | "pending" | "refunded";
    notifyPatient?: boolean;
  },
) {
  if (booking.sourceSystem !== "joy_ai") return;
  const eventId = `booking-cancelled-${booking._id}`;
  const existing = await ctx.db.query("joyEventOutbox").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).first();
  if (existing) return;
  const now = Date.now();
  const data = {
    booking_id: booking._id,
    booking_code: booking.bookingCode ?? null,
    patient_id: booking.patientId,
    start_time: booking.sessionDate ?? null,
    cancelled_by: details.cancelledBy,
    paid: booking.paymentStatus === "completed",
    // Unknown (null) when no refund decision was made here: Joy then says the care team will be in touch
    refund_status: details.refundStatus ?? null,
    notify_patient: details.notifyPatient ?? true,
  };
  const payload = { event_id: eventId, event_type: "booking.cancelled", api_version: "1", occurred_at: new Date(now).toISOString(), data };
  await ctx.db.insert("joyEventOutbox", { eventId, eventType: "booking.cancelled", payload, status: "pending", attempts: 0, createdAt: now, updatedAt: now });
}
