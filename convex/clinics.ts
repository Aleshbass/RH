import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getAuthenticatedUser, ensureClinicOwner, ensureUserRole, ensureIsClinicOwner } from "./auth";

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
 * Create an invitation for a physiotherapist to join a clinic
 */
export const invitePhysiotherapist = mutation({
  args: {
    inviteeEmail: v.string(),
    inviteeName: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get authenticated clinic owner
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clinicOwner = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!clinicOwner || clinicOwner.role !== "clinic_owner") {
      throw new Error("Only clinic owners can invite physiotherapists");
    }

    // Get clinic owned by this user
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", clinicOwner._id))
      .unique();

    if (!clinic) {
      throw new Error("Clinic not found");
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = await ctx.db
      .query("clinicStaffInvitations")
      .filter((q) => 
        q.and(
          q.eq(q.field("clinicId"), clinic._id),
          q.eq(q.field("inviteeEmail"), args.inviteeEmail),
          q.eq(q.field("status"), "pending")
        )
      )
      .unique();

    if (existingInvitation) {
      throw new Error("There is already a pending invitation for this email");
    }

    // Generate unique invitation code
    const code = generateInvitationCode();

    // Create invitation
    const invitationId = await ctx.db.insert("clinicStaffInvitations", {
      code,
      clinicId: clinic._id,
      clinicOwnerId: clinicOwner._id,
      inviteeEmail: args.inviteeEmail,
      inviteeName: args.inviteeName,
      role: "physiotherapist",
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
      message: args.message,
    });

    // TODO: Send email notification to invitee

      return {
      success: true,
      invitationId,
      code,
      message: "Invitation sent successfully",
    };
  },
});

/**
 * Accept a clinic staff invitation
 */
export const acceptClinicInvitation = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Find the invitation
    const invitation = await ctx.db
      .query("clinicStaffInvitations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (!invitation) {
      throw new Error("Invalid invitation code");
    }

    if (invitation.status !== "pending") {
      throw new Error("This invitation has already been processed");
    }

    if (Date.now() > invitation.expiresAt) {
      // Mark as expired
      await ctx.db.patch(invitation._id, { status: "expired" });
      throw new Error("This invitation has expired");
    }

    // Verify email matches
    if (user.email !== invitation.inviteeEmail) {
      throw new Error("This invitation was sent to a different email address");
    }

    // Update user role and profile
    await ctx.db.patch(user._id, {
      role: "physiotherapist",
      onboarded: true,
    });

    // Create or update physiotherapist profile
    const physiotherapistProfile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();

    if (physiotherapistProfile) {
      // Update existing profile with clinic
      await ctx.db.patch(physiotherapistProfile._id, {
        clinicId: invitation.clinicId,
      });
    } else {
      // Create new profile
      await ctx.db.insert("physiotherapistProfiles", {
        userId: user._id,
        clinicId: invitation.clinicId,
      });
    }

    // Mark invitation as accepted
    await ctx.db.patch(invitation._id, {
      status: "accepted",
      acceptedBy: user._id,
    });

    // Create notification for clinic owner
    await ctx.db.insert("notifications", {
      userId: invitation.clinicOwnerId,
      type: "invitation_accepted",
      status: "pending",
      createdAt: Date.now(),
      priority: "medium",
      payload: {
        title: "Staff Invitation Accepted",
        body: `${user.firstName} ${user.lastName} has joined your clinic as a physiotherapist`,
        data: {
          entityId: invitation._id,
          entityType: "clinic_staff_invitation",
        }
      }
    });

    return {
      success: true,
      message: "Successfully joined the clinic!",
    };
  },
});

/**
 * Get pending invitations for a clinic
 */
export const getClinicInvitations = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("clinicStaffInvitations"),
    clinicId: v.id("clinics"),
    clinicOwnerId: v.id("users"),
    inviteeEmail: v.string(),
    code: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined"), v.literal("expired")),
    expiresAt: v.number(),
    createdAt: v.number(),
    acceptedBy: v.optional(v.id("users")),
    isExpired: v.boolean(),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can view invitations");
    }

    // Get clinic
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .unique();
    
    if (!clinic) {
      return [];
    }

    // Get all invitations for this clinic
    const invitations = await ctx.db
      .query("clinicStaffInvitations")
      .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
      .order("desc")
      .collect();

    return invitations.map(invitation => ({
      ...invitation,
      isExpired: Date.now() > invitation.expiresAt,
    }));
  },
});

/**
 * Get clinic staff members
 */
export const getClinicStaff = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("physiotherapistProfiles"),
    userId: v.id("users"),
    clinicId: v.optional(v.id("clinics")),
    specializations: v.optional(v.array(v.string())),
    bio: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
    user: v.any(), // Assuming user can be any object
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can view staff");
    }

    // Get clinic
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .unique();

    if (!clinic) {
      return [];
    }

    // Get all physiotherapist profiles for this clinic
    const physiotherapistProfiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .collect();

    // Get user details for each physiotherapist
    const staff = await Promise.all(
      physiotherapistProfiles.map(async (profile) => {
        const user = await ctx.db.get(profile.userId);
        return {
          ...profile,
          user,
        };
      })
    );

    return staff.filter(s => s.user); // Filter out any null users
  },
});

/**
 * Decline a clinic staff invitation
 */
export const declineClinicInvitation = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Find the invitation
    const invitation = await ctx.db
      .query("clinicStaffInvitations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (!invitation) {
      throw new Error("Invalid invitation code");
    }

    if (invitation.status !== "pending") {
      throw new Error("This invitation has already been processed");
    }

    // Verify email matches
    if (user.email !== invitation.inviteeEmail) {
      throw new Error("This invitation was sent to a different email address");
    }

    // Mark invitation as declined
    await ctx.db.patch(invitation._id, {
      status: "declined",
    });

    // Create notification for clinic owner
    await ctx.db.insert("notifications", {
      userId: invitation.clinicOwnerId,
      type: "invitation_declined",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Staff Invitation Declined",
        body: `${user.firstName} ${user.lastName} has declined your clinic invitation`,
        data: {
          entityId: invitation._id,
          entityType: "clinic_staff_invitation",
        },
      },
      createdAt: Date.now(),
    });

    return {
      success: true,
      message: "Invitation declined",
    };
  },
});

/**
 * Get invitation details by code (for invitation page)
 */
export const getInvitationByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("clinicStaffInvitations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (!invitation) {
      return null;
    }

    // Get clinic details
    const clinic = await ctx.db.get(invitation.clinicId);
    const clinicOwner = await ctx.db.get(invitation.clinicOwnerId);

    // Get clinic staff count for display
    const staffCount = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", invitation.clinicId))
      .collect();

    return {
      ...invitation,
      clinic: clinic ? {
        ...clinic,
        staffCount: staffCount.length,
      } : null,
      clinicOwner,
      isExpired: Date.now() > invitation.expiresAt,
    };
  },
});

// Helper function to generate invitation codes
function generateInvitationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Get clinic dashboard statistics for clinic owner
 */
export const getClinicDashboardStats = query({
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

    if (!user || user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can view clinic statistics");
    }

    // Get clinic
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .unique();

    if (!clinic) {
      return {
        totalPatients: 0,
        activeStaff: 0,
        appointmentsToday: 0,
        thisMonthAppointments: 0,
        completionRate: 0,
        pendingInvitations: 0,
      };
    }

    // Get all physiotherapists in this clinic
    const physiotherapistProfiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const physiotherapistIds = physiotherapistProfiles.map(p => p.userId);

    // Get total unique patients across all clinic physiotherapists
    const patientRelationships = await Promise.all(
      physiotherapistIds.map(physioId =>
        ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physioId))
          .filter((q) => q.eq(q.field("status"), "active"))
          .collect()
      )
    );

    const uniquePatientIds = new Set(
      patientRelationships.flat().map(rel => rel.patientId)
    );

    // Get today's appointments across all clinic physiotherapists
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const endOfDay = startOfDay + (24 * 60 * 60 * 1000) - 1;

    const todaysAppointments = await Promise.all(
      physiotherapistIds.map(physioId =>
        ctx.db
          .query("appointments")
          .withIndex("by_physiotherapist_id_and_time", (q) => 
            q.eq("physiotherapistId", physioId).gte("startTime", startOfDay)
          )
          .filter((q) => q.lte(q.field("startTime"), endOfDay))
          .collect()
      )
    );

    // Get this month's appointments
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

    const thisMonthAppointments = await Promise.all(
      physiotherapistIds.map(physioId =>
        ctx.db
          .query("appointments")
          .withIndex("by_physiotherapist_id_and_time", (q) => 
            q.eq("physiotherapistId", physioId).gte("startTime", startOfMonth)
          )
          .filter((q) => q.lte(q.field("startTime"), endOfMonth))
          .collect()
      )
    );

    const allThisMonthAppointments = thisMonthAppointments.flat();
    const completedAppointments = allThisMonthAppointments.filter(apt => apt.status === "completed");
    const completionRate = allThisMonthAppointments.length > 0 
      ? Math.round((completedAppointments.length / allThisMonthAppointments.length) * 100)
      : 0;

    // Get pending invitations
    const pendingInvitations = await ctx.db
      .query("clinicStaffInvitations")
      .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    return {
      totalPatients: uniquePatientIds.size,
      activeStaff: physiotherapistProfiles.length,
      appointmentsToday: todaysAppointments.flat().length,
      thisMonthAppointments: allThisMonthAppointments.length,
      completionRate,
      pendingInvitations: pendingInvitations.length,
    };
  },
});

/**
 * Get clinic revenue analytics for clinic owner
 */
export const getClinicRevenue = query({
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

    if (!user || user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can view clinic revenue");
    }

    // Get clinic
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .unique();

    if (!clinic) {
      return {
        thisMonth: 0,
        lastMonth: 0,
        growth: 0,
        totalRevenue: 0,
        pendingPayments: 0,
      };
    }

    // Get all physiotherapists in this clinic
    const physiotherapistProfiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const physiotherapistIds = physiotherapistProfiles.map(p => p.userId);

    // Get this month's invoices
    const today = new Date();
    const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    const endOfThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

    // Get last month's invoices
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime();
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999).getTime();

    // Get all invoices for this clinic
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const flatInvoices = allInvoices;

    // Calculate this month's revenue
    const thisMonthInvoices = flatInvoices.filter(invoice => 
      invoice._creationTime >= startOfThisMonth && invoice._creationTime <= endOfThisMonth
    );
    const thisMonthRevenue = thisMonthInvoices
      .filter(invoice => invoice.status === "paid")
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);

    // Calculate last month's revenue
    const lastMonthInvoices = flatInvoices.filter(invoice => 
      invoice._creationTime >= startOfLastMonth && invoice._creationTime <= endOfLastMonth
    );
    const lastMonthRevenue = lastMonthInvoices
      .filter(invoice => invoice.status === "paid")
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);

    // Calculate growth percentage
    const growth = lastMonthRevenue > 0 
      ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : thisMonthRevenue > 0 ? 100 : 0;

    // Calculate total revenue
    const totalRevenue = flatInvoices
      .filter(invoice => invoice.status === "paid")
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);

    // Calculate pending payments (only "sent" status exists)
    const pendingPayments = flatInvoices
      .filter(invoice => invoice.status === "sent")
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);

    return {
      thisMonth: thisMonthRevenue,
      lastMonth: lastMonthRevenue,
      growth,
      totalRevenue,
      pendingPayments,
    };
  },
});

/**
 * Get clinic performance metrics for analytics
 */
export const getClinicPerformanceMetrics = query({
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

    if (!user || user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can view clinic metrics");
    }

    // Get clinic
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .unique();

    if (!clinic) {
      return {
        averageRating: 0,
        totalReviews: 0,
        patientRetentionRate: 0,
        averageSessionsPerPatient: 0,
        staffUtilization: 0,
      };
    }

    // Get all physiotherapists in this clinic
    const physiotherapistProfiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const physiotherapistIds = physiotherapistProfiles.map(p => p.userId);

    // Reviews system not implemented yet - return mock data
    const averageRating = 4.5; // Mock average rating
    const totalReviews = 0;

    // Get patient relationships and session counts
    const patientRelationships = await Promise.all(
      physiotherapistIds.map(physioId =>
        ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physioId))
          .filter((q) => q.eq(q.field("status"), "active"))
          .collect()
      )
    );

    const flatRelationships = patientRelationships.flat();
    const uniquePatientIds = new Set(flatRelationships.map(rel => rel.patientId));

    // Get session logs for all patients
    const allSessionLogs = await Promise.all(
      physiotherapistIds.map(physioId =>
        ctx.db
          .query("sessionLogs")
          .filter((q) => q.eq(q.field("physiotherapistId"), physioId))
          .collect()
      )
    );

    const flatSessionLogs = allSessionLogs.flat();
    const averageSessionsPerPatient = uniquePatientIds.size > 0
      ? Math.round((flatSessionLogs.length / uniquePatientIds.size) * 10) / 10
      : 0;

    // Calculate patient retention rate (patients with more than 1 session)
    const patientSessionCounts = new Map();
    flatSessionLogs.forEach(session => {
      const count = patientSessionCounts.get(session.patientId) || 0;
      patientSessionCounts.set(session.patientId, count + 1);
    });

    const retainedPatients = Array.from(patientSessionCounts.values()).filter(count => count > 1).length;
    const patientRetentionRate = uniquePatientIds.size > 0
      ? Math.round((retainedPatients / uniquePatientIds.size) * 100)
      : 0;

    // Calculate staff utilization (rough estimate based on appointments vs available hours)
    const today = new Date();
    const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay()).getTime();
    const endOfWeek = startOfWeek + (7 * 24 * 60 * 60 * 1000) - 1;

    const weeklyAppointments = await Promise.all(
      physiotherapistIds.map(physioId =>
        ctx.db
          .query("appointments")
          .withIndex("by_physiotherapist_id_and_time", (q) => 
            q.eq("physiotherapistId", physioId).gte("startTime", startOfWeek)
          )
          .filter((q) => q.lte(q.field("startTime"), endOfWeek))
          .collect()
      )
    );

    const flatWeeklyAppointments = weeklyAppointments.flat();
    const totalAppointmentHours = flatWeeklyAppointments.reduce((sum, apt) => 
      sum + (apt.endTime - apt.startTime) / (60 * 60 * 1000), 0
    );

    // Assume 40 hours per week per staff member as baseline
    const totalAvailableHours = physiotherapistIds.length * 40;
    const staffUtilization = totalAvailableHours > 0
      ? Math.round((totalAppointmentHours / totalAvailableHours) * 100)
      : 0;

    return {
      averageRating,
      totalReviews,
      patientRetentionRate,
      averageSessionsPerPatient,
      staffUtilization,
    };
  },
});

/**
 * Get recent clinic activity for dashboard feed
 */
export const getClinicRecentActivity = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can view clinic activity");
    }

    // Get clinic
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .unique();

    if (!clinic) {
      return [];
    }

    // Get all physiotherapists in this clinic
    const physiotherapistProfiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const physiotherapistIds = physiotherapistProfiles.map(p => p.userId);

    // Get recent appointments
    const recentAppointments = await Promise.all(
      physiotherapistIds.map(physioId =>
        ctx.db
          .query("appointments")
          .withIndex("by_physiotherapist_id_and_time", (q) => 
            q.eq("physiotherapistId", physioId)
          )
          .order("desc")
          .take(5)
      )
    );

    // Get recent session logs
    const recentSessions = await Promise.all(
      physiotherapistIds.map(physioId =>
        ctx.db
          .query("sessionLogs")
          .filter((q) => q.eq(q.field("physiotherapistId"), physioId))
          .order("desc")
          .take(5)
      )
    );

    // Get recent patient invitations
    const recentInvitations = await Promise.all(
      physiotherapistIds.map(physioId =>
        ctx.db
          .query("patientInvitations")
          .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physioId))
          .order("desc")
          .take(3)
      )
    );

    // Combine and sort all activities
    const activities: any[] = [];

    // Add appointments
    recentAppointments.flat().forEach(apt => {
      activities.push({
        type: "appointment",
        timestamp: apt._creationTime,
        data: apt,
      });
    });

    // Add sessions
    recentSessions.flat().forEach(session => {
      activities.push({
        type: "session",
        timestamp: session._creationTime,
        data: session,
      });
    });

    // Add invitations
    recentInvitations.flat().forEach(invitation => {
      activities.push({
        type: "invitation",
        timestamp: invitation._creationTime,
        data: invitation,
      });
    });

    // Sort by timestamp and limit
    return activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  },
});

/**
 * Get recent clinic activity for dashboard feed
 */
export const getClinicActivity = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    await ensureIsClinicOwner(ctx, user);

    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();

    if (!clinic) {
      throw new Error("Clinic not found");
    }

    const limit = args.limit || 10;
    const activities = [];

    // Get recent appointments
    const recentAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_clinic_id_and_time", (q) => q.eq("clinicId", clinic._id))
      .order("desc")
      .take(limit);

    for (const appointment of recentAppointments) {
      const patient = appointment.patientId ? await ctx.db.get(appointment.patientId) : null;
      const physiotherapist = appointment.physiotherapistId ? await ctx.db.get(appointment.physiotherapistId) : null;
      
      activities.push({
        id: appointment._id,
        type: "appointment",
        title: `Appointment ${appointment.status}`,
        description: `${patient?.firstName || "Unknown"} ${patient?.lastName || "Patient"} with ${physiotherapist?.firstName || "Unknown"} ${physiotherapist?.lastName || "Therapist"}`,
        timestamp: appointment._creationTime,
        status: appointment.status,
        metadata: {
          appointmentId: appointment._id,
          patientName: `${patient?.firstName || ""} ${patient?.lastName || ""}`.trim(),
          therapistName: `${physiotherapist?.firstName || ""} ${physiotherapist?.lastName || ""}`.trim(),
        }
      });
    }

    // Get recent staff invitations
    const recentInvitations = await ctx.db
      .query("clinicStaffInvitations")
      .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
      .order("desc")
      .take(5);

    for (const invitation of recentInvitations) {
      activities.push({
        id: invitation._id,
        type: "invitation",
        title: `Staff invitation ${invitation.status}`,
        description: `Invitation sent to ${invitation.inviteeEmail}`,
        timestamp: invitation._creationTime,
        status: invitation.status,
        metadata: {
          invitationId: invitation._id,
          email: invitation.inviteeEmail,
          role: invitation.role,
        }
      });
    }

    // Get recent patient registrations
    const recentPatients = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
      .order("desc")
      .take(5);

    for (const relationship of recentPatients) {
      const patient = await ctx.db.get(relationship.patientId);
      
      activities.push({
        id: relationship._id,
        type: "patient_registration",
        title: "New patient registered",
        description: `${patient?.firstName || "Unknown"} ${patient?.lastName || "Patient"} joined the clinic`,
        timestamp: relationship._creationTime,
        status: "active",
        metadata: {
          patientId: relationship.patientId,
          patientName: `${patient?.firstName || ""} ${patient?.lastName || ""}`.trim(),
        }
      });
    }

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => b.timestamp - a.timestamp);

    return activities.slice(0, limit);
  },
});

/**
 * Get clinic patients with user details
 */
export const getClinicPatients = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    await ensureIsClinicOwner(ctx, user);

    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();

    if (!clinic) {
      return [];
    }

    const relationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const patients = [];
    for (const relationship of relationships) {
      const patient = await ctx.db.get(relationship.patientId);
      if (patient) {
        const patientProfile = patient.patientProfileId ? await ctx.db.get(patient.patientProfileId) : null;
        patients.push({
          ...patient,
          user: patient,
          profile: patientProfile,
          relationshipId: relationship._id,
          joinedAt: relationship._creationTime,
          dateOfBirth: patientProfile?.dateOfBirth,
        });
      }
    }

    return patients;
  },
});

/**
 * Get clinic patient statistics
 */
export const getClinicPatientStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    await ensureIsClinicOwner(ctx, user);

    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();

    if (!clinic) {
      return {
        totalPatients: 0,
        activePatients: 0,
        newThisMonth: 0,
        appointmentsToday: 0,
      };
    }

    const relationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const totalPatients = relationships.length;

    // Count active patients (those with appointments in the last 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_clinic_id_and_time", (q) => q.eq("clinicId", clinic._id))
      .filter((q) => q.gte(q.field("startTime"), thirtyDaysAgo))
      .collect();

    const activePatientIds = new Set(recentAppointments.map(apt => apt.patientId));
    const activePatients = activePatientIds.size;

    // Count new patients this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const newThisMonth = relationships.filter(rel => rel._creationTime >= startOfMonth.getTime()).length;

    // Count appointments today
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const endOfDay = startOfDay + (24 * 60 * 60 * 1000);
    
    const appointmentsToday = await ctx.db
      .query("appointments")
      .withIndex("by_clinic_id_and_time", (q) => q.eq("clinicId", clinic._id))
      .filter((q) => q.gte(q.field("startTime"), startOfDay))
      .filter((q) => q.lt(q.field("startTime"), endOfDay))
      .collect();

    return {
      totalPatients,
      activePatients,
      newThisMonth,
      appointmentsToday: appointmentsToday.length,
    };
  },
});

/**
 * Get clinic appointments with patient and therapist details
 */
export const getClinicAppointments = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    await ensureIsClinicOwner(ctx, user);

    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();

    if (!clinic) {
      return [];
    }

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_clinic_id_and_time", (q) => q.eq("clinicId", clinic._id))
      .order("desc")
      .collect();

    const enrichedAppointments = [];
    for (const appointment of appointments) {
      const patient = appointment.patientId ? await ctx.db.get(appointment.patientId) : null;
      const physiotherapist = appointment.physiotherapistId ? await ctx.db.get(appointment.physiotherapistId) : null;
      
      enrichedAppointments.push({
        ...appointment,
        patient: patient ? {
          ...patient,
          user: patient,
        } : null,
        physiotherapist: physiotherapist ? {
          ...physiotherapist,
          user: physiotherapist,
        } : null,
      });
    }

    return enrichedAppointments;
  },
});

/**
 * Get clinic appointment statistics
 */
export const getClinicAppointmentStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    await ensureIsClinicOwner(ctx, user);

    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();

    if (!clinic) {
      return {
        today: 0,
        thisWeek: 0,
        completed: 0,
        noShows: 0,
      };
    }

    // Today's appointments
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const endOfDay = startOfDay + (24 * 60 * 60 * 1000);
    
    const todayAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_clinic_id_and_time", (q) => q.eq("clinicId", clinic._id))
      .filter((q) => q.gte(q.field("startTime"), startOfDay))
      .filter((q) => q.lt(q.field("startTime"), endOfDay))
      .collect();

    // This week's appointments
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const thisWeekAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_clinic_id_and_time", (q) => q.eq("clinicId", clinic._id))
      .filter((q) => q.gte(q.field("startTime"), startOfWeek.getTime()))
      .collect();

    // This month's completed and no-show appointments
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const thisMonthAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_clinic_id_and_time", (q) => q.eq("clinicId", clinic._id))
      .filter((q) => q.gte(q.field("startTime"), startOfMonth.getTime()))
      .collect();

    const completed = thisMonthAppointments.filter(apt => apt.status === 'completed').length;
    const noShows = thisMonthAppointments.filter(apt => apt.status === 'no_show').length;

    return {
      today: todayAppointments.length,
      thisWeek: thisWeekAppointments.length,
      completed,
      noShows,
    };
  },
});

/**
 * Get clinic billing data
 */
export const getClinicBilling = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    await ensureIsClinicOwner(ctx, user);

    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();

    if (!clinic) {
      return {
        totalRevenue: 0,
        pendingAmount: 0,
        overdueAmount: 0,
        thisMonthRevenue: 0,
      };
    }

    // This is a placeholder - you would implement actual billing logic here
    return {
      totalRevenue: 125000,
      pendingAmount: 15000,
      overdueAmount: 3500,
      thisMonthRevenue: 28000,
    };
  },
});



/**
 * Get clinic invoices
 */
export const getClinicInvoices = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    await ensureIsClinicOwner(ctx, user);

    // Placeholder data - implement actual invoice system
    return [
      {
        _id: "invoice1" as Id<"invoices">,
        _creationTime: Date.now() - 86400000, // 1 day ago
        invoiceNumber: "INV-001",
        amount: 5000,
        status: "pending",
        dueDate: Date.now() + 2592000000, // 30 days from now
        patient: {
          user: {
            firstName: "John",
            lastName: "Doe",
          }
        }
      },
      {
        _id: "invoice2" as Id<"invoices">,
        _creationTime: Date.now() - 172800000, // 2 days ago
        invoiceNumber: "INV-002",
        amount: 7500,
        status: "paid",
        dueDate: Date.now() - 86400000, // 1 day ago
        patient: {
          user: {
            firstName: "Jane",
            lastName: "Smith",
          }
        }
      },
    ];
  },
});

/**
 * Get clinic reports data
 */
export const getClinicReports = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    await ensureIsClinicOwner(ctx, user);

    // Placeholder data - implement actual reporting logic
    return {
      monthlyPerformance: [],
      patientDemographics: [],
      revenueBreakdown: [],
      treatmentOutcomes: [],
    };
  },
});

/**
 * Get current clinic for authenticated clinic owner
 */
export const getCurrentClinic = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    
    if (user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can access this function");
    }

    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();

    return clinic;
  },
});

/**
 * Update clinic information
 */
export const updateClinic = mutation({
  args: {
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    specializations: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    await ensureIsClinicOwner(ctx, user);

    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();

    if (!clinic) {
      throw new Error("Clinic not found");
    }

    const updateData: Partial<Doc<"clinics">> = {};
    if (args.name !== undefined) updateData.name = args.name;
    if (args.description !== undefined) updateData.description = args.description;
    if (args.address !== undefined) updateData.address = args.address;
    if (args.phone !== undefined) updateData.contactPhone = args.phone;
    if (args.email !== undefined) updateData.contactEmail = args.email;
    if (args.website !== undefined) updateData.website = args.website;
    if (args.specializations !== undefined) updateData.specializations = args.specializations;

    await ctx.db.patch(clinic._id, updateData);
    
    return { success: true };
  },
});
