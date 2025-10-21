import { query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser } from "./auth";

/**
 * Get all patients with their exercise assignments and completion status
 */
export const getPatientExerciseAssignments = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist") throw new Error("Access denied");

    // Get all active patient relationships
    const relationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .filter((q) =>
        q.and(
          q.eq(q.field("physiotherapistId"), user._id),
          q.eq(q.field("status"), "active")
        )
      )
      .collect();

    const patientData = await Promise.all(
      relationships.map(async (rel) => {
        const patient = await ctx.db.get(rel.patientId);
        if (!patient) return null;

        // Get active treatment plans
        const activePlans = await ctx.db
          .query("treatmentPlans")
          .filter((q) =>
            q.and(
              q.eq(q.field("patientId"), rel.patientId),
              q.eq(q.field("physiotherapistId"), user._id),
              q.eq(q.field("status"), "active")
            )
          )
          .collect();

        // Count total exercises assigned
        let totalExercises = 0;
        activePlans.forEach((plan) => {
          plan.phases?.forEach((phase: any) => {
            totalExercises += phase.exercises?.length || 0;
          });
        });

        return {
          patientId: patient._id,
          patientName: `${patient.firstName} ${patient.lastName}`,
          patientEmail: patient.email,
          activePlans: activePlans.length,
          totalExercises,
          plans: activePlans,
        };
      })
    );

    return patientData.filter((p) => p !== null);
  },
});

/**
 * Get detailed completion logs for a specific patient
 */
export const getPatientCompletionLogs = query({
  args: {
    patientId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist") throw new Error("Access denied");

    // Verify relationship
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .filter((q) =>
        q.and(
          q.eq(q.field("patientId"), args.patientId),
          q.eq(q.field("physiotherapistId"), user._id),
          q.eq(q.field("status"), "active")
        )
      )
      .unique();

    if (!relationship) throw new Error("No active relationship with this patient");

    const patient = await ctx.db.get(args.patientId);

    // Get completion logs
    const logs = await ctx.db
      .query("treatmentProgress")
      .filter((q) =>
        q.and(
          q.eq(q.field("patientId"), args.patientId),
          q.eq(q.field("progressType"), "exercise_completion")
        )
      )
      .order("desc")
      .take(args.limit || 50);

    // Enrich logs with treatment plan details
    const enrichedLogs = await Promise.all(
      logs.map(async (log) => {
        const plan = await ctx.db.get(log.treatmentPlanId);
        const metadata = (log as any).metadata || {};
        
        // Find exercise details from plan
        let exerciseName = "Unknown Exercise";
        if (plan && plan.phases) {
          for (const phase of plan.phases) {
            const exercise = (phase as any).exercises?.find(
              (ex: any) => ex.exerciseId === metadata.exerciseId
            );
            if (exercise) {
              exerciseName = exercise.name || exercise.exerciseId;
              break;
            }
          }
        }

        return {
          _id: log._id,
          entryDate: log.entryDate,
          notes: log.notes,
          exerciseId: metadata.exerciseId,
          exerciseName,
          phaseOrder: metadata.phaseOrder,
          planTitle: plan?.title || "Unknown Plan",
          patientName: `${patient?.firstName} ${patient?.lastName}`,
        };
      })
    );

    return enrichedLogs;
  },
});

/**
 * Calculate adherence metrics for a patient
 */
export const calculatePatientAdherence = query({
  args: {
    patientId: v.id("users"),
    days: v.optional(v.number()), // Default 7 days
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist") throw new Error("Access denied");

    // Verify relationship
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .filter((q) =>
        q.and(
          q.eq(q.field("patientId"), args.patientId),
          q.eq(q.field("physiotherapistId"), user._id),
          q.eq(q.field("status"), "active")
        )
      )
      .unique();

    if (!relationship) throw new Error("No active relationship with this patient");

    const days = args.days || 7;
    const startDate = Date.now() - days * 24 * 60 * 60 * 1000;

    // Get active treatment plans
    const activePlans = await ctx.db
      .query("treatmentPlans")
      .filter((q) =>
        q.and(
          q.eq(q.field("patientId"), args.patientId),
          q.eq(q.field("physiotherapistId"), user._id),
          q.eq(q.field("status"), "active")
        )
      )
      .collect();

    // Count total exercises assigned (daily frequency only for now)
    let totalDailyExercises = 0;
    activePlans.forEach((plan) => {
      plan.phases?.forEach((phase: any) => {
        phase.exercises?.forEach((ex: any) => {
          if (ex.frequency?.toLowerCase().includes("daily")) {
            totalDailyExercises++;
          }
        });
      });
    });

    // Expected completions = total daily exercises * days
    const expectedCompletions = totalDailyExercises * days;

    // Get actual completions in the time period
    const completions = await ctx.db
      .query("treatmentProgress")
      .filter((q) =>
        q.and(
          q.eq(q.field("patientId"), args.patientId),
          q.eq(q.field("progressType"), "exercise_completion"),
          q.gte(q.field("entryDate"), startDate)
        )
      )
      .collect();

    const actualCompletions = completions.length;

    // Calculate adherence percentage
    const adherencePercentage =
      expectedCompletions > 0
        ? Math.round((actualCompletions / expectedCompletions) * 100)
        : 0;

    // Get last activity date
    const lastActivity = completions.length > 0 
      ? Math.max(...completions.map((c) => c.entryDate))
      : null;

    return {
      patientId: args.patientId,
      days,
      expectedCompletions,
      actualCompletions,
      adherencePercentage,
      totalDailyExercises,
      lastActivityDate: lastActivity,
      status:
        adherencePercentage >= 80
          ? "excellent"
          : adherencePercentage >= 50
          ? "good"
          : adherencePercentage >= 30
          ? "fair"
          : "poor",
    };
  },
});

/**
 * Get patient progress summary cards for dashboard
 */
export const getPatientProgressSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist") throw new Error("Access denied");

    // Get all active patient relationships
    const relationships = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .filter((q) =>
        q.and(
          q.eq(q.field("physiotherapistId"), user._id),
          q.eq(q.field("status"), "active")
        )
      )
      .collect();

    const summaries = await Promise.all(
      relationships.map(async (rel) => {
        const patient = await ctx.db.get(rel.patientId);
        if (!patient) return null;

        // Get active plans
        const activePlans = await ctx.db
          .query("treatmentPlans")
          .filter((q) =>
            q.and(
              q.eq(q.field("patientId"), rel.patientId),
              q.eq(q.field("physiotherapistId"), user._id),
              q.eq(q.field("status"), "active")
            )
          )
          .collect();

        // Get completions this week
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const weeklyCompletions = await ctx.db
          .query("treatmentProgress")
          .filter((q) =>
            q.and(
              q.eq(q.field("patientId"), rel.patientId),
              q.eq(q.field("progressType"), "exercise_completion"),
              q.gte(q.field("entryDate"), weekAgo)
            )
          )
          .collect();

        // Count total exercises
        let totalExercises = 0;
        activePlans.forEach((plan) => {
          plan.phases?.forEach((phase: any) => {
            totalExercises += phase.exercises?.length || 0;
          });
        });

        // Get last activity
        const allCompletions = await ctx.db
          .query("treatmentProgress")
          .filter((q) =>
            q.and(
              q.eq(q.field("patientId"), rel.patientId),
              q.eq(q.field("progressType"), "exercise_completion")
            )
          )
          .order("desc")
          .take(1);

        const lastActivity = allCompletions[0]?.entryDate || null;
        const daysSinceActivity = lastActivity
          ? Math.floor((Date.now() - lastActivity) / (24 * 60 * 60 * 1000))
          : null;

        // Simple adherence calculation
        const expectedWeekly = totalExercises * 7; // Assuming daily frequency
        const adherence =
          expectedWeekly > 0
            ? Math.round((weeklyCompletions.length / expectedWeekly) * 100)
            : 0;

        return {
          patientId: patient._id,
          patientName: `${patient.firstName} ${patient.lastName}`,
          patientEmail: patient.email,
          imageUrl: patient.imageUrl,
          totalExercises,
          completedThisWeek: weeklyCompletions.length,
          adherencePercentage: adherence,
          lastActivityDate: lastActivity,
          daysSinceActivity,
          needsAttention: daysSinceActivity !== null && daysSinceActivity >= 3,
          activePlans: activePlans.length,
        };
      })
    );

    return summaries.filter((s) => s !== null);
  },
});
