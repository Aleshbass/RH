import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthenticatedUser, ensureUserRole } from "./auth";

/**
 * Get the current user's profile with role-specific information
 */
export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      email: v.optional(v.string()),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      phoneNumber: v.optional(v.string()),
      role: v.optional(v.union(
        v.literal("physiotherapist"),
        v.literal("clinic_owner"),
        v.literal("patient"),
        v.literal("family_member"),
        v.literal("admin")
      )),
      onboarded: v.boolean(),
      profileData: v.optional(v.object({
        _id: v.id("physiotherapistProfiles"),
        specializations: v.optional(v.array(v.string())),
        bio: v.optional(v.string()),
        licenseNumber: v.optional(v.string()),
        yearsOfExperience: v.optional(v.number()),
        languagesSpoken: v.optional(v.array(v.string())),
      })),
      clinicId: v.optional(v.id("clinics")),
      clinicName: v.optional(v.string()),
    })
  ),
  handler: async (ctx) => {
    try {
      // Get the authenticated user
      const user = await getAuthenticatedUser(ctx);
      if (!user) return null;

      // Base user data
      let result: any = {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        phoneNumber: user.phoneNumber,
        role: user.role,
        onboarded: user.onboarded,
      };

      // Handle physiotherapist role - create profile if it doesn't exist
      if (user.role === "physiotherapist") {
        let profile;
        
        // If profile ID exists, try to fetch the profile
        if (user.physiotherapistProfileId) {
          profile = await ctx.db.get(user.physiotherapistProfileId);
        }
        
        // If no profile exists, return the basic user data
        // Profile creation should be handled by a separate mutation
        if (!profile) {
          return result;
        }
        
        // Add profile data to result
        if (profile) {
          result.profileData = {
            _id: profile._id,
            specializations: profile.specializations || [],
            bio: profile.bio,
            licenseNumber: profile.licenseNumber,
            yearsOfExperience: profile.yearsOfExperience || 0,
            languagesSpoken: profile.languagesSpoken || [],
          };
          
          if (profile.clinicId) {
            result.clinicId = profile.clinicId;
            const clinic = await ctx.db.get(profile.clinicId);
            if (clinic?.name) {
              result.clinicName = clinic.name;
            }
          }
        }
      } else if (user.role === "patient" && user.patientProfileId) {
        const profile = await ctx.db.get(user.patientProfileId);
        if (profile) {
          result = {
            ...result,
            profileData: {
              dateOfBirth: profile.dateOfBirth,
              gender: profile.gender,
              address: profile.address,
              city: profile.city,
              country: profile.country,
              medicalHistorySummary: profile.medicalHistorySummary,
              emergencyContact: profile.emergencyContact,
              preferredLanguage: profile.preferredLanguage,
            },
            ...(profile.clinicId !== undefined && { clinicId: profile.clinicId }),
          };
          // Get clinic name if associated with one
          if (profile.clinicId) {
            const clinic = await ctx.db.get(profile.clinicId);
            if (clinic && clinic.name !== undefined) {
              result = { ...result, clinicName: clinic.name };
            }
          }
        }
      } else if (user.role === "clinic_owner") {
        // Get the clinic they own
        const clinic = await ctx.db
          .query("clinics")
          .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
          .first();
        
        if (clinic) {
          result = {
            ...result,
            ...(clinic._id !== undefined && { clinicId: clinic._id }),
            ...(clinic.name !== undefined && { clinicName: clinic.name }),
            profileData: {
              clinicAddress: clinic.address,
              clinicCity: clinic.city,
              clinicCountry: clinic.country,
              clinicContactEmail: clinic.contactEmail,
              clinicContactPhone: clinic.contactPhone,
            },
          };
        }
      }

      return result;
    } catch (error) {
      console.error("Error in getCurrentUser:", error);
      return null;
    }
  },
});

/**
 * Create or update physiotherapist profile if it doesn't exist
 * This should be called after user authentication and before accessing profile data
 */
export const ensurePhysiotherapistProfile = mutation({
  args: {},
  handler: async (ctx) => {
    try {
      // Get the authenticated user
      const user = await getAuthenticatedUser(ctx);
      if (!user || user.role !== "physiotherapist") {
        throw new Error("User is not a physiotherapist");
      }

      let profileId = user.physiotherapistProfileId;
      let profile;
      
      // If profile ID exists, try to fetch the profile
      if (profileId) {
        profile = await ctx.db.get(profileId);
      }
      
      // If no profile exists, create one
      if (!profile) {
        profileId = await ctx.db.insert("physiotherapistProfiles", {
          userId: user._id,
          specializations: [],
          yearsOfExperience: 0,
          languagesSpoken: [],
          // clinicId is optional and can be set later
        });
        
        // Update user with the new profile ID
        await ctx.db.patch(user._id, {
          physiotherapistProfileId: profileId
        });
      }
      
      return profileId;
    } catch (error) {
      console.error("Error in ensurePhysiotherapistProfile:", error);
      throw error;
    }
  },
});

/**
 * Check if user is onboarded, with less data for faster response
 */
export const checkOnboardingStatus = query({
  args: {},
  returns: v.object({
    isAuthenticated: v.boolean(),
    isOnboarded: v.boolean(),
    role: v.optional(v.union(
      v.literal("physiotherapist"),
      v.literal("clinic_owner"),
      v.literal("patient"),
      v.literal("family_member"),
      v.literal("admin")
    )),
    name: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        return {
          isAuthenticated: false,
          isOnboarded: false,
          role: undefined,
          name: undefined,
        };
      }

      // Find the user with the matching clerkId
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (!user) {
        return {
          isAuthenticated: true,
          isOnboarded: false,
          role: undefined,
          name: undefined,
        };
      }

      return {
        isAuthenticated: true,
        isOnboarded: !!user.onboarded,
        role: user.role,
        name: user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : undefined,
      };
    } catch (error) {
      return {
        isAuthenticated: false,
        isOnboarded: false,
        role: undefined,
        name: undefined,
      };
    }
  },
});

/**
 * Get a specific user's public profile
 */
export const getUserProfile = query({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      role: v.optional(v.string()),
      // Only include non-sensitive public information
      profileData: v.optional(v.any()),
    })
  ),
  handler: async (ctx, args) => {
    try {
      // Make sure the requester is authenticated
      await getAuthenticatedUser(ctx);

      // Get the requested user
      const user = await ctx.db.get(args.userId);
      if (!user) {
        return null;
      }

      // Base public profile
      const result = {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        role: user.role,
        profileData: null as any,
      };

      // Add role-specific public profile data
      if (user.role === "physiotherapist" && user.physiotherapistProfileId) {
        const profile = await ctx.db.get(user.physiotherapistProfileId);
        if (profile) {
          result.profileData = {
            _id: profile._id,
            specializations: profile.specializations,
            bio: profile.bio,
            yearsOfExperience: profile.yearsOfExperience,
            languagesSpoken: profile.languagesSpoken,
            // Note: Not including potentially sensitive info like licenseNumber
          };
        }
      }
      // We could add other role-specific public profile data here if needed

      return result;
    } catch (error) {
      return null;
    }
  },
});

/**
 * Get users with pagination (for admin purposes)
 */
export const getUsers = query({
  args: {
    role: v.optional(v.union(
      v.literal("physiotherapist"),
      v.literal("clinic_owner"),
      v.literal("patient"),
      v.literal("family_member"),
      v.literal("admin")
    )),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    users: v.array(v.object({
      _id: v.id("users"),
      email: v.optional(v.string()),
      name: v.string(),
      role: v.optional(v.string()),
      onboarded: v.boolean(),
      imageUrl: v.optional(v.string()),
    })),
    cursor: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Ensure the requester is an admin
    await ensureUserRole(ctx, ["admin"]);

    // Set defaults
    const limit = args.limit ?? 10;
    
    // Build query - properly chaining query methods to maintain correct types
    const baseQuery = ctx.db.query("users");
    
    // Create properly typed query by conditionally applying filters
    const query = args.role
      ? baseQuery.withIndex("by_role", (q) => q.eq("role", args.role))
      : baseQuery;
    
    // Apply pagination - using proper pagination options pattern
    const paginationOpts = { 
      numItems: limit,
      cursor: args.cursor || null // Must be string | null, not undefined
    };
    
    // Execute query
    const paginationResult = await query.paginate(paginationOpts);
    
    // Transform results
    const users = paginationResult.page.map((user: any) => ({
      _id: user._id,
      email: user.email,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
      role: user.role,
      onboarded: !!user.onboarded,
      imageUrl: user.imageUrl,
    }));
    
    return {
      users,
      cursor: paginationResult.continueCursor,
    };
  },
});
