// Debug and repair helpers. Everything in this file is internal: run with
// `npx convex run debug:<name>` or from the Convex dashboard, never from a browser.
import { internalQuery as query, internalMutation as mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/**
 * Debug query to check clinic documents in the database
 */
export const debugClinicDocuments = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    // Get all clinic documents
    const allClinicDocuments = await ctx.db
      .query("clinicDocuments")
      .collect();
    
    // Get all clinics
    const allClinics = await ctx.db
      .query("clinics")
      .collect();
    
    // Get all pending approvals
    const pendingApprovals = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_status", (q) => q.eq("status", "pending_review"))
      .collect();
    
    // Get clinic owners
    const clinicOwners = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "clinic_owner"))
      .collect();
    
    // Get clinic owner profiles
    const clinicOwnerProfiles = await ctx.db
      .query("clinicOwnerProfiles")
      .collect();
    
    // Check which clinic owners don't have profiles
    const clinicOwnersWithoutProfiles = clinicOwners.filter(owner => 
      !owner.clinicOwnerProfileId || !clinicOwnerProfiles.find(profile => profile.userId === owner._id)
    );
    
    return {
      totalClinicDocuments: allClinicDocuments.length,
      totalClinics: allClinics.length,
      totalPendingApprovals: pendingApprovals.length,
      totalClinicOwners: clinicOwners.length,
      totalClinicOwnerProfiles: clinicOwnerProfiles.length,
      clinicOwnersWithoutProfiles: clinicOwnersWithoutProfiles.length,
      clinicOwners: clinicOwners.map(owner => ({
        _id: owner._id,
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email,
        hasProfile: !!owner.clinicOwnerProfileId,
        onboarded: owner.onboarded
      })),
      clinicDocuments: allClinicDocuments.map(doc => ({
        _id: doc._id,
        clinicId: doc.clinicId,
        documentType: doc.documentType,
        fileName: doc.fileName
      })),
      pendingApprovals: pendingApprovals.map(approval => ({
        _id: approval._id,
        userId: approval.userId,
        status: approval.status,
        submittedAt: approval.submittedAt
      }))
    };
  },
});

/**
 * Diagnostic query to check clinic owner document upload issues
 */
export const diagnosisClinicDocumentIssues = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    // Get all clinic owners
    const clinicOwners = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "clinic_owner"))
      .collect();
    
    // Get all clinics
    const allClinics = await ctx.db
      .query("clinics")
      .collect();
    
    // Get all clinic documents
    const allClinicDocuments = await ctx.db
      .query("clinicDocuments")
      .collect();
    
    // Analyze each clinic owner
    const analysis = await Promise.all(
      clinicOwners.map(async (owner) => {
        // Find their clinic
        const clinic = await ctx.db
          .query("clinics")
          .withIndex("by_owner_id", (q) => q.eq("ownerId", owner._id))
          .first();
        
        // Find their documents
        const documents = clinic ? allClinicDocuments.filter(doc => doc.clinicId === clinic._id) : [];
        
        // Get their approval status
        const approvalStatus = await ctx.db
          .query("accountApprovalStatus")
          .withIndex("by_user_id", (q) => q.eq("userId", owner._id))
          .first();
        
        return {
          owner: {
            _id: owner._id,
            firstName: owner.firstName,
            lastName: owner.lastName,
            email: owner.email,
            onboarded: owner.onboarded,
            createdAt: owner._creationTime
          },
          clinic: clinic ? {
            _id: clinic._id,
            name: clinic.name,
            createdAt: clinic._creationTime
          } : null,
          documents: documents.map(doc => ({
            _id: doc._id,
            documentType: doc.documentType,
            fileName: doc.fileName,
            uploadedAt: doc.uploadedAt
          })),
          approvalStatus: approvalStatus ? {
            status: approvalStatus.status,
            submittedAt: approvalStatus.submittedAt
          } : null,
          hasClinic: !!clinic,
          hasDocuments: documents.length > 0,
          documentCount: documents.length,
          potentialIssues: [] as string[]
        };
      })
    );
    
    // Identify potential issues
    analysis.forEach(item => {
      if (!item.hasClinic) {
        item.potentialIssues.push("No clinic found - clinic creation may have failed");
      }
      if (item.hasClinic && !item.hasDocuments) {
        item.potentialIssues.push("Clinic exists but no documents - upload may have failed");
      }
      if (item.owner.onboarded && !item.hasDocuments) {
        item.potentialIssues.push("User marked as onboarded but no documents uploaded");
      }
      if (item.approvalStatus && !item.hasDocuments) {
        item.potentialIssues.push("Approval request exists but no documents found");
      }
    });
    
    // Get recent clinic owners (last 7 days)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentOwners = analysis.filter(item => item.owner.createdAt > sevenDaysAgo);
    
    // Get owners without documents
    const ownersWithoutDocs = analysis.filter(item => !item.hasDocuments);
    
    return {
      totalClinicOwners: analysis.length,
      recentClinicOwners: recentOwners.length,
      ownersWithoutDocuments: ownersWithoutDocs.length,
      recentOwnersWithoutDocs: recentOwners.filter(item => !item.hasDocuments).length,
      analysis: analysis,
      recentOwners: recentOwners,
      ownersWithoutDocs: ownersWithoutDocs,
      summary: {
        totalDocuments: allClinicDocuments.length,
        lastDocumentUpload: allClinicDocuments.length > 0 ? 
          Math.max(...allClinicDocuments.map(doc => doc.uploadedAt)) : null,
        oldestDocumentUpload: allClinicDocuments.length > 0 ? 
          Math.min(...allClinicDocuments.map(doc => doc.uploadedAt)) : null
      }
    };
  },
});

/**
 * Test clinic document authorization for a specific user
 */
export const testClinicDocumentAuth = query({
  args: {
    userId: v.id("users"),
    clinicId: v.id("clinics")
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    // Get the user
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return { error: "User not found" };
    }
    
    // Get the clinic
    const clinic = await ctx.db.get(args.clinicId);
    if (!clinic) {
      return { error: "Clinic not found" };
    }
    
    // Check authorization
    const isAuthorized = clinic.ownerId === user._id;
    
    return {
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      },
      clinic: {
        _id: clinic._id,
        name: clinic.name,
        ownerId: clinic.ownerId
      },
      isAuthorized,
      authCheck: {
        userIdMatches: clinic.ownerId === user._id,
        userRole: user.role,
        expectedRole: "clinic_owner"
      }
    };
  },
});

/**
 * Migration function to create clinic owner profiles for existing clinic owners
 */
export const fixClinicOwnerProfiles = mutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    profilesCreated: v.number(),
    errors: v.array(v.string())
  }),
  handler: async (ctx) => {
    const errors: string[] = [];
    let profilesCreated = 0;
    
    try {
      // Get all clinic owners
      const clinicOwners = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("role"), "clinic_owner"))
        .collect();
      
      
      for (const owner of clinicOwners) {
        try {
          // Check if they already have a profile
          if (owner.clinicOwnerProfileId) {
            const existingProfile = await ctx.db.get(owner.clinicOwnerProfileId);
            if (existingProfile) {
              continue;
            }
          }
          
          // Find their clinic
          const clinic = await ctx.db
            .query("clinics")
            .withIndex("by_owner_id", (q) => q.eq("ownerId", owner._id))
            .first();
          
          if (!clinic) {
            errors.push(`No clinic found for clinic owner ${owner._id} (${owner.firstName} ${owner.lastName})`);
            continue;
          }
          
          // Create the clinic owner profile
          const profileId = await ctx.db.insert("clinicOwnerProfiles", {
            userId: owner._id,
            clinicId: clinic._id,
          });
          
          // Update the user record to link to the profile
          await ctx.db.patch(owner._id, {
            clinicOwnerProfileId: profileId,
          });
          
          profilesCreated++;
          
        } catch (error) {
          const errorMsg = `Error processing clinic owner ${owner._id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }
      
      return {
        success: true,
        message: `Migration completed. Created ${profilesCreated} profiles.`,
        profilesCreated,
        errors
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
        profilesCreated,
        errors
      };
    }
  },
});

/**
 * Debug query to test the getApprovalDetails flow for a specific user
 */
export const debugApprovalDetails = query({
  args: {
    userId: v.id("users"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    // Get user
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return { error: "User not found" };
    }

    // Get approval status
    const approvalStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();

    let profileDetails = null;
    let documents: any[] = [];

    if (user.role === "clinic_owner") {
      // Get clinic details
      const clinic = await ctx.db
        .query("clinics")
        .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
        .unique();
      
      profileDetails = clinic;
      
      // Get clinic documents if clinic exists
      if (clinic) {
        const clinicDocuments = await ctx.db
          .query("clinicDocuments")
          .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
          .collect();
        
        documents = clinicDocuments.map(doc => ({
          _id: doc._id,
          documentType: doc.documentType,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          uploadedAt: doc.uploadedAt,
          storageId: doc.storageId,
        }));
      }
    }

    return {
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      approvalStatus,
      profileDetails,
      documents,
      documentCount: documents.length,
    };
  },
});

/**
 * Test clinic creation for a specific user
 */
export const testClinicCreation = mutation({
  args: {
    userId: v.id("users")
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    try {
      // Get the user
      const user = await ctx.db.get(args.userId);
      if (!user) {
        return { error: "User not found" };
      }
      
      // Check if user is authenticated properly
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        return { error: "No authenticated identity" };
      }
      
      // Check if user role is correct
      if (user.role !== "clinic_owner") {
        return { error: `User role is ${user.role}, not clinic_owner` };
      }
      
      // Check if they already have a clinic
      const existingClinic = await ctx.db
        .query("clinics")
        .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
        .first();
      
      if (existingClinic) {
        return {
          success: true,
          message: "User already has a clinic",
          clinic: {
            _id: existingClinic._id,
            name: existingClinic.name,
            createdAt: existingClinic._creationTime
          }
        };
      }
      
      // Try to create a test clinic
      const testClinicId = await ctx.db.insert("clinics", {
        name: `Test Clinic for ${user.firstName} ${user.lastName}`,
        ownerId: user._id,
        address: "Test Address",
        city: "Test City",
        country: "Nigeria",
        contactEmail: user.email,
        contactPhone: user.phoneNumber,
        workingHours: {},
        settings: {
          defaultCurrency: "NGN",
          language: "en"
        }
      });
      
      return {
        success: true,
        message: "Test clinic created successfully",
        clinic: {
          _id: testClinicId,
          name: `Test Clinic for ${user.firstName} ${user.lastName}`
        }
      };
      
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      };
    }
  },
});

/**
 * Test document upload authorization for a specific user and clinic
 */
export const testDocumentUploadFlow = mutation({
  args: {
    userId: v.id("users"),
    clinicId: v.id("clinics")
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    try {
      // Get the user
      const user = await ctx.db.get(args.userId);
      if (!user) {
        return { error: "User not found" };
      }
      
      // Get the clinic
      const clinic = await ctx.db.get(args.clinicId);
      if (!clinic) {
        return { error: "Clinic not found" };
      }
      
      // Check authorization
      const isAuthorized = clinic.ownerId === user._id;
      
      // Check if user has the right role
      const hasCorrectRole = user.role === "clinic_owner";
      
      // Check if user is authenticated
      const identity = await ctx.auth.getUserIdentity();
      const isAuthenticated = !!identity;
      
      return {
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          onboarded: user.onboarded
        },
        clinic: {
          _id: clinic._id,
          name: clinic.name,
          ownerId: clinic.ownerId
        },
        authorization: {
          isAuthorized,
          hasCorrectRole,
          isAuthenticated,
          userIdMatches: clinic.ownerId === user._id
        },
        canUploadDocuments: isAuthorized && hasCorrectRole && isAuthenticated
      };
      
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      };
    }
  },
});

/**
 * Create clinics for users who don't have them
 */
export const createMissingClinics = mutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    clinicsCreated: v.number(),
    errors: v.array(v.string())
  }),
  handler: async (ctx) => {
    const errors: string[] = [];
    let clinicsCreated = 0;
    
    try {
      // Get all clinic owners
      const clinicOwners = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("role"), "clinic_owner"))
        .collect();
      
      
      for (const owner of clinicOwners) {
        try {
          // Check if they already have a clinic
          const existingClinic = await ctx.db
            .query("clinics")
            .withIndex("by_owner_id", (q) => q.eq("ownerId", owner._id))
            .first();
          
          if (existingClinic) {
            continue;
          }
          
          // Create a clinic for them
          const clinicId = await ctx.db.insert("clinics", {
            name: `${owner.firstName} ${owner.lastName}'s Clinic`,
            ownerId: owner._id,
            address: "To be updated",
            city: "To be updated",
            country: "Nigeria",
            contactEmail: owner.email,
            contactPhone: owner.phoneNumber || "To be updated",
            workingHours: {},
            settings: {
              defaultCurrency: "NGN",
              language: "en"
            }
          });
          
          clinicsCreated++;
          
        } catch (error) {
          const errorMsg = `Error processing clinic owner ${owner._id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }
      
      return {
        success: true,
        message: `Created ${clinicsCreated} clinics.`,
        clinicsCreated,
        errors
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Failed to create clinics: ${error instanceof Error ? error.message : String(error)}`,
        clinicsCreated,
        errors
      };
    }
  },
});

/**
 * Debug query to check patient invitations
 */
export const debugPatientInvitations = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    // Get all patient invitations
    const allInvitations = await ctx.db
      .query("patientInvitations")
      .collect();
    
    // Get recent invitations (last 10)
    const recentInvitations = allInvitations
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map(inv => ({
        _id: inv._id,
        code: inv.code,
        status: inv.status,
        patientEmail: inv.patientEmail,
        patientName: inv.patientName,
        createdAt: new Date(inv.createdAt).toISOString(),
        expiresAt: new Date(inv.expiresAt).toISOString(),
        patientUserId: inv.patientUserId,
      }));
    
    return {
      totalInvitations: allInvitations.length,
      recentInvitations,
      statusCounts: {
        pending: allInvitations.filter(inv => inv.status === "pending").length,
        accepted: allInvitations.filter(inv => inv.status === "accepted").length,
        expired: allInvitations.filter(inv => inv.status === "expired").length,
      }
    };
  },
});

/**
 * Debug function to validate a specific invitation code
 */
export const debugValidateInvitation = query({
  args: { code: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    // Find the invitation by code
    const invitation = await ctx.db
      .query("patientInvitations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    
    if (!invitation) {
      return { found: false, message: "Invitation not found" };
    }
    
    return {
      found: true,
      invitation: {
        _id: invitation._id,
        code: invitation.code,
        status: invitation.status,
        patientEmail: invitation.patientEmail,
        patientName: invitation.patientName,
        createdAt: new Date(invitation.createdAt).toISOString(),
        expiresAt: new Date(invitation.expiresAt).toISOString(),
        patientUserId: invitation.patientUserId,
        isExpired: Date.now() > invitation.expiresAt,
      }
    };
  },
});

/**
 * Debug function to reset invitation status (for testing)
 */
export const debugResetInvitation = mutation({
  args: { code: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    // Find the invitation by code
    const invitation = await ctx.db
      .query("patientInvitations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    
    if (!invitation) {
      return { success: false, message: "Invitation not found" };
    }
    
    // Reset to pending status
    await ctx.db.patch(invitation._id, {
      status: "pending",
      patientUserId: undefined,
    });
    
    return { 
      success: true, 
      message: `Invitation ${args.code} reset to pending status`,
      previousStatus: invitation.status 
    };
  },
});

/**
 * Debug function that mimics frontend validation
 */
export const debugFrontendValidation = query({
  args: { code: v.string() },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    try {
      // This is exactly what the frontend calls
      const result: any = await ctx.runQuery(api.patientInvitations.validateInvitationCode, {
        code: args.code,
      });
      
      return {
        frontendCall: "api.patientInvitations.validateInvitationCode",
        result: result,
        analysis: {
          isValid: result?.valid === true,
          hasInvitation: !!result?.invitation,
          willShowError: !result?.valid || !result?.invitation,
          errorMessage: result?.message || "Invalid or expired invitation code"
        }
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
        analysis: {
          willShowError: true,
          errorMessage: "Failed to validate invitation"
        }
      };
    }
  },
});
