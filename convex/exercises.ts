import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser } from "./auth";

/**
 * Enhanced Exercise Library System
 * Advanced search, filtering, and management for physiotherapy exercises
 */

/**
 * Search exercises with advanced filtering
 */
export const searchExercises = query({
  args: {
    searchTerm: v.optional(v.string()),
    bodyParts: v.optional(v.array(v.string())),
    conditions: v.optional(v.array(v.string())),
    difficulty: v.optional(v.string()),
    equipment: v.optional(v.array(v.string())),
    targetMuscles: v.optional(v.array(v.string())),
    excludeExerciseIds: v.optional(v.array(v.string())),
    clinicId: v.optional(v.id("clinics")),
    includePublic: v.optional(v.boolean()),
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

    if (!currentUser || currentUser.role !== "physiotherapist") {
      throw new Error("Only physiotherapists can access exercise library");
    }

    let query = ctx.db.query("exercises");

    // Filter by clinic (include public exercises and clinic-specific ones)
    if (args.clinicId) {
      query = query.filter(q => 
        q.or(
          q.eq(q.field("isPublic"), true),
          q.eq(q.field("clinicId"), args.clinicId)
        )
      );
    } else if (args.includePublic !== false) {
      query = query.filter(q => q.eq(q.field("isPublic"), true));
    }

    // Apply difficulty filter
    if (args.difficulty && args.difficulty !== "all") {
      query = query.filter(q => q.eq(q.field("difficultyLevel"), args.difficulty));
    }

    let exercises = await query.take(args.limit || 100);

    // Apply array-based filters
    if (args.bodyParts?.length) {
      exercises = exercises.filter(ex => 
        args.bodyParts!.some(part => ex.bodyParts.includes(part))
      );
    }

    if (args.conditions?.length) {
      exercises = exercises.filter(ex => 
        args.conditions!.some(condition => ex.conditions.includes(condition))
      );
    }

    if (args.equipment?.length) {
      exercises = exercises.filter(ex => 
        args.equipment!.some(equip => ex.equipmentNeeded.includes(equip))
      );
    }

    if (args.targetMuscles?.length) {
      exercises = exercises.filter(ex => 
        args.targetMuscles!.some(muscle => ex.targetMuscles.includes(muscle))
      );
    }

    // Apply search term filter
    if (args.searchTerm) {
      const searchLower = args.searchTerm.toLowerCase();
      exercises = exercises.filter(ex => 
        ex.name.toLowerCase().includes(searchLower) ||
        ex.description.toLowerCase().includes(searchLower) ||
        ex.targetMuscles.some(muscle => muscle.toLowerCase().includes(searchLower)) ||
        ex.bodyParts.some(part => part.toLowerCase().includes(searchLower)) ||
        ex.conditions.some(condition => condition.toLowerCase().includes(searchLower))
      );
    }

    // Exclude specific exercises if provided
    if (args.excludeExerciseIds?.length) {
      exercises = exercises.filter(ex => !args.excludeExerciseIds!.includes(ex._id));
    }

    // Sort by usage and rating
    exercises.sort((a, b) => {
      const aScore = (a.timesAssigned || 0) * 0.3 + (a.averageRating || 0) * 0.7;
      const bScore = (b.timesAssigned || 0) * 0.3 + (b.averageRating || 0) * 0.7;
      return bScore - aScore;
    });

    return exercises;
  },
});

/**
 * Get exercise filter options (body parts, conditions, equipment)
 */
export const getExerciseFilterOptions = query({
  args: {
    clinicId: v.optional(v.id("clinics")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    let query = ctx.db.query("exercises");
    
    if (args.clinicId) {
      query = query.filter(q => 
        q.or(
          q.eq(q.field("isPublic"), true),
          q.eq(q.field("clinicId"), args.clinicId)
        )
      );
    } else {
      query = query.filter(q => q.eq(q.field("isPublic"), true));
    }

    const exercises = await query.collect();

    // Extract unique filter options
    const bodyParts = [...new Set(exercises.flatMap(ex => ex.bodyParts))].sort();
    const conditions = [...new Set(exercises.flatMap(ex => ex.conditions))].sort();
    const equipment = [...new Set(exercises.flatMap(ex => ex.equipmentNeeded))].sort();
    const targetMuscles = [...new Set(exercises.flatMap(ex => ex.targetMuscles))].sort();

    return {
      bodyParts,
      conditions,
      equipment,
      targetMuscles,
      difficulties: ["beginner", "intermediate", "advanced"],
    };
  },
});

/**
 * Create custom exercise for clinic
 */
export const createCustomExercise = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    instructions: v.array(v.string()),
    bodyParts: v.array(v.string()),
    targetMuscles: v.array(v.string()),
    conditions: v.array(v.string()),
    equipmentNeeded: v.array(v.string()),
    difficultyLevel: v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced")),
    defaultSets: v.number(),
    defaultReps: v.number(),
    defaultFrequency: v.string(),
    videoUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    precautions: v.optional(v.array(v.string())),
    contraindications: v.optional(v.array(v.string())),
    isPublic: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
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
      throw new Error("Only physiotherapists can create exercises");
    }

    const exerciseId = await ctx.db.insert("exercises", {
      name: args.name,
      description: args.description,
      instructions: args.instructions,
      bodyParts: args.bodyParts,
      targetMuscles: args.targetMuscles,
      secondaryMuscles: [],
      conditions: args.conditions,
      equipmentNeeded: args.equipmentNeeded,
      difficultyLevel: args.difficultyLevel,
      contraindications: args.contraindications || [],
      precautions: args.precautions || [],
      videoUrl: args.videoUrl,
      imageUrl: args.imageUrl,
      defaultSets: args.defaultSets,
      defaultReps: args.defaultReps,
      defaultDuration: undefined,
      defaultFrequency: args.defaultFrequency,
      createdBy: currentUser._id,
      isPublic: args.isPublic || false,
      clinicId: currentUser.clinicId,
      tags: args.tags || [],
      timesAssigned: 0,
      averageRating: 0,
    });

    return exerciseId;
  },
});

/**
 * Get exercise by ID with usage tracking
 */
export const getExerciseById = query({
  args: {
    exerciseId: v.id("exercises"),
  },
  handler: async (ctx, args) => {
    const exercise = await ctx.db.get(args.exerciseId);
    if (!exercise) {
      throw new Error("Exercise not found");
    }

    return exercise;
  },
});

/**
 * Update exercise usage statistics
 */
export const updateExerciseUsage = mutation({
  args: {
    exerciseId: v.id("exercises"),
    rating: v.optional(v.number()), // 1-5 rating from physiotherapist
  },
  handler: async (ctx, args) => {
    const exercise = await ctx.db.get(args.exerciseId);
    if (!exercise) {
      throw new Error("Exercise not found");
    }

    const updates: any = {
      timesAssigned: (exercise.timesAssigned || 0) + 1,
    };

    if (args.rating) {
      const currentRating = exercise.averageRating || 0;
      const currentCount = exercise.timesAssigned || 0;
      const newAverage = ((currentRating * currentCount) + args.rating) / (currentCount + 1);
      updates.averageRating = newAverage;
    }

    await ctx.db.patch(args.exerciseId, updates);

    return { success: true };
  },
});

/**
 * Bulk assign exercises to treatment plan
 */
export const bulkAssignExercises = mutation({
  args: {
    treatmentPlanId: v.id("treatmentPlans"),
    exercises: v.array(v.object({
      exerciseId: v.id("exercises"),
      phaseOrder: v.number(),
      sets: v.optional(v.number()),
      reps: v.optional(v.number()),
      frequency: v.optional(v.string()),
      notes: v.optional(v.string()),
    })),
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
      throw new Error("Only physiotherapists can assign exercises");
    }

    const treatmentPlan = await ctx.db.get(args.treatmentPlanId);
    if (!treatmentPlan) {
      throw new Error("Treatment plan not found");
    }

    if (treatmentPlan.physiotherapistId !== currentUser._id) {
      throw new Error("Access denied");
    }

    // Get current phases
    const currentPhases = [...treatmentPlan.phases];

    // Add exercises to appropriate phases
    for (const exerciseAssignment of args.exercises) {
      const exercise = await ctx.db.get(exerciseAssignment.exerciseId);
      if (!exercise) continue;

      // Find or create phase
      let targetPhase = currentPhases.find(p => p.order === exerciseAssignment.phaseOrder);
      if (!targetPhase) {
        targetPhase = {
          name: `Phase ${exerciseAssignment.phaseOrder}`,
          description: `Treatment phase ${exerciseAssignment.phaseOrder}`,
          duration: "2 weeks",
          order: exerciseAssignment.phaseOrder,
          exercises: []
        };
        currentPhases.push(targetPhase);
      }

      // Add exercise to phase
      targetPhase.exercises.push({
        exerciseId: exercise._id,
        sets: exerciseAssignment.sets || exercise.defaultSets,
        reps: exerciseAssignment.reps || exercise.defaultReps,
        frequency: exerciseAssignment.frequency || exercise.defaultFrequency,
        notes: exerciseAssignment.notes || exercise.description,
        duration: exercise.defaultDuration ? `${exercise.defaultDuration}s` : undefined,
      });

      // Update exercise usage
      await ctx.db.patch(exerciseAssignment.exerciseId, {
        timesAssigned: (exercise.timesAssigned || 0) + 1,
      });
    }

    // Sort phases by order
    currentPhases.sort((a, b) => a.order - b.order);

    // Update treatment plan
    await ctx.db.patch(args.treatmentPlanId, {
      phases: currentPhases,
      updatedAt: Date.now(),
      version: treatmentPlan.version + 1,
    });

    // Create version record for patient sync
    await ctx.db.insert("treatmentPlanVersions", {
      treatmentPlanId: args.treatmentPlanId,
      version: treatmentPlan.version + 1,
      changeType: "exercise_added",
      changedBy: currentUser._id,
      changeDescription: `Added ${args.exercises.length} exercise(s) to treatment plan`,
      previousData: { phases: treatmentPlan.phases },
      newData: { phases: currentPhases },
      timestamp: Date.now(),
      patientNotified: false,
    });

    // Send notification to patient
    await ctx.db.insert("notifications", {
      userId: treatmentPlan.patientId,
      type: "treatment_plan_updated",
      payload: {
        title: "New Exercises Added",
        body: `Your physiotherapist has added ${args.exercises.length} new exercise(s) to your treatment plan`,
        data: { treatmentPlanId: args.treatmentPlanId },
        link: `/dashboard/patient/treatment-plans`,
      },
      status: "pending",
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Get exercises by condition for quick filtering
 */
export const getExercisesByCondition = query({
  args: {
    condition: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const exercises = await ctx.db
      .query("exercises")
      .filter(q => q.eq(q.field("conditions"), [args.condition]))
      .take(args.limit || 20);

    return exercises;
  },
});

/**
 * Get popular exercises (most assigned)
 */
export const getPopularExercises = query({
  args: {
    clinicId: v.optional(v.id("clinics")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("exercises");
    
    if (args.clinicId) {
      query = query.filter(q => 
        q.or(
          q.eq(q.field("isPublic"), true),
          q.eq(q.field("clinicId"), args.clinicId)
        )
      );
    } else {
      query = query.filter(q => q.eq(q.field("isPublic"), true));
    }

    const exercises = await query.collect();
    
    // Sort by popularity (times assigned + rating)
    exercises.sort((a, b) => {
      const aScore = (a.timesAssigned || 0) * 0.6 + (a.averageRating || 0) * 0.4;
      const bScore = (b.timesAssigned || 0) * 0.6 + (b.averageRating || 0) * 0.4;
      return bScore - aScore;
    });

    return exercises.slice(0, args.limit || 10);
  },
});

/**
 * Rate an exercise (for improving recommendations)
 */
export const rateExercise = mutation({
  args: {
    exerciseId: v.id("exercises"),
    rating: v.number(), // 1-5
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const exercise = await ctx.db.get(args.exerciseId);
    if (!exercise) {
      throw new Error("Exercise not found");
    }

    // Update average rating
    const currentRating = exercise.averageRating || 0;
    const currentCount = exercise.timesAssigned || 1;
    const newAverage = ((currentRating * currentCount) + args.rating) / (currentCount + 1);

    await ctx.db.patch(args.exerciseId, {
      averageRating: newAverage,
    });

    return { success: true };
  },
});
