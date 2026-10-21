// @ts-nocheck
/**
 * Admin Marketplace Bookings
 * - Page through bookings (newest first) with full guest/patient info
 * - Search recent bookings by patient, clinician, email, phone or reference
 * - Headline counts for the bookings screen
 * - Reassign a specific patient's booking to a different physiotherapist
 * - List all approved physios for reassignment dropdown
 *
 * Every read here is bounded: lists use `.paginate()` and enrich only the page, and the
 * search and stats queries scan a capped window of the most recent bookings.
 */

import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensureUserRole } from "../auth";
import { isPhysioNetworkEligible } from "../physioSetup";
import { isBookableServiceId } from "../../lib/rehabify-services";
import { findSlotClash } from "../helpers/slotHolds";

const BOOKING_STATUSES = new Set([
  "pending_payment",
  "awaiting_admin_schedule",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

/** Most recent bookings the search scans. Older bookings are reached by paging the list. */
const SEARCH_SCAN_LIMIT = 1000;
const SEARCH_RESULT_LIMIT = 50;
/** Most recent bookings the headline counts are computed from. */
const STATS_SCAN_LIMIT = 2000;
const MAX_PAGE_SIZE = 100;

/**
 * The bookings query for a status filter, using an index so pagination stays cheap.
 * `payment_failed` is a payment state rather than a booking state; anything unknown means all.
 */
function bookingsForStatus(ctx: QueryCtx, status?: string) {
  if (status === "payment_failed") {
    return ctx.db
      .query("marketplaceBookings")
      .withIndex("by_payment_status", (q) => q.eq("paymentStatus", "failed"));
  }
  if (status && BOOKING_STATUSES.has(status)) {
    return ctx.db
      .query("marketplaceBookings")
      .withIndex("by_booking_status", (q) => q.eq("bookingStatus", status));
  }
  return ctx.db.query("marketplaceBookings");
}

function fullName(user: Doc<"users"> | null | undefined) {
  if (!user) return "";
  return `${user.firstName || ""} ${user.lastName || ""}`.trim();
}

/**
 * Older Joy virtual bookings were created before their 100% Rehabify allocation was
 * recorded. Derive it so reporting is historically accurate while new bookings persist it.
 */
function rehabifyShare(booking: Doc<"marketplaceBookings">) {
  // Standard pricing: after the physio's payout and Paystack's actual fee (once known)
  if (booking.pricingModel) {
    const estimate = booking.paystackFeeEstimateKobo ?? 0;
    return (booking.rehabifyEarnings ?? 0) + estimate - (booking.paystackFeeActualKobo ?? estimate);
  }
  return booking.rehabifyEarnings ?? (
    booking.joyBookingRoute === "admin_scheduled_virtual" ? booking.totalAmount : booking.platformFee
  );
}

/** Resolve patient (or guest) and physio details for one booking. */
async function enrichBooking(ctx: QueryCtx, booking: Doc<"marketplaceBookings">) {
  // ── Patient Info ──
  let patientName = "Guest";
  let patientEmail = booking.guestEmail || "";
  let patientPhone = booking.guestPhone || "";
  let isGuest = Boolean(booking.isGuestBooking);
  // Guest bookings point at a guest user row, which carries the patient's Rehabify ID too
  const patient = await ctx.db.get(booking.patientId);
  const patientNumber = patient?.patientNumber ?? null;

  if (!booking.isGuestBooking) {
    if (patient) {
      patientName = fullName(patient) || patient.email || "Patient";
      patientEmail = patient.email || "";
      patientPhone = patient.phoneNumber || "";
    }
  } else {
    // Guest: use stored guest fields
    patientName = booking.guestName || booking.guestEmail || "Guest";
    isGuest = true;
  }

  // ── Physio Info ──
  const physio = booking.physiotherapistId ? await ctx.db.get(booking.physiotherapistId) : null;
  let physioName = booking.adminSchedulingStatus === "awaiting_schedule" ? "Awaiting admin assignment" : "Unassigned";
  let physioEmail = "";
  let physioLocation = "";
  let physioOffersOnline = false;
  let physioOffersInPerson = false;

  if (physio) {
    physioName = fullName(physio) || "Physiotherapist";
    physioEmail = physio.email || "";

    const physioProfile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", booking.physiotherapistId))
      .first();

    if (physioProfile) {
      physioLocation = physioProfile.location || "";
      physioOffersOnline = physioProfile.offersOnlineSessions ?? false;
      physioOffersInPerson = physioProfile.offersInPersonSessions ?? false;
    }
  }

  return {
    _id: booking._id,
    createdAt: booking.createdAt,
    paidAt: booking.paidAt,
    sessionDate: booking.sessionDate,
    sessionType: booking.sessionType,
    sessionDuration: booking.sessionDuration,
    isOnline: booking.isOnline,
    packageSessions: booking.packageSessions,
    conditionLabel: booking.conditionLabel,
    // Standard pricing
    serviceId: booking.serviceId,
    travelZoneName: booking.travelZoneName,
    travelArea: booking.travelArea,
    adminAttentionReason: booking.adminAttentionReason,
    isAccess: Boolean(booking.accessAwardId),

    // Status
    bookingStatus: booking.bookingStatus,
    paymentStatus: booking.paymentStatus,
    paymentReference: booking.paymentReference,
    bookingCode: booking.bookingCode,

    // Amounts (in kobo — client divides by 100)
    totalAmount: booking.totalAmount,
    platformFee: booking.platformFee,
    physiotherapistEarnings: booking.physiotherapistEarnings,
    rehabifyEarnings: rehabifyShare(booking),

    // Patient
    patientId: booking.patientId,
    patientNumber,
    patientName,
    patientEmail,
    patientPhone,
    isGuest,

    // Physio
    physiotherapistId: booking.physiotherapistId,
    physioName,
    physioEmail,
    physioLocation,
    physioOffersOnline,
    physioOffersInPerson,

    // Linked records
    appointmentId: booking.appointmentId,
    joyBookingRoute: booking.joyBookingRoute,
    joyConsultationType: booking.joyConsultationType,
    adminSchedulingStatus: booking.adminSchedulingStatus,
    patientPhysioRelationshipId: booking.patientPhysioRelationshipId,
    treatmentPlanId: booking.treatmentPlanId,
  };
}

/**
 * Marketplace bookings for the admin view, newest first, one page at a time.
 * Properly resolves guest info (name/email/phone) even for non-authed bookings.
 * Use with `usePaginatedQuery`; search goes through `adminSearchMarketplaceBookings`.
 */
export const adminGetAllMarketplaceBookings = query({
  args: {
    paginationOpts: paginationOptsValidator,
    // "all" | booking status | "payment_failed"
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const numItems = Math.min(Math.max(args.paginationOpts.numItems, 1), MAX_PAGE_SIZE);
    const result = await bookingsForStatus(ctx, args.status)
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems });

    return {
      ...result,
      page: await Promise.all(result.page.map((booking) => enrichBooking(ctx, booking))),
    };
  },
});

/**
 * Search the most recent bookings by patient or guest name, email, phone, clinician name,
 * payment reference or booking code. Only matches are enriched.
 */
export const adminSearchMarketplaceBookings = query({
  args: {
    search: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const needle = args.search.trim().toLowerCase();
    if (needle.length < 2) return { bookings: [], scanned: 0, capped: false };

    const recent = await bookingsForStatus(ctx, args.status).order("desc").take(SEARCH_SCAN_LIMIT + 1);
    const capped = recent.length > SEARCH_SCAN_LIMIT;
    const scan = capped ? recent.slice(0, SEARCH_SCAN_LIMIT) : recent;

    // Load each patient and clinician once, however many bookings they have.
    const userIds = new Set<Id<"users">>();
    for (const b of scan) {
      if (b.patientId) userIds.add(b.patientId);
      if (b.physiotherapistId) userIds.add(b.physiotherapistId);
    }
    const users = new Map<Id<"users">, Doc<"users"> | null>();
    await Promise.all([...userIds].map(async (id) => users.set(id, await ctx.db.get(id))));

    const matches: Doc<"marketplaceBookings">[] = [];
    for (const b of scan) {
      if (matches.length >= SEARCH_RESULT_LIMIT) break;
      const patient = users.get(b.patientId);
      const haystack: (string | undefined)[] = [b.guestName, b.guestEmail, b.guestPhone, b.paymentReference, b.bookingCode, patient?.patientNumber];
      if (!b.isGuestBooking) {
        haystack.push(fullName(patient), patient?.email, patient?.phoneNumber);
      }
      if (b.physiotherapistId) haystack.push(fullName(users.get(b.physiotherapistId)));
      if (haystack.some((value) => value && value.toLowerCase().includes(needle))) matches.push(b);
    }

    return {
      bookings: await Promise.all(matches.map((booking) => enrichBooking(ctx, booking))),
      scanned: scan.length,
      capped,
    };
  },
});

/**
 * Headline counts for the bookings screen, computed from the most recent bookings.
 * `capped` is true when there are more bookings than were counted.
 */
export const adminGetMarketplaceBookingStats = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);

    const recent = await ctx.db.query("marketplaceBookings").order("desc").take(STATS_SCAN_LIMIT + 1);
    const capped = recent.length > STATS_SCAN_LIMIT;
    const rows = capped ? recent.slice(0, STATS_SCAN_LIMIT) : recent;

    const statusCounts: Record<string, number> = {};
    let paymentFailed = 0;
    let guest = 0;
    let awaitingSchedule = 0;
    let rehabifyRevenue = 0;

    for (const b of rows) {
      statusCounts[b.bookingStatus] = (statusCounts[b.bookingStatus] ?? 0) + 1;
      if (b.paymentStatus === "failed") paymentFailed += 1;
      if (b.isGuestBooking) guest += 1;
      if (b.adminSchedulingStatus === "awaiting_schedule") awaitingSchedule += 1;
      if (b.paymentStatus === "completed") rehabifyRevenue += rehabifyShare(b) || 0;
    }

    return {
      total: rows.length,
      capped,
      statusCounts,
      paymentFailed,
      guest,
      awaitingSchedule,
      // kobo
      rehabifyRevenue,
    };
  },
});

/**
 * Get all approved physiotherapists for the reassignment dropdown.
 * Returns id, name, location, online/in-person flags.
 */
export const adminGetAllPhysiosForSelect = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);

    // Only approved physios (those with approval status "approved")
    const approvedStatuses = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .take(1000);

    const physioUsers = await Promise.all(
      approvedStatuses.map(async (s) => {
        const user = await ctx.db.get(s.userId);
        if (!user || user.role !== "physiotherapist") return null;

        const profile = await ctx.db
          .query("physiotherapistProfiles")
          .withIndex("by_user_id", (q) => q.eq("userId", user._id))
          .first();

        return {
          id: user._id,
          name: fullName(user) || user.email || "Physiotherapist",
          email: user.email || "",
          location: profile?.location || "",
          offersOnline: profile?.offersOnlineSessions ?? false,
          offersInPerson: profile?.offersInPersonSessions ?? false,
        };
      })
    );

    return physioUsers.filter(Boolean);
  },
});

/**
 * Reassign a specific booking (and all linked records) to a new physiotherapist.
 * Scope: transfers this patient's booking, appointment, relationship, and treatment plan only.
 */
export const adminReassignBookingPhysio = mutation({
  args: {
    bookingId: v.id("marketplaceBookings"),
    newPhysiotherapistId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");

    const oldPhysioId = booking.physiotherapistId;
    const newPhysioId = args.newPhysiotherapistId;

    if (oldPhysioId === newPhysioId) {
      throw new Error("New physiotherapist is the same as current one");
    }

    // Verify new physio exists and is a physiotherapist
    const newPhysio = await ctx.db.get(newPhysioId);
    if (!newPhysio || newPhysio.role !== "physiotherapist") {
      throw new Error("Target user is not a physiotherapist");
    }

    // Standard-priced bookings: the new physio must deliver this service (mode, zone, Access
    // opt-in), be free at that time, and the old physio must not have been paid already.
    const invoice = booking.invoiceId ? await ctx.db.get(booking.invoiceId) : null;
    if (booking.pricingModel && isBookableServiceId(booking.serviceId)) {
      const eligible = await isPhysioNetworkEligible(ctx, newPhysioId, {
        serviceId: booking.serviceId,
        zoneId: booking.travelZoneId ?? null,
        access: booking.accessAwardId ? { payoutKobo: booking.payoutKobo ?? 0 } : undefined,
      });
      if (!eligible) {
        throw new ConvexError("That physiotherapist doesn't offer this service in the patient's area (or isn't in the Rehabify network).");
      }
      if (booking.sessionDate) {
        const clash = await findSlotClash(
          ctx,
          newPhysioId,
          { start: booking.sessionDate, end: booking.sessionDate + booking.sessionDuration * 60_000 },
          { excludeBookingId: booking._id, excludeAppointmentId: booking.appointmentId }
        );
        if (clash) throw new ConvexError("That physiotherapist is already booked at this time.");
      }
      if (invoice) {
        const payout = await ctx.db
          .query("payouts")
          .withIndex("by_payout_invoice_id", (q) => q.eq("invoiceId", invoice._id))
          .first();
        if (payout) throw new ConvexError("The session has already been paid out, so it can't be reassigned.");
      }
    }
    if (invoice) await ctx.db.patch(invoice._id, { physiotherapistId: newPhysioId });

    // 1. Update the booking
    await ctx.db.patch(args.bookingId, {
      physiotherapistId: newPhysioId,
      updatedAt: Date.now(),
    });

    // 2. Update the linked appointment
    if (booking.appointmentId) {
      await ctx.db.patch(booking.appointmentId, {
        physiotherapistId: newPhysioId,
      });
    }

    // 3. Update the patient-physio relationship
    if (booking.patientPhysioRelationshipId) {
      await ctx.db.patch(booking.patientPhysioRelationshipId, {
        physiotherapistId: newPhysioId,
        notes: `Reassigned by admin${args.reason ? `: ${args.reason}` : ""}. Previous physio: ${oldPhysioId}`,
      });
    } else {
      // Create a new relationship with the new physio if none existed
      const existingRel = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient_and_physiotherapist", (q) =>
          q.eq("patientId", booking.patientId).eq("physiotherapistId", newPhysioId)
        )
        .first();

      if (!existingRel) {
        await ctx.db.insert("patientPhysiotherapistRelationships", {
          patientId: booking.patientId,
          physiotherapistId: newPhysioId,
          status: "active",
          isPrimaryPhysiotherapist: true,
          startDate: Date.now(),
          notes: `Created via admin reassignment${args.reason ? `: ${args.reason}` : ""}`,
        });
      }
    }

    // 4. Update treatment plan if exists
    if (booking.treatmentPlanId) {
      await ctx.db.patch(booking.treatmentPlanId as any, {
        physiotherapistId: newPhysioId,
        updatedAt: Date.now(),
      });
    }

    // 5. Update physio earnings stats (deduct from old, add to new)
    if (booking.paymentStatus === "completed") {
      const oldProfile = oldPhysioId
        ? await ctx.db
            .query("physiotherapistProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", oldPhysioId))
            .first()
        : null;
      const newProfile = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", newPhysioId))
        .first();

      if (oldProfile) {
        await ctx.db.patch(oldProfile._id, {
          bookingsThroughMarketplace: Math.max(0, (oldProfile.bookingsThroughMarketplace || 0) - 1),
          totalMarketplaceEarnings: Math.max(0, (oldProfile.totalMarketplaceEarnings || 0) - booking.physiotherapistEarnings),
        });
      }
      if (newProfile) {
        await ctx.db.patch(newProfile._id, {
          bookingsThroughMarketplace: (newProfile.bookingsThroughMarketplace || 0) + 1,
          totalMarketplaceEarnings: (newProfile.totalMarketplaceEarnings || 0) + booking.physiotherapistEarnings,
        });
      }
    }

    // 6. Insert in-app notification for new physio
    await ctx.db.insert("notifications", {
      userId: newPhysioId,
      type: "appointment_scheduled",
      priority: "high",
      status: "pending",
      payload: {
        title: "Patient Assigned to You",
        body: `A booking has been reassigned to you by an admin.${args.reason ? ` Reason: ${args.reason}` : ""}`,
        data: {
          entityId: args.bookingId,
          entityType: "booking",
          actionUrl: "/dashboard/physiotherapist/appointments",
        },
      },
      createdAt: Date.now(),
    } as any);

    return { success: true, bookingId: args.bookingId, newPhysiotherapistId: newPhysioId };
  },
});
