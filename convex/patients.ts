
import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { getAuthenticatedUser, ensureClinicOwner, ensureUserRole, ensureIsClinicOwner } from "./auth";
import { Id } from "./_generated/dataModel";
import { getClinicMember, requireClinicWrite } from "./clinicTools";
import { normalizePhone } from "./helpers/partnerShared";

/**
 * Get authenticated physiotherapist user and validate permissions
 */
async function getAuthenticatedPhysiotherapist(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) {
    throw new Error("User not found");
  }

  if (user.role !== "physiotherapist") {
    throw new Error("Access denied. Physiotherapist privileges required.");
  }

  // Check if physiotherapist is approved
  const approvalStatus = await ctx.db
    .query("accountApprovalStatus")
    .withIndex("by_user_id", (q: any) => q.eq("userId", user._id))
    .unique();

  if (!approvalStatus || approvalStatus.status !== "approved") {
    throw new Error("Account not approved. Please wait for admin approval.");
  }

  return user;
}

/**
 * Create a new patient invitation
 * Allows physiotherapists to invite patients via email
 */
export const createPatientInvitation = mutation({
  args: {
    patientEmail: v.string(),
    patientName: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const physiotherapist = await getAuthenticatedPhysiotherapist(ctx);

    // Get physiotherapist profile to get clinic info
    const physiotherapistProfile = await ctx.db.get(physiotherapist.physiotherapistProfileId!);
    if (!physiotherapistProfile) {
      throw new Error("Physiotherapist profile not found");
    }

    // Generate unique invitation code
    const code = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const now = Date.now();
    const expiresAt = now + (7 * 24 * 60 * 60 * 1000); // 7 days

    // Get the clinic ID (optional for independent physiotherapists)
    let clinicId = null;
    if (physiotherapistProfile && (physiotherapistProfile as any)?.clinicId) {
      clinicId = (physiotherapistProfile as any).clinicId;
    } else if (physiotherapist.clinicId) {
      clinicId = physiotherapist.clinicId;
    }
    // Note: Independent physiotherapists can work without a clinic

    // Create the invitation
    const invitationId = await ctx.db.insert("patientInvitations", {
      code,
      physiotherapistId: physiotherapist._id,
      clinicId: clinicId, // Can be null for independent physiotherapists
      patientEmail: args.patientEmail,
      patientName: args.patientName,
      status: "pending",
      createdAt: now,
      expiresAt,
      notes: args.notes,
      patientUserId: undefined,
    });

    // Create notification for the physiotherapist
    await ctx.db.insert("notifications", {
      userId: physiotherapist._id,
      type: "invitation_created",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Patient Invitation Created",
        body: `Patient invitation sent to ${args.patientEmail} `,
        data: {
          entityId: invitationId,
          entityType: "patient_invitation",
          actionUrl: "/dashboard/physiotherapist/patients",
        },
      },
      createdAt: now,
    });

    return {
      success: true,
      invitationCode: code,
      message: "Patient invitation created successfully.",
    };
  },
});

/**
 * Get all patients for a physiotherapist
 */
export const getMyPatients = query({
  args: {
    limit: v.optional(v.number()),
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const physiotherapist = await getAuthenticatedPhysiotherapist(ctx);
    const limit = args.limit ?? 50;

    // Get all patient relationships for this physiotherapist
    const activeRelationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physiotherapist._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .take(limit);
    // Each patient once, even if older data linked them twice
    const relationships = [...new Map(activeRelationships.map((r) => [r.patientId, r] as const)).values()];

    // Get patient details
    const patients = await Promise.all(
      relationships.map(async (relationship) => {
        const patient = await ctx.db.get(relationship.patientId);
        if (!patient) return null;

        // Get patient profile
        const patientProfile = patient.patientProfileId
          ? await ctx.db.get(patient.patientProfileId)
          : null;

        // Visits with this physio, counted up to 100 so a long history doesn't make the list slow
        const appointmentCount = await ctx.db
          .query("appointments")
          .withIndex("by_patient_id_and_time", (q) =>
            q.eq("patientId", patient._id)
          )
          .filter((q) => q.eq(q.field("physiotherapistId"), physiotherapist._id))
          .take(100)
          .then(appointments => appointments.length);

        // Get latest session
        const latestSession = await ctx.db
          .query("sessionLogs")
          .withIndex("by_patient_id_and_date", (q) =>
            q.eq("patientId", patient._id)
          )
          .filter((q) => q.eq(q.field("physiotherapistId"), physiotherapist._id))
          .order("desc")
          .first();

        return {
          _id: patient._id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email,
          imageUrl: patient.imageUrl,
          phoneNumber: patient.phoneNumber,
          patientNumber: patient.patientNumber,
          relationship: {
            isPrimary: relationship.isPrimaryPhysiotherapist,
            startDate: relationship.startDate,
            status: relationship.status,
            source: relationship.source,
            referredBy: relationship.referredBy,
          },
          profile: patientProfile,
          stats: {
            appointmentCount,
            lastSessionDate: latestSession?.sessionDate,
          },
        };
      })
    );

    // Filter out null values and apply search if provided
    let filteredPatients = patients.filter(Boolean);

    if (args.searchTerm) {
      const searchLower = args.searchTerm.toLowerCase();
      filteredPatients = filteredPatients.filter(patient =>
        patient!.firstName?.toLowerCase().includes(searchLower) ||
        patient!.lastName?.toLowerCase().includes(searchLower) ||
        patient!.email?.toLowerCase().includes(searchLower)
      );
    }

    return filteredPatients;
  },
});

/**
 * The physio's active patients for pickers (messages, video calls, invoices, scheduling):
 * names and contact only, one read per patient. Use getMyPatients where stats are shown.
 */
export const getMyPatientOptions = query({
  args: {},
  handler: async (ctx) => {
    const physiotherapist = await getAuthenticatedPhysiotherapist(ctx);
    const relationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physiotherapist._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .take(500);
    const patientIds = [...new Set(relationships.map((r) => r.patientId))];
    const patients = await Promise.all(patientIds.map((id) => ctx.db.get(id)));
    return patients
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map((p) => ({
        _id: p._id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phoneNumber: p.phoneNumber,
        patientNumber: p.patientNumber,
        imageUrl: p.imageUrl,
      }))
      .sort((a, b) => `${a.firstName ?? ""} ${a.lastName ?? ""}`.localeCompare(`${b.firstName ?? ""} ${b.lastName ?? ""}`));
  },
});

/**
 * Get detailed patient information for a specific patient
 */
export const getPatientDetails = query({
  args: {
    patientId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const physiotherapist = await getAuthenticatedPhysiotherapist(ctx);

    // Verify physiotherapist has access to this patient
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) =>
        q.eq("patientId", args.patientId).eq("physiotherapistId", physiotherapist._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    // Not this physio's (active) patient, or no such patient: the page shows "not found"
    // instead of crashing on a thrown query error
    if (!relationship) {
      return null;
    }

    // Get patient details
    const patient = await ctx.db.get(args.patientId);
    if (!patient) {
      return null;
    }

    // Get patient profile (basic demographics)
    const patientProfile = patient.patientProfileId
      ? await ctx.db.get(patient.patientProfileId)
      : null;

    // Get extended clinical record from patients table if available
    const patientRecord = await ctx.db
      .query("patients")
      .withIndex("by_user_id", (q: any) => q.eq("userId", args.patientId))
      .unique();

    // Merge clinical arrays into profile for downstream UI consumption
    const enrichedProfile = patientProfile || patientRecord ? {
      ...(patientProfile || {}),
      // Prefer explicit profile fields if they exist, otherwise fall back to patientRecord
      emergencyContact: (patientProfile as any)?.emergencyContact ?? patientRecord?.emergencyContact,
      medicalHistory:
        (patientProfile as any)?.medicalHistory ??
        (Array.isArray((patientRecord as any)?.medicalHistory)
          ? (patientRecord as any)?.medicalHistory
          : ((patientRecord as any)?.currentConditions || ((patientRecord as any)?.medicalHistory ? [(patientRecord as any).medicalHistory] : []))),
      currentMedications:
        (patientProfile as any)?.currentMedications ?? (patientRecord as any)?.medications ?? [],
      allergies:
        (patientProfile as any)?.allergies ?? (patientRecord as any)?.allergies ?? [],
      referralSource:
        (patientProfile as any)?.referralSource ?? (patientRecord as any)?.referralSource ?? null,
    } : null;

    // Get recent appointments
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_patient_id_and_time", (q) =>
        q.eq("patientId", args.patientId)
      )
      .filter((q) => q.eq(q.field("physiotherapistId"), physiotherapist._id))
      .order("desc")
      .take(10);

    // Get recent session logs
    const sessionLogs = await ctx.db
      .query("sessionLogs")
      .withIndex("by_patient_id_and_date", (q) =>
        q.eq("patientId", args.patientId)
      )
      .filter((q) => q.eq(q.field("physiotherapistId"), physiotherapist._id))
      .order("desc")
      .take(10);

    const enrichedSessionLogs = await Promise.all(
      sessionLogs.map(async (log) => {
        const physiotherapist = await ctx.db.get(log.physiotherapistId);
        return {
          ...log,
          physiotherapist: physiotherapist
            ? {
              firstName: physiotherapist.firstName,
              lastName: physiotherapist.lastName,
            }
            : null,
        };
      })
    );

    // Get active treatment plans
    const treatmentPlans = await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .filter((q) => q.eq(q.field("physiotherapistId"), physiotherapist._id))
      .collect();

    // Get patient documents
    const documents = patientProfile ? await ctx.db
      .query("patientDocuments")
      .withIndex("by_patient_profile_id", (q) =>
        q.eq("patientProfileId", patientProfile._id)
      )
      .collect() : [];

    return {
      patient: {
        _id: patient._id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        imageUrl: patient.imageUrl,
        phoneNumber: patient.phoneNumber,
      },
      profile: enrichedProfile,
      relationship,
      appointments,
      sessionLogs: enrichedSessionLogs,
      treatmentPlans,
      documents,
    };
  },
});

/**
 * Get the active package booking for a patient (physio-scoped)
 */
export const getActivePackageBooking = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const physiotherapist = await getAuthenticatedPhysiotherapist(ctx);

    // Verify access
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) =>
        q.eq("patientId", args.patientId).eq("physiotherapistId", physiotherapist._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!relationship) return null;

    // Find the latest confirmed package booking
    const bookings = await ctx.db
      .query("marketplaceBookings")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .filter((q) =>
        q.and(
          q.eq(q.field("physiotherapistId"), physiotherapist._id),
          q.eq(q.field("sessionType"), "package"),
          q.eq(q.field("bookingStatus"), "confirmed")
        )
      )
      .order("desc")
      .first();

    if (!bookings) return null;

    return {
      bookingId: bookings._id,
      packageSessions: bookings.packageSessions ?? 1,
      sessionsRemaining: bookings.sessionsRemaining ?? bookings.packageSessions ?? 1,
      conditionLabel: bookings.conditionLabel ?? "General physiotherapy",
      conditionLevel: bookings.conditionLevel ?? "standard",
      packageDiscountPercent: bookings.packageDiscountPercent ?? 0,
      totalAmount: bookings.totalAmount, // kobo
      treatmentPlanId: (bookings as any).treatmentPlanId ?? null,
      paidAt: bookings.paidAt,
    };
  },
});

export const getMyPatientInvitations = query({
  args: {
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("expired")
    )),
  },
  handler: async (ctx, args) => {
    const physiotherapist = await getAuthenticatedPhysiotherapist(ctx);

    let invitationsQuery = ctx.db
      .query("patientInvitations")
      .withIndex("by_physiotherapist", (q) =>
        q.eq("physiotherapistId", physiotherapist._id)
      );

    if (args.status) {
      invitationsQuery = invitationsQuery.filter((q) =>
        q.eq(q.field("status"), args.status)
      );
    }

    const invitations = await invitationsQuery.order("desc").take(50);

    // Add patient info for accepted invitations
    const invitationsWithPatients = await Promise.all(
      invitations.map(async (invitation) => {
        let patientInfo = null;
        if (invitation.patientUserId) {
          const patient = await ctx.db.get(invitation.patientUserId);
          patientInfo = patient ? {
            _id: patient._id,
            firstName: patient.firstName,
            lastName: patient.lastName,
            email: patient.email,
            imageUrl: patient.imageUrl,
          } : null;
        }

        return {
          ...invitation,
          patientInfo,
        };
      })
    );

    return invitationsWithPatients;
  },
});

/**
 * Update patient profile (basic info only - medical history requires separate endpoint)
 */
export const updatePatientBasicInfo = mutation({
  args: {
    patientId: v.id("users"),
    updates: v.object({
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      email: v.optional(v.string()),
      phoneNumber: v.optional(v.string()),
      dateOfBirth: v.optional(v.string()),
      gender: v.optional(v.union(
        v.literal("male"),
        v.literal("female"),
        v.literal("other"),
        v.literal("prefer_not_to_say")
      )),
    }),
  },
  handler: async (ctx, args) => {
    const physiotherapist = await getAuthenticatedPhysiotherapist(ctx);

    // Verify access to patient
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) =>
        q.eq("patientId", args.patientId).eq("physiotherapistId", physiotherapist._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!relationship) {
      throw new ConvexError("Access denied. Patient not assigned to you.");
    }

    // Update basic user info. The email is the patient's sign-in, so only the patient changes it.
    const userUpdateData: any = {};
    if (args.updates.firstName !== undefined) userUpdateData.firstName = args.updates.firstName;
    if (args.updates.lastName !== undefined) userUpdateData.lastName = args.updates.lastName;
    if (args.updates.phoneNumber !== undefined) userUpdateData.phoneNumber = args.updates.phoneNumber;

    if (Object.keys(userUpdateData).length > 0) {
      await ctx.db.patch(args.patientId, userUpdateData);
    }

    // Update patient profile info (dateOfBirth, gender)
    const patient = await ctx.db.get(args.patientId);
    if (!patient) {
      throw new Error("Patient not found.");
    }

    const profileUpdateData: any = {};
    if (args.updates.dateOfBirth !== undefined) profileUpdateData.dateOfBirth = args.updates.dateOfBirth;
    if (args.updates.gender !== undefined) profileUpdateData.gender = args.updates.gender;

    if (Object.keys(profileUpdateData).length > 0) {
      // Marketplace and Joy patients have a profile without the user pointer, or none yet
      const profileId =
        patient.patientProfileId ??
        (
          await ctx.db
            .query("patientProfiles")
            .withIndex("by_user_id", (q) => q.eq("userId", args.patientId))
            .first()
        )?._id;
      if (profileId) {
        await ctx.db.patch(profileId, profileUpdateData);
        if (!patient.patientProfileId) await ctx.db.patch(args.patientId, { patientProfileId: profileId });
      } else {
        const newProfileId = await ctx.db.insert("patientProfiles", { userId: args.patientId, ...profileUpdateData });
        await ctx.db.patch(args.patientId, { patientProfileId: newProfileId });
      }
    }

    return { success: true, message: "Patient information updated successfully." };
  },
});

/**
 * Get dashboard statistics for physiotherapist
 */
export const getDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const physiotherapist = await getAuthenticatedPhysiotherapist(ctx);

    // Get total patients
    const totalPatients = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_physiotherapist", (q) =>
        q.eq("physiotherapistId", physiotherapist._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect()
      .then(relationships => relationships.length);

    // Get today's appointments
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const endOfDay = startOfDay + (24 * 60 * 60 * 1000) - 1;

    const todaysAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) =>
        q.eq("physiotherapistId", physiotherapist._id).gte("startTime", startOfDay).lte("startTime", endOfDay)
      )
      .filter((q) => q.neq(q.field("isRecordOnly"), true))
      .collect();

    // Get this week's completed sessions (completed appointments)
    const startOfWeek = startOfDay - (today.getDay() * 24 * 60 * 60 * 1000);
    const endOfWeek = startOfWeek + (7 * 24 * 60 * 60 * 1000) - 1;

    const completedSessions = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) =>
        q.eq("physiotherapistId", physiotherapist._id).gte("startTime", startOfWeek).lte("startTime", endOfWeek)
      )
      .filter((q) => q.and(q.eq(q.field("status"), "completed"), q.neq(q.field("isRecordOnly"), true)))
      .collect();

    // Get pending invitations
    const pendingInvitations = await ctx.db
      .query("patientInvitations")
      .withIndex("by_physiotherapist", (q) =>
        q.eq("physiotherapistId", physiotherapist._id)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    return {
      totalPatients,
      todaysAppointments: todaysAppointments.length,
      upcomingAppointments: todaysAppointments.filter(apt =>
        apt.status === "scheduled" || apt.status === "confirmed"
      ).length,
      completedSessionsThisWeek: completedSessions.length,
      pendingInvitations: pendingInvitations.length,
    };
  },
});

/**
 * Get patient dashboard statistics for the current patient
 */
export const getPatientDashboardStats = query({
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
      throw new Error("Access denied. Only patients can view patient dashboard stats.");
    }

    // Get patient appointments
    const allAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", user._id))
      .collect();

    // Calculate date boundaries
    const now = Date.now();
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const endOfDay = startOfDay + (24 * 60 * 60 * 1000) - 1;

    // Get upcoming appointments
    const upcomingAppointments = allAppointments.filter(apt =>
      apt.startTime > now &&
      (apt.status === "scheduled" || apt.status === "confirmed")
    ).sort((a, b) => a.startTime - b.startTime);

    // Get completed appointments
    const completedAppointments = allAppointments.filter(apt =>
      apt.status === "completed"
    );

    // Get active treatment plans
    const activeTreatmentPlans = await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Get session logs for completed sessions count
    const sessionLogs = await ctx.db
      .query("sessionLogs")
      .withIndex("by_patient_id_and_date", (q) => q.eq("patientId", user._id))
      .collect();

    // Calculate health score (mock calculation based on engagement)
    const totalAppointments = allAppointments.length;
    const completedCount = completedAppointments.length;
    const completionRate = totalAppointments > 0 ? (completedCount / totalAppointments) : 0;
    const baseHealthScore = 60;
    const engagementBonus = Math.min(completionRate * 40, 40); // Max 40 points for engagement
    const healthScore = Math.round(baseHealthScore + engagementBonus);

    return {
      upcomingAppointments: upcomingAppointments.length,
      nextAppointmentDate: upcomingAppointments[0]?.startTime,
      activeTreatmentPlans: activeTreatmentPlans.length,
      completedSessions: completedAppointments.length,
      totalSessions: sessionLogs.length,
      healthScore: Math.min(healthScore, 100), // Cap at 100
      appointmentsThisMonth: allAppointments.filter(apt => {
        const appointmentDate = new Date(apt.startTime);
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        return appointmentDate.getMonth() === currentMonth && appointmentDate.getFullYear() === currentYear;
      }).length,
    };
  },
});

/**
 * Get patient's recent activity feed
 */
export const getPatientRecentActivity = query({
  args: {
    limit: v.optional(v.number()),
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

    if (!user || user.role !== "patient") {
      throw new Error("Access denied. Only patients can view patient activity.");
    }

    const limit = args.limit ?? 10;
    const activities: Array<{
      type: string;
      title: string;
      description: string;
      date: number;
      icon: string;
      metadata?: any;
    }> = [];

    // Get recent appointments
    const recentAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", user._id))
      .order("desc")
      .take(5);

    for (const appointment of recentAppointments) {
      const physiotherapist = await ctx.db.get(appointment.physiotherapistId);
      const physiotherapistName = physiotherapist
        ? `${physiotherapist.firstName} ${physiotherapist.lastName} `
        : "Your physiotherapist";

      if (appointment.status === "completed") {
        activities.push({
          type: "appointment_completed",
          title: "Session Completed",
          description: `Completed ${appointment.serviceType} session with ${physiotherapistName} `,
          date: appointment.startTime,
          icon: "CheckCircle",
          metadata: { appointmentId: appointment._id, physiotherapistName },
        });
      } else if (appointment.status === "scheduled" || appointment.status === "confirmed") {
        activities.push({
          type: "appointment_scheduled",
          title: "Appointment Scheduled",
          description: `${appointment.serviceType} session with ${physiotherapistName} `,
          date: appointment.startTime,
          icon: "Calendar",
          metadata: { appointmentId: appointment._id, physiotherapistName },
        });
      }
    }

    // Get recent session logs
    const recentSessions = await ctx.db
      .query("sessionLogs")
      .withIndex("by_patient_id_and_date", (q) => q.eq("patientId", user._id))
      .order("desc")
      .take(3);

    for (const session of recentSessions) {
      const physiotherapist = await ctx.db.get(session.physiotherapistId);
      const physiotherapistName = physiotherapist
        ? `${physiotherapist.firstName} ${physiotherapist.lastName} `
        : "Your physiotherapist";

      activities.push({
        type: "session_notes_added",
        title: "Session Notes Updated",
        description: `${physiotherapistName} added notes from your recent session`,
        date: session.sessionDate,
        icon: "FileText",
        metadata: { sessionId: session._id, physiotherapistName },
      });
    }

    // Get recent treatment plan updates
    const recentTreatmentPlans = await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .order("desc")
      .take(2);

    for (const plan of recentTreatmentPlans) {
      const physiotherapist = await ctx.db.get(plan.physiotherapistId);
      const physiotherapistName = physiotherapist
        ? `${physiotherapist.firstName} ${physiotherapist.lastName} `
        : "Your physiotherapist";

      activities.push({
        type: "treatment_plan_updated",
        title: "Treatment Plan Updated",
        description: `${physiotherapistName} updated your treatment plan: ${plan.title} `,
        date: plan._creationTime,
        icon: "Heart",
        metadata: { treatmentPlanId: plan._id, physiotherapistName },
      });
    }

    // Sort all activities by date (most recent first) and limit
    activities.sort((a, b) => b.date - a.date);
    return activities.slice(0, limit);
  },
});

/**
 * Get patient's health summary and metrics
 */
export const getPatientHealthSummary = query({
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
      throw new Error("Access denied. Only patients can view health summary.");
    }

    // Get patient profile
    const patientProfile = user.patientProfileId
      ? await ctx.db.get(user.patientProfileId)
      : null;

    // Get active treatment plans
    const activeTreatmentPlans = await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Get recent session logs for progress tracking
    const recentSessions = await ctx.db
      .query("sessionLogs")
      .withIndex("by_patient_id_and_date", (q) => q.eq("patientId", user._id))
      .order("desc")
      .take(10);

    // Get recent appointments for consistency tracking
    const recentAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", user._id))
      .filter((q) => q.gte(q.field("startTime"), Date.now() - (30 * 24 * 60 * 60 * 1000))) // Last 30 days
      .collect();

    const completedAppointments = recentAppointments.filter(apt => apt.status === "completed");
    const attendanceRate = recentAppointments.length > 0
      ? Math.round((completedAppointments.length / recentAppointments.length) * 100)
      : 0;

    // Calculate progress indicators
    const progressIndicators = {
      attendanceRate,
      activeTreatmentPlans: activeTreatmentPlans.length,
      recentSessionsCount: recentSessions.length,
      improvementTrend: "stable", // Mock - would be calculated from session notes/outcomes
    };

    return {
      profile: patientProfile,
      activeTreatmentPlans,
      progressIndicators,
      recentSessions: recentSessions.slice(0, 5), // Latest 5 sessions
      healthMetrics: {
        attendanceRate,
        totalSessions: recentSessions.length,
        activePlans: activeTreatmentPlans.length,
        lastSessionDate: recentSessions[0]?.sessionDate,
      },
    };
  },
});

/**
 * Get patient's care team information
 */
export const getPatientCareTeam = query({
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
      throw new Error("Access denied. Only patients can view care team.");
    }

    // Get patient-physiotherapist relationships
    const relationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q) => q.eq("patientId", user._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Get physiotherapist details for each relationship
    const careTeam = await Promise.all(
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

        // Get recent appointments with this physiotherapist
        const recentAppointments = await ctx.db
          .query("appointments")
          .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", user._id))
          .filter((q) => q.eq(q.field("physiotherapistId"), physiotherapist._id))
          .order("desc")
          .take(5);

        return {
          physiotherapist: {
            _id: physiotherapist._id,
            firstName: physiotherapist.firstName,
            lastName: physiotherapist.lastName,
            email: physiotherapist.email,
            imageUrl: physiotherapist.imageUrl,
          },
          // Public fields only: the full rows hold earnings, licence and admin data
          profile: physiotherapistProfile
            ? {
                specializations: physiotherapistProfile.specializations,
                bio: physiotherapistProfile.bio,
                yearsOfExperience: physiotherapistProfile.yearsOfExperience,
                languagesSpoken: physiotherapistProfile.languagesSpoken,
                location: physiotherapistProfile.location,
                offersOnlineSessions: physiotherapistProfile.offersOnlineSessions,
                offersInPersonSessions: physiotherapistProfile.offersInPersonSessions,
                averageRating: physiotherapistProfile.averageRating,
                reviewCount: physiotherapistProfile.reviewCount,
                bookingSlug: physiotherapistProfile.bookingSlug,
              }
            : null,
          clinic: clinicInfo
            ? {
                _id: clinicInfo._id,
                name: clinicInfo.name,
                address: clinicInfo.address,
                city: clinicInfo.city,
                contactPhone: clinicInfo.contactPhone,
                logoUrl: clinicInfo.logoUrl,
              }
            : null,
          relationship: {
            isPrimary: relationship.isPrimaryPhysiotherapist,
            startDate: relationship.startDate,
            status: relationship.status,
          },
          recentAppointments: recentAppointments.length,
          lastAppointment: recentAppointments[0]?.startTime,
        };
      })
    );

    return careTeam.filter(Boolean); // Remove null entries
  },
});

/**
 * The signed-in patient's own details (patient settings). `userId` is ignored and kept only so
 * older clients still validate: the record always comes from the caller's identity.
 */
export const getPatientByUserId = query({
  args: {
    userId: v.optional(v.string()),
  },
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
      return null;
    }

    // Joy and marketplace patients may have a profile row without users.patientProfileId
    const patientProfile =
      (user.patientProfileId ? await ctx.db.get(user.patientProfileId) : null) ??
      (await ctx.db.query("patientProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first());

    return {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phoneNumber,
      dateOfBirth: patientProfile?.dateOfBirth,
      imageUrl: user.imageUrl,
      patientProfileId: patientProfile?._id,
      profile: patientProfile,
      notificationPreferences: user.notificationPreferences,
    };
  },
});

const PATIENT_GENDERS = v.union(
  v.literal("male"),
  v.literal("female"),
  v.literal("other"),
  v.literal("prefer_not_to_say")
);

/**
 * The signed-in patient's profile id, linking or creating it when needed. Marketplace and Joy
 * bookings create a profile without setting users.patientProfileId, which the records page needs.
 */
export const ensureMyPatientProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "patient") throw new ConvexError("Only patients have a patient profile.");
    if (user.patientProfileId && (await ctx.db.get(user.patientProfileId))) return user.patientProfileId;

    const existing = await ctx.db
      .query("patientProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();
    const profileId = existing?._id ?? (await ctx.db.insert("patientProfiles", { userId: user._id }));
    await ctx.db.patch(user._id, { patientProfileId: profileId });
    return profileId;
  },
});

/** The signed-in patient updates their own details (settings page). Email is managed by Clerk. */
export const updateMyPatientProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    phoneNumber: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(PATIENT_GENDERS),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    emergencyContact: v.optional(
      v.object({ name: v.string(), relationship: v.string(), phone: v.string() })
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "patient") throw new ConvexError("Only patients can update this profile.");

    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    if (!firstName || !lastName) throw new ConvexError("Please enter your first and last name.");
    if (firstName.length > 80 || lastName.length > 80) throw new ConvexError("Names must be 80 characters or fewer.");
    if (args.dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(args.dateOfBirth) || Date.parse(args.dateOfBirth) > Date.now())) {
      throw new ConvexError("Please enter a valid date of birth.");
    }

    // Joy finds WhatsApp patients by phone, so numbers are stored in one format (+234...)
    // and a number must belong to one account only
    const phoneNumber = args.phoneNumber?.trim() ? normalizePhone(args.phoneNumber) ?? undefined : undefined;
    if (args.phoneNumber?.trim() && !phoneNumber) {
      throw new ConvexError("Please enter a valid phone number, e.g. 0803 123 4567 or +234 803 123 4567.");
    }
    if (phoneNumber && phoneNumber !== user.phoneNumber) {
      const taken = await ctx.db
        .query("users")
        .withIndex("by_phone_number", (q) => q.eq("phoneNumber", phoneNumber))
        .first();
      if (taken && taken._id !== user._id) {
        throw new ConvexError(
          taken.clerkId.startsWith("joy-whatsapp:")
            ? "This number has WhatsApp bookings with Joy. Contact support and we'll link them to this account."
            : "This number is linked to another account. Please contact support."
        );
      }
    }

    await ctx.db.patch(user._id, { firstName, lastName, phoneNumber });

    const profileFields = {
      dateOfBirth: args.dateOfBirth || undefined,
      gender: args.gender,
      address: args.address?.trim() || undefined,
      city: args.city?.trim() || undefined,
      emergencyContact: args.emergencyContact?.name.trim() ? args.emergencyContact : undefined,
    };
    const profile =
      (user.patientProfileId ? await ctx.db.get(user.patientProfileId) : null) ??
      (await ctx.db.query("patientProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first());
    if (profile) {
      await ctx.db.patch(profile._id, profileFields);
      if (user.patientProfileId !== profile._id) await ctx.db.patch(user._id, { patientProfileId: profile._id });
    } else {
      const profileId = await ctx.db.insert("patientProfiles", { userId: user._id, ...profileFields });
      await ctx.db.patch(user._id, { patientProfileId: profileId });
    }
    return { success: true };
  },
});

/**
 * Everything the platform holds for the signed-in patient, for "Download my data". Clinician-only
 * working notes (notesForTherapist, internal follow-up notes) are left out.
 */
export const exportMyData = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "patient") throw new ConvexError("Only patients can export patient data.");

    const profile =
      (user.patientProfileId ? await ctx.db.get(user.patientProfileId) : null) ??
      (await ctx.db.query("patientProfiles").withIndex("by_user_id", (q) => q.eq("userId", user._id)).first());

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", user._id))
      .collect();
    const documents = profile
      ? await ctx.db.query("patientDocuments").withIndex("by_patient_profile_id", (q) => q.eq("patientProfileId", profile._id)).collect()
      : [];
    const checkIns = await ctx.db.query("patientCheckIns").withIndex("by_patient", (q) => q.eq("patientId", user._id)).collect();
    const exerciseLogs = await ctx.db.query("exerciseProgramLogs").withIndex("by_patient", (q) => q.eq("patientId", user._id)).collect();
    const invoices = await ctx.db.query("invoices").withIndex("by_patient_id", (q) => q.eq("patientId", user._id)).collect();
    // appointmentFeedback.patientId is typed as a "patients" id but holds users ids; go via appointments
    const feedback = (
      await Promise.all(
        appointments.map((a) =>
          ctx.db.query("appointmentFeedback").withIndex("by_appointment", (q) => q.eq("appointmentId", a._id)).first()
        )
      )
    ).filter((f) => f !== null);
    const careEpisodes = await ctx.db.query("careEpisodes").withIndex("by_patient", (q) => q.eq("patientId", user._id)).collect();
    const joyIntakes = await ctx.db.query("joyIntakes").withIndex("by_patient", (q) => q.eq("patientId", user._id)).collect();
    const joyJourney = await ctx.db.query("joyJourneyEvents").withIndex("by_patient", (q) => q.eq("patientId", user._id)).collect();

    return {
      exportedAt: new Date().toISOString(),
      account: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        createdAt: user._creationTime,
        notificationPreferences: user.notificationPreferences,
      },
      profile: profile
        ? {
            dateOfBirth: profile.dateOfBirth,
            gender: profile.gender,
            address: profile.address,
            city: profile.city,
            area: profile.area,
            country: profile.country,
            medicalHistorySummary: profile.medicalHistorySummary,
            emergencyContact: profile.emergencyContact,
          }
        : null,
      appointments: appointments
        .filter((a) => !a.isRecordOnly)
        .map(({ notesForTherapist: _privateNotes, ...appointment }) => appointment),
      documents: documents.map(({ storageId: _storageId, ...document }) => document),
      checkIns,
      exerciseLogs,
      invoices,
      feedback,
      careEpisodes: careEpisodes.map(({ followUpNotes: _internalNotes, ...episode }) => episode),
      whatsAppIntakes: joyIntakes,
      whatsAppJourney: joyJourney.map(({ stage, occurredAt, bookingId }) => ({ stage, occurredAt, bookingId })),
    };
  },
});

/**
 * Reassign a patient to a different physiotherapist (Clinic Owner only)
 */
export const reassignPatient = mutation({
  args: {
    patientId: v.id("users"),
    currentPhysiotherapistId: v.id("users"),
    newPhysiotherapistId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // The clinic owner, or a team member whose role includes Patients, once the clinic is approved
    const member = await requireClinicWrite(ctx, "patients");
    const { user: clinicOwner, clinic } = member;
    // A clinician can hand over their own patients; moving a colleague's patients is for the
    // owner or someone the owner gave full access
    if (
      member.kind === "clinician" &&
      member.permissions !== "all" &&
      args.currentPhysiotherapistId !== member.user._id
    ) {
      throw new ConvexError("Only the clinic owner can move another clinician's patients.");
    }

    // Verify both physiotherapists belong to the clinic
    const currentPhysio = await ctx.db.get(args.currentPhysiotherapistId);
    const newPhysio = await ctx.db.get(args.newPhysiotherapistId);

    // The owner treats patients too but has no users.clinicId of their own
    const belongsToClinic = (physio: typeof currentPhysio) =>
      !!physio && (physio.clinicId === clinic._id || physio._id === clinic.ownerId);
    if (!belongsToClinic(currentPhysio)) {
      throw new ConvexError("Current physiotherapist does not belong to your clinic");
    }
    if (!belongsToClinic(newPhysio)) {
      throw new ConvexError("New physiotherapist does not belong to your clinic");
    }
    if (args.currentPhysiotherapistId === args.newPhysiotherapistId) {
      throw new ConvexError("The patient is already with this clinician");
    }

    // Find the active relationship
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) =>
        q.eq("patientId", args.patientId).eq("physiotherapistId", args.currentPhysiotherapistId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!relationship) {
      throw new ConvexError("Active relationship not found between patient and current physiotherapist");
    }
    // Only the clinic's own care moves: a clinician's private patients from outside the clinic stay theirs
    if (relationship.clinicId && relationship.clinicId !== clinic._id) {
      throw new ConvexError("This patient is in this clinician's own practice, not the clinic's.");
    }

    // Deactivate current relationship
    await ctx.db.patch(relationship._id, {
      status: "inactive",
      endDate: Date.now(),
    });

    // Re-open an earlier link with the new clinician (moving a patient back and forth) instead
    // of adding a second row for the same pair
    const earlier = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) =>
        q.eq("patientId", args.patientId).eq("physiotherapistId", args.newPhysiotherapistId)
      )
      .first();
    const handover = {
      clinicId: clinic._id,
      status: "active" as const,
      isPrimaryPhysiotherapist: relationship.isPrimaryPhysiotherapist,
      // Keep where the patient came from (e.g. a Rehabify referral) and the follow-up date
      source: relationship.source,
      nextCheckInAt: relationship.nextCheckInAt,
    };
    if (earlier) {
      await ctx.db.patch(earlier._id, { ...handover, endDate: undefined, startDate: Date.now() });
    } else {
      await ctx.db.insert("patientPhysiotherapistRelationships", {
        patientId: args.patientId,
        physiotherapistId: args.newPhysiotherapistId,
        startDate: Date.now(),
        ...handover,
      });
    }

    // The open course of care moves with the patient
    const openEpisodes = await ctx.db
      .query("careEpisodes")
      .withIndex("by_patient", (q: any) => q.eq("patientId", args.patientId))
      .collect();
    for (const episode of openEpisodes) {
      if (episode.status === "active" && episode.physiotherapistId === args.currentPhysiotherapistId) {
        await ctx.db.patch(episode._id, { physiotherapistId: args.newPhysiotherapistId });
      }
    }

    // Log the reassignment
    await ctx.db.insert("systemLogs", {
      type: "info",
      action: "patient_reassigned",
      userId: clinicOwner._id,
      clinicId: clinic._id,
      targetEntityType: "user",
      targetEntityId: args.patientId,
      details: {
        fromPhysioId: args.currentPhysiotherapistId,
        toPhysioId: args.newPhysiotherapistId,
        reason: args.reason,
      },
      timestamp: Date.now(),
    });

    // Transfer Active & Draft Treatment Plans
    const activePlans = await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .filter((q) =>
        q.and(
          q.eq(q.field("physiotherapistId"), args.currentPhysiotherapistId),
          q.or(
            q.eq(q.field("status"), "active"),
            q.eq(q.field("status"), "draft")
          )
        )
      )
      .collect();

    for (const plan of activePlans) {
      await ctx.db.patch(plan._id, {
        physiotherapistId: args.newPhysiotherapistId,
      });
    }

    // Transfer Future Appointments
    const futureAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) =>
        q.eq("physiotherapistId", args.currentPhysiotherapistId).gt("startTime", Date.now())
      )
      .filter((q) => q.eq(q.field("patientId"), args.patientId))
      .collect();

    for (const appt of futureAppointments) {
      await ctx.db.patch(appt._id, {
        physiotherapistId: args.newPhysiotherapistId,
      });
    }

    return { success: true };
  },
});

/**
 * Formally discharge a patient, ending the treatment relationship and archiving plans
 */
export const dischargePatient = mutation({
  args: {
    patientId: v.id("users"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new Error("Not authenticated");

    const physiotherapist = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", user.subject))
      .unique();

    if (!physiotherapist || physiotherapist.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can discharge patients");
    }

    // Find active relationship
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) =>
        q.eq("patientId", args.patientId).eq("physiotherapistId", physiotherapist._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!relationship) {
      throw new Error("Active relationship not found");
    }

    // Deactivate relationship
    await ctx.db.patch(relationship._id, {
      status: "inactive",
      endDate: Date.now(),
    });

    // Mark active treatment plans as completed
    const activePlans = await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .filter((q) =>
        q.and(
          q.eq(q.field("physiotherapistId"), physiotherapist._id),
          q.eq(q.field("status"), "active")
        )
      )
      .collect();

    for (const plan of activePlans) {
      await ctx.db.patch(plan._id, {
        status: "completed",
        completedAt: Date.now(),
      } as any);
    }

    // Cancel upcoming appointments
    const futureAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) =>
        q.eq("physiotherapistId", physiotherapist._id).gt("startTime", Date.now())
      )
      .filter((q) => q.eq(q.field("patientId"), args.patientId))
      .collect();

    for (const appt of futureAppointments) {
      await ctx.db.patch(appt._id, {
        status: "cancelled_by_therapist",
        cancellationReason: "Patient formally discharged",
      } as any);
    }

    // Log the discharge
    await ctx.db.insert("systemLogs", {
      type: "info",
      action: "patient_discharged",
      userId: physiotherapist._id,
      clinicId: physiotherapist.clinicId,
      targetEntityType: "user",
      targetEntityId: args.patientId,
      details: {
        notes: args.notes,
        plansCompleted: activePlans.length,
        appointmentsCancelled: futureAppointments.length,
      },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Get all patients for a specific physiotherapist (Clinic Owner view)
 */
export const getPhysiotherapistPatients = query({
  args: {
    physiotherapistId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // The clinic owner, or a team member whose role includes the Team page
    const { clinic } = await getClinicMember(ctx, "team");

    // Verify physiotherapist belongs to the clinic (the owner sees patients too)
    const physio = await ctx.db.get(args.physiotherapistId);
    if (!physio || (physio.clinicId !== clinic._id && physio._id !== clinic.ownerId)) {
      throw new ConvexError("This clinician isn't part of your clinic");
    }

    // Get relationships
    const relationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", args.physiotherapistId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Get patient details
    const patients = await Promise.all(
      relationships.map(async (rel) => {
        const patient = await ctx.db.get(rel.patientId);
        if (!patient) return null;

        // Get latest session for improvement stage (mock logic for now)
        const latestSession = await ctx.db
          .query("sessionLogs")
          .withIndex("by_patient_id_and_date", (q) => q.eq("patientId", patient._id))
          .order("desc")
          .first();

        // Determine improvement stage based on session count or manual field
        // For now, we'll infer it from session count
        const sessionCount = await ctx.db
          .query("sessionLogs")
          .withIndex("by_patient_id_and_date", (q) => q.eq("patientId", patient._id))
          .collect()
          .then((logs) => logs.length);

        let stage = "Initial";
        if (sessionCount > 5) stage = "Mid";
        if (sessionCount > 15) stage = "Discharge Readiness";

        return {
          _id: patient._id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email,
          imageUrl: patient.imageUrl,
          stage,
          sessionCount,
          lastSessionDate: latestSession?.sessionDate,
        };
      })
    );

    return patients.filter(Boolean);
  },
});

// Toggle patient flag status
export const togglePatientFlag = mutation({
  args: {
    patientId: v.id("users"),
    isFlagged: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ensureUserRole(ctx, ["clinic_owner"]);

    const patient = await ctx.db
      .query("patients")
      .withIndex("by_user_id", (q) => q.eq("userId", args.patientId))
      .first();

    if (!patient) throw new Error("Patient not found");

    await ctx.db.patch(patient._id, {
      isFlagged: args.isFlagged,
      flagReason: args.reason,
      flaggedBy: args.isFlagged ? user?._id : undefined,
      flaggedAt: args.isFlagged ? Date.now() : undefined,
    });

    // Log to audit/system logs
    await ctx.db.insert("auditLogs", {
      actorUserId: user?._id,
      action: args.isFlagged ? "patient_flagged" : "patient_unflagged",
      targetEntityType: "patient",
      targetEntityId: args.patientId,
      timestamp: Date.now(),
      details: { reason: args.reason },
    });
  },
});

// Get detailed patient info including session logs
// Internal: it returns a patient's full record without checking who asks (no page uses it)
export const getClinicPatientDetails = internalQuery({
  args: {
    patientId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Basic permission check (can be refined)
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return null;

    const patient = await ctx.db
      .query("users")
      .filter(q => q.eq(q.field("_id"), args.patientId))
      .first();

    if (!patient) return null;

    const patientRecord = await ctx.db
      .query("patients")
      .withIndex("by_user_id", (q) => q.eq("userId", args.patientId))
      .first();

    // Get session logs
    const sessionLogs = await ctx.db
      .query("sessionLogs")
      .withIndex("by_patient_id_and_date", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .collect();

    // Enrich session logs with physio details
    const enrichedLogs = await Promise.all(
      sessionLogs.map(async (log) => {
        const physio = await ctx.db.get(log.physiotherapistId);
        return {
          ...log,
          physiotherapist: physio ? {
            firstName: physio.firstName,
            lastName: physio.lastName,
          } : null,
        };
      })
    );

    return {
      user: patient,
      patientRecord,
      sessionLogs: enrichedLogs,
    };
  },
});