/**
 * Rehabify Access awards: an approved patient books chosen services with a matched physio at
 * the assisted tariff, for a set number of sessions. The booking mutations check the award
 * here, and a session is used up when payment is verified.
 */
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isLiveHold } from "./slotHolds";

/** Paid sessions plus bookings still holding a slot, so an award can't be overbooked. */
export async function sessionsCommitted(ctx: QueryCtx, award: Doc<"accessAwards">): Promise<number> {
  const bookings = await ctx.db
    .query("marketplaceBookings")
    .withIndex("by_access_award", (q) => q.eq("accessAwardId", award._id))
    .collect();
  const now = Date.now();
  return bookings.filter(
    (booking) =>
      (booking.paymentStatus === "completed" && booking.bookingStatus !== "cancelled") || isLiveHold(booking, now)
  ).length;
}

export async function assertAwardUsable(
  ctx: QueryCtx,
  award: Doc<"accessAwards"> | null,
  expected: { patientId: Id<"users">; physiotherapistId: Id<"users">; serviceId: string }
): Promise<Doc<"accessAwards">> {
  if (!award || award.patientId !== expected.patientId) throw new ConvexError("This Rehabify Access arrangement wasn't found.");
  if (award.status !== "active" || award.expiresAt <= Date.now()) {
    throw new ConvexError("Your Rehabify Access arrangement has ended. Please contact us to review it.");
  }
  if (award.physiotherapistId !== expected.physiotherapistId) {
    throw new ConvexError("Your Rehabify Access sessions are with your matched physiotherapist.");
  }
  if (!award.serviceIds.includes(expected.serviceId)) {
    throw new ConvexError("This service isn't part of your Rehabify Access arrangement.");
  }
  if ((await sessionsCommitted(ctx, award)) >= award.sessionsGranted) {
    throw new ConvexError("You've used all the sessions in your Rehabify Access arrangement.");
  }
  return award;
}

/** Records a paid Access session; completes the award when the last one is used. */
export async function useAwardSession(ctx: MutationCtx, awardId: Id<"accessAwards">): Promise<void> {
  const award = await ctx.db.get(awardId);
  if (!award) return;
  const sessionsUsed = award.sessionsUsed + 1;
  await ctx.db.patch(awardId, {
    sessionsUsed,
    status: sessionsUsed >= award.sessionsGranted ? "completed" : award.status,
    updatedAt: Date.now(),
  });
}

/** Gives a session back after a refund. */
export async function returnAwardSession(ctx: MutationCtx, awardId: Id<"accessAwards">): Promise<void> {
  const award = await ctx.db.get(awardId);
  if (!award || award.sessionsUsed <= 0) return;
  await ctx.db.patch(awardId, {
    sessionsUsed: award.sessionsUsed - 1,
    status: award.status === "completed" && award.expiresAt > Date.now() ? "active" : award.status,
    updatedAt: Date.now(),
  });
}
