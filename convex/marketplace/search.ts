// @ts-nocheck
/**
 * Marketplace Search & Discovery
 * Public queries for browsing and filtering physiotherapists
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

/**
 * Search and filter physiotherapists in the marketplace
 * Public access - no authentication required
 */
export const searchPhysiotherapists = query({
  args: {
    // Search
    searchQuery: v.optional(v.string()),

    // Filters
    specializations: v.optional(v.array(v.string())),
    location: v.optional(v.string()),
    minPrice: v.optional(v.number()), // in Naira
    maxPrice: v.optional(v.number()), // in Naira
    availability: v.optional(v.string()), // "today", "this_week", "evening", "weekend"
    verifiedOnly: v.optional(v.boolean()),
    offersOnline: v.optional(v.boolean()),
    offersInPerson: v.optional(v.boolean()),
    minYearsExperience: v.optional(v.number()),

    // Sorting
    sortBy: v.optional(v.string()), // "verified", "price_low", "price_high", "experience", "rating"

    // Pagination
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },

  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    const offset = args.offset || 0;

    // Get all physiotherapist profiles (including those without explicit marketplace toggle)
    const allPhysios = await ctx.db
      .query("physiotherapistProfiles")
      .collect();

    // Get user details for each physiotherapist
    const physiosWithDetails = await Promise.all(
      allPhysios.map(async (profile) => {
        // Skip profiles that have explicitly opted OUT of marketplace
        if (profile.isAvailableOnMarketplace === false) return null;

        const user = await ctx.db.get(profile.userId);
        if (!user) return null;

        // Check if user is approved
        const approvalStatus = await ctx.db
          .query("accountApprovalStatus")
          .withIndex("by_user_id", (q) => q.eq("userId", profile.userId))
          .first();

        if (!approvalStatus || approvalStatus.status !== "approved") {
          return null;
        }

        return {
          ...profile,
          user,
        };
      })
    );

    // Filter out nulls
    let filteredPhysios = physiosWithDetails.filter((p) => p !== null);

    // Apply filters
    if (args.searchQuery) {
      const query = args.searchQuery.toLowerCase();
      filteredPhysios = filteredPhysios.filter((p) => {
        const fullName = `${p.user.firstName} ${p.user.lastName}`.toLowerCase();
        const bio = (p.bio || "").toLowerCase();
        const specs = (p.specializations || []).join(" ").toLowerCase();

        return (
          fullName.includes(query) ||
          bio.includes(query) ||
          specs.includes(query)
        );
      });
    }

    if (args.specializations && args.specializations.length > 0) {
      filteredPhysios = filteredPhysios.filter((p) => {
        const physioSpecs = p.specializations || [];
        return args.specializations.some((spec) =>
          physioSpecs.some((pSpec) =>
            pSpec.toLowerCase().includes(spec.toLowerCase())
          )
        );
      });
    }

    if (args.location) {
      filteredPhysios = filteredPhysios.filter(
        (p) => p.location?.toLowerCase() === args.location.toLowerCase()
      );
    }

    if (args.minPrice !== undefined || args.maxPrice !== undefined) {
      filteredPhysios = filteredPhysios.filter((p) => {
        // Use the lower of hourlyRate or initialConsultRate for filtering
        const hourlyNaira = (p.hourlyRate || 0) / 100;
        const initialNaira = (p.initialConsultRate || 0) / 100;
        const rate = Math.min(
          hourlyNaira || initialNaira || 0,
          initialNaira || hourlyNaira || 0
        ) || hourlyNaira || initialNaira || 0;

        if (args.minPrice !== undefined && rate < args.minPrice) return false;
        if (args.maxPrice !== undefined && rate > args.maxPrice) return false;
        return true;
      });
    }

    if (args.verifiedOnly) {
      filteredPhysios = filteredPhysios.filter(
        (p) =>
          p.verificationBadge?.status === "verified" ||
          p.verificationBadge?.status === "pro_verified"
      );
    }

    if (args.offersOnline !== undefined) {
      filteredPhysios = filteredPhysios.filter(
        (p) => p.offersOnlineSessions === args.offersOnline
      );
    }

    if (args.offersInPerson !== undefined) {
      filteredPhysios = filteredPhysios.filter(
        (p) => p.offersInPersonSessions === args.offersInPerson
      );
    }

    if (args.minYearsExperience !== undefined) {
      filteredPhysios = filteredPhysios.filter(
        (p) => (p.yearsOfExperience || 0) >= args.minYearsExperience
      );
    }

    // Sorting
    const sortBy = args.sortBy || "verified";

    filteredPhysios.sort((a, b) => {
      // For verified sort, prioritize verified first
      if (sortBy === "verified") {
        const aVerified = a.verificationBadge?.status !== "none" ? 1 : 0;
        const bVerified = b.verificationBadge?.status !== "none" ? 1 : 0;

        if (aVerified !== bVerified) {
          return bVerified - aVerified;
        }

        // Secondary: highest rated
        return (b.averageRating || 0) - (a.averageRating || 0);
      }

      // For other sorts, apply directly
      switch (sortBy) {
        case "price_low": {
          const aPrice = Math.min(a.hourlyRate || Infinity, a.initialConsultRate || Infinity);
          const bPrice = Math.min(b.hourlyRate || Infinity, b.initialConsultRate || Infinity);
          return aPrice - bPrice;
        }
        case "price_high": {
          const aPrice = Math.max(a.hourlyRate || 0, a.initialConsultRate || 0);
          const bPrice = Math.max(b.hourlyRate || 0, b.initialConsultRate || 0);
          return bPrice - aPrice;
        }
        case "experience":
          return (b.yearsOfExperience || 0) - (a.yearsOfExperience || 0);
        case "rating":
          const ratingDiff = (b.averageRating || 0) - (a.averageRating || 0);
          if (ratingDiff !== 0) return ratingDiff;
          // Secondary: more reviews
          return (b.reviewCount || 0) - (a.reviewCount || 0);
        default:
          return 0;
      }
    });

    // Pagination
    const total = filteredPhysios.length;
    const paginatedPhysios = filteredPhysios.slice(offset, offset + limit);

    // Format response
    const results = paginatedPhysios.map((p) => ({
      id: p.userId,
      profileId: p._id,
      fullName: `${p.user.firstName} ${p.user.lastName}`,
      firstName: p.user.firstName,
      lastName: p.user.lastName,
      imageUrl: p.user.imageUrl,
      credentials: [
        p.certificationBoard,
        p.licenseNumber ? "Licensed Physiotherapist" : null,
      ].filter(Boolean),
      bio: p.bio,
      specializations: p.specializations || [],
      yearsOfExperience: p.yearsOfExperience || 0,
      location: p.location,
      latitude: p.latitude,
      longitude: p.longitude,
      hourlyRate: p.hourlyRate ? p.hourlyRate / 100 : 0, // Convert to Naira
      initialConsultRate: p.initialConsultRate
        ? p.initialConsultRate / 100
        : 0,
      packageRates: (p.packageRates || []).map((pkg) => ({
        ...pkg,
        price: pkg.price / 100, // Convert to Naira
      })),
      averageRating: p.averageRating || 0,
      reviewCount: p.reviewCount || 0,
      isVerified:
        p.verificationBadge?.status === "verified" ||
        p.verificationBadge?.status === "pro_verified",
      verificationBadge: p.verificationBadge,
      offersOnlineSessions: p.offersOnlineSessions || false,
      offersInPersonSessions: p.offersInPersonSessions || false,
      profileViews: p.profileViews || 0,
    }));

    return {
      results,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    };
  },
});

/**
 * Get full physiotherapist profile for marketplace
 */
export const getPhysiotherapistProfile = query({
  args: {
    physiotherapistId: v.id("users"),
  },

  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", args.physiotherapistId))
      .first();

    // Return null ONLY if explicitly opted out
    if (profile && profile.isAvailableOnMarketplace === false) {
      return null;
    }

    const user = await ctx.db.get(args.physiotherapistId);
    if (!user) {
      return null;
    }

    // Get reviews
    const reviews = await ctx.db
      .query("marketplaceReviews")
      .withIndex("by_physio_and_status", (q) =>
        q.eq("physiotherapistId", args.physiotherapistId).eq("status", "approved")
      )
      .order("desc")
      .take(10);

    // Get reviews with patient details
    const reviewsWithDetails = await Promise.all(
      reviews.map(async (review) => {
        const patient = await ctx.db.get(review.patientId);
        return {
          ...review,
          patientName: patient
            ? `${patient.firstName} ${patient.lastName}`
            : "Anonymous",
          patientImage: patient?.imageUrl,
        };
      })
    );

    return {
      id: user._id,
      profileId: profile?._id,
      fullName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Physiotherapist",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      phoneNumber: user.phoneNumber,
      imageUrl: user.imageUrl,
      credentials: [
        profile?.certificationBoard,
        profile?.licenseNumber ? "Licensed Physiotherapist" : null,
      ].filter(Boolean),
      bio: profile?.bio || "",
      specializations: profile?.specializations || [],
      yearsOfExperience: profile?.yearsOfExperience || 0,
      location: profile?.location,
      latitude: profile?.latitude,
      longitude: profile?.longitude,
      languagesSpoken: profile?.languagesSpoken || [],

      // Pricing
      hourlyRate: profile?.hourlyRate ? profile.hourlyRate / 100 : 0,
      initialConsultRate: profile?.initialConsultRate
        ? profile.initialConsultRate / 100
        : 0,
      packageRates: (profile?.packageRates || []).map((pkg) => ({
        ...pkg,
        price: pkg.price / 100,
      })),
      packageDiscountPercent: (profile as any)?.packageDiscountPercent || 0,

      // Ratings
      averageRating: profile?.averageRating || 0,
      reviewCount: profile?.reviewCount || 0,
      reviews: reviewsWithDetails,

      // Verification
      isVerified:
        profile?.verificationBadge?.status === "verified" ||
        profile?.verificationBadge?.status === "pro_verified",
      verificationBadge: profile?.verificationBadge || { status: "none" },

      // Availability
      offersOnlineSessions: profile?.offersOnlineSessions ?? true,
      offersInPersonSessions: profile?.offersInPersonSessions ?? true,
      availabilitySchedule: profile?.availabilitySchedule,

      // Stats
      profileViews: profile?.profileViews || 0,
      bookingsThroughMarketplace: profile?.bookingsThroughMarketplace || 0,
    };
  },
});

/**
 * Get marketplace statistics
 */
export const getMarketplaceStats = query({
  handler: async (ctx) => {
    const allPhysios = await ctx.db
      .query("physiotherapistProfiles")
      .filter((q) => q.eq(q.field("isAvailableOnMarketplace"), true))
      .collect();

    const verifiedCount = allPhysios.filter(
      (p) =>
        p.verificationBadge?.status === "verified" ||
        p.verificationBadge?.status === "pro_verified"
    ).length;

    const locations = [...new Set(allPhysios.map((p) => p.location).filter(Boolean))];
    const specializations = [
      ...new Set(
        allPhysios.flatMap((p) => p.specializations || [])
      ),
    ];

    return {
      totalPhysiotherapists: allPhysios.length,
      verifiedPhysiotherapists: verifiedCount,
      locations,
      specializations,
    };
  },
});

/**
 * Increment profile view count
 * Call this from the client when someone views a profile
 */
export const incrementProfileView = mutation({
  args: {
    physiotherapistId: v.id("users"),
  },

  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", args.physiotherapistId))
      .first();

    if (!profile) {
      return { success: false };
    }

    await ctx.db.patch(profile._id, {
      profileViews: (profile.profileViews || 0) + 1,
    });

    return { success: true };
  },
});

/**
 * Resolve a booking slug to a user ID.
 * Used by the /book/[slug] page to support short URLs like /book/eniola-ojuko
 */
export const resolveBookingSlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_bookingSlug", (q) => q.eq("bookingSlug", args.slug))
      .first();

    if (!profile) return null;
    return { userId: profile.userId, profileId: profile._id };
  },
});

/**
 * Ensure a physiotherapist has a booking slug.
 * Auto-generates from user name if not set, appending a short suffix on collisions.
 */
export const ensureBookingSlug = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .first();

    if (!profile) return null;
    if (profile.bookingSlug) return profile.bookingSlug;

    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    // Generate slug from name
    const base = `${user.firstName || ""}-${user.lastName || ""}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      || "physio";

    // Check for collisions and append suffix if needed
    let slug = base;
    let attempt = 0;
    while (attempt < 10) {
      const existing = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_bookingSlug", (q) => q.eq("bookingSlug", slug))
        .first();
      if (!existing) break;
      attempt++;
      slug = `${base}-${Math.random().toString(36).slice(2, 5)}`;
    }

    await ctx.db.patch(profile._id, { bookingSlug: slug });
    return slug;
  },
});
