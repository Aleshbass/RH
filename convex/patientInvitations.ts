import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Validate a patient invitation code
 */
export const validateInvitationCode = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("patientInvitations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (!invitation) {
      return { valid: false, error: "Invalid invitation code" };
    }

    // Check if invitation has expired
    if (invitation.expiresAt < Date.now()) {
      return { valid: false, error: "Invitation has expired" };
    }

    // Check if invitation is already accepted
    if (invitation.status === "accepted") {
      return { valid: false, error: "Invitation has already been accepted" };
    }

    // Get physiotherapist details
    const physiotherapist = await ctx.db.get(invitation.physiotherapistId);
    if (!physiotherapist) {
      return { valid: false, error: "Physiotherapist not found" };
    }

    // Get clinic details if applicable
    let clinic = null;
    if (invitation.clinicId) {
      clinic = await ctx.db.get(invitation.clinicId);
    }

    return {
      valid: true,
      invitation: {
        _id: invitation._id,
        code: invitation.code,
        patientEmail: invitation.patientEmail,
        patientName: invitation.patientName,
        notes: invitation.notes,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      },
      physiotherapist: {
        _id: physiotherapist._id,
        firstName: physiotherapist.firstName,
        lastName: physiotherapist.lastName,
        email: physiotherapist.email,
      },
      clinic: clinic ? {
        _id: clinic._id,
        name: clinic.name,
        address: clinic.address,
      } : null,
    };
  },
});

/**
 * Get physiotherapists for a patient (from their care team)
 */
export const getMyPhysiotherapists = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "patient") {
      throw new Error("Access denied. Only patients can view their physiotherapists.");
    }

    // Get patient-physiotherapist relationships
    const relationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Get physiotherapist details for each relationship
    const physiotherapists = await Promise.all(
      relationships.map(async (relationship) => {
        const physiotherapist = await ctx.db.get(relationship.physiotherapistId);
        if (!physiotherapist) return null;

        // Get physiotherapist profile
        const physiotherapistProfile = await ctx.db
          .query("physiotherapistProfiles")
          .withIndex("by_user_id", (q) => q.eq("userId", physiotherapist._id))
          .unique();

        // Get clinic information if applicable
        let clinicInfo = null;
        if (physiotherapistProfile?.clinicId) {
          clinicInfo = await ctx.db.get(physiotherapistProfile.clinicId);
        }

        return {
          _id: physiotherapist._id,
          firstName: physiotherapist.firstName,
          lastName: physiotherapist.lastName,
          email: physiotherapist.email,
          imageUrl: physiotherapist.imageUrl,
          profile: physiotherapistProfile,
          clinic: clinicInfo,
          relationship: {
            isPrimary: relationship.isPrimaryPhysiotherapist,
            startDate: relationship.startDate,
            status: relationship.status,
          },
        };
      })
    );

    return physiotherapists.filter(Boolean); // Remove null entries
  },
});

/**
 * Accept a patient invitation
 */
export const acceptInvitation = mutation({
  args: {
    invitationCode: v.string(),
    patientData: v.object({
      firstName: v.string(),
      lastName: v.string(),
      email: v.string(),
      phoneNumber: v.optional(v.string()),
      dateOfBirth: v.optional(v.string()),
      gender: v.optional(
        v.union(
          v.literal("male"),
          v.literal("female"),
          v.literal("other"),
          v.literal("prefer_not_to_say")
        )
      ),
      medicalHistory: v.optional(v.string()),
      emergencyContact: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Validate invitation
    const invitation = await ctx.db
      .query("patientInvitations")
      .withIndex("by_code", (q) => q.eq("code", args.invitationCode))
      .unique();

    if (!invitation) {
      throw new Error("Invalid invitation code");
    }

    if (invitation.expiresAt < Date.now()) {
      throw new Error("Invitation has expired");
    }

    if (invitation.status === "accepted") {
      throw new Error("Invitation has already been accepted");
    }

    // Create or update user
    let user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      // Create new user (patient by default via invitation)
      const userId = await ctx.db.insert("users", {
        clerkId: identity.subject,
        email: args.patientData.email,
        firstName: args.patientData.firstName,
        lastName: args.patientData.lastName,
        role: "patient",
        phoneNumber: args.patientData.phoneNumber,
        imageUrl: identity.pictureUrl,
        onboarded: true,
      });
      
      // Get the created user
      user = await ctx.db.get(userId);
      if (!user) {
        throw new Error("Failed to create user");
      }
    } else {
      // Ensure existing account is provisioned as a patient
      await ctx.db.patch(user._id, {
        role: "patient",
        onboarded: true,
        firstName: user.firstName ?? args.patientData.firstName,
        lastName: user.lastName ?? args.patientData.lastName,
        email: user.email ?? args.patientData.email,
        phoneNumber: user.phoneNumber ?? args.patientData.phoneNumber,
      });
      user = await ctx.db.get(user._id);
      if (!user) {
        throw new Error("User not found after update");
      }
    }

    // Narrow nullability for TypeScript
    const ensuredUser = user as NonNullable<typeof user>;
    // Create patient profile if none exists
    let patientProfileId = ensuredUser.patientProfileId;
    if (!patientProfileId) {
      patientProfileId = await ctx.db.insert("patientProfiles", {
        userId: ensuredUser._id,
        dateOfBirth: args.patientData.dateOfBirth,
        gender: args.patientData.gender,
        medicalHistorySummary: args.patientData.medicalHistory,
        emergencyContact:
          typeof args.patientData.emergencyContact === "string"
            ? undefined
            : (args.patientData.emergencyContact as any),
      });
    }

    // Update user with patient profile ID
    await ctx.db.patch(ensuredUser._id, {
      patientProfileId,
    });

    // Create patient-physiotherapist relationship
    await ctx.db.insert("patientPhysiotherapistRelationships", {
      patientId: ensuredUser._id,
      physiotherapistId: invitation.physiotherapistId,
      clinicId: invitation.clinicId,
      invitationId: invitation._id,
      isPrimaryPhysiotherapist: true,
      status: "active",
      startDate: Date.now(),
    });

    // Update invitation status
    await ctx.db.patch(invitation._id, {
      status: "accepted",
      patientUserId: ensuredUser._id,
    });

    return {
      success: true,
      patientId: ensuredUser._id,
      message: "Invitation accepted successfully",
    };
  },
});

/**
 * Complete patient onboarding (alias for acceptInvitation)
 */
export const completePatientOnboarding = mutation({
  args: {
    invitationCode: v.string(),
    patientData: v.object({
      firstName: v.string(),
      lastName: v.string(),
      email: v.string(),
      phoneNumber: v.optional(v.string()),
      dateOfBirth: v.optional(v.string()),
      gender: v.optional(
        v.union(
          v.literal("male"),
          v.literal("female"),
          v.literal("other"),
          v.literal("prefer_not_to_say")
        )
      ),
      medicalHistory: v.optional(v.string()),
      emergencyContact: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    // This is just an alias for acceptInvitation - implement the same logic
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Validate invitation code
    const invitation = await ctx.db
      .query("patientInvitations")
      .withIndex("by_code", (q) => q.eq("code", args.invitationCode))
      .unique();

    if (!invitation) {
      throw new Error("Invalid invitation code");
    }

    if (invitation.expiresAt < Date.now()) {
      throw new Error("Invitation has expired");
    }

    if (invitation.status === "accepted") {
      throw new Error("Invitation has already been accepted");
    }

    // Check if user already exists
    let user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      // Create new user
      const userId = await ctx.db.insert("users", {
        clerkId: identity.subject,
        email: args.patientData.email,
        firstName: args.patientData.firstName,
        lastName: args.patientData.lastName,
        role: "patient",
        phoneNumber: args.patientData.phoneNumber,
        imageUrl: identity.pictureUrl,
        onboarded: true,
      });
      
      user = await ctx.db.get(userId);
      if (!user) {
        throw new Error("Failed to create user");
      }
    } else {
      // Ensure existing account is provisioned as a patient
      await ctx.db.patch(user._id, {
        role: "patient",
        onboarded: true,
        firstName: user.firstName ?? args.patientData.firstName,
        lastName: user.lastName ?? args.patientData.lastName,
        email: user.email ?? args.patientData.email,
        phoneNumber: user.phoneNumber ?? args.patientData.phoneNumber,
      });
      user = await ctx.db.get(user._id);
      if (!user) {
        throw new Error("User not found after update");
      }
    }

    // Narrow nullability for TypeScript
    const ensuredUser = user as NonNullable<typeof user>;
    // Create patient profile if none exists
    let patientProfileId = ensuredUser.patientProfileId;
    if (!patientProfileId) {
      patientProfileId = await ctx.db.insert("patientProfiles", {
        userId: ensuredUser._id,
        dateOfBirth: args.patientData.dateOfBirth,
        gender: args.patientData.gender,
        medicalHistorySummary: args.patientData.medicalHistory,
        emergencyContact:
          typeof args.patientData.emergencyContact === "string"
            ? undefined
            : (args.patientData.emergencyContact as any),
      });
    }

    // Update user with patient profile ID
    await ctx.db.patch(ensuredUser._id, {
      patientProfileId,
    });

    // Create patient-physiotherapist relationship
    await ctx.db.insert("patientPhysiotherapistRelationships", {
      patientId: ensuredUser._id,
      physiotherapistId: invitation.physiotherapistId,
      clinicId: invitation.clinicId,
      invitationId: invitation._id,
      isPrimaryPhysiotherapist: true,
      status: "active",
      startDate: Date.now(),
    });

    // Update invitation status
    await ctx.db.patch(invitation._id, {
      status: "accepted",
      patientUserId: ensuredUser._id,
    });

    return {
      success: true,
      patientId: ensuredUser._id,
      message: "Invitation accepted successfully",
    };
  },
});

/**
 * Get invitation by code with validation
 */
export const getInvitationByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("patientInvitations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (!invitation) {
      return {
        valid: false,
        error: "Invalid invitation code",
      };
    }

    // Check if invitation has expired
    if (invitation.expiresAt < Date.now()) {
      return {
        valid: false,
        error: "Invitation has expired",
      };
    }

    // Check if invitation is already accepted
    if (invitation.status === "accepted") {
      return {
        valid: false,
        error: "Invitation has already been accepted",
      };
    }

    // Get physiotherapist details
    const physiotherapist = await ctx.db.get(invitation.physiotherapistId);
    if (!physiotherapist) {
      return {
        valid: false,
        error: "Physiotherapist not found",
      };
    }

    // Get clinic details if available
    let clinic = null;
    if (invitation.clinicId) {
      clinic = await ctx.db.get(invitation.clinicId);
    }

    return {
      valid: true,
      invitation,
      physiotherapist,
      clinic,
    };
  },
});

/**
 * Create patient invitation (alias for the one in patients.ts)
 */
export const createPatientInvitation = mutation({
  args: {
    patientEmail: v.string(),
    patientName: v.optional(v.string()),
    notes: v.optional(v.string()),
    expirationDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "physiotherapist") {
      throw new Error("Access denied. Physiotherapist privileges required.");
    }

    // Check if physiotherapist is approved
    const approvalStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();

    if (!approvalStatus || approvalStatus.status !== "approved") {
      throw new Error("Account not approved. Please wait for admin approval.");
    }

    // Generate unique invitation code
    const code = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const now = Date.now();
    const expirationDays = args.expirationDays || 7;
    const expiresAt = now + (expirationDays * 24 * 60 * 60 * 1000);

    // Get physiotherapist profile to get clinic info
    const physiotherapistProfile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();

    let clinicId = null;
    if (physiotherapistProfile?.clinicId) {
      clinicId = physiotherapistProfile.clinicId;
    } else if (user.clinicId) {
      clinicId = user.clinicId;
    }

    // Create the invitation
    const invitationId = await ctx.db.insert("patientInvitations", {
      code,
      physiotherapistId: user._id,
      clinicId: clinicId || undefined,
      patientEmail: args.patientEmail,
      patientName: args.patientName,
      status: "pending",
      createdAt: now,
      expiresAt,
      notes: args.notes,
      patientUserId: undefined,
    });

    return {
      success: true,
      invitationCode: code,
      invitationId,
      message: "Patient invitation created successfully.",
    };
  },
});

/**
 * Get patient invitations created by the current physiotherapist
 */
export const getMyPatientInvitations = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("accepted"),
        v.literal("expired")
      )
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "physiotherapist") {
      throw new Error("Access denied. Physiotherapist privileges required.");
    }

    let query = ctx.db
      .query("patientInvitations")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id));

    if (args.status) {
      query = query.filter((q) => q.eq(q.field("status"), args.status));
    }

    const invitations = await query.order("desc").collect();

    return invitations.map((invitation) => ({
      _id: invitation._id,
      code: invitation.code,
      patientEmail: invitation.patientEmail,
      patientName: invitation.patientName,
      status: invitation.status,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      notes: invitation.notes,
    }));
  },
});

/**
 * Get patients for the current physiotherapist
 */
export const getMyPatients = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("inactive"),
        v.literal("archived")
      )
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "physiotherapist") {
      throw new Error("Access denied. Physiotherapist privileges required.");
    }

    // Get patient relationships
    let relationshipQuery = ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id));

    if (args.status) {
      relationshipQuery = relationshipQuery.filter((q) => q.eq(q.field("status"), args.status));
    }

    const relationships = await relationshipQuery.collect();

    // Get patient details for each relationship
    const patients = await Promise.all(
      relationships.map(async (relationship) => {
        const patient = await ctx.db.get(relationship.patientId);
        if (!patient) return null;

        // Get patient profile
        const patientProfile = await ctx.db
          .query("patientProfiles")
          .withIndex("by_user_id", (q) => q.eq("userId", patient._id))
          .unique();

        return {
          _id: patient._id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email,
          phoneNumber: patient.phoneNumber,
          imageUrl: patient.imageUrl,
          profile: patientProfile,
          relationship: {
            isPrimary: relationship.isPrimaryPhysiotherapist,
            startDate: relationship.startDate,
            status: relationship.status,
          },
        };
      })
    );

    return patients.filter(Boolean); // Remove null entries
  },
});
