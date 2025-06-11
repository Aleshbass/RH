import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getAuthenticatedUser, ensureClinicOwner, ensureUserRole } from "./auth";

/**
 * Create a new clinic (for clinic owners during onboarding)
 */
export const createClinic = mutation({
  args: {
    name: v.string(),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
  },
  returns: v.object({ 
    clinicId: v.id("clinics"),
    success: v.boolean(),
    message: v.string() 
  }),
  handler: async (ctx, args) => {
    // Get the authenticated user
    const user = await getAuthenticatedUser(ctx);

    // Only allow clinic owners to create clinics
    if (user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can create clinics");
    }

    // Create the clinic
    const clinicId = await ctx.db.insert("clinics", {
      name: args.name,
      ownerId: user._id,
      address: args.address,
      city: args.city,
      country: args.country,
      contactEmail: args.contactEmail || user.email,
      contactPhone: args.contactPhone || user.phoneNumber,
      logoUrl: args.logoUrl,
      workingHours: {}, // Default empty working hours
      settings: {
        defaultCurrency: "NGN", // Default to Naira
        language: "en"          // Default to English
      }
    });

    return { 
      clinicId,
      success: true,
      message: `Clinic '${args.name}' created successfully` 
    };
  },
});

/**
 * Get clinics owned by the authenticated user
 */
export const getMyClinic = query({
  args: {},
  returns: v.union(v.null(), v.object({
    _id: v.id("clinics"),
    name: v.string(),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    physiotherapistCount: v.number()
  })),
  handler: async (ctx) => {
    try {
      // Get the authenticated user
      const user = await getAuthenticatedUser(ctx);
      
      if (user.role !== "clinic_owner") {
        return null;
      }

      // Get the clinic owned by this user
      const clinic = await ctx.db
        .query("clinics")
        .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
        .first();
      
      if (!clinic) {
        return null;
      }

      // Count physiotherapists associated with this clinic
      const physiotherapists = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
        .collect();

      return {
        _id: clinic._id,
        name: clinic.name,
        address: clinic.address,
        city: clinic.city,
        country: clinic.country,
        contactEmail: clinic.contactEmail,
        contactPhone: clinic.contactPhone,
        logoUrl: clinic.logoUrl,
        physiotherapistCount: physiotherapists.length
      };
    } catch (error) {
      // If there's any error (including auth errors), return null
      return null;
    }
  },
});

/**
 * Get all clinics (for admin purposes)
 */
export const getAllClinics = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("clinics"),
    name: v.string(),
    ownerName: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    // Get the authenticated user
    const user = await ensureUserRole(ctx, ["admin"]);

    // Get all clinics
    const clinics = await ctx.db
      .query("clinics")
      .collect();

    // Map to return format with owner names
    const results = [];
    for (const clinic of clinics) {
      const owner = await ctx.db.get(clinic.ownerId);
      results.push({
        _id: clinic._id,
        name: clinic.name,
        ownerName: owner ? `${owner.firstName || ""} ${owner.lastName || ""}`.trim() : undefined,
        city: clinic.city,
        country: clinic.country
      });
    }

    return results;
  },
});

/**
 * Invite a physiotherapist to join a clinic
 * In this initial implementation, we'll just associate an existing user with the clinic
 * Future enhancement: Send actual email invitations and create pending invites
 */
export const invitePhysiotherapist = mutation({
  args: {
    clinicId: v.id("clinics"),
    email: v.string(),
  },
  returns: v.object({ 
    success: v.boolean(),
    message: v.string() 
  }),
  handler: async (ctx, args) => {
    // Check that the user is the owner of this clinic
    const { user, clinic } = await ensureClinicOwner(ctx, args.clinicId);

    // Find the physiotherapist by email
    const physiotherapist = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (!physiotherapist) {
      return {
        success: false,
        message: `No user found with email ${args.email}`
      };
    }

    if (physiotherapist.role !== "physiotherapist") {
      return {
        success: false,
        message: `User with email ${args.email} is not a physiotherapist`
      };
    }

    // Check if this physiotherapist already has a profile
    if (physiotherapist.physiotherapistProfileId) {
      // Check if they're already associated with this clinic
      const profile = await ctx.db.get(physiotherapist.physiotherapistProfileId);
      if (profile && profile.clinicId === args.clinicId) {
        return {
          success: false,
          message: `Physiotherapist is already associated with this clinic`
        };
      }

      // Update their profile to associate with this clinic
      await ctx.db.patch(physiotherapist.physiotherapistProfileId, {
        clinicId: args.clinicId
      });
    } else {
      // Create a physiotherapist profile and associate with the clinic
      const profileId = await ctx.db.insert("physiotherapistProfiles", {
        userId: physiotherapist._id,
        clinicId: args.clinicId,
      });

      // Update the user record to link to this profile
      await ctx.db.patch(physiotherapist._id, {
        physiotherapistProfileId: profileId
      });
    }

    return {
      success: true,
      message: `Physiotherapist ${physiotherapist.email} associated with clinic successfully`
    };
  },
});

/**
 * Get all physiotherapists for a clinic
 */
export const getClinicPhysiotherapists = query({
  args: {
    clinicId: v.id("clinics"),
  },
  returns: v.array(v.object({
    _id: v.id("users"),
    name: v.string(),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    specializations: v.optional(v.array(v.string())),
    licenseNumber: v.optional(v.string()),
    yearsOfExperience: v.optional(v.number()),
  })),
  handler: async (ctx, args) => {
    // Make sure the user has access to this clinic's data
    // Either they're the owner or they're a physiotherapist at this clinic
    const user = await getAuthenticatedUser(ctx);
    
    let hasAccess = false;
    
    if (user.role === "clinic_owner") {
      const clinic = await ctx.db.get(args.clinicId);
      hasAccess = !!(clinic && clinic.ownerId === user._id);
    } else if (user.role === "physiotherapist" && user.physiotherapistProfileId) {
      const profile = await ctx.db.get(user.physiotherapistProfileId);
      if (profile) {
        hasAccess = profile.clinicId === args.clinicId;
      } else {
        hasAccess = false;
      }
    }
    
    if (!hasAccess) {
      throw new Error("You don't have permission to view this clinic's physiotherapists");
    }

    // Get all physiotherapist profiles for this clinic
    const profiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", args.clinicId))
      .collect();

    // Get the user details for each profile
    const results = [];
    for (const profile of profiles) {
      const physioUser = await ctx.db.get(profile.userId);
      if (physioUser) {
        results.push({
          _id: physioUser._id,
          name: `${physioUser.firstName || ""} ${physioUser.lastName || ""}`.trim(),
          email: physioUser.email,
          imageUrl: physioUser.imageUrl,
          specializations: profile.specializations,
          licenseNumber: profile.licenseNumber,
          yearsOfExperience: profile.yearsOfExperience,
        });
      }
    }

    return results;
  },
});

/**
 * Remove a physiotherapist from a clinic
 */
export const removePhysiotherapist = mutation({
  args: {
    clinicId: v.id("clinics"),
    physiotherapistId: v.id("users"),
  },
  returns: v.object({ 
    success: v.boolean(),
    message: v.string() 
  }),
  handler: async (ctx, args) => {
    // Check that the user is the owner of this clinic
    const { user, clinic } = await ensureClinicOwner(ctx, args.clinicId);

    // Get the physiotherapist
    const physiotherapist = await ctx.db.get(args.physiotherapistId);
    if (!physiotherapist || !physiotherapist.physiotherapistProfileId) {
      return {
        success: false,
        message: "Physiotherapist not found"
      };
    }

    // Get their profile
    const profile = await ctx.db.get(physiotherapist.physiotherapistProfileId);
    if (!profile || profile.clinicId !== args.clinicId) {
      return {
        success: false,
        message: "Physiotherapist is not associated with this clinic"
      };
    }

    // For now, we'll simply remove the association to the clinic
    // In a more complex system, you might want to handle appointments, patients, etc.
    await ctx.db.patch(physiotherapist.physiotherapistProfileId, {
      clinicId: undefined // Remove association
    });

    return {
      success: true,
      message: "Physiotherapist removed from clinic successfully"
    };
  },
});
