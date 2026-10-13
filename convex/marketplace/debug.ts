// @ts-nocheck
/**
 * Debug utilities for marketplace troubleshooting
 */

import { query } from "../_generated/server";
import { ensureUserRole } from "../auth";

/**
 * Get all physiotherapist profiles with their marketplace status
 * Use this to debug why physiotherapists aren't showing up
 */
export const debugMarketplaceProfiles = query({
  handler: async (ctx) => {
    // Lists every physiotherapist's name and email: admins only.
    await ensureUserRole(ctx, ["admin"]);
    const allProfiles = await ctx.db
      .query("physiotherapistProfiles")
      .collect();
    
    const debugInfo = await Promise.all(
      allProfiles.map(async (profile) => {
        const user = await ctx.db.get(profile.userId);
        const approvalStatus = await ctx.db
          .query("accountApprovalStatus")
          .withIndex("by_user_id", (q) => q.eq("userId", profile.userId))
          .first();
        
        return {
          userId: profile.userId,
          fullName: user ? `${user.firstName} ${user.lastName}` : "Unknown",
          email: user?.email || "No email",
          isAvailableOnMarketplace: profile.isAvailableOnMarketplace,
          approvalStatus: approvalStatus?.status || "no_status",
          hasMarketplaceFields: {
            hourlyRate: !!profile.hourlyRate,
            initialConsultRate: !!profile.initialConsultRate,
            profileViews: profile.profileViews !== undefined,
            bookingsThroughMarketplace: profile.bookingsThroughMarketplace !== undefined,
          },
          shouldShowInMarketplace: 
            profile.isAvailableOnMarketplace === true && 
            approvalStatus?.status === "approved",
        };
      })
    );
    
    return {
      total: debugInfo.length,
      availableOnMarketplace: debugInfo.filter(p => p.isAvailableOnMarketplace === true).length,
      approved: debugInfo.filter(p => p.approvalStatus === "approved").length,
      shouldShow: debugInfo.filter(p => p.shouldShowInMarketplace).length,
      profiles: debugInfo,
    };
  },
});
