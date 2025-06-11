import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getAuthenticatedUser, ensureUserRole } from "./auth";
import { api } from "./_generated/api";

// Import formatters from NotificationService
import { formatInvitationCreatedNotification, formatOnboardingCompleteNotification } from "../lib/notifications/notificationService";

// Import ConvexError for better error handling
import { ConvexError } from "convex/values";

/**
 * Generate a unique invitation code
 */
function generateInvitationCode(): string {
  // Create a random 8-character alphanumeric code
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    code += characters.charAt(randomIndex);
  }
  return code;
}

/**
 * Create a new patient invitation and send notification
 */
export const createPatientInvitationWithNotification = action({
  args: {
    patientEmail: v.optional(v.string()),
    patientName: v.optional(v.string()),
    notes: v.optional(v.string()),
    expirationDays: v.optional(v.number()),
    sendEmail: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    invitationCode: v.optional(v.string()),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ success: boolean; invitationCode?: string; message?: string }> => {
    try {
      // Get the Convex client
      const client = ctx.runMutation;
      const query = ctx.runQuery;
      
      // Create the invitation
      const result = await client(api.patientInvitations.createPatientInvitation, {
        patientEmail: args.patientEmail,
        patientName: args.patientName,
        notes: args.notes,
        expirationDays: args.expirationDays,
      });
      
      if (!result.success) {
        return result;
      }
      
      // Get the physiotherapist user details
      const user = await query(api.users.getMyUser, {});
      if (!user) {
        return result;
      }
      
      // Create notification for the physiotherapist
      if (user._id) {
        const invitationUrl = result.invitationCode ? 
          `/invitation/${result.invitationCode}` : 
          '/dashboard/physiotherapist/patients';
          
        const physiotherapistName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Physiotherapist';
        const patientName = args.patientName || args.patientEmail || 'Patient';
        
        // Format notification data with all required parameters
        const notificationData = formatInvitationCreatedNotification(
          patientName,
          args.patientEmail || '',
          physiotherapistName,
          result.invitationCode || '',
          invitationUrl,
          // Expiration date (default to 7 days from now if not specified)
          Date.now() + (args.expirationDays || 7) * 24 * 60 * 60 * 1000
        );
        
        // Send notification to the physiotherapist
        await client(api.notifications.create, {
          userId: user._id,
          type: 'invitation_created',
          title: notificationData.title,
          message: notificationData.message,
          data: {
            entityId: result.invitationCode,
            entityType: 'invitation',
            actionUrl: invitationUrl,
            metadata: {
              patientEmail: args.patientEmail,
              patientName: args.patientName
            }
          },
          sendEmail: args.sendEmail ?? false
        });
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "An error occurred while creating the invitation.",
      };
    }
  },
});

/**
 * Create a new patient invitation
 */
export const createPatientInvitation = mutation({
  args: {
    patientEmail: v.optional(v.string()),
    patientName: v.optional(v.string()),
    notes: v.optional(v.string()),
    expirationDays: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    invitationCode: v.optional(v.string()),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      // Get the authenticated user (must be a physiotherapist)
      const user = await ensureUserRole(ctx, ["physiotherapist"]);
      
      // Get the physiotherapist profile to access their clinic
      const physiotherapistProfile = await ctx.db.get(user.physiotherapistProfileId!);
      if (!physiotherapistProfile) {
        return { success: false, message: "Physiotherapist profile not found." };
      }
      
      if (!physiotherapistProfile.clinicId) {
        return { success: false, message: "Physiotherapist profile does not have a clinicId." };
      }
      
      // Generate a unique invitation code
      let code = generateInvitationCode();
      let existingInvitation = await ctx.db
        .query("patientInvitations")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
      
      // In the unlikely event of a collision, regenerate the code
      while (existingInvitation) {
        code = generateInvitationCode();
        existingInvitation = await ctx.db
          .query("patientInvitations")
          .withIndex("by_code", (q) => q.eq("code", code))
          .unique();
      }
      
      // Set expiration date (default: 30 days from now)
      const expirationDays = args.expirationDays || 30;
      const now = Date.now();
      const expiresAt = now + (expirationDays * 24 * 60 * 60 * 1000);
      
      // Create the invitation
      const invitationId = await ctx.db.insert("patientInvitations", {
        code,
        physiotherapistId: user._id,
        clinicId: physiotherapistProfile.clinicId,
        patientEmail: args.patientEmail,
        patientName: args.patientName,
        status: "pending",
        createdAt: now,
        expiresAt,
        notes: args.notes,
        patientUserId: undefined, // Will be set when a patient accepts the invitation
      });
      
      return {
        success: true,
        invitationCode: code,
        message: "Patient invitation created successfully.",
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "An error occurred while creating the invitation.",
      };
    }
  }
});

/**
 * Get a patient invitation by code
 */
export const getInvitationByCode = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("patientInvitations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    
    return invitation;
  },
});

/**
 * Validate a patient invitation code
 */
export const validateInvitationCode = query({
  args: {
    code: v.string(),
  },
  returns: v.object({
    valid: v.boolean(),
    message: v.optional(v.string()),
    invitation: v.optional(
      v.object({
        _id: v.id("patientInvitations"),
        code: v.string(),
        physiotherapistName: v.string(),
        clinicName: v.string(),
        patientEmail: v.optional(v.string()),
        patientName: v.optional(v.string()),
        expiresAt: v.number(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    try {
      // Find the invitation by code
      const invitation = await ctx.db
        .query("patientInvitations")
        .withIndex("by_code", (q) => q.eq("code", args.code))
        .unique();
      
      if (!invitation) {
        return { valid: false, message: "Invalid invitation code." };
      }
      
      // Check if the invitation has expired
      if (invitation.status === "expired" || Date.now() > invitation.expiresAt) {
        // Since this is a query function, we can't modify data directly
        // We'll just return the expired status and let mutations handle updates
        // This approach avoids the TypeScript error with ctx.db.patch in a query function
        return { valid: false, message: "This invitation has expired." };
      }
      
      // Check if the invitation has already been accepted
      if (invitation.status === "accepted") {
        return { valid: false, message: "This invitation has already been used." };
      }
      
      // Get physiotherapist and clinic information
      const physiotherapist = await ctx.db.get(invitation.physiotherapistId);
      const clinic = await ctx.db.get(invitation.clinicId);
      
      if (!physiotherapist || !clinic) {
        return { valid: false, message: "Invitation data is incomplete." };
      }
      
      // Return validated invitation with relevant information
      return {
        valid: true,
        invitation: {
          _id: invitation._id,
          code: invitation.code,
          physiotherapistName: `${physiotherapist.firstName || ""} ${physiotherapist.lastName || ""}`.trim(),
          clinicName: clinic.name,
          patientEmail: invitation.patientEmail,
          patientName: invitation.patientName,
          expiresAt: invitation.expiresAt,
        },
      };
    } catch (error) {
      return {
        valid: false,
        message: error instanceof Error ? error.message : "An error occurred while validating the invitation code.",
      };
    }
  },
});

/**
 * Complete patient onboarding with invitation and send notifications
 * This should be called after the patient has been created via the Clerk authentication flow
 */
export const completePatientOnboardingWithNotification = action({
  args: {
    invitationCode: v.string(),
    patientData: v.object({
      firstName: v.string(),
      lastName: v.string(),
      email: v.string(),
      phoneNumber: v.optional(v.string()),
      dateOfBirth: v.optional(v.string()),
      gender: v.optional(v.union(
        v.literal("male"),
        v.literal("female"),
        v.literal("other"),
        v.literal("prefer_not_to_say")
      )),
      medicalHistory: v.optional(v.string()),
      emergencyContact: v.optional(v.string()),
    }),
    sendEmail: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.optional(v.string()),
    patientId: v.optional(v.id("users")),
  }),
  handler: async (ctx, args): Promise<{success: boolean; message?: string; patientId?: Id<"users">}> => {
    try {
      // Get the Convex clients
      const client = ctx.runMutation;
      const query = ctx.runQuery;
      
      // Complete the patient onboarding using the base mutation
      const result = await client(api.patientInvitations.completePatientOnboarding, {
        invitationCode: args.invitationCode,
        patientData: args.patientData,
      });
      
      if (!result.success) {
        return result;
      }
      
      // Get details about the invitation and physiotherapist
      const invitationResult = await query(api.patientInvitations.validateInvitationCode, {
        code: args.invitationCode
      });
      
      if (!invitationResult?.valid || !invitationResult?.invitation) {
        return {
          ...result,
          patientId: undefined
        };
      }
      
      // Get the authenticated user (the patient)
      const user = await query(api.users.getMyUser, {});
      if (!user) {
        return {
          ...result,
          patientId: undefined
        };
      }
      
      // Create notification for the patient
      const patientName = `${args.patientData.firstName} ${args.patientData.lastName}`.trim();
      const dashboardLink = '/dashboard/patient';
      
      // Format notification data
      const patientNotification = formatOnboardingCompleteNotification(
        patientName,
        'patient',
        dashboardLink
      );
      
      // Send notification to patient
      await client(api.notifications.create, {
        userId: user._id,
        type: 'onboarding_complete',
        title: patientNotification.title,
        message: patientNotification.message,
        data: patientNotification.data,
        sendEmail: args.sendEmail ?? true
      });
      
            // Get the full invitation details directly from the unique code
      const fullInvitation = await query(api.patientInvitations.getInvitationByCode, {
        code: args.invitationCode
      });
      
      // If we have a valid invitation with physiotherapist ID, notify them too
      if (fullInvitation && fullInvitation.physiotherapistId) {
        const physiotherapistId = fullInvitation.physiotherapistId;
        
        // Get physiotherapist details
        const physio = await query(api.users.getUserById, { userId: physiotherapistId });
        const physioName = physio ? `${physio.firstName || ''} ${physio.lastName || ''}`.trim() : 'Your physiotherapist';
        
        // Create notification for the physiotherapist
        await client(api.notifications.create, {
          userId: physiotherapistId,
          type: 'patient_onboarded',
          title: `${patientName} completed onboarding`,
          message: `Your patient ${patientName} has completed their account setup and is ready for treatment.`,
          data: {
            entityType: 'patient_onboarding',
            entityId: user._id.toString(), // Convert ID to string
            actionUrl: `/dashboard/physiotherapist/patients`,
            metadata: {
              patientName
            }
          },
          sendEmail: args.sendEmail ?? true
        });
      }
      
      return {
        success: true,
        message: "Patient onboarding completed successfully.",
        patientId: user._id
      };
      
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "An error occurred while completing onboarding.",
      };
    }
  }
});

/**
 * Complete patient onboarding with invitation
 * This should be called after the patient has been created via the Clerk authentication flow
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
      gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
      medicalHistory: v.optional(v.string()),
      emergencyContact: v.optional(v.string()),
    }),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      // Get the authenticated user
      const user = await getAuthenticatedUser(ctx);
      
      // Validate the invitation code
      const invitation = await ctx.db
        .query("patientInvitations")
        .withIndex("by_code", (q) => q.eq("code", args.invitationCode))
        .unique();
      
      if (!invitation) {
        return { success: false, message: "Invalid invitation code." };
      }
      
      if (invitation.status === "expired" || Date.now() > invitation.expiresAt) {
        return { success: false, message: "This invitation has expired." };
      }
      
      if (invitation.status === "accepted") {
        return { success: false, message: "This invitation has already been used." };
      }
      
      // Create or update patient profile
      let patientProfileId: Id<"patientProfiles">;
      if (user.patientProfileId) {
        // Update existing profile
        // Use mutation API properly
        await ctx.db.patch(user.patientProfileId, {
          dateOfBirth: args.patientData.dateOfBirth,
          gender: args.patientData.gender,
          medicalHistorySummary: args.patientData.medicalHistory,
          // Link to the clinic from the invitation
          clinicId: invitation.clinicId,
        });
        patientProfileId = user.patientProfileId;
      } else {
        // Create new profile
        patientProfileId = await ctx.db.insert("patientProfiles", {
          userId: user._id,
          clinicId: invitation.clinicId,
          dateOfBirth: args.patientData.dateOfBirth,
          gender: args.patientData.gender,
          medicalHistorySummary: args.patientData.medicalHistory,
        });
      }
      
      // Update user record
      await ctx.db.patch(user._id, {
        firstName: args.patientData.firstName,
        lastName: args.patientData.lastName,
        email: args.patientData.email,
        phoneNumber: args.patientData.phoneNumber,
        role: "patient",
        onboarded: true,
        patientProfileId,
      });
      
      // Update invitation status
      await ctx.db.patch(invitation._id, {
        status: "accepted",
        patientUserId: user._id,
      });
      
      // Create the patient-physiotherapist relationship
      await ctx.db.insert("patientPhysiotherapistRelationships", {
        patientId: user._id,
        physiotherapistId: invitation.physiotherapistId,
        clinicId: invitation.clinicId,
        invitationId: invitation._id,
        status: "active",
        isPrimaryPhysiotherapist: true, // First physiotherapist is set as primary
        startDate: Date.now(),
      });
      
      return {
        success: true,
        message: "Patient onboarding completed successfully.",
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "An error occurred during patient onboarding.",
      };
    }
  },
});

/**
 * Get all invitations created by the current physiotherapist
 */
export const getMyPatientInvitations = query({
  args: {
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("expired"),
      v.literal("all")
    )),
  },
  returns: v.array(v.object({
    _id: v.id("patientInvitations"),
    code: v.string(),
    patientEmail: v.optional(v.string()),
    patientName: v.optional(v.string()),
    status: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    notes: v.optional(v.string()),
    patientInfo: v.optional(v.object({
      _id: v.id("users"),
      name: v.string(),
      email: v.optional(v.string()),
    })),
  })),
  handler: async (ctx, args) => {
    try {
      // Get the authenticated user (must be a physiotherapist)
      const user = await ensureUserRole(ctx, ["physiotherapist"]);
      
      // Query invitations by this physiotherapist
      let invitationsQuery = ctx.db
        .query("patientInvitations")
        .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id));
      
      // Filter by status if specified
      if (args.status && args.status !== "all") {
        invitationsQuery = invitationsQuery.filter((q) => q.eq(q.field("status"), args.status));
      }
      
      const invitations = await invitationsQuery.collect();
      
      // Enrich with patient info for accepted invitations
      const enrichedInvitations = await Promise.all(invitations.map(async (invitation) => {
        const result = {
          _id: invitation._id,
          code: invitation.code,
          patientEmail: invitation.patientEmail,
          patientName: invitation.patientName,
          status: invitation.status,
          createdAt: invitation.createdAt,
          expiresAt: invitation.expiresAt,
          notes: invitation.notes,
          patientInfo: undefined as { _id: Id<"users">; name: string; email: string; } | undefined,
        };
        
        // Add patient info if the invitation has been accepted
        if (invitation.status === "accepted" && invitation.patientUserId) {
          const patient = await ctx.db.get(invitation.patientUserId);
          if (patient) {
            result.patientInfo = {
              _id: patient._id,
              name: `${patient.firstName || ""} ${patient.lastName || ""}`.trim(),
              email: patient.email ?? "",
            };
          }
        }
        
        return result;
      }));
      
      return enrichedInvitations;
    } catch (error) {
      return [];
    }
  },
});

/**
 * Get all patients for the current physiotherapist
 */
export const getMyPatients = query({
  args: {
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("archived"),
      v.literal("all")
    )),
  },
  returns: v.array(v.object({
    relationshipId: v.id("patientPhysiotherapistRelationships"),
    patientId: v.id("users"),
    name: v.string(),
    email: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    isPrimaryPhysiotherapist: v.boolean(),
    status: v.string(),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    profileInfo: v.optional(v.object({
      dateOfBirth: v.optional(v.string()),
      gender: v.optional(v.string()),
      medicalHistorySummary: v.optional(v.string()),
    })),
  })),
  handler: async (ctx, args) => {
    try {
      // Get the authenticated user (must be a physiotherapist)
      const user = await ensureUserRole(ctx, ["physiotherapist"]);
      
      // Query relationships where this user is the physiotherapist
      let relationshipsQuery = ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id));
      
      // Filter by status if specified
      if (args.status && args.status !== "all") {
        relationshipsQuery = relationshipsQuery.filter((q) => q.eq(q.field("status"), args.status));
      }
      
      const relationships = await relationshipsQuery.collect();
      
      // Enrich with patient information
      const patients = await Promise.all(relationships.map(async (relationship) => {
        const patient = await ctx.db.get(relationship.patientId);
        if (!patient) {
          return null; // Skip if patient doesn't exist
        }
        
        // Get patient profile information
        let profileInfo;
        if (patient.patientProfileId) {
          const profile = await ctx.db.get(patient.patientProfileId);
          if (profile) {
            profileInfo = {
              dateOfBirth: profile.dateOfBirth,
              gender: profile.gender,
              medicalHistorySummary: profile.medicalHistorySummary,
            };
          }
        }
        
        return {
          relationshipId: relationship._id,
          patientId: patient._id,
          name: `${patient.firstName || ""} ${patient.lastName || ""}`.trim(),
          email: patient.email,
          phoneNumber: patient.phoneNumber,
          isPrimaryPhysiotherapist: relationship.isPrimaryPhysiotherapist,
          status: relationship.status,
          startDate: relationship.startDate,
          endDate: relationship.endDate,
          profileInfo,
        };
      }));
      
      // Filter out null values (patients that no longer exist)
      return patients.filter((p): p is NonNullable<typeof p> => p !== null);
    } catch (error) {
      return [];
    }
  },
});

/**
 * Get all physiotherapists for the current patient
 */
export const getMyPhysiotherapists = query({
  args: {
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("archived"),
      v.literal("all")
    )),
  },
  returns: v.array(v.object({
    relationshipId: v.id("patientPhysiotherapistRelationships"),
    physiotherapistId: v.id("users"),
    name: v.string(),
    clinicName: v.string(),
    isPrimaryPhysiotherapist: v.boolean(),
    status: v.string(),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    profileInfo: v.optional(v.object({
      specializations: v.optional(v.array(v.string())),
      bio: v.optional(v.string()),
      yearsOfExperience: v.optional(v.number()),
    })),
  })),
  handler: async (ctx, args) => {
    try {
      // Get the authenticated user (must be a patient)
      const user = await ensureUserRole(ctx, ["patient"]);
      
      // Query relationships where this user is the patient
      let relationshipsQuery = ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient", (q) => q.eq("patientId", user._id));
      
      // Filter by status if specified
      if (args.status && args.status !== "all") {
        relationshipsQuery = relationshipsQuery.filter((q) => q.eq(q.field("status"), args.status));
      }
      
      const relationships = await relationshipsQuery.collect();
      
      // Enrich with physiotherapist information
      const physiotherapists = await Promise.all(relationships.map(async (relationship) => {
        const physiotherapist = await ctx.db.get(relationship.physiotherapistId);
        if (!physiotherapist) {
          return null; // Skip if physiotherapist doesn't exist
        }
        
        // Get clinic information
        const clinic = await ctx.db.get(relationship.clinicId);
        if (!clinic) {
          return null; // Skip if clinic doesn't exist
        }
        
        // Get physiotherapist profile information
        let profileInfo;
        if (physiotherapist.physiotherapistProfileId) {
          const profile = await ctx.db.get(physiotherapist.physiotherapistProfileId);
          if (profile) {
            profileInfo = {
              specializations: profile.specializations,
              bio: profile.bio,
              yearsOfExperience: profile.yearsOfExperience,
            };
          }
        }
        
        return {
          relationshipId: relationship._id,
          physiotherapistId: physiotherapist._id,
          name: `${physiotherapist.firstName || ""} ${physiotherapist.lastName || ""}`.trim(),
          clinicName: clinic.name,
          isPrimaryPhysiotherapist: relationship.isPrimaryPhysiotherapist,
          status: relationship.status,
          startDate: relationship.startDate,
          endDate: relationship.endDate,
          profileInfo,
        };
      }));
      
      // Filter out null values (physiotherapists that no longer exist)
      return physiotherapists.filter((p): p is NonNullable<typeof p> => p !== null);
    } catch (error) {
      return [];
    }
  },
});
