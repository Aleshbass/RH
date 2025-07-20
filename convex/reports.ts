import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Get patient analytics for a physiotherapist
 */
export const getPatientAnalytics = query({
  args: {
    timeframe: v.optional(v.union(v.literal("week"), v.literal("month"), v.literal("year"))),
  },
  handler: async (ctx, { timeframe = "month" }) => {
    const now = Date.now();
    const startTime = timeframe === "week" ? now - 7 * 24 * 60 * 60 * 1000 :
                     timeframe === "month" ? now - 30 * 24 * 60 * 60 * 1000 :
                     now - 365 * 24 * 60 * 60 * 1000;

    // Get all sessions in the timeframe
    const sessions = await ctx.db
      .query("sessionLogs")
      .filter(q => q.gte(q.field("sessionDate"), startTime))
      .collect();

    // Get all appointments in the timeframe
    const appointments = await ctx.db
      .query("appointments")
      .filter(q => q.gte(q.field("startTime"), startTime))
      .collect();

    return {
      totalSessions: sessions.length,
      completedAppointments: appointments.filter(a => a.status === "completed").length,
      cancelledAppointments: appointments.filter(a => 
        a.status === "cancelled_by_patient" || 
        a.status === "cancelled_by_therapist"
      ).length,
      noShows: appointments.filter(a => a.status === "no_show").length,
      sessionsByDay: sessions.reduce((acc: Record<string, number>, session) => {
        const day = new Date(session.sessionDate).toISOString().split('T')[0];
        acc[day] = (acc[day] || 0) + 1;
        return acc;
      }, {}),
    };
  },
});

/**
 * Get treatment outcome analytics
 */
export const getTreatmentOutcomes = query({
  args: {
    patientId: v.optional(v.id("users")),
  },
  handler: async (ctx, { patientId }) => {
    // Get all session logs for the patient
    const query = ctx.db.query("sessionLogs");
    if (patientId) {
      query.filter(q => q.eq(q.field("patientId"), patientId));
    }
    const sessions = await query.collect();

    // In a real system, we would analyze treatment progress metrics
    // For now, return mock analytics
    return {
      totalTreatments: sessions.length,
      averageSessionDuration: 45, // minutes
      progressMetrics: {
        painReduction: 65, // percentage
        mobilityImprovement: 45, // percentage
        strengthGain: 30, // percentage
      },
      recommendedActions: [
        "Increase exercise intensity",
        "Add balance training",
        "Schedule follow-up assessment"
      ]
    };
  },
});

/**
 * Get clinic performance metrics
 */
export const getClinicMetrics = query({
  args: {
    clinicId: v.id("clinics"),
    timeframe: v.optional(v.union(v.literal("week"), v.literal("month"), v.literal("year"))),
  },
  handler: async (ctx, { clinicId, timeframe = "month" }) => {
    const now = Date.now();
    const startTime = timeframe === "week" ? now - 7 * 24 * 60 * 60 * 1000 :
                     timeframe === "month" ? now - 30 * 24 * 60 * 60 * 1000 :
                     now - 365 * 24 * 60 * 60 * 1000;

    // Get all appointments for the clinic
    const appointments = await ctx.db
      .query("appointments")
      .filter(q => 
        q.and(
          q.eq(q.field("clinicId"), clinicId),
          q.gte(q.field("startTime"), startTime)
        )
      )
      .collect();

    // Get all physiotherapists in the clinic
    const physiotherapists = await ctx.db
      .query("physiotherapistProfiles")
      .filter(q => q.eq(q.field("clinicId"), clinicId))
      .collect();

    return {
      appointmentMetrics: {
        total: appointments.length,
        completed: appointments.filter(a => a.status === "completed").length,
        cancelled: appointments.filter(a => 
          a.status === "cancelled_by_patient" || 
          a.status === "cancelled_by_therapist"
        ).length,
        noShow: appointments.filter(a => a.status === "no_show").length,
      },
      staffMetrics: {
        totalPhysiotherapists: physiotherapists.length,
        averageAppointmentsPerTherapist: physiotherapists.length ? 
          Math.round(appointments.length / physiotherapists.length) : 0,
      },
      utilization: {
        overallRate: 75, // percentage (mock data)
        peakHours: ["09:00", "10:00", "14:00", "15:00"],
        lowUtilizationHours: ["12:00", "17:00"],
      },
    };
  },
});

/**
 * Generate a comprehensive report
 */
export const generateReport = mutation({
  args: {
    reportType: v.union(
      v.literal("patient_progress"),
      v.literal("clinic_performance"),
      v.literal("therapist_performance")
    ),
    timeframe: v.union(v.literal("week"), v.literal("month"), v.literal("year")),
    entityId: v.id("users"), // Patient ID, Clinic ID, or Therapist ID
  },
  handler: async (ctx, { reportType, timeframe, entityId }) => {
    // Create a report record
    const reportId = await ctx.db.insert("reports", {
      type: reportType,
      timeframe,
      entityId,
      generatedAt: Date.now(),
      status: "pending",
    });

    // In a real system, we would:
    // 1. Queue report generation
    // 2. Process data asynchronously
    // 3. Store results
    // 4. Notify when ready

    return reportId;
  },
}); 