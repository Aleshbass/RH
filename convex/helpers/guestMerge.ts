/**
 * A guest who booked without an account (users row with clerkId "guest-…") and later signs up
 * with the same email gets everything moved onto their real account: bookings, visits, the physio
 * link, care episodes and plans, invoices, receipts, video calls and notifications. The guest row
 * then gives up its email, so the same email can't end up on two accounts again.
 *
 * Only call this with an email Clerk has verified for the real account (clerk.ts, users.ts).
 */
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { adoptGuestPatientNumber } from "./rehabifyIds";

const CAP = 500;

export function isGuestUser(user: Pick<Doc<"users">, "clerkId"> | null | undefined): boolean {
  return Boolean(user && String(user.clerkId ?? "").startsWith("guest-"));
}

/** Moves one guest row's records onto the real account. Returns how many records moved. */
async function moveGuest(ctx: MutationCtx, guest: Doc<"users">, userId: Id<"users">): Promise<number> {
  let moved = 0;
  const patch = async (id: any, fields: Record<string, unknown>) => {
    await ctx.db.patch(id, fields);
    moved++;
  };

  const bookings = await ctx.db
    .query("marketplaceBookings")
    .withIndex("by_patient", (q) => q.eq("patientId", guest._id))
    .take(CAP);
  for (const booking of bookings) await patch(booking._id, { patientId: userId, isGuestBooking: false });

  const appointments = await ctx.db
    .query("appointments")
    .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", guest._id))
    .take(CAP);
  for (const appointment of appointments) {
    await patch(appointment._id, { patientId: userId });
    // The video room lists the guest as a participant: the real account must be able to join
    const calls = await ctx.db
      .query("videoCalls")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
      .take(20);
    for (const call of calls) {
      const participants = [...new Set(call.participants.map((p) => (p === guest._id ? userId : p)))];
      await patch(call._id, {
        participants,
        ...((call as { patientId?: Id<"users"> }).patientId === guest._id ? { patientId: userId } : {}),
      });
      const rows = await ctx.db
        .query("videoCallParticipants")
        .withIndex("by_call_and_user", (q) => q.eq("callId", call._id).eq("userId", guest._id))
        .take(5);
      for (const row of rows) await patch(row._id, { userId });
    }
  }

  const relationships = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient", (q) => q.eq("patientId", guest._id))
    .take(CAP);
  for (const relationship of relationships) {
    // The real account may already be linked to the same physio: keep one link
    const existing = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", userId).eq("physiotherapistId", relationship.physiotherapistId))
      .first();
    if (existing) {
      // Keep where Rehabify sent them from (billing evidence), and the active link
      await patch(existing._id, {
        ...(relationship.source && !existing.source ? { source: relationship.source } : {}),
        ...(relationship.status === "active" ? { status: "active" } : {}),
      });
      await ctx.db.delete(relationship._id);
    } else {
      await patch(relationship._id, { patientId: userId });
    }
  }

  for (const table of ["careEpisodes", "treatmentPlans"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_patient", (q: any) => q.eq("patientId", guest._id))
      .take(CAP);
    for (const row of rows) await patch(row._id, { patientId: userId });
  }

  const invoices = await ctx.db
    .query("invoices")
    .withIndex("by_patient_id", (q) => q.eq("patientId", guest._id))
    .take(CAP);
  for (const invoice of invoices) await patch(invoice._id, { patientId: userId });

  const receipts = await ctx.db
    .query("receipts")
    .withIndex("by_payer", (q) => q.eq("payerUserId", guest._id))
    .take(CAP);
  for (const receipt of receipts) await patch(receipt._id, { payerUserId: userId });

  const notifications = await ctx.db
    .query("notifications")
    .withIndex("by_user", (q) => q.eq("userId", guest._id))
    .take(CAP);
  for (const notification of notifications) await patch(notification._id, { userId });

  // The guest row stays (other records may still point at it) but no longer owns the email
  await ctx.db.patch(guest._id, { email: undefined });
  return moved;
}

/**
 * Merge every guest row with this email into the real account. Safe to run more than once.
 * Never touches a staff account's role.
 */
export async function mergeGuestAccounts(ctx: MutationCtx, userId: Id<"users">, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const user = await ctx.db.get(userId);
  if (!user || !email || isGuestUser(user)) return { merged: 0, moved: 0 };

  const candidates = [
    ...(await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).take(10)),
    ...(rawEmail !== email ? await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", rawEmail)).take(10) : []),
  ];
  // Guest bookings also carry the email, in case the guest row's email differs in case
  const bookings = await ctx.db
    .query("marketplaceBookings")
    .filter((q) => q.and(q.eq(q.field("isGuestBooking"), true), q.eq(q.field("guestEmail"), email)))
    .take(50);
  const guestIds = new Set<Id<"users">>();
  for (const candidate of candidates) if (candidate._id !== userId && isGuestUser(candidate)) guestIds.add(candidate._id);
  for (const booking of bookings) if (booking.patientId !== userId) guestIds.add(booking.patientId);

  let merged = 0;
  let moved = 0;
  for (const guestId of guestIds) {
    const guest = await ctx.db.get(guestId);
    if (!guest || !isGuestUser(guest)) continue;
    moved += await moveGuest(ctx, guest, userId);
    merged++;
  }
  if (merged > 0) {
    if (!user.role) await ctx.db.patch(userId, { role: "patient", onboarded: true });
    const profile = await ctx.db
      .query("patientProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();
    if (!profile) await ctx.db.insert("patientProfiles", { userId });
    await adoptGuestPatientNumber(ctx, userId, [...guestIds]);
  }
  return { merged, moved };
}
