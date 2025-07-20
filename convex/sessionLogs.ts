import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser, ensureUserRole } from "./auth";

/**
 * Get the current user's session logs
 */
export const getMySessionLogs = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    _id: v.id("sessionLogs"),
    appointmentId: v.id("appointments"),
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    clinicId: v.optional(v.id("clinics")),
    sessionDate: v.number(),
    subjectiveAssessment: v.optional(v.string()),
    objectiveAssessment: v.optional(v.string()),
    treatmentAdministered: v.optional(v.string()),
    planForNextSession: v.optional(v.string()),
    voiceNoteUrl: v.optional(v.string()),
    attachments: v.optional(v.array(v.id("_storage"))),
    patient: v.any(),
    appointment: v.any(),
  })),
  handler: async (ctx, args) => {
    // Get current authenticated user
    const user = await getAuthenticatedUser(ctx);

    // Ensure user is a physiotherapist
    if (user.role !== "physiotherapist") {
      throw new Error("Access denied. Only physiotherapists can view session logs.");
    }

    const limit = args.limit ?? 50;

    // Get session logs for this physiotherapist
    const sessionLogs = await ctx.db
      .query("sessionLogs")
      .filter((q) => q.eq(q.field("physiotherapistId"), user._id))
      .order("desc")
      .take(limit);

    // Get patient details for each session log
    const sessionLogsWithPatients = await Promise.all(
      sessionLogs.map(async (session) => {
        const patient = await ctx.db.get(session.patientId);
        const appointment = await ctx.db.get(session.appointmentId);
        
        return {
          ...session,
          patient: patient ? {
            _id: patient._id,
            firstName: patient.firstName,
            lastName: patient.lastName,
            email: patient.email,
            imageUrl: patient.imageUrl,
          } : null,
          appointment: appointment ? {
            _id: appointment._id,
            serviceType: appointment.serviceType,
            startTime: appointment.startTime,
            endTime: appointment.endTime,
          } : null,
        };
      })
    );

    return sessionLogsWithPatients;
  },
});

/**
 * Create a new session log entry
 */
export const createSessionLog = mutation({
  args: {
    appointmentId: v.id("appointments"),
    subjectiveAssessment: v.optional(v.string()),
    objectiveAssessment: v.optional(v.string()),
    treatmentAdministered: v.optional(v.string()),
    planForNextSession: v.optional(v.string()),
    voiceNoteUrl: v.optional(v.string()),
    attachments: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.object({
    success: v.boolean(),
    sessionLogId: v.id("sessionLogs"),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    // Get current user and ensure they're a physiotherapist
    const user = await ensureUserRole(ctx, ["physiotherapist"]);

    // Get the appointment to validate access and get patient info
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Verify physiotherapist owns this appointment
    if (appointment.physiotherapistId !== user._id) {
      throw new Error("Access denied. Appointment not assigned to you.");
    }

    // Check if session log already exists for this appointment
    const existingSessionLog = await ctx.db
      .query("sessionLogs")
      .withIndex("by_appointment_id", (q) => q.eq("appointmentId", args.appointmentId))
      .unique();

    if (existingSessionLog) {
      throw new Error("Session log already exists for this appointment. Use update instead.");
    }

    // Create the session log
    const sessionLogId = await ctx.db.insert("sessionLogs", {
      appointmentId: args.appointmentId,
      patientId: appointment.patientId,
      physiotherapistId: user._id,
      clinicId: appointment.clinicId,
      sessionDate: Date.now(),
      subjectiveAssessment: args.subjectiveAssessment,
      objectiveAssessment: args.objectiveAssessment,
      treatmentAdministered: args.treatmentAdministered,
      planForNextSession: args.planForNextSession,
      voiceNoteUrl: args.voiceNoteUrl,
      attachments: args.attachments,
    });

    // Update appointment status to completed
    await ctx.db.patch(args.appointmentId, {
      status: "completed",
    });

    // Create notification for patient
    const patient = await ctx.db.get(appointment.patientId);
    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : "Patient";
    
    await ctx.db.insert("notifications", {
      userId: appointment.patientId,
      type: "session_completed",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Session Notes Available",
        body: `Your session notes from today's appointment are now available.`,
        data: {
          entityId: sessionLogId.toString(),
          entityType: "sessionLog",
          actionUrl: "/dashboard/patient/sessions",
        },
      },
      createdAt: Date.now(),
    });

    return {
      success: true,
      sessionLogId,
      message: "Session log created successfully.",
    };
  },
});

/**
 * Update an existing session log
 */
export const updateSessionLog = mutation({
  args: {
    sessionLogId: v.id("sessionLogs"),
    subjectiveAssessment: v.optional(v.string()),
    objectiveAssessment: v.optional(v.string()),
    treatmentAdministered: v.optional(v.string()),
    planForNextSession: v.optional(v.string()),
    voiceNoteUrl: v.optional(v.string()),
    attachments: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await ensureUserRole(ctx, ["physiotherapist"]);

    // Get the session log
    const sessionLog = await ctx.db.get(args.sessionLogId);
    if (!sessionLog) {
      throw new Error("Session log not found");
    }

    // Verify physiotherapist owns this session log
    if (sessionLog.physiotherapistId !== user._id) {
      throw new Error("Access denied. Session log not created by you.");
    }

    // Update the session log
    await ctx.db.patch(args.sessionLogId, {
      subjectiveAssessment: args.subjectiveAssessment,
      objectiveAssessment: args.objectiveAssessment,
      treatmentAdministered: args.treatmentAdministered,
      planForNextSession: args.planForNextSession,
      voiceNoteUrl: args.voiceNoteUrl,
      attachments: args.attachments,
    });

    return {
      success: true,
      message: "Session log updated successfully.",
    };
  },
});

/**
 * Get session logs for a specific patient (for physiotherapist view)
 */
export const getPatientSessionLogs = query({
  args: {
    patientId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get current user and ensure they're a physiotherapist
    const user = await ensureUserRole(ctx, ["physiotherapist"]);

    // Verify physiotherapist has access to this patient
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) => 
        q.eq("patientId", args.patientId).eq("physiotherapistId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (!relationship) {
      throw new Error("Access denied. Patient not assigned to you.");
    }

    const limit = args.limit ?? 50;

    // Get session logs for this patient by this physiotherapist
    const sessionLogs = await ctx.db
      .query("sessionLogs")
      .withIndex("by_patient_id_and_date", (q) => q.eq("patientId", args.patientId))
      .filter((q) => q.eq(q.field("physiotherapistId"), user._id))
      .order("desc")
      .take(limit);

    // Get appointment details for each session log
    const sessionLogsWithAppointments = await Promise.all(
      sessionLogs.map(async (session) => {
        const appointment = await ctx.db.get(session.appointmentId);
        
        return {
          ...session,
          appointment: appointment ? {
            _id: appointment._id,
            serviceType: appointment.serviceType,
            startTime: appointment.startTime,
            endTime: appointment.endTime,
            status: appointment.status,
          } : null,
        };
      })
    );

    return sessionLogsWithAppointments;
  },
});

/**
 * Get session statistics for dashboard
 */
export const getSessionStats = query({
  args: {},
  handler: async (ctx) => {
    // Get current user and ensure they're a physiotherapist
    const user = await ensureUserRole(ctx, ["physiotherapist"]);

    // Get all session logs for this physiotherapist
    const allSessions = await ctx.db
      .query("sessionLogs")
      .filter((q) => q.eq(q.field("physiotherapistId"), user._id))
      .collect();

    // Calculate date boundaries
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);

    // Filter sessions by time periods
    const sessionsThisWeek = allSessions.filter(session => session.sessionDate >= oneWeekAgo);
    const sessionsThisMonth = allSessions.filter(session => session.sessionDate >= oneMonthAgo);

    // Calculate average session duration (mock for now - would need duration field)
    const averageSessionDuration = 45; // minutes - placeholder

    return {
      totalSessions: allSessions.length,
      sessionsThisWeek: sessionsThisWeek.length,
      sessionsThisMonth: sessionsThisMonth.length,
      averageSessionDuration,
    };
  },
});

/**
 * Get a specific session log by ID
 */
export const getSessionLogById = query({
  args: {
    sessionLogId: v.id("sessionLogs"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    // Get the session log
    const sessionLog = await ctx.db.get(args.sessionLogId);
    if (!sessionLog) {
      throw new Error("Session log not found");
    }

    // Check access permissions
    if (user.role === "physiotherapist") {
      // Physiotherapist can only see their own session logs
      if (sessionLog.physiotherapistId !== user._id) {
        throw new Error("Access denied. Session log not created by you.");
      }
    } else if (user.role === "patient") {
      // Patient can only see their own session logs
      if (sessionLog.patientId !== user._id) {
        throw new Error("Access denied. Session log not for you.");
      }
    } else {
      throw new Error("Access denied. Invalid user role.");
    }

    // Get related data
    const patient = await ctx.db.get(sessionLog.patientId);
    const physiotherapist = await ctx.db.get(sessionLog.physiotherapistId);
    const appointment = await ctx.db.get(sessionLog.appointmentId);

    return {
      ...sessionLog,
      patient: patient ? {
        _id: patient._id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        imageUrl: patient.imageUrl,
      } : null,
      physiotherapist: physiotherapist ? {
        _id: physiotherapist._id,
        firstName: physiotherapist.firstName,
        lastName: physiotherapist.lastName,
        email: physiotherapist.email,
      } : null,
      appointment: appointment ? {
        _id: appointment._id,
        serviceType: appointment.serviceType,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        status: appointment.status,
      } : null,
    };
  },
});

/**
 * Get recent session logs for dashboard display
 */
export const getRecentSessions = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get current authenticated user
    const user = await getAuthenticatedUser(ctx);

    // Ensure user is a physiotherapist
    if (user.role !== "physiotherapist") {
      throw new Error("Access denied. Only physiotherapists can view recent sessions.");
    }

    const limit = args.limit ?? 10; // Default to 10 recent sessions

    // Get recent session logs for this physiotherapist
    const recentSessions = await ctx.db
      .query("sessionLogs")
      .filter((q) => q.eq(q.field("physiotherapistId"), user._id))
      .order("desc")
      .take(limit);

    // Get patient and appointment details for each session
    const sessionsWithDetails = await Promise.all(
      recentSessions.map(async (session) => {
        const patient = await ctx.db.get(session.patientId);
        const appointment = await ctx.db.get(session.appointmentId);
        
        return {
          _id: session._id,
          sessionDate: session.sessionDate,
          patientId: session.patientId,
          appointmentId: session.appointmentId,
          subjectiveAssessment: session.subjectiveAssessment,
          treatmentAdministered: session.treatmentAdministered,
          planForNextSession: session.planForNextSession,
          patient: patient ? {
            _id: patient._id,
            firstName: patient.firstName,
            lastName: patient.lastName,
            email: patient.email,
            imageUrl: patient.imageUrl,
          } : null,
          appointment: appointment ? {
            _id: appointment._id,
            serviceType: appointment.serviceType,
            startTime: appointment.startTime,
            endTime: appointment.endTime,
            status: appointment.status,
          } : null,
        };
      })
    );

    return sessionsWithDetails;
  },
});

/**
 * Delete a session log (soft delete by marking as inactive)
 */
export const deleteSessionLog = mutation({
  args: {
    sessionLogId: v.id("sessionLogs"),
  },
  handler: async (ctx, args) => {
    const user = await ensureUserRole(ctx, ["physiotherapist"]);

    // Get the session log
    const sessionLog = await ctx.db.get(args.sessionLogId);
    if (!sessionLog) {
      throw new Error("Session log not found");
    }

    // Verify physiotherapist owns this session log
    if (sessionLog.physiotherapistId !== user._id) {
      throw new Error("Access denied. Session log not created by you.");
    }

    // Delete the session log
    await ctx.db.delete(args.sessionLogId);

    // Revert appointment status back to confirmed if it was completed
    const appointment = await ctx.db.get(sessionLog.appointmentId);
    if (appointment && appointment.status === "completed") {
      await ctx.db.patch(sessionLog.appointmentId, {
        status: "confirmed",
      });
    }

    return {
      success: true,
      message: "Session log deleted successfully.",
    };
  },
}); 