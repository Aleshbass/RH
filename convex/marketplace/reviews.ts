// @ts-nocheck
/**
 * Marketplace Reviews & Ratings System
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";

/**
 * Submit a review for a physiotherapist
 */
export const submitReview = mutation({
  args: {
    physiotherapistId: v.id("users"),
    bookingId: v.optional(v.id("marketplaceBookings")),
    overallRating: v.number(), // 1-5
    communicationRating: v.optional(v.number()),
    treatmentEffectivenessRating: v.optional(v.number()),
    professionalismRating: v.optional(v.number()),
    valueForMoneyRating: v.optional(v.number()),
    reviewTitle: v.optional(v.string()),
    reviewText: v.string(),
  },
  
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("You must be logged in to submit a review");
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    
    if (!user) {
      throw new Error("User not found");
    }
    
    // Validate ratings
    if (args.overallRating < 1 || args.overallRating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }
    
    // Check if booking exists and user is the patient
    let isVerifiedBooking = false;
    let appointmentId = null;
    
    if (args.bookingId) {
      const booking = await ctx.db.get(args.bookingId);
      if (booking) {
        if (booking.patientId !== user._id) {
          throw new Error("You can only review bookings you made");
        }
        if (booking.physiotherapistId !== args.physiotherapistId) {
          throw new Error("Booking does not match physiotherapist");
        }
        isVerifiedBooking = true;
        appointmentId = booking.appointmentId || null;
      }
    }
    
    // Check if user already reviewed this physiotherapist
    const existingReview = await ctx.db
      .query("marketplaceReviews")
      .withIndex("by_physiotherapist", (q) =>
        q.eq("physiotherapistId", args.physiotherapistId)
      )
      .filter((q) => q.eq(q.field("patientId"), user._id))
      .first();
    
    if (existingReview && args.bookingId === existingReview.bookingId) {
      throw new Error("You have already reviewed this session");
    }
    
    // Create review
    const reviewId = await ctx.db.insert("marketplaceReviews", {
      physiotherapistId: args.physiotherapistId,
      patientId: user._id,
      appointmentId,
      bookingId: args.bookingId,
      overallRating: args.overallRating,
      communicationRating: args.communicationRating,
      treatmentEffectivenessRating: args.treatmentEffectivenessRating,
      professionalismRating: args.professionalismRating,
      valueForMoneyRating: args.valueForMoneyRating,
      reviewTitle: args.reviewTitle,
      reviewText: args.reviewText,
      isVerifiedBooking,
      helpfulCount: 0,
      reportedCount: 0,
      status: "approved", // Auto-approve for now; can add moderation later
      createdAt: Date.now(),
    });
    
    // Update physiotherapist's average rating
    await updatePhysiotherapistRating(ctx, args.physiotherapistId);
    
    return { reviewId, success: true };
  },
});

/**
 * Helper function to recalculate physiotherapist's average rating
 */
async function updatePhysiotherapistRating(ctx: any, physiotherapistId: any) {
  const reviews = await ctx.db
    .query("marketplaceReviews")
    .withIndex("by_physio_and_status", (q) =>
      q.eq("physiotherapistId", physiotherapistId).eq("status", "approved")
    )
    .collect();
  
  if (reviews.length === 0) {
    return;
  }
  
  const totalRating = reviews.reduce(
    (sum, review) => sum + review.overallRating,
    0
  );
  const averageRating = totalRating / reviews.length;
  
  // Update profile
  const profile = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", physiotherapistId))
    .first();
  
  if (profile) {
    await ctx.db.patch(profile._id, {
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
      reviewCount: reviews.length,
    });
  }
}

/**
 * Respond to a review (physiotherapist only)
 */
export const respondToReview = mutation({
  args: {
    reviewId: v.id("marketplaceReviews"),
    responseText: v.string(),
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
    
    if (!user || user.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can respond to reviews");
    }
    
    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new Error("Review not found");
    }
    
    if (review.physiotherapistId !== user._id) {
      throw new Error("You can only respond to your own reviews");
    }
    
    await ctx.db.patch(args.reviewId, {
      response: {
        text: args.responseText,
        respondedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
    
    return { success: true };
  },
});

/**
 * Mark review as helpful
 */
export const markReviewHelpful = internalMutation({
  args: {
    reviewId: v.id("marketplaceReviews"),
  },
  
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new Error("Review not found");
    }
    
    await ctx.db.patch(args.reviewId, {
      helpfulCount: (review.helpfulCount || 0) + 1,
    });
    
    return { success: true };
  },
});

/**
 * Report a review
 */
export const reportReview = mutation({
  args: {
    reviewId: v.id("marketplaceReviews"),
    reason: v.string(),
  },
  
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("You must be logged in to report a review");
    }
    
    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new Error("Review not found");
    }
    
    await ctx.db.patch(args.reviewId, {
      reportedCount: (review.reportedCount || 0) + 1,
    });
    
    // TODO: Create a review report record for admin review
    
    return { success: true };
  },
});

/**
 * Get reviews for a physiotherapist
 */
export const getPhysiotherapistReviews = query({
  args: {
    physiotherapistId: v.id("users"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    const offset = args.offset || 0;
    
    const reviews = await ctx.db
      .query("marketplaceReviews")
      .withIndex("by_physio_and_status", (q) =>
        q.eq("physiotherapistId", args.physiotherapistId).eq("status", "approved")
      )
      .order("desc")
      .collect();
    
    const total = reviews.length;
    const paginatedReviews = reviews.slice(offset, offset + limit);
    
    // Get patient details for each review
    const reviewsWithPatients = await Promise.all(
      paginatedReviews.map(async (review) => {
        const patient = await ctx.db.get(review.patientId);
        return {
          ...review,
          patient: patient
            ? {
                id: patient._id,
                fullName: `${patient.firstName} ${patient.lastName}`,
                firstName: patient.firstName,
                imageUrl: patient.imageUrl,
              }
            : null,
        };
      })
    );
    
    return {
      reviews: reviewsWithPatients,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    };
  },
});

/**
 * Get rating breakdown for a physiotherapist
 */
export const getRatingBreakdown = query({
  args: {
    physiotherapistId: v.id("users"),
  },
  
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("marketplaceReviews")
      .withIndex("by_physio_and_status", (q) =>
        q.eq("physiotherapistId", args.physiotherapistId).eq("status", "approved")
      )
      .collect();
    
    if (reviews.length === 0) {
      return {
        totalReviews: 0,
        averageRating: 0,
        breakdown: {
          5: 0,
          4: 0,
          3: 0,
          2: 0,
          1: 0,
        },
        categoryAverages: {
          communication: 0,
          treatmentEffectiveness: 0,
          professionalism: 0,
          valueForMoney: 0,
        },
      };
    }
    
    // Rating breakdown
    const breakdown = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    };
    
    reviews.forEach((review) => {
      const rating = Math.round(review.overallRating);
      if (rating >= 1 && rating <= 5) {
        breakdown[rating as keyof typeof breakdown]++;
      }
    });
    
    // Calculate averages
    const totalRating = reviews.reduce((sum, r) => sum + r.overallRating, 0);
    const averageRating = totalRating / reviews.length;
    
    // Category averages
    const categoryAverages = {
      communication: 0,
      treatmentEffectiveness: 0,
      professionalism: 0,
      valueForMoney: 0,
    };
    
    let commCount = 0;
    let treatCount = 0;
    let profCount = 0;
    let valueCount = 0;
    
    reviews.forEach((review) => {
      if (review.communicationRating) {
        categoryAverages.communication += review.communicationRating;
        commCount++;
      }
      if (review.treatmentEffectivenessRating) {
        categoryAverages.treatmentEffectiveness +=
          review.treatmentEffectivenessRating;
        treatCount++;
      }
      if (review.professionalismRating) {
        categoryAverages.professionalism += review.professionalismRating;
        profCount++;
      }
      if (review.valueForMoneyRating) {
        categoryAverages.valueForMoney += review.valueForMoneyRating;
        valueCount++;
      }
    });
    
    if (commCount > 0)
      categoryAverages.communication /= commCount;
    if (treatCount > 0)
      categoryAverages.treatmentEffectiveness /= treatCount;
    if (profCount > 0)
      categoryAverages.professionalism /= profCount;
    if (valueCount > 0)
      categoryAverages.valueForMoney /= valueCount;
    
    return {
      totalReviews: reviews.length,
      averageRating: Math.round(averageRating * 10) / 10,
      breakdown,
      categoryAverages,
    };
  },
});
