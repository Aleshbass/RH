import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { getAuthenticatedUser, ensureClinicOwner, ensureUserRole, ensureIsClinicOwner } from "./auth";
import { getOwnerClinicOrPreview } from "./clinicTools";

/**
 * Create the owner's clinic during onboarding, or update it if one already exists
 * (e.g. the placeholder created when onboarding was skipped). Safe to call repeatedly.
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
    state: v.optional(v.string()),
    website: v.optional(v.string()),
    registrationNumber: v.optional(v.string()),
    clinicType: v.optional(v.string()),
    yearEstablished: v.optional(v.number()),
    services: v.optional(v.array(v.string())),
    specializations: v.optional(v.array(v.string())),
    facilities: v.optional(v.array(v.string())),
    equipment: v.optional(v.array(v.string())),
    workingHours: v.optional(v.any()),
    additionalNotes: v.optional(v.string()),
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

    const name = args.name.trim();
    if (!name) {
      throw new Error("Clinic name is required");
    }

    // Only overwrite fields the caller actually provided
    const details: Partial<Doc<"clinics">> = { name };
    const optionalKeys = [
      "address", "city", "country", "contactEmail", "contactPhone", "logoUrl", "state", "website",
      "registrationNumber", "clinicType", "yearEstablished", "services", "specializations",
      "facilities", "equipment", "workingHours", "additionalNotes",
    ] as const;
    for (const key of optionalKeys) {
      if (args[key] !== undefined) {
        (details as Record<string, unknown>)[key] = args[key];
      }
    }

    const existing = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, details);
      return {
        clinicId: existing._id,
        success: true,
        message: `Clinic '${name}' updated successfully`
      };
    }

    // Create the clinic
    const clinicId = await ctx.db.insert("clinics", {
      ...details,
      name,
      ownerId: user._id,
      contactEmail: args.contactEmail || user.email,
      contactPhone: args.contactPhone || user.phoneNumber,
      workingHours: args.workingHours ?? {}, // Default empty working hours
      settings: {
        defaultCurrency: "NGN", // Default to Naira
        language: "en"          // Default to English
      }
    });

    return {
      clinicId,
      success: true,
      message: `Clinic '${name}' created successfully`
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
      // If there's already a pending invitation, return it instead of throwing error
      // This handles the case where the user clicks invite multiple times
      return {
        success: true,
        invitationId: existingInvitation._id,
        code: existingInvitation.code,
        message: "Invitation already sent",
      };
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

    // Note: Email notification is handled by the action wrapper
    // createClinicStaffInvitationWithNotification in actions/clinics/inviteClinicStaff.ts

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

    // Update user role, profile, and assign to clinic
    // We set onboarded to false so they are forced to go through the onboarding wizard
    // to fill in their profile details (license, bio, etc.)
    await ctx.db.patch(user._id, {
      role: "physiotherapist",
      onboarded: false,
      clinicId: invitation.clinicId, // Assign user to clinic
      status: "active", // Set as active staff member
      joinedAt: Date.now(), // Track when they joined
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
      // Ensure user has the profile ID linked
      await ctx.db.patch(user._id, {
        physiotherapistProfileId: physiotherapistProfile._id,
      });
    } else {
      // Create new profile
      const newProfileId = await ctx.db.insert("physiotherapistProfiles", {
        userId: user._id,
        clinicId: invitation.clinicId,
        isAvailableOnMarketplace: true,
        offersInPersonSessions: true,
        offersOnlineSessions: true,
      });
      // Link profile to user
      await ctx.db.patch(user._id, {
        physiotherapistProfileId: newProfileId,
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
          actionUrl: "/dashboard/clinic/staff",
        }
      }
    });

    // Create approved account status for the user so they can access the dashboard
    // This bypasses the manual approval process since they were invited by a clinic owner
    await ctx.db.insert("accountApprovalStatus", {
      userId: user._id,
      status: "approved",
      submittedAt: Date.now(),
      reviewedAt: Date.now(),
      comments: "Automatically approved via clinic invitation",
    });
    // Email notification to clinic owner is handled by the action wrapper
    // (acceptStaffInvitationWithNotification). Avoid sending from the base
    // mutation to prevent duplicate emails.

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
    _creationTime: v.number(),
    clinicId: v.id("clinics"),
    clinicOwnerId: v.id("users"),
    inviteeEmail: v.string(),
    inviteeName: v.optional(v.string()),
    code: v.string(),
    role: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined"), v.literal("expired")),
    expiresAt: v.number(),
    createdAt: v.number(),
    acceptedBy: v.optional(v.id("users")),
    message: v.optional(v.string()),
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
  // No strict `returns` validator: physiotherapist profiles carry many optional fields
  // (marketplace settings etc.) and a strict object validator would reject them.
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "clinic_owner") {
      return [];
    }

    // Get clinic
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();

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
          role: user?.role ?? "physiotherapist",
          status: user?.status ?? "active",
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
          actionUrl: "/dashboard/clinic/staff",
        },
      },
      createdAt: Date.now(),
    });
    // Email notification to clinic owner is handled by the action wrapper
    // (declineStaffInvitationWithNotification). Avoid sending from the base
    // mutation to prevent duplicate emails.

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

    // Get pending and non-expired invitations
    const pendingInvitations = await ctx.db
      .query("clinicStaffInvitations")
      .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .filter((q) => q.gt(q.field("expiresAt"), Date.now()))
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
    // Sample numbers only for genuine preview viewers; a real owner gets real data or the error
    const clinic = (await getOwnerClinicOrPreview(ctx))?.clinic ?? null;

    if (!clinic) {
      return {
        thisMonth: 4200000,
        lastMonth: 3650000,
        growth: 15,
        totalRevenue: 28450000,
        pendingPayments: 245000,
      };
    }

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

    // Revenue counts when money arrived (same rule as the Billing page)
    const paidAt = (invoice: Doc<"invoices">) => invoice.paymentDate ?? invoice._creationTime;
    const paidInvoices = flatInvoices.filter(invoice => invoice.status === "paid");

    const thisMonthRevenue = paidInvoices
      .filter(invoice => paidAt(invoice) >= startOfThisMonth && paidAt(invoice) <= endOfThisMonth)
      .reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0);

    const lastMonthRevenue = paidInvoices
      .filter(invoice => paidAt(invoice) >= startOfLastMonth && paidAt(invoice) <= endOfLastMonth)
      .reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0);

    // Calculate growth percentage
    const growth = lastMonthRevenue > 0
      ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : thisMonthRevenue > 0 ? 100 : 0;

    // Calculate total revenue
    const totalRevenue = flatInvoices
      .filter(invoice => invoice.status === "paid")
      .reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0);

    const pendingPayments = flatInvoices
      .filter(invoice => invoice.status === "sent" || invoice.status === "overdue" || invoice.status === "partial_payment")
      .reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0);

    // Invoices are stored in kobo; every consumer of this query displays naira
    const toNaira = (kobo: number) => Math.round(kobo / 100);
    return {
      thisMonth: toNaira(thisMonthRevenue),
      lastMonth: toNaira(lastMonthRevenue),
      growth,
      totalRevenue: toNaira(totalRevenue),
      pendingPayments: toNaira(pendingPayments),
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
        patientSatisfaction: 0,
        treatmentSuccess: 0,
        avgSessionDuration: 0,
        revenueGrowth: 0,
        patientAcquisitionCost: 0,
        patientLifetimeValue: 0,
        netPromoterScore: 0,
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

    // Derive or placeholder values for additional metrics
    const patientSatisfaction = Math.round((averageRating / 5) * 100); // Convert 0-5 rating to %
    const treatmentSuccess = 0; // Placeholder until implemented
    const avgSessionDuration = 0; // Placeholder until we track duration
    const revenueGrowth = 0; // Placeholder until revenue growth calc

    return {
      averageRating,
      totalReviews,
      patientRetentionRate,
      averageSessionsPerPatient,
      staffUtilization,
      patientSatisfaction,
      treatmentSuccess,
      avgSessionDuration,
      revenueGrowth,
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
 * Get clinic patients with user details (legacy version for existing UI)
 */
export const getClinicPatientsLegacy = query({
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
    // Sample data only for genuine preview viewers; a real owner gets real data or the error
    const auth = await getOwnerClinicOrPreview(ctx);
    const user: any = auth?.user ?? null;
    const clinic: any = auth?.clinic ?? null;

    if (!clinic) {
      return {
        totalPatients: 48,
        activePatients: 42,
        newThisMonth: 12,
        appointmentsToday: 6,
      };
    }

    const relationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const totalPatients = new Set(
      relationships.filter((rel) => rel.status === "active").map((rel) => rel.patientId)
    ).size;

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
 * Get clinic appointments with patient and therapist details (legacy version for existing UI)
 */
export const getClinicAppointmentsLegacy = query({
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
    // Sample data only for genuine preview viewers; a real owner gets real data or the error
    const auth = await getOwnerClinicOrPreview(ctx);
    const user: any = auth?.user ?? null;
    const clinic: any = auth?.clinic ?? null;

    if (!clinic) {
      return {
        total: 58,
        completed: 51,
        cancelled: 4,
        noShows: 3,
        completionRate: 94.4,
      };
    }

    // Get this month's appointments for analytics
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime();

    // Record-only entries anchor notes; they were never visits
    const thisMonthAppointments = (
      await ctx.db
        .query("appointments")
        .withIndex("by_clinic_id_and_time", (q) => q.eq("clinicId", clinic._id).gte("startTime", startOfMonth))
        .collect()
    ).filter((apt) => !apt.isRecordOnly);

    const total = thisMonthAppointments.length;
    const completed = thisMonthAppointments.filter(apt => apt.status === 'completed').length;
    const cancelled = thisMonthAppointments.filter(apt =>
      apt.status === 'cancelled_by_patient' || apt.status === 'cancelled_by_therapist'
    ).length;
    const noShows = thisMonthAppointments.filter(apt => apt.status === 'no_show').length;

    // Calculate completion rate (completed / (completed + no-shows))
    const attempted = completed + noShows;
    const completionRate = attempted > 0 ? (completed / attempted) * 100 : 0;

    return {
      total,
      completed,
      cancelled,
      noShows,
      completionRate: Math.round(completionRate * 10) / 10,
    };
  },
});

/**
 * Get staff metrics for analytics
 */
export const getStaffMetrics = query({
  args: {},
  handler: async (ctx) => {
    // Sample data only for genuine preview viewers; a real owner gets real data or the error
    const auth = await getOwnerClinicOrPreview(ctx);
    const user: any = auth?.user ?? null;
    const clinic: any = auth?.clinic ?? null;

    if (!clinic) {
      return {
        total: 6,
        active: 5,
        pending: 1,
        inactive: 0,
        newThisMonth: 1,
        utilization: 82,
      };
    }

    // Get CLINIC-SPECIFIC physiotherapists through physiotherapistProfiles
    const physiotherapistProfiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const physiotherapistIds = physiotherapistProfiles.map(p => p.userId);

    // Get user details for each physiotherapist
    const physiotherapists = await Promise.all(
      physiotherapistIds.map(async (id) => {
        const user = await ctx.db.get(id);
        return user;
      })
    );

    const validPhysios = physiotherapists.filter(p => p !== null);
    const activePhysios = validPhysios.filter(p => p?.status !== 'suspended' && p?.status !== 'terminated');

    // Get this month's new staff (clinic-specific)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const newThisMonth = physiotherapistProfiles.filter(profile =>
      profile._creationTime >= startOfMonth
    ).length;

    // Calculate utilization based on completed appointments this month
    const thisMonthAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_clinic_id_and_time", (q) => q.eq("clinicId", clinic._id))
      .filter((q) => q.gte(q.field("startTime"), startOfMonth))
      .collect();

    const completedAppointments = thisMonthAppointments.filter(apt => apt.status === "completed");

    // Utilization: completed appointments / (staff count * working days * avg appointments per day)
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const workingDays = Math.floor(daysInMonth * 0.7); // Assume 70% working days
    const expectedAppointments = activePhysios.length * workingDays * 5; // 5 appointments/day capacity

    const utilization = expectedAppointments > 0
      ? Math.min(100, (completedAppointments.length / expectedAppointments) * 100)
      : 0;

    return {
      total: validPhysios.length,
      active: activePhysios.length,
      pending: 0, // Can be enhanced if needed
      inactive: validPhysios.length - activePhysios.length,
      newThisMonth,
      utilization: Math.round(utilization),
    };
  },
});

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

/**
 * Update staff member role
 */
export const updateStaffRole = mutation({
  args: {
    staffId: v.id("users"),
    // Clinic owners may only assign clinic-level roles. Platform roles such as
    // "admin" or "clinic_owner" must never be grantable from a clinic account.
    newRole: v.literal("physiotherapist"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    // Only clinic owners can update staff roles
    if (user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can update staff roles");
    }

    // Get the clinic owned by this user
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .unique();

    if (!clinic) {
      throw new Error("Clinic not found");
    }

    // Verify the staff member belongs to this clinic
    const staffMember = await ctx.db.get(args.staffId);
    if (!staffMember || staffMember.clinicId !== clinic._id) {
      throw new Error("Staff member not found or not in your clinic");
    }
    if (staffMember._id === user._id || staffMember.role === "admin" || staffMember.role === "clinic_owner") {
      throw new Error("This account's role cannot be changed from the clinic dashboard");
    }

    // Update the staff member's role
    await ctx.db.patch(args.staffId, {
      role: args.newRole,
    });

    // Log the action
    await ctx.db.insert("systemLogs", {
      type: "info",
      action: "staff_role_updated",
      userId: user._id,
      clinicId: clinic._id,
      targetEntityType: "user",
      targetEntityId: String(args.staffId),
      details: {
        oldRole: staffMember.role,
        newRole: args.newRole,
      },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Update staff member status
 */
export const updateStaffStatus = mutation({
  args: {
    staffId: v.id("users"),
    newStatus: v.union(v.literal("active"), v.literal("suspended"), v.literal("terminated")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    // Only clinic owners can update staff status
    if (user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can update staff status");
    }

    // Get the clinic owned by this user
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .unique();

    if (!clinic) {
      throw new Error("Clinic not found");
    }

    // Verify the staff member belongs to this clinic
    const staffMember = await ctx.db.get(args.staffId);
    if (!staffMember || staffMember.clinicId !== clinic._id) {
      throw new Error("Staff member not found or not in your clinic");
    }

    // Update the staff member's status
    await ctx.db.patch(args.staffId, {
      status: args.newStatus,
    });

    // Log the action
    await ctx.db.insert("systemLogs", {
      type: "info",
      action: "staff_status_updated",
      userId: user._id,
      clinicId: clinic._id,
      targetEntityType: "user",
      targetEntityId: String(args.staffId),
      details: {
        oldStatus: staffMember.status,
        newStatus: args.newStatus,
      },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Reassign staff to clinic
 */
export const reassignStaffToClinic = mutation({
  args: {
    staffId: v.id("users"),
    newClinicId: v.id("clinics"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    // Only clinic owners can reassign staff
    if (user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can reassign staff");
    }

    // Get the clinic owned by this user
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .unique();

    if (!clinic) {
      throw new Error("Clinic not found");
    }

    // Verify the staff member belongs to this clinic
    const staffMember = await ctx.db.get(args.staffId);
    if (!staffMember || staffMember.clinicId !== clinic._id) {
      throw new Error("Staff member not found or not in your clinic");
    }

    // Verify the new clinic exists and is owned by the same owner
    const newClinic = await ctx.db.get(args.newClinicId);
    if (!newClinic || newClinic.ownerId !== user._id) {
      throw new Error("Target clinic not found or not owned by you");
    }

    // Update the staff member's clinic assignment
    await ctx.db.patch(args.staffId, {
      clinicId: args.newClinicId,
    });

    // Log the action
    await ctx.db.insert("systemLogs", {
      type: "info",
      action: "staff_reassigned",
      userId: user._id,
      clinicId: clinic._id,
      targetEntityType: "user",
      targetEntityId: String(args.staffId),
      details: {
        oldClinicId: clinic._id,
        newClinicId: args.newClinicId,
        oldClinicName: clinic.name,
        newClinicName: newClinic.name,
      },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Create staff member directly (without invitation)
 */
export const createStaffDirect = mutation({
  args: {
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    role: v.union(
      v.literal("physiotherapist"),
      v.literal("admin")
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    // Only clinic owners can create staff directly
    if (user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can create staff members");
    }

    // Get the clinic owned by this user
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .unique();

    if (!clinic) {
      throw new Error("Clinic not found");
    }

    // Check if user with this email already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (existingUser) {
      throw new Error("A user with this email already exists");
    }

    // Create the staff member
    const staffId = await ctx.db.insert("users", {
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      phoneNumber: args.phoneNumber,
      role: args.role,
      status: "active",
      clinicId: clinic._id,
      onboarded: false, // Will be set to true when they complete onboarding
      joinedAt: Date.now(),
    } as any); // Avoid deep type instantiation

    // If role is physiotherapist, create physiotherapist profile
    if (args.role === "physiotherapist") {
      await ctx.db.insert("physiotherapistProfiles", {
        userId: staffId,
        clinicId: clinic._id,
        isAvailableOnMarketplace: true,
        offersInPersonSessions: true,
        offersOnlineSessions: true,
      } as any);
    }

    // Log the action
    await ctx.db.insert("systemLogs", {
      type: "info",
      action: "staff_created_direct",
      userId: user._id,
      clinicId: clinic._id,
      targetEntityType: "user",
      targetEntityId: String(staffId),
      details: {
        staffEmail: args.email,
        staffRole: args.role,
      },
      timestamp: Date.now(),
    });

    return {
      success: true,
      staffId,
      message: "Staff member created successfully",
    };
  },
});

/**
 * Get clinic audit logs for clinic owner
 */
export const getClinicAuditLogs = query({
  args: {
    limit: v.optional(v.number()),
    actionFilter: v.optional(v.string()),
    dateFilter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    // Only clinic owners can view audit logs
    if (user.role !== "clinic_owner") {
      throw new Error("Only clinic owners can view audit logs");
    }

    // Get the clinic owned by this user
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .unique();

    if (!clinic) {
      throw new Error("Clinic not found");
    }

    const limit = args.limit || 50;

    // Build query for system logs
    let logsQuery = ctx.db
      .query("systemLogs")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .order("desc");

    // Apply date filter
    if (args.dateFilter && args.dateFilter !== 'all') {
      const now = Date.now();
      let startTime = 0;

      switch (args.dateFilter) {
        case 'today':
          const today = new Date();
          startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
          break;
        case 'week':
          startTime = now - (7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startTime = now - (30 * 24 * 60 * 60 * 1000);
          break;
        case 'quarter':
          startTime = now - (90 * 24 * 60 * 60 * 1000);
          break;
      }

      if (startTime > 0) {
        logsQuery = logsQuery.filter((q) => q.gte(q.field("timestamp"), startTime));
      }
    }

    let logs = await logsQuery.take(limit);

    // Apply action filter
    if (args.actionFilter && args.actionFilter !== 'all') {
      logs = logs.filter(log => log.action === args.actionFilter);
    }

    // Enrich logs with user details
    const enrichedLogs = await Promise.all(
      logs.map(async (log) => {
        let logUser: Doc<"users"> | null = null;
        if (log.userId) {
          // Try to find by Clerk ID first
          logUser = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", log.userId!))
            .unique();

          // If not found, try as Convex ID
          if (!logUser) {
            try {
              logUser = await ctx.db.get(log.userId as Id<"users">);
            } catch (error) {
              // Ignore invalid ID format errors
            }
          }
        }

        const targetUser = (log.targetEntityType === "user" && log.targetEntityId)
          ? await ctx.db.get(log.targetEntityId as Id<"users">)
          : null;

        return {
          ...log,
          user: logUser ? {
            firstName: logUser.firstName,
            lastName: logUser.lastName,
            email: logUser.email,
            imageUrl: logUser.imageUrl,
          } : null,
          targetUser: targetUser ? {
            firstName: targetUser.firstName,
            lastName: targetUser.lastName,
            email: targetUser.email,
          } : null,
        };
      })
    );

    return enrichedLogs;
  },
});

/**
 * Get owner analytics data (REAL DATA FROM DATABASE)
 */
export const getOwnerAnalytics = query({
  args: {},
  handler: async (ctx) => {
    // Sample data only for genuine preview viewers; a real owner gets real data or the error
    const auth = await getOwnerClinicOrPreview(ctx);
    const user: any = auth?.user ?? null;
    const clinic: any = auth?.clinic ?? null;

    if (!clinic) {
      return {
        telehealth: {
          totalMinutes: 1440,
          sessionsCount: 24,
          averageSessionLength: 60,
          growth: 18.5,
        },
        patients: {
          total: 48,
          active: 42,
          newThisMonth: 12,
          retention: 87.5,
        },
      };
    }

    // Get clinic physiotherapists
    const physiotherapistProfiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const physiotherapistIds = physiotherapistProfiles.map(p => p.userId);

    // Get REAL patient data through relationships
    const patientRelationships = await Promise.all(
      physiotherapistIds.map(physioId =>
        ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physioId))
          .collect()
      )
    );

    const allPatientRels = patientRelationships.flat();
    const uniquePatientIds = Array.from(new Set(allPatientRels.map(r => r.patientId)));
    const activePatients = allPatientRels.filter(r => r.status === 'active').length;

    // Calculate new patients this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const newPatientsThisMonth = allPatientRels.filter(r =>
      r._creationTime >= startOfMonth
    ).length;

    // Get REAL telehealth data
    const allAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_clinic_id_and_time", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const telehealthSessions = allAppointments.filter(apt =>
      apt.appointmentType === 'telehealth' && apt.status === 'completed'
    );

    const totalTelehealthMinutes = telehealthSessions.reduce((sum, session) => {
      const duration = session.endTime ? (session.endTime - session.startTime) / (1000 * 60) : 60;
      return sum + duration;
    }, 0);

    const avgSessionLength = telehealthSessions.length > 0
      ? Math.round(totalTelehealthMinutes / telehealthSessions.length)
      : 0;

    // Calculate telehealth growth (this month vs last month)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();

    const thisMonthTelehealth = telehealthSessions.filter(s => s.startTime >= startOfMonth).length;
    const lastMonthTelehealth = telehealthSessions.filter(s =>
      s.startTime >= startOfLastMonth && s.startTime <= endOfLastMonth
    ).length;

    const telehealthGrowth = lastMonthTelehealth > 0
      ? ((thisMonthTelehealth - lastMonthTelehealth) / lastMonthTelehealth) * 100
      : thisMonthTelehealth > 0 ? 100 : 0;

    // Calculate patient retention (active vs total)
    const retentionRate = uniquePatientIds.length > 0
      ? (activePatients / uniquePatientIds.length) * 100
      : 0;

    // Note: Revenue and appointment stats are fetched by separate queries
    // This function focuses on patient and telehealth metrics
    return {
      telehealth: {
        totalMinutes: Math.round(totalTelehealthMinutes),
        sessionsCount: telehealthSessions.length,
        averageSessionLength: avgSessionLength,
        growth: Math.round(telehealthGrowth * 10) / 10,
      },
      patients: {
        total: uniquePatientIds.length,
        active: activePatients,
        newThisMonth: newPatientsThisMonth,
        retention: Math.round(retentionRate * 10) / 10,
      }
    };
  },
});

/**
 * Get clinic information for clinic staff member
 */
export const getMyClinicInfo = query({
  args: {},
  handler: async (ctx) => {
    // Check if user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null; // Return null instead of throwing for unauthenticated users
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return null;
    }

    // Only return clinic info if user is assigned to a clinic
    if (!user.clinicId) {
      return null;
    }

    // Get the clinic information
    const clinic = await ctx.db.get(user.clinicId);

    if (!clinic) {
      return null;
    }

    // Get clinic owner information
    const clinicOwner = await ctx.db.get(clinic.ownerId);

    return {
      _id: clinic._id,
      name: clinic.name,
      address: clinic.address,
      city: clinic.city,
      country: clinic.country,
      contactEmail: clinic.contactEmail,
      contactPhone: clinic.contactPhone,
      logoUrl: clinic.logoUrl,
      owner: clinicOwner ? {
        firstName: clinicOwner.firstName,
        lastName: clinicOwner.lastName,
        email: clinicOwner.email,
      } : null,
      staffRole: user.role,
      joinedAt: user.joinedAt,
    };
  },
});

/**
 * Get all patients across clinic (for clinic owner)
 */
export const getClinicPatients = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const clinic = (await getOwnerClinicOrPreview(ctx))?.clinic ?? null;

    if (!clinic) {
      return [
        {
          _id: "prev_p1",
          firstName: "Folake",
          lastName: "Adebayo",
          email: "folake.adebayo@example.com",
          phoneNumber: "+234 803 123 4567",
          status: "active",
          gender: "female",
          initialDiagnosis: "Post-Op Right ACL Reconstruction",
          totalSessions: 8,
          relationshipCreatedAt: Date.now() - 14 * 86400000,
          primaryPhysiotherapist: {
            _id: "prev_doc1",
            firstName: "Kunle",
            lastName: "Balogun",
          },
        },
        {
          _id: "prev_p2",
          firstName: "Chukwudi",
          lastName: "Eze",
          email: "chukwudi.eze@example.com",
          phoneNumber: "+234 802 987 6543",
          status: "active",
          gender: "male",
          initialDiagnosis: "Lumbar Disc Herniation (L4-L5)",
          totalSessions: 12,
          relationshipCreatedAt: Date.now() - 30 * 86400000,
          primaryPhysiotherapist: {
            _id: "prev_doc2",
            firstName: "Amara",
            lastName: "Okafor",
          },
        },
        {
          _id: "prev_p3",
          firstName: "Fatima",
          lastName: "Aliyu",
          email: "fatima.aliyu@example.com",
          phoneNumber: "+234 814 555 1212",
          status: "active",
          gender: "female",
          initialDiagnosis: "Cervicogenic Headache & Neck Spasm",
          totalSessions: 4,
          relationshipCreatedAt: Date.now() - 5 * 86400000,
          primaryPhysiotherapist: {
            _id: "prev_doc1",
            firstName: "Kunle",
            lastName: "Balogun",
          },
        },
      ];
    }

    // Get all physiotherapists in this clinic
    const physiotherapistProfiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const physiotherapistIds = Array.from(
      new Set([clinic.ownerId, ...physiotherapistProfiles.map(p => p.userId)])
    );

    // Every care relationship at this clinic, past or present, plus active ones held by
    // a clinic clinician. Discharged and paused patients stay on the list.
    const patientRelationships = await Promise.all([
      ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
        .collect(),
      ...physiotherapistIds.map(physioId =>
        ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physioId))
          .filter((q) => q.eq(q.field("status"), "active"))
          .collect()
      ),
    ]);

    // One row per patient: the active relationship when there is one, else the latest
    const uniquePatientMap = new Map<Id<"users">, Doc<"patientPhysiotherapistRelationships">>();
    patientRelationships.flat().forEach(rel => {
      const current = uniquePatientMap.get(rel.patientId);
      const better =
        !current ||
        (rel.status === "active" && current.status !== "active") ||
        (rel.status !== "active" && current.status !== "active" && (rel.endDate ?? 0) > (current.endDate ?? 0));
      if (better) {
        uniquePatientMap.set(rel.patientId, rel);
      }
    });

    // Patients in care first, then by most recent start
    const uniqueRelationships = Array.from(uniquePatientMap.values()).sort((a, b) =>
      a.status === "active" && b.status !== "active"
        ? -1
        : b.status === "active" && a.status !== "active"
          ? 1
          : b.startDate - a.startDate
    );

    // Apply pagination
    const limit = args.limit || 50;
    const offset = args.offset || 0;
    const paginatedRelationships = uniqueRelationships.slice(offset, offset + limit);

    // Get patient details
    const patients = await Promise.all(
      paginatedRelationships.map(async (rel) => {
        const patient = await ctx.db.get(rel.patientId) as Doc<"users"> | null;
        const physiotherapist = await ctx.db.get(rel.physiotherapistId) as Doc<"users"> | null;

        if (!patient) return null;

        // Get patient's appointment count
        const appointments = await ctx.db
          .query("appointments")
          .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", rel.patientId))
          .collect();

        return {
          _id: patient._id,
          firstName: patient.firstName || "",
          lastName: patient.lastName || "",
          email: patient.email || "",
          imageUrl: patient.imageUrl,
          phoneNumber: patient.phoneNumber,
          primaryPhysiotherapist: physiotherapist ? {
            _id: physiotherapist._id,
            firstName: physiotherapist.firstName || "",
            lastName: physiotherapist.lastName || "",
          } : null,
          relationship: {
            isPrimary: rel.isPrimaryPhysiotherapist,
            startDate: rel.startDate,
            status: rel.status,
          },
          source: rel.source ?? "clinic_direct",
          careStatus:
            rel.status === "active"
              ? ("active" as const)
              : rel.notes === "Care paused"
                ? ("paused" as const)
                : ("discharged" as const),
          stats: {
            appointmentCount: appointments.length,
            lastSessionDate: appointments.length > 0
              ? Math.max(...appointments.map(a => a.startTime))
              : undefined,
          },
        };
      })
    );

    return patients.filter(p => p !== null);
  },
});

/**
 * Get all appointments across clinic (for clinic owner)
 */
export const getClinicAppointments = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const clinic = (await getOwnerClinicOrPreview(ctx))?.clinic ?? null;

    if (!clinic) {
      return [
        {
          _id: "prev_apt_1",
          startTime: Date.now() + 2 * 60 * 60 * 1000,
          endTime: Date.now() + 3 * 60 * 60 * 1000,
          appointmentType: "in-person",
          status: "scheduled",
          patientId: "prev_p1",
          physiotherapistId: "prev_doc1",
          patient: {
            _id: "prev_p1",
            firstName: "Folake",
            lastName: "Adebayo",
            email: "folake.adebayo@example.com",
            imageUrl: undefined,
          },
          physiotherapist: {
            _id: "prev_doc1",
            firstName: "Kunle",
            lastName: "Balogun",
            email: "dr.kunle@rehabify.ng",
            imageUrl: undefined,
          },
        },
        {
          _id: "prev_apt_2",
          startTime: Date.now() + 4 * 60 * 60 * 1000,
          endTime: Date.now() + 5 * 60 * 60 * 1000,
          appointmentType: "telehealth",
          status: "scheduled",
          patientId: "prev_p2",
          physiotherapistId: "prev_doc2",
          patient: {
            _id: "prev_p2",
            firstName: "Chukwudi",
            lastName: "Eze",
            email: "chukwudi.eze@example.com",
            imageUrl: undefined,
          },
          physiotherapist: {
            _id: "prev_doc2",
            firstName: "Amara",
            lastName: "Okafor",
            email: "dr.amara@rehabify.ng",
            imageUrl: undefined,
          },
        },
        {
          _id: "prev_apt_3",
          startTime: Date.now() - 2 * 60 * 60 * 1000,
          endTime: Date.now() - 1 * 60 * 60 * 1000,
          appointmentType: "in-person",
          status: "completed",
          patientId: "prev_p3",
          physiotherapistId: "prev_doc1",
          patient: {
            _id: "prev_p3",
            firstName: "Fatima",
            lastName: "Aliyu",
            email: "fatima.aliyu@example.com",
            imageUrl: undefined,
          },
          physiotherapist: {
            _id: "prev_doc1",
            firstName: "Kunle",
            lastName: "Balogun",
            email: "dr.kunle@rehabify.ng",
            imageUrl: undefined,
          },
        },
      ];
    }

    // Get all physiotherapists in this clinic
    const physiotherapistProfiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const physiotherapistIds = physiotherapistProfiles.map(p => p.userId);

    // Appointments booked against the clinic itself (covers the owner as clinician)
    const clinicAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_clinic_id_and_time", (q) => {
        const base = q.eq("clinicId", clinic._id);
        return args.startDate !== undefined ? base.gte("startTime", args.startDate) : base;
      })
      .collect();

    // Get appointments for all clinic physiotherapists
    const allAppointments = await Promise.all(
      physiotherapistIds.map(async (physioId) => {
        if (args.startDate !== undefined) {
          let query = ctx.db
            .query("appointments")
            .withIndex("by_physiotherapist_id_and_time", (q) =>
              q.eq("physiotherapistId", physioId).gte("startTime", args.startDate!)
            );

          if (args.endDate !== undefined) {
            query = query.filter((q) => q.lte(q.field("startTime"), args.endDate!));
          }

          return query.collect();
        } else {
          // No date filter, get all appointments for this physiotherapist
          const allApts = await ctx.db
            .query("appointments")
            .withIndex("by_physiotherapist_id_and_time", (q) => q.eq("physiotherapistId", physioId))
            .collect();

          if (args.endDate !== undefined) {
            return allApts.filter(apt => apt.startTime <= args.endDate!);
          }

          return allApts;
        }
      })
    );

    // Merge, deduplicate and sort by start time
    const byId = new Map<Id<"appointments">, Doc<"appointments">>();
    for (const apt of [
      ...clinicAppointments.filter(apt => args.endDate === undefined || apt.startTime <= args.endDate),
      ...allAppointments.flat(),
    ]) {
      byId.set(apt._id, apt);
    }
    const flatAppointments = Array.from(byId.values())
      .filter(apt => !apt.isRecordOnly) // note/check-in anchors are not visits
      .sort((a, b) => b.startTime - a.startTime);

    // Apply limit
    const limit = args.limit || 100;
    const limitedAppointments = flatAppointments.slice(0, limit);

    // Enrich with patient and physiotherapist details
    const enrichedAppointments = await Promise.all(
      limitedAppointments.map(async (appointment) => {
        const patient = await ctx.db.get(appointment.patientId);
        const physiotherapist = await ctx.db.get(appointment.physiotherapistId);

        return {
          ...appointment,
          patient: patient ? {
            _id: patient._id,
            firstName: patient.firstName || "",
            lastName: patient.lastName || "",
            email: patient.email || "",
            imageUrl: patient.imageUrl,
          } : null,
          physiotherapist: physiotherapist ? {
            _id: physiotherapist._id,
            firstName: physiotherapist.firstName || "",
            lastName: physiotherapist.lastName || "",
          } : null,
        };
      })
    );

    return enrichedAppointments;
  },
});

/**
 * Get clinic reports data with comprehensive analytics (REAL DATA)
 */
export const getClinicReports = query({
  args: {},
  handler: async (ctx) => {
    // Check if user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null; // Return null instead of throwing for unauthenticated users
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || user.role !== "clinic_owner") {
      return null;
    }

    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();

    if (!clinic) {
      return null;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    // Get physiotherapists for this clinic
    const physiotherapistProfiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .collect();

    const physiotherapistIds = physiotherapistProfiles.map(p => p.userId);

    // Get all patients for demographics
    const patientRelationships = await Promise.all(
      physiotherapistIds.map(physioId =>
        ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physioId))
          .collect()
      )
    );

    const allPatientRels = patientRelationships.flat();
    const uniquePatientIds = Array.from(new Set(allPatientRels.map(r => r.patientId)));

    // Get patient profiles for age demographics (dateOfBirth is in patientProfiles)
    const patientProfiles = await Promise.all(
      uniquePatientIds.map(async (patientId) => {
        return await ctx.db
          .query("patientProfiles")
          .withIndex("by_user_id", (q) => q.eq("userId", patientId))
          .first();
      })
    );

    // Calculate age demographics
    const ageGroups = { '18-30': 0, '31-50': 0, '51-70': 0, '70+': 0 };
    patientProfiles.forEach(profile => {
      if (profile?.dateOfBirth) {
        // dateOfBirth is stored as a string (YYYY-MM-DD), convert to timestamp
        const birthDate = new Date(profile.dateOfBirth).getTime();
        const age = Math.floor((Date.now() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
        if (age >= 18 && age <= 30) ageGroups['18-30']++;
        else if (age >= 31 && age <= 50) ageGroups['31-50']++;
        else if (age >= 51 && age <= 70) ageGroups['51-70']++;
        else if (age > 70) ageGroups['70+']++;
      }
    });

    const totalPatients = Object.values(ageGroups).reduce((sum, count) => sum + count, 0);
    const demographics = {
      '18-30': totalPatients > 0 ? Math.round((ageGroups['18-30'] / totalPatients) * 100) : 0,
      '31-50': totalPatients > 0 ? Math.round((ageGroups['31-50'] / totalPatients) * 100) : 0,
      '51-70': totalPatients > 0 ? Math.round((ageGroups['51-70'] / totalPatients) * 100) : 0,
      '70+': totalPatients > 0 ? Math.round((ageGroups['70+'] / totalPatients) * 100) : 0,
    };

    // Get all invoices for revenue breakdown
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .filter((q) => q.eq(q.field("status"), "paid"))
      .collect();

    const totalRevenue = allInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

    // Calculate revenue breakdown (simplified - all as individual sessions for now)
    const revenueBreakdown = {
      individualSessions: totalRevenue,
      insuranceClaims: 0,
      packageDeals: 0,
    };

    // Get appointments for daily average
    const thisMonthAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_clinic_id_and_time", (q) => q.eq("clinicId", clinic._id))
      .filter((q) => q.gte(q.field("startTime"), startOfMonth))
      .collect();

    const daysInMonth = Math.ceil((Date.now() - startOfMonth) / (24 * 60 * 60 * 1000));
    const avgDailyAppointments = physiotherapistProfiles.length > 0 && daysInMonth > 0
      ? (thisMonthAppointments.length / daysInMonth / physiotherapistProfiles.length)
      : 0;

    return {
      clinicName: clinic.name,
      totalStaff: physiotherapistProfiles.length,
      appointmentsThisMonth: thisMonthAppointments.length,
      reportGeneratedAt: Date.now(),
      demographics,
      revenueBreakdown,
      avgDailyAppointments: Math.round(avgDailyAppointments * 10) / 10,
    };
  },
});

/**
 * Get all invoices for a clinic
 */
export const getClinicInvoices = query({
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
      throw new Error("Only clinic owners can view invoices");
    }

    // Get clinic
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .unique();

    if (!clinic) {
      return [];
    }

    // Get all invoices for this clinic
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .order("desc")
      .collect();

    // Enhance invoices with patient details
    const enhancedInvoices = await Promise.all(
      invoices.map(async (invoice) => {
        let patientDetails = null;
        if (invoice.patientId) {
          const patient = await ctx.db.get(invoice.patientId);
          if (patient) {
            patientDetails = {
              user: {
                firstName: patient.firstName,
                lastName: patient.lastName,
                email: patient.email,
              }
            };
          }
        }
        return {
          ...invoice,
          patient: patientDetails,
        };
      })
    );

    return enhancedInvoices;
  },
});

export * from "./clinicTools";
