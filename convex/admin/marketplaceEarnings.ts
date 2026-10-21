// @ts-nocheck
/**
 * Admin Marketplace Earnings & Analytics Dashboard
 * View all physiotherapist earnings, patient relationships, platform revenue
 *
 * Reads are bounded: bookings come from the `by_creation_time` index inside the selected
 * time window and are capped at the most recent BOOKING_SCAN_LIMIT; per-physio lookups
 * (relationships, reviews) run only for the page of physios being returned. Each result
 * carries `capped: true` when the cap was hit so the UI can say the numbers are partial.
 */

import { v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensureUserRole } from "../auth";

const BOOKING_SCAN_LIMIT = 2500;
const PROFILE_SCAN_LIMIT = 1000;
const REVIEW_SCAN_LIMIT = 2000;
const PER_PHYSIO_LOOKUP_LIMIT = 500;
const DETAIL_BOOKING_LIMIT = 1000;

const timeframeValidator = v.optional(
  v.union(
    v.literal("all_time"),
    v.literal("this_month"),
    v.literal("last_month"),
    v.literal("this_year")
  )
);

/** [start, end) of a timeframe in ms. `end` is Infinity for open-ended windows. */
function timeframeWindow(timeframe?: string) {
  const date = new Date();
  if (timeframe === "this_month") {
    return { start: new Date(date.getFullYear(), date.getMonth(), 1).getTime(), end: Infinity };
  }
  if (timeframe === "last_month") {
    return {
      start: new Date(date.getFullYear(), date.getMonth() - 1, 1).getTime(),
      end: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
    };
  }
  if (timeframe === "this_year") {
    return { start: new Date(date.getFullYear(), 0, 1).getTime(), end: Infinity };
  }
  return { start: 0, end: Infinity };
}

/** The most recent bookings created inside the window, newest first, capped. */
async function bookingsInWindow(ctx: QueryCtx, window: { start: number; end: number }) {
  const rows = await ctx.db
    .query("marketplaceBookings")
    .withIndex("by_creation_time", (q) => q.gte("_creationTime", window.start))
    .order("desc")
    .take(BOOKING_SCAN_LIMIT + 1);
  const capped = rows.length > BOOKING_SCAN_LIMIT;
  const bookings = (capped ? rows.slice(0, BOOKING_SCAN_LIMIT) : rows).filter(
    (b) => b.createdAt >= window.start && b.createdAt < window.end
  );
  return { bookings, capped };
}


/**
 * Rehabify's share of a booking. Standard-priced bookings: what the patient paid minus the
 * physio's payout and Paystack's fee (the actual fee once the webhook reports it). Older Joy
 * virtual bookings predate the stored value.
 */
function rehabifyShare(b: Doc<"marketplaceBookings">) {
  if (b.pricingModel) {
    const estimate = b.paystackFeeEstimateKobo ?? 0;
    return (b.rehabifyEarnings ?? 0) + estimate - (b.paystackFeeActualKobo ?? estimate);
  }
  return b.rehabifyEarnings ?? (b.joyBookingRoute === "admin_scheduled_virtual" ? b.totalAmount : b.platformFee) ?? 0;
}

const sum = (rows: Doc<"marketplaceBookings">[], pick: (b: Doc<"marketplaceBookings">) => number | undefined) =>
  rows.reduce((total, b) => total + (pick(b) || 0), 0);

const monthKey = (ts: number) => {
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Get comprehensive marketplace earnings for all physiotherapists
 */
export const getAllPhysiotherapistEarnings = query({
  args: {
    timeframe: timeframeValidator,
    sortBy: v.optional(v.union(
      v.literal("earnings_desc"),
      v.literal("earnings_asc"),
      v.literal("bookings_desc"),
      v.literal("patients_desc")
    )),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },

  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const { bookings: windowBookings, capped } = await bookingsInWindow(ctx, timeframeWindow(args.timeframe));

    // Group bookings by physio once instead of filtering the whole list per physio.
    const byPhysio = new Map<Id<"users">, Doc<"marketplaceBookings">[]>();
    for (const b of windowBookings) {
      if (!b.physiotherapistId) continue;
      const list = byPhysio.get(b.physiotherapistId);
      if (list) list.push(b);
      else byPhysio.set(b.physiotherapistId, [b]);
    }

    const physioProfiles = await ctx.db.query("physiotherapistProfiles").take(PROFILE_SCAN_LIMIT);

    // Cheap per-physio figures for everyone (needed to sort and total); lookups come later.
    const rows = (
      await Promise.all(
        physioProfiles.map(async (profile) => {
          const physioUser = await ctx.db.get(profile.userId);
          if (!physioUser) return null;

          const physioBookings = byPhysio.get(profile.userId) ?? [];
          const completedBookings = physioBookings.filter((b) => b.paymentStatus === "completed");

          return {
            profile,
            physioBookings,
            row: {
              physiotherapistId: profile.userId,
              name: `${physioUser.firstName} ${physioUser.lastName}`,
              email: physioUser.email,
              imageUrl: physioUser.imageUrl,
              isAvailable: profile.isAvailableOnMarketplace || false,

              // Earnings breakdown (Naira)
              totalEarnings: sum(completedBookings, (b) => b.physiotherapistEarnings) / 100,
              totalPlatformFees: sum(completedBookings, (b) => b.platformFee) / 100,
              totalPaystackFees: sum(completedBookings, (b) => b.paystackFee) / 100,
              totalRevenue: sum(completedBookings, (b) => b.totalAmount) / 100,

              // Booking stats
              totalBookings: physioBookings.length,
              completedBookings: completedBookings.length,
              pendingBookings: physioBookings.filter((b) => b.paymentStatus === "pending").length,

              // Patient stats
              totalPatients: new Set(physioBookings.map((b) => b.patientId)).size,

              // Reviews
              averageRating: profile.averageRating || 0,

              // Profile stats
              profileViews: profile.profileViews || 0,

              // Pricing
              hourlyRate: profile.hourlyRate ? profile.hourlyRate / 100 : 0,
              initialConsultRate: profile.initialConsultRate ? profile.initialConsultRate / 100 : 0,
            },
          };
        })
      )
    ).filter((d) => d !== null);

    // Sort
    const sortBy = args.sortBy || "earnings_desc";
    rows.sort((a, b) => {
      switch (sortBy) {
        case "earnings_desc":
          return b.row.totalEarnings - a.row.totalEarnings;
        case "earnings_asc":
          return a.row.totalEarnings - b.row.totalEarnings;
        case "bookings_desc":
          return b.row.totalBookings - a.row.totalBookings;
        case "patients_desc":
          return b.row.totalPatients - a.row.totalPatients;
        default:
          return 0;
      }
    });

    // Pagination
    const limit = Math.min(args.limit || 50, 200);
    const offset = args.offset || 0;
    const total = rows.length;

    // Relationship and review counts only for the physios on this page.
    const paginatedData = await Promise.all(
      rows.slice(offset, offset + limit).map(async ({ profile, row }) => {
        const relationships = await ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", profile.userId))
          .take(PER_PHYSIO_LOOKUP_LIMIT);
        const reviews = await ctx.db
          .query("marketplaceReviews")
          .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", profile.userId))
          .take(PER_PHYSIO_LOOKUP_LIMIT);
        return {
          ...row,
          activeRelationships: relationships.filter((r) => r.status === "active").length,
          totalRelationships: relationships.length,
          reviewCount: reviews.length,
        };
      })
    );

    // Calculate platform totals
    const platformTotals = {
      totalRevenue: rows.reduce((total, d) => total + d.row.totalRevenue, 0),
      totalPlatformFees: rows.reduce((total, d) => total + d.row.totalPlatformFees, 0),
      totalPaystackFees: rows.reduce((total, d) => total + d.row.totalPaystackFees, 0),
      totalPhysiotherapistEarnings: rows.reduce((total, d) => total + d.row.totalEarnings, 0),
      totalBookings: rows.reduce((total, d) => total + d.row.totalBookings, 0),
      totalPhysiotherapists: rows.length,
      activePhysiotherapists: rows.filter((d) => d.row.isAvailable).length,
    };

    return {
      physiotherapists: paginatedData,
      platformTotals,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
      capped: capped || physioProfiles.length >= PROFILE_SCAN_LIMIT,
    };
  },
});

/**
 * Get detailed earnings for a specific physiotherapist (the admin drill-down sheet).
 * Returns null when the user isn't a physiotherapist.
 */
export const getPhysiotherapistEarningsDetail = query({
  args: {
    physiotherapistId: v.id("users"),
    timeframe: timeframeValidator,
  },

  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const physioUser = await ctx.db.get(args.physiotherapistId);
    if (!physioUser || physioUser.role !== "physiotherapist") return null;

    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", args.physiotherapistId))
      .first();

    const window = timeframeWindow(args.timeframe);
    const recent = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", args.physiotherapistId))
      .order("desc")
      .take(DETAIL_BOOKING_LIMIT + 1);
    const capped = recent.length > DETAIL_BOOKING_LIMIT;
    const bookings = (capped ? recent.slice(0, DETAIL_BOOKING_LIMIT) : recent).filter(
      (b) => b.createdAt >= window.start && b.createdAt < window.end
    );
    const completed = bookings.filter((b) => b.paymentStatus === "completed");

    // Patients, by total spent. Identified by Rehabify ID only: this is a finance view.
    const patientIds = [...new Set(bookings.map((b) => b.patientId))];
    const patients = await Promise.all(
      patientIds.map(async (patientId) => {
        const patientBookings = bookings.filter((b) => b.patientId === patientId);
        const guestBooking = patientBookings.find((b) => b.isGuestBooking);
        const patient = await ctx.db.get(patientId);
        return {
          id: patientId,
          patientNumber: patient?.patientNumber ?? null,
          isGuest: Boolean(guestBooking),
          totalBookings: patientBookings.length,
          totalSpent: sum(patientBookings.filter((b) => b.paymentStatus === "completed"), (b) => b.totalAmount) / 100,
          lastBookingDate: Math.max(...patientBookings.map((b) => b.createdAt)),
        };
      })
    );
    patients.sort((a, b) => b.totalSpent - a.totalSpent);

    // Earnings breakdown by month (for charts), in Naira
    const earningsByMonth: Record<string, number> = {};
    const bookingsByMonth: Record<string, number> = {};
    for (const booking of completed) {
      const key = monthKey(booking.createdAt);
      earningsByMonth[key] = (earningsByMonth[key] || 0) + (booking.physiotherapistEarnings || 0) / 100;
      bookingsByMonth[key] = (bookingsByMonth[key] || 0) + 1;
    }

    return {
      physiotherapist: {
        id: physioUser._id,
        name: `${physioUser.firstName} ${physioUser.lastName}`,
        email: physioUser.email,
        imageUrl: physioUser.imageUrl,
        location: profile?.location || "",
        isAvailable: profile?.isAvailableOnMarketplace || false,
        averageRating: profile?.averageRating || 0,
      },
      summary: {
        totalBookings: bookings.length,
        completedBookings: completed.length,
        pendingBookings: bookings.filter((b) => b.paymentStatus === "pending").length,
        totalEarnings: sum(completed, (b) => b.physiotherapistEarnings) / 100,
        totalRevenue: sum(completed, (b) => b.totalAmount) / 100,
        platformFees: sum(completed, (b) => b.platformFee) / 100,
        patientCount: patients.length,
      },
      recentBookings: bookings.slice(0, 10).map((b) => ({
        id: b._id,
        createdAt: b.createdAt,
        sessionDate: b.sessionDate,
        sessionType: b.sessionType,
        bookingStatus: b.bookingStatus,
        paymentStatus: b.paymentStatus,
        totalAmount: (b.totalAmount || 0) / 100,
        physiotherapistEarnings: (b.physiotherapistEarnings || 0) / 100,
        patientId: b.patientId,
        patientNumber: patients.find((p) => p.id === b.patientId)?.patientNumber ?? null,
        isGuest: Boolean(b.isGuestBooking),
      })),
      patients: patients.slice(0, 50),
      earningsByMonth,
      bookingsByMonth,
      capped,
    };
  },
});

/**
 * Get platform-wide marketplace analytics
 */
export const getPlatformMarketplaceAnalytics = query({
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);

    const { bookings: allBookings, capped } = await bookingsInWindow(ctx, timeframeWindow("all_time"));
    const completedBookings = allBookings.filter((b) => b.paymentStatus === "completed");

    // Calculate totals
    const totalRevenue = sum(completedBookings, (b) => b.totalAmount);
    const totalPlatformFees = sum(completedBookings, (b) => b.platformFee);
    const totalPaystackFees = sum(completedBookings, (b) => b.paystackFee);
    const totalPhysioEarnings = sum(completedBookings, (b) => b.physiotherapistEarnings);
    const totalRehabify = sum(completedBookings, rehabifyShare);

    // Physiotherapists
    const allPhysios = await ctx.db.query("physiotherapistProfiles").take(PROFILE_SCAN_LIMIT);
    const availablePhysios = allPhysios.filter((p) => p.isAvailableOnMarketplace);

    // Reviews
    const allReviews = await ctx.db.query("marketplaceReviews").order("desc").take(REVIEW_SCAN_LIMIT);
    const averageRating =
      allReviews.length > 0
        ? allReviews.reduce((total, r) => total + r.overallRating, 0) / allReviews.length
        : 0;

    // Unique patients
    const uniquePatients = new Set(allBookings.map((b) => b.patientId));

    // Package vs single-session breakdown
    const isPackage = (b: Doc<"marketplaceBookings">) =>
      b.sessionType === "package" || (b.packageSessions && b.packageSessions > 1);
    const packageBookings = completedBookings.filter(isPackage);
    const singleBookings = completedBookings.filter((b) => !isPackage(b));

    const packageRevenue = sum(packageBookings, (b) => b.totalAmount);
    const singleRevenue = sum(singleBookings, (b) => b.totalAmount);

    const avgPackageSize = packageBookings.length > 0
      ? packageBookings.reduce((total, b) => total + (b.packageSessions || 1), 0) / packageBookings.length
      : 0;

    // Top 5 recent package bookings for admin table
    const recentPackageBookings = await Promise.all(
      [...packageBookings]
        .sort((a, b) => (b.paidAt || b.createdAt) - (a.paidAt || a.createdAt))
        .slice(0, 5)
        .map(async (b) => {
          const patient = await ctx.db.get(b.patientId);
          const physio = b.physiotherapistId ? await ctx.db.get(b.physiotherapistId) : null;
          return {
            bookingId: b._id,
            patientId: b.patientId,
            patientNumber: patient?.patientNumber ?? null,
            isGuest: Boolean(b.isGuestBooking),
            physioName: physio ? `${physio.firstName} ${physio.lastName}` : "Unassigned",
            packageSessions: b.packageSessions ?? 1,
            sessionsRemaining: b.sessionsRemaining ?? b.packageSessions ?? 1,
            conditionLabel: b.conditionLabel ?? "General",
            totalAmount: (b.totalAmount || 0) / 100,
            paidAt: b.paidAt,
          };
        })
    );

    // Completed revenue for the last 12 calendar months, oldest first (Naira)
    const months: { month: string; revenue: number; rehabify: number; bookings: number }[] = [];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({ month: monthKey(d.getTime()), revenue: 0, rehabify: 0, bookings: 0 });
    }
    const monthIndex = new Map(months.map((m, i) => [m.month, i]));
    for (const b of completedBookings) {
      const i = monthIndex.get(monthKey(b.paidAt || b.createdAt));
      if (i === undefined) continue;
      months[i].revenue += (b.totalAmount || 0) / 100;
      months[i].rehabify += rehabifyShare(b) / 100;
      months[i].bookings += 1;
    }

    return {
      revenue: {
        total: totalRevenue / 100,
        platformFees: totalPlatformFees / 100,
        paystackFees: totalPaystackFees / 100,
        physiotherapistEarnings: totalPhysioEarnings / 100,
        rehabify: totalRehabify / 100,
      },
      revenueByMonth: months,
      bookings: {
        total: allBookings.length,
        completed: completedBookings.length,
        pending: allBookings.filter((b) => b.paymentStatus === "pending").length,
        failed: allBookings.filter((b) => b.paymentStatus === "failed").length,
      },
      packages: {
        totalPackageBookings: packageBookings.length,
        totalSingleBookings: singleBookings.length,
        packageRevenue: packageRevenue / 100,
        singleRevenue: singleRevenue / 100,
        avgPackageSize: Math.round(avgPackageSize * 10) / 10,
        recentPackageBookings,
      },
      physiotherapists: {
        total: allPhysios.length,
        available: availablePhysios.length,
      },
      patients: {
        total: uniquePatients.size,
      },
      reviews: {
        total: allReviews.length,
        averageRating: Math.round(averageRating * 10) / 10,
      },
      capped: capped || allPhysios.length >= PROFILE_SCAN_LIMIT || allReviews.length >= REVIEW_SCAN_LIMIT,
    };
  },
});
