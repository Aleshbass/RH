import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { logJourney } from "../joyHandoff";

/**
 * Tells Joy (the WhatsApp assistant) that one of its patients' bookings was cancelled, wherever
 * that happened: the patient's or physio's dashboard, a refund request, or the care team. Joy
 * stops that booking's reminders and messages the patient. Queued in the same outbox as Joy's
 * other events (joyIntegration.queueJoyEvent), so a failed delivery is retried by the cron.
 * Only bookings made through Joy (sourceSystem "joy_ai") are sent; others are ignored.
 */
/**
 * A physio sent, added to or changed a home programme: Joy tells the patient on WhatsApp and offers
 * reminders. Only for patients Joy can reach (a WhatsApp-only record, or a record connected or linked
 * to a WhatsApp number); everyone else gets the app notification and email as before.
 */
export async function queueJoyProgrammeSent(
  ctx: MutationCtx,
  patient: Doc<"users">,
  details: { programmeId: string; title: string; senderName: string; change: "new" | "added" | "updated"; what?: string }
) {
  const reachable = patient.clerkId.startsWith("joy-whatsapp:") || Boolean(patient.whatsappLinkedAt);
  if (!reachable) return;
  const now = Date.now();
  // One message per programme per change, at most every 10 minutes (a physio saving edits)
  const eventId = `programme-${details.change}-${details.programmeId}-${Math.floor(now / 600_000)}`;
  const existing = await ctx.db.query("joyEventOutbox").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).first();
  if (existing) return;
  const data = {
    patient_id: patient._id,
    programme_id: details.programmeId,
    title: details.title,
    sender_name: details.senderName,
    change: details.change,
    what: details.what ?? null,
  };
  const payload = { event_id: eventId, event_type: "programme.sent", api_version: "1", occurred_at: new Date(now).toISOString(), data };
  await ctx.db.insert("joyEventOutbox", { eventId, eventType: "programme.sent", payload, status: "pending", attempts: 0, createdAt: now, updatedAt: now });
}

/**
 * A physio or clinic booked a visit for a patient Joy can reach (not a Joy booking: those have their
 * own booking.* events). Joy sends the time on WhatsApp. payToConfirm: a Rehabify Care visit the
 * patient pays for in the app within 24 hours.
 */
export async function queueJoyAppointmentScheduled(
  ctx: MutationCtx,
  patient: Doc<"users">,
  details: { appointmentId: string; startTime: number; endTime: number; online: boolean; physioName: string; clinicName?: string | null; visits?: number; payToConfirm?: boolean }
) {
  const reachable = patient.clerkId.startsWith("joy-whatsapp:") || Boolean(patient.whatsappLinkedAt);
  if (!reachable || details.endTime <= Date.now()) return;
  const eventId = `appointment-scheduled-${details.appointmentId}`;
  const existing = await ctx.db.query("joyEventOutbox").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).first();
  if (existing) return;
  const now = Date.now();
  const data = {
    patient_id: patient._id,
    appointment_id: details.appointmentId,
    start_time: details.startTime,
    end_time: details.endTime,
    online: details.online,
    physio_name: details.physioName,
    clinic_name: details.clinicName ?? null,
    visits: details.visits ?? 1,
    pay_to_confirm: Boolean(details.payToConfirm),
  };
  const payload = { event_id: eventId, event_type: "appointment.scheduled", api_version: "1", occurred_at: new Date(now).toISOString(), data };
  await ctx.db.insert("joyEventOutbox", { eventId, eventType: "appointment.scheduled", payload, status: "pending", attempts: 0, createdAt: now, updatedAt: now });
}

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
  // The tracking timeline (partner, doctor and patient views) shows the cancellation too
  await logJourney(ctx, { patientId: booking.patientId, bookingId: booking._id, stage: "cancelled", eventKey: `booking-cancelled-${booking._id}` });
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
