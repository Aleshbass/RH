/**
 * Admin: marketplace bookings waiting for a manual bank-transfer confirmation.
 *
 * "Awaiting" is the same set the sidebar badge counts (convex/adminConsole.ts
 * getNavBadges): paymentStatus "pending", a physiotherapist assigned, not cancelled.
 * Confirming goes through api.monthlySettlements.confirmBankTransferBooking, which
 * completes the booking from the admin's evidence. All amounts are in kobo.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ensureUserRole } from "./auth";

const MAX_LIMIT = 200;

function clampLimit(limit: number | undefined, fallback: number) {
  return Math.min(Math.max(Math.floor(limit ?? fallback), 1), MAX_LIMIT);
}

function personName(u: Doc<"users"> | null) {
  if (!u) return null;
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || null;
}

async function enrich(ctx: QueryCtx, bookings: Doc<"marketplaceBookings">[]) {
  const users = new Map<string, Doc<"users"> | null>();
  const getUser = async (id: Id<"users"> | undefined) => {
    if (!id) return null;
    if (!users.has(id)) users.set(id, await ctx.db.get(id));
    return users.get(id) ?? null;
  };
  const now = Date.now();
  return Promise.all(
    bookings.map(async (b) => {
      const [patient, physio] = await Promise.all([getUser(b.patientId), getUser(b.physiotherapistId)]);
      return {
        _id: b._id,
        bookingCode: b.bookingCode ?? null,
        createdAt: b.createdAt,
        sessionDate: b.sessionDate ?? null,
        sessionType: b.sessionType,
        sessionDuration: b.sessionDuration,
        packageSessions: b.packageSessions ?? null,
        mode: b.joyServiceMode ?? (b.isOnline ? "online" : "in_person"),
        bookingStatus: b.bookingStatus,
        paymentStatus: b.paymentStatus,
        paymentMethod: b.paymentMethod ?? null,
        sourceSystem: b.sourceSystem ?? null,
        // What the confirmation records as paid (confirmBankTransferBooking uses serviceAmount)
        serviceAmountKobo: b.serviceAmount,
        totalAmountKobo: b.totalAmount,
        paidAmountKobo: b.paidAmountKobo ?? null,
        paidAt: b.paidAt ?? null,
        paymentReference: b.paymentReference ?? null,
        holdExpired: typeof b.holdExpiresAt === "number" && b.holdExpiresAt < now,
        patient: {
          _id: b.patientId,
          name: b.guestName || personName(patient) || "Patient",
          email: b.guestEmail || patient?.email || null,
          phone: b.guestPhone || patient?.phoneNumber || null,
          isGuest: Boolean(b.isGuestBooking),
        },
        physiotherapist: b.physiotherapistId
          ? { _id: b.physiotherapistId, name: personName(physio) || "Physiotherapist", email: physio?.email ?? null }
          : null,
        bankTransferDetails: b.bankTransferDetails ?? null,
      };
    })
  );
}

/** Bookings whose patient may have paid by bank transfer and still need confirming. Newest first. */
export const listAwaitingPayment = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const limit = clampLimit(args.limit, 100);
    const pending = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_payment_status", (q) => q.eq("paymentStatus", "pending"))
      .order("desc")
      .take(limit * 2);
    const awaiting = pending.filter((b) => b.physiotherapistId && b.bookingStatus !== "cancelled").slice(0, limit);
    return {
      rows: await enrich(ctx, awaiting),
      // True when there may be more than we read
      capped: pending.length >= limit * 2,
    };
  },
});

/** Bank transfers an admin has already confirmed, most recently confirmed first. */
export const listRecentlyConfirmed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const limit = clampLimit(args.limit, 50);
    const completed = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_payment_status", (q) => q.eq("paymentStatus", "completed"))
      .order("desc")
      .take(Math.max(limit * 6, 300));
    const confirmed = completed
      .filter((b) => b.paymentMethod === "bank_transfer" && b.bankTransferDetails)
      .sort(
        (a, b) =>
          (b.bankTransferDetails?.confirmedAt ?? b.paidAt ?? 0) - (a.bankTransferDetails?.confirmedAt ?? a.paidAt ?? 0)
      )
      .slice(0, limit);
    return enrich(ctx, confirmed);
  },
});
