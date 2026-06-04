import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Ping the physiotherapist's location. Creates or updates their active location.
 */
export const pingLocation = mutation({
  args: {
    latitude: v.number(),
    longitude: v.number(),
    status: v.union(v.literal("in_transit"), v.literal("at_patient"), v.literal("idle")),
    accuracy: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated call to pingLocation");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if user is a physiotherapist
    if (user.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can ping locations");
    }

    // Find existing location entry
    const existingLocation = await ctx.db
      .query("physiotherapistLocations")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id))
      .first();

    const now = Date.now();

    if (existingLocation) {
      // Update existing
      await ctx.db.patch(existingLocation._id, {
        latitude: args.latitude,
        longitude: args.longitude,
        status: args.status,
        lastUpdated: now,
        accuracy: args.accuracy,
      });
      return { success: true, action: "updated" };
    } else {
      // Insert new
      await ctx.db.insert("physiotherapistLocations", {
        physiotherapistId: user._id,
        latitude: args.latitude,
        longitude: args.longitude,
        status: args.status,
        lastUpdated: now,
        accuracy: args.accuracy,
      });
      return { success: true, action: "created" };
    }
  },
});

/**
 * Stop tracking location (optional status update or delete)
 */
export const stopTracking = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return;

    const existingLocation = await ctx.db
      .query("physiotherapistLocations")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id))
      .first();

    if (existingLocation) {
      // We can either delete it or set status to "idle" / offline
      await ctx.db.delete(existingLocation._id);
    }
  },
});

/**
 * Get all active physiotherapist locations (For Admin Dashboard)
 * We filter out locations older than 15 minutes to assume they went offline
 */
export const getAllActiveLocations = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "admin") {
      throw new Error("Only admins can view all locations");
    }

    const locations = await ctx.db.query("physiotherapistLocations").collect();
    
    // Filter active locations (updated in the last 15 minutes)
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    const activeLocations = locations.filter(loc => loc.lastUpdated > fifteenMinutesAgo);

    // Join with user data
    const populatedLocations = await Promise.all(
      activeLocations.map(async (loc) => {
        const physio = await ctx.db.get(loc.physiotherapistId);
        return {
          ...loc,
          physiotherapistName: physio ? `${physio.firstName} ${physio.lastName}` : "Unknown Physiotherapist",
          physiotherapistEmail: physio?.email,
        };
      })
    );

    return populatedLocations;
  },
});
