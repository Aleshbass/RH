import { insertNotification } from "./helpers/pushNotify";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthenticatedUser } from "./auth";

/**
 * Real-Time Treatment Plan Sync System
 * Handles patient-physiotherapist synchronization with version tracking
 */

/**
 * Sync treatment plan changes to patient with notification. Internal: only the physio-side
 * plan mutations call it, after their own access checks.
 */
export const syncTreatmentPlanToPatient = internalMutation({
  args: {
    treatmentPlanId: v.id("treatmentPlans"),
    changeType: v.union(
      v.literal("created"),
      v.literal("exercise_added"),
      v.literal("exercise_removed"),
      v.literal("exercise_modified"),
      v.literal("goal_updated"),
      v.literal("assessment_added"),
      v.literal("status_changed"),
      v.literal("phase_updated")
    ),
    changeDescription: v.string(),
    notifyPatient: v.optional(v.boolean()),
    previousData: v.optional(v.any()),
    newData: v.any(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    const plan = await ctx.db.get(args.treatmentPlanId);
    if (!plan) {
      throw new Error("Treatment plan not found");
    }

    // Create version record
    await ctx.db.insert("treatmentPlanVersions", {
      treatmentPlanId: args.treatmentPlanId,
      version: plan.version,
      changeType: args.changeType,
      changedBy: currentUser._id,
      changeDescription: args.changeDescription,
      previousData: args.previousData,
      newData: args.newData,
      timestamp: Date.now(),
      patientNotified: false,
    });

    // Send real-time notification to patient
    if (args.notifyPatient !== false) {
      await insertNotification(ctx, {
        userId: plan.patientId,
        type: "treatment_plan_updated",
        payload: {
          title: "Treatment Plan Updated",
          body: args.changeDescription,
          data: { 
            treatmentPlanId: args.treatmentPlanId,
            changeType: args.changeType 
          },
          link: `/dashboard/patient/treatment-plans`,
        },
        status: "pending",
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/**
 * Get patient treatment plan updates (real-time subscription)
 */
export const getPatientTreatmentPlanUpdates = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "patient") {
      throw new Error("Access denied");
    }

    // Get active treatment plans
    const activePlans = await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient_and_status", q => 
        q.eq("patientId", user._id).eq("status", "active")
      )
      .collect();

    // Get recent changes for each plan
    const plansWithUpdates = await Promise.all(
      activePlans.map(async (plan) => {
        const unreadVersions = await ctx.db
          .query("treatmentPlanVersions")
          .withIndex("by_patient_notified", q => 
            q.eq("treatmentPlanId", plan._id).eq("patientNotified", false)
          )
          .collect();

        const recentVersions = await ctx.db
          .query("treatmentPlanVersions")
          .withIndex("by_treatment_plan", q => q.eq("treatmentPlanId", plan._id))
          .order("desc")
          .take(5);

        return {
          ...plan,
          unreadChanges: unreadVersions.length,
          hasUnreadChanges: unreadVersions.length > 0,
          recentChanges: recentVersions,
          latestChange: recentVersions[0],
        };
      })
    );

    return plansWithUpdates;
  },
});

/**
 * Mark treatment plan changes as read by patient
 */
export const markTreatmentChangesAsRead = mutation({
  args: {
    treatmentPlanId: v.id("treatmentPlans"),
    versionIds: v.optional(v.array(v.id("treatmentPlanVersions"))),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "patient") {
      throw new Error("Access denied");
    }
    const plan = await ctx.db.get(args.treatmentPlanId);
    if (!plan || plan.patientId !== user._id) {
      throw new Error("Access denied");
    }

    // Mark specific versions as read, or all unread versions
    if (args.versionIds) {
      for (const versionId of args.versionIds) {
        const version = await ctx.db.get(versionId);
        if (!version || version.treatmentPlanId !== plan._id) continue;
        await ctx.db.patch(versionId, {
          patientNotified: true,
          notificationSentAt: Date.now(),
        });
      }
    } else {
      const unreadVersions = await ctx.db
        .query("treatmentPlanVersions")
        .withIndex("by_patient_notified", q => 
          q.eq("treatmentPlanId", args.treatmentPlanId).eq("patientNotified", false)
        )
        .collect();

      for (const version of unreadVersions) {
        await ctx.db.patch(version._id, {
          patientNotified: true,
          notificationSentAt: Date.now(),
        });
      }
    }

    return { success: true };
  },
});

/**
 * Get treatment plan change history
 */
export const getTreatmentPlanChangeHistory = query({
  args: {
    treatmentPlanId: v.id("treatmentPlans"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    const treatmentPlan = await ctx.db.get(args.treatmentPlanId);
    if (!treatmentPlan) {
      throw new Error("Treatment plan not found");
    }

    // Check access
    let hasAccess = false;
    if (currentUser.role === "physiotherapist") {
      hasAccess = treatmentPlan.physiotherapistId === currentUser._id;
    } else if (currentUser.role === "patient") {
      hasAccess = treatmentPlan.patientId === currentUser._id;
    }

    if (!hasAccess) {
      throw new Error("Access denied");
    }

    const versions = await ctx.db
      .query("treatmentPlanVersions")
      .withIndex("by_treatment_plan", q => q.eq("treatmentPlanId", args.treatmentPlanId))
      .order("desc")
      .take(args.limit || 20);

    // Get user details for each change
    const versionsWithUsers = await Promise.all(
      versions.map(async (version) => {
        const changedBy = await ctx.db.get(version.changedBy);
        return {
          ...version,
          changedBy: changedBy ? {
            firstName: changedBy.firstName,
            lastName: changedBy.lastName,
            role: changedBy.role,
          } : null,
        };
      })
    );

    return versionsWithUsers;
  },
});

/**
 * Get unread notifications count for patient
 */
export const getUnreadNotificationsCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "patient") {
      return 0;
    }

    const unreadCount = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_status", q => 
        q.eq("userId", user._id).eq("status", "pending")
      )
      .collect();

    return unreadCount.length;
  },
});

/**
 * Subscribe to real-time treatment plan changes
 */
export const subscribeToTreatmentUpdates = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "patient") {
      throw new Error("Access denied");
    }

    // Get all unread treatment plan changes
    const activePlans = await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient_and_status", q => 
        q.eq("patientId", user._id).eq("status", "active")
      )
      .collect();

    const allUnreadChanges = [];
    
    for (const plan of activePlans) {
      const unreadVersions = await ctx.db
        .query("treatmentPlanVersions")
        .withIndex("by_patient_notified", q => 
          q.eq("treatmentPlanId", plan._id).eq("patientNotified", false)
        )
        .collect();

      for (const version of unreadVersions) {
        allUnreadChanges.push({
          ...version,
          treatmentPlanTitle: plan.title,
        });
      }
    }

    // Sort by timestamp (newest first)
    allUnreadChanges.sort((a, b) => b.timestamp - a.timestamp);

    return {
      unreadCount: allUnreadChanges.length,
      recentChanges: allUnreadChanges.slice(0, 5),
      hasUpdates: allUnreadChanges.length > 0,
    };
  },
});

/**
 * Create assessment and link to treatment plan
 */
export const createAssessmentWithPlanIntegration = mutation({
  args: {
    patientId: v.id("users"),
    treatmentPlanId: v.optional(v.id("treatmentPlans")),
    assessmentType: v.string(),
    title: v.string(),
    responses: v.array(v.object({
      questionId: v.string(),
      question: v.string(),
      answer: v.any(),
      score: v.number(),
    })),
    totalScore: v.number(),
    maxScore: v.number(),
    percentageScore: v.number(),
    interpretation: v.string(),
    isBaseline: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser || currentUser.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can create assessments");
    }

    // Create assessment
    const assessmentId = await ctx.db.insert("assessments", {
      patientId: args.patientId,
      physiotherapistId: currentUser._id,
      clinicId: currentUser.clinicId,
      assessmentType: args.assessmentType as "oswestry" | "neck_disability" | "shoulder_function" | "custom",
      title: args.title,
      responses: args.responses,
      totalScore: args.totalScore,
      maxScore: args.maxScore,
      percentageScore: args.percentageScore,
      interpretation: args.interpretation,
      notes: args.notes,
      completedAt: Date.now(),
      createdAt: Date.now(),
    });

    // If linked to treatment plan, update plan and sync to patient
    if (args.treatmentPlanId) {
      const plan = await ctx.db.get(args.treatmentPlanId);
      if (plan) {
        await ctx.db.patch(args.treatmentPlanId, {
          updatedAt: Date.now(),
          version: plan.version + 1,
        });

        // Sync to patient
        await ctx.runMutation(internal.treatmentPlanSync.syncTreatmentPlanToPatient, {
          treatmentPlanId: args.treatmentPlanId,
          changeType: "assessment_added",
          changeDescription: `New ${args.title} assessment completed`,
          previousData: null,
          newData: { assessmentId, assessmentType: args.assessmentType },
        });
      }
    }

    return assessmentId;
  },
});
