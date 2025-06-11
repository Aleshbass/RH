import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthenticatedUser } from "./auth";
import { Id } from "./_generated/dataModel";

export const upsertPhysiotherapistProfessionalDetails = mutation({
  args: {
    specializations: v.optional(v.array(v.string())),
    yearsOfExperience: v.optional(v.number()),
    bio: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
    languagesSpoken: v.optional(v.array(v.string())),
    clinicId: v.optional(v.id("clinics")), // Added optional clinicId
    // Add any other fields relevant to professional details here
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    if (user.role !== "physiotherapist") {
      throw new Error("User is not a physiotherapist.");
    }

    const existingProfile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id)) // Corrected index name
      .unique();

    const profileData = {
      ...(args.specializations && { specializations: args.specializations }),
      ...(args.yearsOfExperience !== undefined && { yearsOfExperience: args.yearsOfExperience }),
      ...(args.bio && { bio: args.bio }),
      ...(args.licenseNumber && { licenseNumber: args.licenseNumber }),
      ...(args.languagesSpoken && { languagesSpoken: args.languagesSpoken }),
      ...(args.clinicId && { clinicId: args.clinicId }), // Include clinicId if provided
    };

    if (existingProfile) {
      // Update existing profile
      await ctx.db.patch(existingProfile._id, profileData);
      return existingProfile._id;
    } else {
      // Create new profile
      // For new profiles, clinicId might be required by your schema.
      // If args.clinicId is not provided and your schema requires it,
      // this insert will fail, which is the correct behavior.
      const newProfileId = await ctx.db.insert("physiotherapistProfiles", {
        userId: user._id,
        ...(args.clinicId && { clinicId: args.clinicId }), // Add clinicId if provided
        ...profileData, // Spread other profile data, ensuring clinicId from args takes precedence if set
      } as any); // Using 'as any' temporarily if schema has strict non-optional clinicId and it's not in profileData. Ideally, ensure profileData type matches schema or handle clinicId more explicitly.
      return newProfileId;
    }
  },
});
