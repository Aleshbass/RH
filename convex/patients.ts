
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser, ensureClinicOwner, ensureUserRole, ensureIsClinicOwner } from "./auth";
import { Id } from "./_generated/dataModel";

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
    const relationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", physiotherapist._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .take(limit);

    // Get patient details
    const patients = await Promise.all(
      relationships.map(async (relationship) => {
        const patient = await ctx.db.get(relationship.patientId);
        if (!patient) return null;

        // Get patient profile
        const patientProfile = patient.patientProfileId
          ? await ctx.db.get(patient.patientProfileId)
          : null;

        // Get recent appointment count
        const appointmentCount = await ctx.db
          .query("appointments")
          .withIndex("by_patient_id_and_time", (q) =>
            q.eq("patientId", patient._id)
          )
          .filter((q) => q.eq(q.field("physiotherapistId"), physiotherapist._id))
          .collect()
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
          relationship: {
            isPrimary: relationship.isPrimaryPhysiotherapist,
            startDate: relationship.startDate,
            status: relationship.status,
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
      .unique();

    if (!relationship) {
      throw new Error("Access denied. Patient not assigned to you.");
    }

    // Get patient details
    const patient = await ctx.db.get(args.patientId);
    if (!patient) {
      throw new Error("Patient not found");
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
      .unique();

    if (!relationship) {
      throw new Error("Access denied. Patient not assigned to you.");
    }

    // Update basic user info (firstName, lastName, email, phoneNumber)
    const userUpdateData: any = {};
    if (args.updates.firstName !== undefined) userUpdateData.firstName = args.updates.firstName;
    if (args.updates.lastName !== undefined) userUpdateData.lastName = args.updates.lastName;
    if (args.updates.email !== undefined) userUpdateData.email = args.updates.email;
    if (args.updates.phoneNumber !== undefined) userUpdateData.phoneNumber = args.updates.phoneNumber;

    if (Object.keys(userUpdateData).length > 0) {
      await ctx.db.patch(args.patientId, userUpdateData);
    }

    // Update patient profile info (dateOfBirth, gender)
    const patient = await ctx.db.get(args.patientId);
    if (!patient) {
      throw new Error("Patient not found.");
    }

    if (patient.patientProfileId) {
      const profileUpdateData: any = {};
      if (args.updates.dateOfBirth !== undefined) profileUpdateData.dateOfBirth = args.updates.dateOfBirth;
      if (args.updates.gender !== undefined) profileUpdateData.gender = args.updates.gender;

      if (Object.keys(profileUpdateData).length > 0) {
        await ctx.db.patch(patient.patientProfileId, profileUpdateData);
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
        q.eq("physiotherapistId", physiotherapist._id).gte("startTime", startOfDay)
      )
      .filter((q) => q.lte(q.field("startTime"), endOfDay))
      .collect();

    // Get this week's completed sessions (completed appointments)
    const startOfWeek = startOfDay - (today.getDay() * 24 * 60 * 60 * 1000);
    const endOfWeek = startOfWeek + (7 * 24 * 60 * 60 * 1000) - 1;

    const completedSessions = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) =>
        q.eq("physiotherapistId", physiotherapist._id).gte("startTime", startOfWeek)
      )
      .filter((q) =>
        q.and(
          q.lte(q.field("startTime"), endOfWeek),
          q.eq(q.field("status"), "completed")
        )
      )
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
          profile: physiotherapistProfile,
          clinic: clinicInfo,
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
 * Get patient by their user ID (for patient dashboard use)
 */
export const getPatientByUserId = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get the user by their clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.userId))
      .unique();

    if (!user || user.role !== "patient") {
      return null;
    }

    // Get patient profile
    const patientProfile = user.patientProfileId
      ? await ctx.db.get(user.patientProfileId)
      : null;

    return {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phoneNumber,
      dateOfBirth: patientProfile?.dateOfBirth,
      imageUrl: user.imageUrl,
      patientProfileId: user.patientProfileId,
      profile: patientProfile,
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
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const clinicOwner = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", user.subject))
      .unique();

    if (!clinicOwner || clinicOwner.role !== "clinic_owner") {
      throw new Error("Only clinic owners can reassign patients");
    }

    // Verify clinic ownership
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", clinicOwner._id))
      .unique();

    if (!clinic) {
      throw new Error("Clinic not found");
    }

    // Verify both physiotherapists belong to the clinic
    const currentPhysio = await ctx.db.get(args.currentPhysiotherapistId);
    const newPhysio = await ctx.db.get(args.newPhysiotherapistId);

    if (!currentPhysio || currentPhysio.clinicId !== clinic._id) {
      throw new Error("Current physiotherapist does not belong to your clinic");
    }
    if (!newPhysio || newPhysio.clinicId !== clinic._id) {
      throw new Error("New physiotherapist does not belong to your clinic");
    }

    // Find the active relationship
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) =>
        q.eq("patientId", args.patientId).eq("physiotherapistId", args.currentPhysiotherapistId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (!relationship) {
      throw new Error("Active relationship not found between patient and current physiotherapist");
    }

    // Deactivate current relationship
    await ctx.db.patch(relationship._id, {
      status: "inactive",
      endDate: Date.now(),
    });

    // Create new relationship
    await ctx.db.insert("patientPhysiotherapistRelationships", {
      patientId: args.patientId,
      physiotherapistId: args.newPhysiotherapistId,
      clinicId: clinic._id,
      status: "active",
      startDate: Date.now(),
      isPrimaryPhysiotherapist: relationship.isPrimaryPhysiotherapist,
    });

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
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const clinicOwner = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", user.subject))
      .unique();

    if (!clinicOwner || clinicOwner.role !== "clinic_owner") {
      throw new Error("Only clinic owners can view physiotherapist patients");
    }

    // Verify clinic ownership
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", clinicOwner._id))
      .unique();

    if (!clinic) {
      throw new Error("Clinic not found");
    }

    // Verify physiotherapist belongs to the clinic
    const physio = await ctx.db.get(args.physiotherapistId);
    if (!physio || physio.clinicId !== clinic._id) {
      throw new Error("Physiotherapist does not belong to your clinic");
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
export const getClinicPatientDetails = query({
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