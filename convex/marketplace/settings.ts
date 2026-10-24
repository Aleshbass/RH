// @ts-nocheck
/**
 * Marketplace profile settings for physiotherapists.
 *
 * Under Rehabify standard pricing (Oct 2026) physios don't set prices. They choose how they
 * see Rehabify patients (video, home visits) and which travel zones they cover, and accept
 * the Rehabify network terms, which show their payout for each service.
 */

import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { NETWORK_TERMS_VERSION } from "../../lib/rehabify-network-terms";
import { BOOKABLE_SERVICE_IDS, getService } from "../../lib/rehabify-services";
import { loadTariffs } from "../helpers/rehabifyPricing";
import { profileViewCount } from "../physioSetup";

async function approvedPhysio(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();
  if (!user || user.role !== "physiotherapist") throw new ConvexError("Only physiotherapists can change these settings");
  const approvalStatus = await ctx.db
    .query("accountApprovalStatus")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .first();
  if (approvalStatus?.status !== "approved") {
    throw new ConvexError("Your account must be approved before you can change marketplace settings");
  }
  const profile = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .first();
  if (!profile) throw new ConvexError("Physiotherapist profile not found");
  return { user, profile };
}

/**
 * Listing, session modes and travel-zone coverage. Covered zones are mirrored into Joy's
 * service modes and areas so Joy matches the same physios the website does.
 */
export const updateMarketplaceSettings = mutation({
  args: {
    isAvailableOnMarketplace: v.optional(v.boolean()),
    offersOnlineSessions: v.optional(v.boolean()),
    offersInPersonSessions: v.optional(v.boolean()),
    coveredZoneIds: v.optional(v.array(v.id("travelZones"))),
    location: v.optional(v.string()),
    bio: v.optional(v.string()),
    specializations: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { profile } = await approvedPhysio(ctx);
    const updates: any = {};
    for (const key of ["isAvailableOnMarketplace", "offersOnlineSessions", "offersInPersonSessions", "location", "bio", "specializations"]) {
      if (args[key] !== undefined) updates[key] = args[key];
    }

    const online = args.offersOnlineSessions ?? profile.offersOnlineSessions !== false;
    const home = args.offersInPersonSessions ?? Boolean(profile.offersInPersonSessions);
    if (!online && !home) throw new ConvexError("Offer video sessions, home visits, or both.");

    let zoneIds = profile.coveredZoneIds ?? [];
    if (args.coveredZoneIds !== undefined) {
      const zones = await Promise.all([...new Set(args.coveredZoneIds)].map((id) => ctx.db.get(id)));
      if (zones.some((zone) => !zone || !zone.active)) throw new ConvexError("One of those areas is no longer available. Please refresh.");
      zoneIds = zones.map((zone) => zone._id);
      updates.coveredZoneIds = zoneIds;
    }
    if (home && zoneIds.length === 0) throw new ConvexError("Choose at least one area you travel to for home visits.");

    // Keep Joy's matching fields in step with the website
    const zones = await Promise.all(zoneIds.map((id) => ctx.db.get(id)));
    const modes = [...(online ? ["online"] : []), ...(home ? ["home_visit"] : [])];
    updates.joyServiceModes = modes;
    updates.joyServiceAreas = home ? [...new Set(zones.filter(Boolean).flatMap((zone) => [zone.city, ...zone.areas]))] : [];

    await ctx.db.patch(profile._id, updates);
    return { success: true };
  },
});

/** Accept the current Rehabify network terms, with the optional Rehabify Access opt-in. */
export const acceptNetworkTerms = mutation({
  args: {
    version: v.string(),
    tariffVersion: v.number(),
    accessOptIn: v.boolean(),
    accessMinimumPayouts: v.optional(v.array(v.object({ serviceId: v.string(), minimumPayoutKobo: v.number() }))),
  },
  handler: async (ctx, args) => {
    const { user, profile } = await approvedPhysio(ctx);
    if (profile.clinicId) {
      throw new ConvexError("You work under your clinic's terms, so the Rehabify network terms don't apply to you.");
    }
    if (args.version !== NETWORK_TERMS_VERSION) throw new ConvexError("These terms have been updated. Please refresh and read the latest version.");
    const { version: tariffVersion } = await loadTariffs(ctx);
    if (args.tariffVersion !== tariffVersion) throw new ConvexError("The payout schedule has just been updated. Please refresh and review it.");

    const minimums = args.accessOptIn
      ? (args.accessMinimumPayouts ?? [])
          .filter((row) => BOOKABLE_SERVICE_IDS.includes(row.serviceId))
          .map((row) => {
            if (!Number.isInteger(row.minimumPayoutKobo) || row.minimumPayoutKobo < 0) {
              throw new ConvexError(`${getService(row.serviceId)?.name}: enter a minimum of ₦0 or more`);
            }
            return { serviceId: row.serviceId, minimumPayoutKobo: row.minimumPayoutKobo };
          })
      : undefined;

    const acceptedAt = Date.now();
    const terms = { version: args.version, acceptedAt, tariffVersion, accessOptIn: args.accessOptIn, accessMinimumPayouts: minimums };
    await ctx.db.patch(profile._id, { networkTerms: terms });
    await ctx.db.insert("physioNetworkAgreements", { physiotherapistId: user._id, ...terms });
    return { success: true };
  },
});

/** The signed-in physio's network terms status (null for anyone else). */
export const getMyNetworkTerms = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user || user.role !== "physiotherapist") return null;
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();
    const terms = profile?.networkTerms ?? null;
    return {
      currentVersion: NETWORK_TERMS_VERSION,
      isClinicMember: Boolean(profile?.clinicId),
      accepted: terms?.version === NETWORK_TERMS_VERSION,
      terms,
    };
  },
});

/**
 * Get current physiotherapist's marketplace settings
 */
export const getMyMarketplaceSettings = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "physiotherapist") {
      return null;
    }

    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    if (!profile) {
      return null;
    }

    // Check approval status
    const approvalStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    // Get stats
    const totalBookings = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id))
      .collect();

    const reviews = await ctx.db
      .query("marketplaceReviews")
      .withIndex("by_physiotherapist", (q) =>
        q.eq("physiotherapistId", user._id)
      )
      .collect();

    return {
      userId: user._id,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      imageUrl: user.imageUrl,

      // Settings
      isAvailableOnMarketplace: profile.isAvailableOnMarketplace !== false,
      offersOnlineSessions: profile.offersOnlineSessions !== false,
      offersInPersonSessions: profile.offersInPersonSessions || false,
      coveredZoneIds: profile.coveredZoneIds ?? [],
      isClinicMember: Boolean(profile.clinicId),
      networkTermsAccepted: profile.networkTerms?.version === NETWORK_TERMS_VERSION,
      location: profile.location,
      bio: profile.bio,
      specializations: profile.specializations || [],
      yearsOfExperience: profile.yearsOfExperience || 0,

      // Verification
      verificationBadge: profile.verificationBadge || { status: "none" },

      // Stats
      profileViews: await profileViewCount(ctx, user._id, profile.profileViews),
      bookingsThroughMarketplace: totalBookings.length,
      totalMarketplaceEarnings:
        (profile.totalMarketplaceEarnings || 0) / 100,
      averageRating: profile.averageRating || 0,
      reviewCount: reviews.length,

      // Approval
      isApproved: approvalStatus?.status === "approved",
      approvalStatus: approvalStatus?.status,
    };
  },
});

/**
 * Toggle marketplace availability (quick on/off)
 */
export const toggleMarketplaceAvailability = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can toggle marketplace");
    }

    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    if (!profile) {
      throw new Error("Profile not found");
    }

    const newStatus = !profile.isAvailableOnMarketplace;

    await ctx.db.patch(profile._id, {
      isAvailableOnMarketplace: newStatus,
    });

    return { success: true, isAvailable: newStatus };
  },
});
