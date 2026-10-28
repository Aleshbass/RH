/**
 * Slot holds for marketplace bookings.
 *
 * A booking is "scheduled" from the moment it is made and holds its slot while the patient
 * pays; it is confirmed only once payment is verified. getAvailableSlots
 * (convex/calendar/availability.ts) already treats unexpired pending_payment holds as busy;
 * this module makes the booking mutations check for clashes and set the hold.
 */
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** How long a web booking holds its slot before payment. */
export const WEB_HOLD_MS = 30 * 60 * 1000;
/** A follow-up scheduled by the physio waits longer: the patient has to see it first. */
export const PHYSIO_SCHEDULED_HOLD_MS = 24 * 60 * 60 * 1000;

const CANCELLED = new Set(["cancelled_by_patient", "cancelled_by_therapist"]);

type Interval = { start: number; end: number };

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

/** A pending booking still holding its slot. */
export function isLiveHold(
  booking: Pick<Doc<"marketplaceBookings">, "bookingStatus" | "holdExpiresAt"> & Partial<Pick<Doc<"marketplaceBookings">, "providerResponse">>,
  now: number
): boolean {
  // A paid request waiting for the physio's answer keeps its time until they answer
  if (booking.bookingStatus === "awaiting_physio") return booking.providerResponse === "pending";
  return booking.bookingStatus === "pending_payment" && (booking.holdExpiresAt ?? 0) > now;
}

export function bookingInterval(booking: Pick<Doc<"marketplaceBookings">, "sessionDate" | "sessionDuration">): Interval | null {
  if (!booking.sessionDate) return null;
  return { start: booking.sessionDate, end: booking.sessionDate + booking.sessionDuration * 60_000 };
}

/** The physio's Google Calendar (cached free/busy) has something at this time. */
export async function isGoogleBusy(ctx: QueryCtx, physiotherapistId: Id<"users">, slot: Interval): Promise<boolean> {
  const cache = await ctx.db
    .query("googleBusyCache")
    .withIndex("by_user_id", (q) => q.eq("userId", physiotherapistId))
    .first();
  return Boolean(cache?.blocks.some((block) => overlaps(block, slot)));
}

/** What is blocking this physio's time over the interval, if anything. */
export async function findSlotClash(
  ctx: QueryCtx,
  physiotherapistId: Id<"users">,
  slot: Interval,
  options: { excludeBookingId?: Id<"marketplaceBookings">; excludeAppointmentId?: Id<"appointments"> } = {}
): Promise<"appointment" | "hold" | null> {
  const appointments = await ctx.db
    .query("appointments")
    .withIndex("by_physiotherapist_id_and_time", (q) => q.eq("physiotherapistId", physiotherapistId).lt("startTime", slot.end))
    .collect();
  const appointmentClash = appointments.some(
    (appointment) =>
      appointment._id !== options.excludeAppointmentId &&
      !CANCELLED.has(appointment.status) &&
      overlaps({ start: appointment.startTime, end: appointment.endTime }, slot)
  );
  if (appointmentClash) return "appointment";

  const now = Date.now();
  const bookings = await ctx.db
    .query("marketplaceBookings")
    .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physiotherapistId))
    .collect();
  const holdClash = bookings.some((booking) => {
    if (booking._id === options.excludeBookingId || !isLiveHold(booking, now)) return false;
    const interval = bookingInterval(booking);
    return interval !== null && overlaps(interval, slot);
  });
  return holdClash ? "hold" : null;
}

/** Throws a patient-friendly error when the slot is taken or held by someone else. */
export async function assertSlotFree(
  ctx: QueryCtx,
  physiotherapistId: Id<"users">,
  slot: Interval,
  options: { excludeBookingId?: Id<"marketplaceBookings"> } = {}
): Promise<void> {
  const clash = await findSlotClash(ctx, physiotherapistId, slot, options);
  if (clash === "appointment") throw new ConvexError("That time has just been booked. Please pick another time.");
  if (clash === "hold") throw new ConvexError("Someone is completing a booking for that time. Please pick another time.");
  if (await isGoogleBusy(ctx, physiotherapistId, slot)) {
    throw new ConvexError("That time isn't available any more. Please pick another time.");
  }
}
