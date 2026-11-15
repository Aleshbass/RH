/**
 * Keeps Joy (WhatsApp) in step with what happens on the website, whatever page or path did it.
 *
 * - syncJoyAppointments: a visit for a WhatsApp patient was booked, moved or cancelled (by the
 *   physio, the clinic, the patient on the website, or the care team). Joy tells the patient and
 *   moves or stops its reminders. Before Nov 2026 only a few paths told Joy anything.
 * - nudgeJoyHolds: a time Joy is holding for payment runs out in ~10 minutes (Joy reminds the
 *   patient, with the payment link), or has just run out (Joy says so and how to try again).
 *
 * Both run every 5 minutes (convex/crons.ts) and only queue events in Joy's outbox, which the
 * outbox cron delivers and retries. Event ids are fixed per change, so nothing is sent twice.
 */
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { queueJoyAppointmentScheduled } from "./helpers/joyEvents";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const CANCELLED = new Set(["cancelled_by_patient", "cancelled_by_therapist"]);

/** Joy can message this patient: a WhatsApp-only record, or one linked to a WhatsApp number. */
function reachableByJoy(user: Doc<"users"> | null): user is Doc<"users"> {
  return Boolean(user && (user.clerkId.startsWith("joy-whatsapp:") || user.whatsappLinkedAt));
}

function nameOf(user: Doc<"users"> | null): string {
  const name = [user?.firstName, user?.lastName].filter((part) => part && part !== "undefined").join(" ").trim();
  return name || "your physiotherapist";
}

async function queueEvent(ctx: MutationCtx, eventId: string, eventType: string, data: Record<string, unknown>): Promise<boolean> {
  const existing = await ctx.db.query("joyEventOutbox").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).first();
  if (existing) return false;
  const now = Date.now();
  const payload = { event_id: eventId, event_type: eventType, api_version: "1", occurred_at: new Date(now).toISOString(), data };
  await ctx.db.insert("joyEventOutbox", { eventId, eventType, payload, status: "pending", attempts: 0, createdAt: now, updatedAt: now });
  return true;
}

/** The Joy booking behind this visit, if it came from one (its own booking.* events cover the booking). */
async function joyBookingFor(ctx: MutationCtx, appointmentId: Id<"appointments">) {
  const booking = await ctx.db.query("marketplaceBookings").withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId)).first();
  return booking && booking.sourceSystem === "joy_ai" ? booking : null;
}

export const syncJoyAppointments = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Visits from an hour ago (a late cancellation still matters) to 60 days ahead
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_start_time", (q) => q.gte("startTime", now - 60 * MINUTE).lt("startTime", now + 60 * DAY))
      .take(3000);
    const patients = new Map<string, Doc<"users"> | null>();
    let queued = 0;
    for (const appointment of appointments) {
      if (!patients.has(appointment.patientId)) patients.set(appointment.patientId, await ctx.db.get(appointment.patientId));
      const patient = patients.get(appointment.patientId) ?? null;
      if (!reachableByJoy(patient)) continue;
      const cancelled = CANCELLED.has(appointment.status);
      const notice = await ctx.db
        .query("joyAppointmentNotices")
        .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
        .first();
      if (!notice) {
        await ctx.db.insert("joyAppointmentNotices", {
          appointmentId: appointment._id, patientId: appointment.patientId, startTime: appointment.startTime, cancelled, updatedAt: now,
        });
        // Booked in the last 2 hours by a path that didn't tell Joy (its own event id dedupes the
        // paths that did). Older visits are only recorded: the first run must not message anyone.
        if (!cancelled && appointment._creationTime > now - 2 * 60 * MINUTE && appointment.startTime > now && !(await joyBookingFor(ctx, appointment._id))) {
          const physio = await ctx.db.get(appointment.physiotherapistId);
          await queueJoyAppointmentScheduled(ctx, patient, {
            appointmentId: appointment._id, startTime: appointment.startTime, endTime: appointment.endTime,
            online: Boolean(appointment.isOnline), physioName: nameOf(physio),
          });
          queued += 1;
        }
        continue;
      }
      const moved = !cancelled && notice.startTime !== appointment.startTime;
      const nowCancelled = cancelled && !notice.cancelled;
      if (!moved && !nowCancelled) continue;
      const physio = await ctx.db.get(appointment.physiotherapistId);
      const booking = await joyBookingFor(ctx, appointment._id);
      const data = {
        patient_id: appointment.patientId,
        appointment_id: appointment._id,
        booking_id: booking?._id ?? null,
        start_time: appointment.startTime,
        end_time: appointment.endTime,
        previous_start_time: notice.startTime,
        online: Boolean(appointment.isOnline),
        physio_name: nameOf(physio),
        cancelled_by: appointment.status === "cancelled_by_patient" ? "patient" : appointment.status === "cancelled_by_therapist" ? "physiotherapist" : null,
      };
      if (nowCancelled) {
        if (await queueEvent(ctx, `appointment-cancelled-${appointment._id}`, "appointment.cancelled", data)) queued += 1;
      } else if (appointment.endTime > now) {
        if (await queueEvent(ctx, `appointment-rescheduled-${appointment._id}-${appointment.startTime}`, "appointment.rescheduled", data)) queued += 1;
      }
      await ctx.db.patch(notice._id, { startTime: appointment.startTime, cancelled, updatedAt: now });
    }
    return { checked: appointments.length, queued };
  },
});

export const nudgeJoyHolds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // The newest unpaid holds; older ones lapsed long ago
    const held = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_booking_status", (q) => q.eq("bookingStatus", "pending_payment"))
      .order("desc")
      .take(300);
    let queued = 0;
    for (const booking of held) {
      if (booking.sourceSystem !== "joy_ai" || booking.paymentStatus !== "pending" || typeof booking.holdExpiresAt !== "number") continue;
      const left = booking.holdExpiresAt - now;
      const physio = booking.physiotherapistId ? await ctx.db.get(booking.physiotherapistId) : null;
      const data = {
        booking_id: booking._id, patient_id: booking.patientId, hold_expires_at: booking.holdExpiresAt,
        start_time: booking.sessionDate ?? null, physio_name: nameOf(physio), amount_kobo: booking.totalAmount ?? null,
      };
      // A renewed hold gets its own reminder (the expiry time is part of the id)
      if (left > 0 && left <= 12 * MINUTE) {
        if (await queueEvent(ctx, `hold-reminder-${booking._id}-${booking.holdExpiresAt}`, "booking.payment_reminder", data)) queued += 1;
      } else if (left <= 0 && left > -20 * MINUTE) {
        if (await queueEvent(ctx, `hold-expired-${booking._id}-${booking.holdExpiresAt}`, "booking.hold_expired", data)) queued += 1;
      }
    }
    return { queued };
  },
});
