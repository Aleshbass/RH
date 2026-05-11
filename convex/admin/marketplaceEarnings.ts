// @ts-nocheck
/**
 * Admin Marketplace Earnings & Analytics Dashboard
 * View all physiotherapist earnings, patient relationships, platform revenue
 */

import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * Get comprehensive marketplace earnings for all physiotherapists
 */
export const getAllPhysiotherapistEarnings = query({
  args: {
    timeframe: v.optional(v.union(
      v.literal("all_time"),
      v.literal("this_month"),
      v.literal("last_month"),
      v.literal("this_year")
    )),
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "admin") {
      throw new Error("Only admins can view earnings data");
    }

    // Calculate timeframe boundaries
    const now = Date.now();
    let startTime = 0;
    
    if (args.timeframe === "this_month") {
      const date = new Date();
      startTime = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    } else if (args.timeframe === "last_month") {
      const date = new Date();
      startTime = new Date(date.getFullYear(), date.getMonth() - 1, 1).getTime();
      const endTime = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    } else if (args.timeframe === "this_year") {
      const date = new Date();
      startTime = new Date(date.getFullYear(), 0, 1).getTime();
    }

    // Get all physiotherapist profiles
    const physioProfiles = await ctx.db
      .query("physiotherapistProfiles")
      .collect();

    // Get all marketplace bookings
    const allBookings = await ctx.db
      .query("marketplaceBookings")
      .collect();

    // Build earnings data for each physiotherapist
    const earningsData = await Promise.all(
      physioProfiles.map(async (profile) => {
        const physioUser = await ctx.db.get(profile.userId);
        if (!physioUser) return null;

        // Filter bookings by timeframe
        const physioBookings = allBookings.filter((b) => {
          if (b.physiotherapistId !== profile.userId) return false;
          if (args.timeframe && args.timeframe !== "all_time") {
            return b.createdAt >= startTime;
          }
          return true;
        });

        // Calculate total earnings
        const completedBookings = physioBookings.filter(
          (b) => b.paymentStatus === "completed"
        );
        
        const totalEarnings = completedBookings.reduce(
          (sum, b) => sum + (b.physiotherapistEarnings || 0),
          0
        );

        const totalPlatformFees = completedBookings.reduce(
          (sum, b) => sum + (b.platformFee || 0),
          0
        );

        const totalPaystackFees = completedBookings.reduce(
          (sum, b) => sum + (b.paystackFee || 0),
          0
        );

        const totalRevenue = completedBookings.reduce(
          (sum, b) => sum + (b.totalAmount || 0),
          0
        );

        // Get unique patients
        const uniquePatients = new Set(
          physioBookings.map((b) => b.patientId)
        );

        // Get patient relationships
        const relationships = await ctx.db
          .query("patientPhysiotherapistRelationships")
          .filter((q) => q.eq(q.field("physiotherapistId"), profile.userId))
          .collect();

        const activeRelationships = relationships.filter(
          (r) => r.status === "active"
        );

        // Get reviews
        const reviews = await ctx.db
          .query("marketplaceReviews")
          .withIndex("by_physiotherapist", (q) =>
            q.eq("physiotherapistId", profile.userId)
          )
          .collect();

        return {
          physiotherapistId: profile.userId,
          name: `${physioUser.firstName} ${physioUser.lastName}`,
          email: physioUser.email,
          imageUrl: physioUser.imageUrl,
          isAvailable: profile.isAvailableOnMarketplace || false,
          
          // Earnings breakdown
          totalEarnings: totalEarnings / 100, // Convert to Naira
          totalPlatformFees: totalPlatformFees / 100,
          totalPaystackFees: totalPaystackFees / 100,
          totalRevenue: totalRevenue / 100,
          
          // Booking stats
          totalBookings: physioBookings.length,
          completedBookings: completedBookings.length,
          pendingBookings: physioBookings.filter(
            (b) => b.paymentStatus === "pending"
          ).length,
          
          // Patient stats
          totalPatients: uniquePatients.size,
          activeRelationships: activeRelationships.length,
          totalRelationships: relationships.length,
          
          // Reviews
          averageRating: profile.averageRating || 0,
          reviewCount: reviews.length,
          
          // Profile stats
          profileViews: profile.profileViews || 0,
          
          // Pricing
          hourlyRate: profile.hourlyRate ? profile.hourlyRate / 100 : 0,
          initialConsultRate: profile.initialConsultRate
            ? profile.initialConsultRate / 100
            : 0,
        };
      })
    );

    // Filter out nulls
    let filteredData = earningsData.filter((d) => d !== null);

    // Sort
    const sortBy = args.sortBy || "earnings_desc";
    filteredData.sort((a, b) => {
      switch (sortBy) {
        case "earnings_desc":
          return b.totalEarnings - a.totalEarnings;
        case "earnings_asc":
          return a.totalEarnings - b.totalEarnings;
        case "bookings_desc":
          return b.totalBookings - a.totalBookings;
        case "patients_desc":
          return b.totalPatients - a.totalPatients;
        default:
          return 0;
      }
    });

    // Pagination
    const limit = args.limit || 50;
    const offset = args.offset || 0;
    const total = filteredData.length;
    const paginatedData = filteredData.slice(offset, offset + limit);

    // Calculate platform totals
    const platformTotals = {
      totalRevenue: filteredData.reduce((sum, d) => sum + d.totalRevenue, 0),
      totalPlatformFees: filteredData.reduce(
        (sum, d) => sum + d.totalPlatformFees,
        0
      ),
      totalPaystackFees: filteredData.reduce(
        (sum, d) => sum + d.totalPaystackFees,
        0
      ),
      totalPhysiotherapistEarnings: filteredData.reduce(
        (sum, d) => sum + d.totalEarnings,
        0
      ),
      totalBookings: filteredData.reduce((sum, d) => sum + d.totalBookings, 0),
      totalPhysiotherapists: filteredData.length,
      activePhysiotherapists: filteredData.filter((d) => d.isAvailable).length,
    };

    return {
      physiotherapists: paginatedData,
      platformTotals,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    };
  },
});

/**
 * Get detailed earnings for a specific physiotherapist
 */
export const getPhysiotherapistEarningsDetail = query({
  args: {
    physiotherapistId: v.id("users"),
    timeframe: v.optional(v.union(
      v.literal("all_time"),
      v.literal("this_month"),
      v.literal("last_month"),
      v.literal("this_year")
    )),
  },

  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "admin") {
      throw new Error("Only admins can view earnings data");
    }

    const physioUser = await ctx.db.get(args.physiotherapistId);
    if (!physioUser || physioUser.role !== "physiotherapist") {
      throw new Error("Physiotherapist not found");
    }

    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", args.physiotherapistId))
      .first();

    if (!profile) {
      throw new Error("Physiotherapist profile not found");
    }

    // Calculate timeframe
    const now = Date.now();
    let startTime = 0;
    
    if (args.timeframe === "this_month") {
      const date = new Date();
      startTime = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    } else if (args.timeframe === "last_month") {
      const date = new Date();
      startTime = new Date(date.getFullYear(), date.getMonth() - 1, 1).getTime();
    } else if (args.timeframe === "this_year") {
      const date = new Date();
      startTime = new Date(date.getFullYear(), 0, 1).getTime();
    }

    // Get bookings
    const allBookings = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_physiotherapist", (q) =>
        q.eq("physiotherapistId", args.physiotherapistId)
      )
      .collect();

    const bookings = allBookings.filter((b) => {
      if (args.timeframe && args.timeframe !== "all_time") {
        return b.createdAt >= startTime;
      }
      return true;
    });

    // Get patients
    const patients = await Promise.all(
      [...new Set(bookings.map((b) => b.patientId))].map(async (patientId) => {
        const patient = await ctx.db.get(patientId);
        const patientBookings = bookings.filter((b) => b.patientId === patientId);
        const totalSpent = patientBookings
          .filter((b) => b.paymentStatus === "completed")
          .reduce((sum, b) => sum + (b.totalAmount || 0), 0);

        return {
          id: patientId,
          name: patient
            ? `${patient.firstName} ${patient.lastName}`
            : "Unknown",
          email: patient?.email,
          totalBookings: patientBookings.length,
          totalSpent: totalSpent / 100,
          lastBookingDate: Math.max(...patientBookings.map((b) => b.createdAt)),
        };
      })
    );

    // Sort patients by total spent
    patients.sort((a, b) => b.totalSpent - a.totalSpent);

    // Earnings breakdown by month (for charts)
    const earningsByMonth: Record<string, number> = {};
    const bookingsByMonth: Record<string, number> = {};

    bookings
      .filter((b) => b.paymentStatus === "completed")
      .forEach((booking) => {
        const date = new Date(booking.createdAt);
        const monthKey = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;

        earningsByMonth[monthKey] =
          (earningsByMonth[monthKey] || 0) + (booking.physiotherapistEarnings || 0);
        bookingsByMonth[monthKey] = (bookingsByMonth[monthKey] || 0) + 1;
      });

    // Convert to Naira
    Object.keys(earningsByMonth).forEach((key) => {
      earningsByMonth[key] = earningsByMonth[key] / 100;
    });

    return {
      physiotherapist: {
        id: physioUser._id,
        name: `${physioUser.firstName} ${physioUser.lastName}`,
        email: physioUser.email,
        imageUrl: physioUser.imageUrl,
      },
      bookings,
      patients,
      earningsByMonth,
      bookingsByMonth,
    };
  },
});

/**
 * Get platform-wide marketplace analytics
 */
export const getPlatformMarketplaceAnalytics = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "admin") {
      throw new Error("Only admins can view analytics");
    }

    // Get all bookings
    const allBookings = await ctx.db.query("marketplaceBookings").collect();
    const completedBookings = allBookings.filter(
      (b) => b.paymentStatus === "completed"
    );

    // Calculate totals
    const totalRevenue = completedBookings.reduce(
      (sum, b) => sum + (b.totalAmount || 0),
      0
    );
    const totalPlatformFees = completedBookings.reduce(
      (sum, b) => sum + (b.platformFee || 0),
      0
    );
    const totalPaystackFees = completedBookings.reduce(
      (sum, b) => sum + (b.paystackFee || 0),
      0
    );
    const totalPhysioEarnings = completedBookings.reduce(
      (sum, b) => sum + (b.physiotherapistEarnings || 0),
      0
    );

    // Get all physiotherapists
    const allPhysios = await ctx.db
      .query("physiotherapistProfiles")
      .collect();
    const availablePhysios = allPhysios.filter(
      (p) => p.isAvailableOnMarketplace
    );

    // Get all reviews
    const allReviews = await ctx.db.query("marketplaceReviews").collect();
    const averageRating =
      allReviews.length > 0
        ? allReviews.reduce((sum, r) => sum + r.overallRating, 0) /
          allReviews.length
        : 0;

    // Unique patients
    const uniquePatients = new Set(allBookings.map((b) => b.patientId));

    // Package vs single-session breakdown
    const packageBookings = completedBookings.filter(
      (b) => b.sessionType === "package" || (b.packageSessions && b.packageSessions > 1)
    );
    const singleBookings = completedBookings.filter(
      (b) => b.sessionType !== "package" && (!b.packageSessions || b.packageSessions <= 1)
    );

    const packageRevenue = packageBookings.reduce(
      (sum, b) => sum + (b.totalAmount || 0), 0
    );
    const singleRevenue = singleBookings.reduce(
      (sum, b) => sum + (b.totalAmount || 0), 0
    );

    const avgPackageSize = packageBookings.length > 0
      ? packageBookings.reduce((sum, b) => sum + (b.packageSessions || 1), 0) / packageBookings.length
      : 0;

    // Top 5 recent package bookings for admin table
    const recentPackageBookings = await Promise.all(
      packageBookings
        .sort((a, b) => (b.paidAt || b.createdAt) - (a.paidAt || a.createdAt))
        .slice(0, 5)
        .map(async (b) => {
          const patient = await ctx.db.get(b.patientId);
          const physio = await ctx.db.get(b.physiotherapistId);
          return {
            bookingId: b._id,
            patientName: patient ? `${patient.firstName} ${patient.lastName}` : "Unknown",
            physioName: physio ? `${physio.firstName} ${physio.lastName}` : "Unknown",
            packageSessions: b.packageSessions ?? 1,
            sessionsRemaining: b.sessionsRemaining ?? b.packageSessions ?? 1,
            conditionLabel: b.conditionLabel ?? "General",
            totalAmount: (b.totalAmount || 0) / 100,
            paidAt: b.paidAt,
          };
        })
    );

    return {
      revenue: {
        total: totalRevenue / 100,
        platformFees: totalPlatformFees / 100,
        paystackFees: totalPaystackFees / 100,
        physiotherapistEarnings: totalPhysioEarnings / 100,
      },
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
    };
  },
});

