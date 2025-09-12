import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser } from "./auth";
import { internal } from "./_generated/api";

/**
 * Treatment Plan Management System
 * Comprehensive system for creating, managing, and tracking treatment plans
 */

/**
 * Create a new treatment plan
 */
export const createTreatmentPlan = mutation({
  args: {
    patientId: v.id("users"),
    clinicId: v.id("clinics"),
    title: v.string(),
    description: v.optional(v.string()),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    goals: v.array(v.object({
      description: v.string(),
      targetValue: v.string(),
      timeline: v.string(),
      measurable: v.boolean(),
    })),
    phases: v.array(v.object({
      name: v.string(),
      description: v.string(),
      duration: v.string(),
      order: v.number(),
      exercises: v.array(v.object({
        exerciseId: v.string(),
        sets: v.number(),
        reps: v.number(),
        duration: v.optional(v.string()),
        frequency: v.string(),
        notes: v.optional(v.string()),
      })),
    })),
    reviewInterval: v.number(), // days
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const physiotherapist = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
      .unique();

    if (!physiotherapist || physiotherapist.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can create treatment plans");
    }

    // Verify patient relationship
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", q => 
        q.eq("patientId", args.patientId).eq("physiotherapistId", physiotherapist._id)
      )
      .unique();

    if (!relationship || relationship.status !== "active") {
      throw new Error("No active relationship with this patient");
    }

    const treatmentPlanId = await ctx.db.insert("treatmentPlans", {
      ...args,
      physiotherapistId: physiotherapist._id,
      status: "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    });

    // Create initial progress entry
    await ctx.db.insert("treatmentProgress", {
      treatmentPlanId,
      patientId: args.patientId,
      physiotherapistId: physiotherapist._id,
      entryDate: Date.now(),
      progressType: "plan_created",
      notes: "Treatment plan created",
      recordedBy: physiotherapist._id,
    });

    return treatmentPlanId;
  },
});

/**
 * Get treatment plans for a patient
 */
export const getPatientTreatmentPlans = query({
  args: {
    patientId: v.id("users"),
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("on_hold")
    )),
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

    // Check if user has access to this patient
    let hasAccess = false;
    if (currentUser.role === "physiotherapist") {
      const relationship = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient_and_physiotherapist", q => 
          q.eq("patientId", args.patientId).eq("physiotherapistId", currentUser._id)
        )
        .unique();
      hasAccess = relationship?.status === "active";
    } else if (currentUser.role === "patient") {
      hasAccess = currentUser._id === args.patientId;
    }

    if (!hasAccess) {
      throw new Error("Access denied");
    }

    let query = ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient", q => q.eq("patientId", args.patientId));

    if (args.status) {
      query = query.filter(q => q.eq(q.field("status"), args.status));
    }

    const treatmentPlans = await query
      .order("desc")
      .collect();

    // Get progress data for each plan
    const plansWithProgress = await Promise.all(
      treatmentPlans.map(async (plan) => {
        const progress = await ctx.db
          .query("treatmentProgress")
          .withIndex("by_treatment_plan", q => q.eq("treatmentPlanId", plan._id))
          .order("desc")
          .take(5);

        const physiotherapist = await ctx.db.get(plan.physiotherapistId);

        return {
          ...plan,
          physiotherapist: physiotherapist ? {
            firstName: physiotherapist.firstName,
            lastName: physiotherapist.lastName,
          } : null,
          recentProgress: progress,
          progressCount: progress.length,
        };
      })
    );

    return plansWithProgress;
  },
});

/**
 * Update treatment plan
 */
export const updateTreatmentPlan = mutation({
  args: {
    treatmentPlanId: v.id("treatmentPlans"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    endDate: v.optional(v.number()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    goals: v.optional(v.array(v.object({
      description: v.string(),
      targetValue: v.string(),
      timeline: v.string(),
      measurable: v.boolean(),
    }))),
    phases: v.optional(v.array(v.object({
      name: v.string(),
      description: v.string(),
      duration: v.string(),
      order: v.number(),
      exercises: v.array(v.object({
        exerciseId: v.string(),
        sets: v.number(),
        reps: v.number(),
        duration: v.optional(v.string()),
        frequency: v.string(),
        notes: v.optional(v.string()),
        videoUrl: v.optional(v.string()),
        youtubeId: v.optional(v.string()),
        beforeImageStorageId: v.optional(v.id("_storage")),
        afterImageStorageId: v.optional(v.id("_storage")),
      })),
    }))),
    reviewInterval: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const physiotherapist = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
      .unique();

    if (!physiotherapist || physiotherapist.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can update treatment plans");
    }

    const treatmentPlan = await ctx.db.get(args.treatmentPlanId);
    if (!treatmentPlan) {
      throw new Error("Treatment plan not found");
    }

    if (treatmentPlan.physiotherapistId !== physiotherapist._id) {
      throw new Error("Access denied");
    }

    const { treatmentPlanId, ...updateData } = args;

    await ctx.db.patch(args.treatmentPlanId, {
      ...updateData,
      updatedAt: Date.now(),
      version: treatmentPlan.version + 1,
    });

    // Log the update
    await ctx.db.insert("treatmentProgress", {
      treatmentPlanId: args.treatmentPlanId,
      patientId: treatmentPlan.patientId,
      physiotherapistId: physiotherapist._id,
      entryDate: Date.now(),
      progressType: "plan_updated",
      notes: "Treatment plan updated",
      recordedBy: physiotherapist._id,
    });

    return { success: true };
  },
});

/**
 * Update treatment plan status
 */
export const updateTreatmentPlanStatus = mutation({
  args: {
    treatmentPlanId: v.id("treatmentPlans"),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("on_hold")
    ),
    statusNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const physiotherapist = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
      .unique();

    if (!physiotherapist || physiotherapist.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can update treatment plan status");
    }

    const treatmentPlan = await ctx.db.get(args.treatmentPlanId);
    if (!treatmentPlan) {
      throw new Error("Treatment plan not found");
    }

    if (treatmentPlan.physiotherapistId !== physiotherapist._id) {
      throw new Error("Access denied");
    }

    await ctx.db.patch(args.treatmentPlanId, {
      status: args.status,
      updatedAt: Date.now(),
      ...(args.status === "completed" && { completedAt: Date.now() }),
      ...(args.status === "cancelled" && { cancelledAt: Date.now() }),
    });

    // Log status change
    await ctx.db.insert("treatmentProgress", {
      treatmentPlanId: args.treatmentPlanId,
      patientId: treatmentPlan.patientId,
      physiotherapistId: physiotherapist._id,
      entryDate: Date.now(),
      progressType: "status_change",
      notes: `Status changed to ${args.status}${args.statusNotes ? `: ${args.statusNotes}` : ''}`,
      recordedBy: physiotherapist._id,
    });

    return { success: true };
  },
});

/**
 * Record progress update
 */
export const recordProgressUpdate = mutation({
  args: {
    treatmentPlanId: v.id("treatmentPlans"),
    goalId: v.optional(v.string()),
    progressType: v.union(
      v.literal("goal_progress"),
      v.literal("exercise_completion"),
      v.literal("assessment"),
      v.literal("milestone"),
      v.literal("setback"),
      v.literal("general")
    ),
    currentValue: v.optional(v.string()),
    progressRating: v.union(
      v.literal("poor"),
      v.literal("fair"),
      v.literal("good"),
      v.literal("excellent")
    ),
    notes: v.string(),
    measurements: v.optional(v.array(v.object({
      type: v.string(),
      value: v.string(),
      unit: v.string(),
      date: v.number(),
    }))),
    attachments: v.optional(v.array(v.object({
      fileName: v.string(),
      fileUrl: v.string(),
      fileType: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const physiotherapist = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
      .unique();

    if (!physiotherapist || physiotherapist.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can record progress");
    }

    const treatmentPlan = await ctx.db.get(args.treatmentPlanId);
    if (!treatmentPlan) {
      throw new Error("Treatment plan not found");
    }

    if (treatmentPlan.physiotherapistId !== physiotherapist._id) {
      throw new Error("Access denied");
    }

    const progressId = await ctx.db.insert("treatmentProgress", {
      treatmentPlanId: args.treatmentPlanId,
      patientId: treatmentPlan.patientId,
      physiotherapistId: physiotherapist._id,
      entryDate: Date.now(),
      progressType: args.progressType,
      goalId: args.goalId,
      currentValue: args.currentValue,
      progressRating: args.progressRating,
      notes: args.notes,
      measurements: args.measurements,
      attachments: args.attachments,
      recordedBy: physiotherapist._id,
    });

    return progressId;
  },
});

/**
 * Get treatment plan progress
 */
export const getTreatmentPlanProgress = query({
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

    const progress = await ctx.db
      .query("treatmentProgress")
      .withIndex("by_treatment_plan", q => q.eq("treatmentPlanId", args.treatmentPlanId))
      .order("desc")
      .take(args.limit || 50);

    // Get recorder details for each progress entry
    const progressWithRecorders = await Promise.all(
      progress.map(async (entry) => {
        const recorder = await ctx.db.get(entry.recordedBy);
        return {
          ...entry,
          recordedBy: recorder ? {
            firstName: recorder.firstName,
            lastName: recorder.lastName,
            role: recorder.role,
          } : null,
        };
      })
    );

    return progressWithRecorders;
  },
});

/**
 * Duplicate treatment plan
 */
export const duplicateTreatmentPlan = mutation({
  args: {
    treatmentPlanId: v.id("treatmentPlans"),
    newPatientId: v.optional(v.id("users")),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const physiotherapist = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
      .unique();

    if (!physiotherapist || physiotherapist.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can duplicate treatment plans");
    }

    const originalPlan = await ctx.db.get(args.treatmentPlanId);
    if (!originalPlan) {
      throw new Error("Treatment plan not found");
    }

    if (originalPlan.physiotherapistId !== physiotherapist._id) {
      throw new Error("Access denied");
    }

    const newPatientId = args.newPatientId || originalPlan.patientId;

    // Verify patient relationship for new patient
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", q => 
        q.eq("patientId", newPatientId).eq("physiotherapistId", physiotherapist._id)
      )
      .unique();

    if (!relationship || relationship.status !== "active") {
      throw new Error("No active relationship with target patient");
    }

    const { _id, _creationTime, createdAt, updatedAt, version, status, completedAt, cancelledAt, ...planData } = originalPlan;

    const duplicatedPlanId = await ctx.db.insert("treatmentPlans", {
      ...planData,
      patientId: newPatientId,
      title: args.title || `${originalPlan.title} (Copy)`,
      status: "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    });

    return duplicatedPlanId;
  },
});

// ==== Query: Get active treatment plan for the authenticated patient ====
export const getPatientActivePlan = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "patient") {
      throw new Error("Access denied");
    }

    const plans = await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient_and_status", (q) =>
        q.eq("patientId", user._id).eq("status", "active")
      )
      .order("desc")
      .take(1);

    return plans[0] ?? null;
  },
});

// ==== Mutation: Log exercise completion by patient ====
export const logExerciseCompletion = mutation({
  args: {
    treatmentPlanId: v.id("treatmentPlans"),
    exerciseId: v.string(),
    phaseOrder: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "patient") throw new Error("Access denied");

    // Ensure the treatment plan belongs to this patient and is active
    const plan = await ctx.db.get(args.treatmentPlanId);
    if (!plan || plan.patientId !== user._id) throw new Error("Plan not found");
    if (plan.status !== "active") throw new Error("Plan is not active");

    // Record progress entry
    await ctx.db.insert("treatmentProgress", {
      treatmentPlanId: args.treatmentPlanId,
      patientId: user._id,
      physiotherapistId: plan.physiotherapistId,
      entryDate: Date.now(),
      progressType: "exercise_completed",
      notes: args.notes,
      recordedBy: user._id,
      metadata: {
        exerciseId: args.exerciseId,
        phaseOrder: args.phaseOrder,
      },
    } as any);

    return { success: true };
  },
});

// ==== Query: Get completion map for a plan (exerciseId+phaseOrder => boolean) ====
export const getExerciseCompletionMap = query({
  args: { treatmentPlanId: v.id("treatmentPlans") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "patient") throw new Error("Access denied");

    const entries = await ctx.db
      .query("treatmentProgress")
      .withIndex("by_treatment_plan", (q) => q.eq("treatmentPlanId", args.treatmentPlanId))
      .filter((q) => q.eq(q.field("patientId"), user._id))
      .filter((q) => q.eq(q.field("progressType"), "exercise_completed"))
      .collect();

    const map: Record<string, boolean> = {};
    for (const e of entries) {
      const meta = (e as any).metadata || {};
      const key = `${meta.phaseOrder}-${meta.exerciseId}`;
      map[key] = true;
    }
    return map;
  },
});

/**
 * Get treatment templates for physiotherapists
 */
export const getTreatmentTemplates = query({
  args: {
    category: v.optional(v.string()),
    difficulty: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const physiotherapist = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!physiotherapist || physiotherapist.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can access treatment templates");
    }

    let q = ctx.db.query("treatmentTemplates")
      .filter((f) =>
        f.or(
          f.eq(f.field("createdBy"), physiotherapist._id),
          f.eq(f.field("isPublic"), true),
          physiotherapist.clinicId ? f.eq(f.field("clinicId"), physiotherapist.clinicId) : f.eq(f.field("createdBy"), physiotherapist._id)
        )
      );

    if (args.category) {
      q = q.filter((f) => f.eq(f.field("category"), args.category));
    }
    if (args.difficulty) {
      q = q.filter((f) => f.eq(f.field("difficulty"), args.difficulty));
    }

    const templates = await q.collect();
    return templates;
  },
});

export const getTreatmentTemplateById = query({
  args: { templateId: v.id("treatmentTemplates") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    const tpl = await ctx.db.get(args.templateId);
    if (!tpl) return null;
    // Access: creator, public, or same clinic
    const allowed =
      tpl.isPublic === true ||
      tpl.createdBy === user._id ||
      (tpl.clinicId && user.clinicId && tpl.clinicId === user.clinicId);
    if (!allowed) throw new Error("Access denied");
    return tpl;
  },
});

/**
 * Create treatment template
 */
export const createTreatmentTemplate = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    duration: v.optional(v.string()),
    difficulty: v.optional(v.union(v.literal("Beginner"), v.literal("Intermediate"), v.literal("Advanced"))),
    // Simplified creation input from UI (strings)
    exercises: v.optional(v.array(v.string())),
    phases: v.optional(v.array(v.string())),
    goals: v.optional(v.array(v.string())),
    // Full builder payload (preferred). If provided, overrides the simplified inputs above.
    builderPhases: v.optional(
      v.array(
        v.object({
          name: v.string(),
          description: v.optional(v.string()),
          duration: v.optional(v.string()),
          order: v.number(),
          exercises: v.array(
            v.object({
              exerciseRefId: v.optional(v.id("exercises")),
              exerciseId: v.optional(v.string()),
              sets: v.optional(v.number()),
              reps: v.optional(v.number()),
              duration: v.optional(v.string()),
              frequency: v.optional(v.string()),
              notes: v.optional(v.string()),
              videoUrl: v.optional(v.string()),
              youtubeId: v.optional(v.string()),
              beforeImageStorageId: v.optional(v.id("_storage")),
              afterImageStorageId: v.optional(v.id("_storage")),
            })
          ),
        })
      )
    ),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const physiotherapist = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!physiotherapist || physiotherapist.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can create treatment templates");
    }

    // Map simple inputs to schema shape, unless full builderPhases provided
    let phases: any[];
    if (args.builderPhases && args.builderPhases.length > 0) {
      phases = args.builderPhases.map((p, idx) => ({
        name: p.name,
        description: p.description || "",
        duration: p.duration || undefined,
        order: p.order ?? idx + 1,
        exercises: (p.exercises || []).map((e) => ({
          exerciseRefId: e.exerciseRefId,
          exerciseId: e.exerciseId,
          sets: e.sets ?? 3,
          reps: e.reps ?? 10,
          duration: e.duration,
          frequency: e.frequency || "Daily",
          notes: e.notes,
          videoUrl: e.videoUrl,
          youtubeId: e.youtubeId,
          beforeImageStorageId: e.beforeImageStorageId,
          afterImageStorageId: e.afterImageStorageId,
        })),
      }));
    } else {
      type TemplateExerciseSeed = {
        exerciseId: string;
        sets: number;
        reps: number;
        duration?: string;
        frequency: string;
        notes?: string;
        videoUrl?: string;
        youtubeId?: string;
      };

      phases = (args.phases || []).map((name, idx) => ({
        name,
        description: "",
        duration: args.duration || undefined,
        order: idx + 1,
        exercises: [] as TemplateExerciseSeed[],
      }));

      // If exercises provided, add them to first phase
      if ((args.exercises || []).length) {
        if (phases.length === 0) {
          phases.push({ name: "Phase 1", description: "", duration: args.duration || undefined, order: 1, exercises: [] as TemplateExerciseSeed[] });
        }
        const target = phases[phases.length - 1];
        for (const ex of args.exercises || []) {
          target.exercises.push({
            exerciseId: ex,
            sets: 3,
            reps: 10,
            frequency: "Daily",
            notes: "",
          });
        }
      }
    }

    const goals = (args.goals || []).map((g) => ({ description: g }));

    const templateId = await ctx.db.insert("treatmentTemplates", {
      title: args.title,
      description: args.description,
      category: args.category,
      difficulty: args.difficulty,
      duration: args.duration,
      goals,
      phases,
      createdBy: physiotherapist._id,
      clinicId: physiotherapist.clinicId,
      isPublic: args.isPublic ?? false,
      usageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return templateId;
  },
});

export const updateTreatmentTemplate = mutation({
  args: {
    templateId: v.id("treatmentTemplates"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    duration: v.optional(v.string()),
    difficulty: v.optional(v.union(v.literal("Beginner"), v.literal("Intermediate"), v.literal("Advanced"))),
    goals: v.optional(
      v.array(
        v.object({ description: v.string(), targetValue: v.optional(v.string()), timeline: v.optional(v.string()), measurable: v.optional(v.boolean()) })
      )
    ),
    phases: v.optional(
      v.array(
        v.object({
          name: v.string(),
          description: v.optional(v.string()),
          duration: v.optional(v.string()),
          order: v.number(),
          exercises: v.array(
            v.object({
              exerciseRefId: v.optional(v.id("exercises")),
              exerciseId: v.optional(v.string()),
              sets: v.optional(v.number()),
              reps: v.optional(v.number()),
              duration: v.optional(v.string()),
              frequency: v.optional(v.string()),
              notes: v.optional(v.string()),
              videoUrl: v.optional(v.string()),
              youtubeId: v.optional(v.string()),
              beforeImageStorageId: v.optional(v.id("_storage")),
              afterImageStorageId: v.optional(v.id("_storage")),
            })
          ),
        })
      )
    ),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const existing = await ctx.db.get(args.templateId);
    if (!existing) throw new Error("Template not found");
    if (existing.createdBy !== user._id) throw new Error("Access denied");

    const { templateId, ...patch } = args as any;
    await ctx.db.patch(args.templateId, { ...patch, updatedAt: Date.now() });
    return { success: true };
  },
});

export const deleteTreatmentTemplate = mutation({
  args: { templateId: v.id("treatmentTemplates") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");
    const tpl = await ctx.db.get(args.templateId);
    if (!tpl) return { success: true };
    if (tpl.createdBy !== user._id) throw new Error("Access denied");
    await ctx.db.delete(args.templateId);
    return { success: true };
  },
});

export const assignTemplateToPatient = mutation({
  args: {
    templateId: v.id("treatmentTemplates"),
    patientId: v.id("users"),
    clinicId: v.optional(v.id("clinics")),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    activate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const physiotherapist = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!physiotherapist || physiotherapist.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can assign templates");
    }

    // Verify active relationship with patient
    const relationship = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) =>
        q.eq("patientId", args.patientId).eq("physiotherapistId", physiotherapist._id)
      )
      .unique();
    if (!relationship || relationship.status !== "active") {
      throw new Error("No active relationship with this patient");
    }

    const tpl = await ctx.db.get(args.templateId);
    if (!tpl) throw new Error("Template not found");

    // Determine clinic context: prefer explicit arg, then relationship, then physiotherapist profile, then template.
    // If none is available, proceed without clinic context (support independent physiotherapists).
    const resolvedClinicId = args.clinicId || relationship?.clinicId || physiotherapist.clinicId || tpl.clinicId;
    if (!resolvedClinicId) {
      console.warn("[treatmentPlans.assignTemplateToPatient] Proceeding without clinic context; independent physiotherapist flow.");
    }

    const planId = await ctx.db.insert("treatmentPlans", {
      patientId: args.patientId,
      physiotherapistId: physiotherapist._id,
      clinicId: resolvedClinicId,
      title: args.title || tpl.title,
      description: args.description || tpl.description,
      startDate: Date.now(),
      endDate: undefined,
      priority: args.priority || "medium",
      status: args.activate === false ? "draft" : "active",
      goals: (tpl.goals || []).map((g: any) => ({
        description: g.description,
        targetValue: g.targetValue || "",
        timeline: g.timeline || "",
        measurable: g.measurable ?? true,
      })),
      phases: (tpl.phases || []).map((p: any) => ({
        name: p.name,
        description: p.description || "",
        duration: p.duration || "",
        order: p.order,
        exercises: (p.exercises || []).map((ex: any) => ({
          exerciseId: ex.exerciseRefId || ex.exerciseId || "",
          sets: ex.sets || 3,
          reps: ex.reps || 10,
          duration: ex.duration,
          frequency: ex.frequency || "Daily",
          notes: ex.notes,
          videoUrl: ex.videoUrl,
          youtubeId: ex.youtubeId,
          beforeImageStorageId: ex.beforeImageStorageId,
          afterImageStorageId: ex.afterImageStorageId,
        })),
      })),
      reviewInterval: 14,
      notes: undefined,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: undefined,
      cancelledAt: undefined,
    });

    // Log creation
    await ctx.db.insert("treatmentProgress", {
      treatmentPlanId: planId,
      patientId: args.patientId,
      physiotherapistId: physiotherapist._id,
      entryDate: Date.now(),
      progressType: "plan_created",
      notes: `Plan created from template: ${tpl.title}`,
      recordedBy: physiotherapist._id,
    });

    // Optional: send sync/notification via plan sync system
    try {
      await ctx.runMutation(internal.treatmentPlanSync.syncTreatmentPlanToPatient, {
        treatmentPlanId: planId,
        changeType: "created",
        changeDescription: `New treatment plan assigned: ${args.title || tpl.title}`,
        previousData: null,
        newData: { fromTemplateId: args.templateId },
      });
    } catch (e) {
      // Best-effort; do not block
    }

    // Increment usage count
    await ctx.db.patch(args.templateId, {
      usageCount: (tpl.usageCount || 0) + 1,
      updatedAt: Date.now(),
    });

    return planId;
  },
});

export const getTreatmentPlan = query({
  args: { treatmentPlanId: v.id("treatmentPlans") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const plan = await ctx.db.get(args.treatmentPlanId);
    if (!plan) return null;
    const canAccess =
      plan.patientId === user._id || plan.physiotherapistId === user._id;
    if (!canAccess) throw new Error("Access denied");
    return plan;
  },
});