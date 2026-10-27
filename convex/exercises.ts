import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureUserRole } from "./auth";

// Create a new exercise
export const createExercise = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    instructions: v.array(v.string()),
    bodyParts: v.array(v.string()),
    targetMuscles: v.array(v.string()),
    secondaryMuscles: v.optional(v.array(v.string())),
    conditions: v.array(v.string()),
    equipmentNeeded: v.array(v.string()),
    difficultyLevel: v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced")),
    contraindications: v.optional(v.array(v.string())),
    precautions: v.optional(v.array(v.string())),
    videoUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    alternativeVideos: v.optional(v.array(v.string())),
    defaultSets: v.number(),
    defaultReps: v.number(),
    defaultDuration: v.optional(v.number()),
    defaultFrequency: v.string(),
    isPublic: v.boolean(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // The exercise library is managed from the admin dashboard only.
    await ensureUserRole(ctx, ["admin"]);

    // In a real app, we'd check for admin role here
    // const user = await ctx.db.query("users").withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject)).unique();
    // if (user?.role !== "admin") throw new Error("Unauthorized");

    const exerciseId = await ctx.db.insert("exercises", {
      ...args,
      createdBy: undefined, // We can link to user if needed, but schema says optional
    });

    return exerciseId;
  },
});

// List exercises with optional filtering
export const listExercises = query({
  args: {
    bodyPart: v.optional(v.string()),
    difficulty: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // A physio's own exercises are private to them (and their clinic team); removed ones are hidden
    const identity = await ctx.auth.getUserIdentity();
    const viewer = identity
      ? await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject)).unique()
      : null;
    let exercises = (await ctx.db.query("exercises").collect())
      .filter(
        (ex) =>
          !ex.archivedAt &&
          (!ex.createdBy ||
            ex.isPublic ||
            ex.createdBy === viewer?._id ||
            (ex.clinicId !== undefined && ex.clinicId === viewer?.clinicId))
      )
      // File details stay on the server; links come from exerciseLibrary.requestExerciseMediaLinks
      .map(({ ownMedia: _ownMedia, ...ex }) => ex);

    if (args.bodyPart) {
      exercises = exercises.filter(ex => ex.bodyParts.includes(args.bodyPart!));
    }

    if (args.difficulty) {
      exercises = exercises.filter(ex => ex.difficultyLevel === args.difficulty);
    }

    if (args.search) {
      const searchLower = args.search.toLowerCase();
      exercises = exercises.filter(ex =>
        ex.name.toLowerCase().includes(searchLower) ||
        ex.description.toLowerCase().includes(searchLower)
      );
    }

    return exercises;
  },
});

// Update an exercise
export const updateExercise = mutation({
  args: {
    id: v.id("exercises"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    instructions: v.optional(v.array(v.string())),
    bodyParts: v.optional(v.array(v.string())),
    targetMuscles: v.optional(v.array(v.string())),
    secondaryMuscles: v.optional(v.array(v.string())),
    conditions: v.optional(v.array(v.string())),
    equipmentNeeded: v.optional(v.array(v.string())),
    difficultyLevel: v.optional(v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced"))),
    contraindications: v.optional(v.array(v.string())),
    precautions: v.optional(v.array(v.string())),
    videoUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    defaultSets: v.optional(v.number()),
    defaultReps: v.optional(v.number()),
    defaultDuration: v.optional(v.number()),
    defaultFrequency: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

// Delete an exercise
export const deleteExercise = mutation({
  args: {
    id: v.id("exercises"),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    await ctx.db.delete(args.id);
  },
});

// Get a single exercise by ID
export const getExercise = query({
  args: {
    id: v.id("exercises"),
  },
  handler: async (ctx, args) => {
    const exercise = await ctx.db.get(args.id);
    if (!exercise) return null;
    // File details stay on the server; links come from exerciseLibrary.requestExerciseMediaLinks
    const { ownMedia: _ownMedia, ...rest } = exercise;
    return rest;
  },
});

// Get multiple exercises by IDs
export const getExercisesByIds = query({
  args: {
    ids: v.array(v.string()), // Using string to be safe, will cast to ID if possible
  },
  handler: async (ctx, args) => {
    const exercises = [];
    for (const id of args.ids) {
      // Skip if not a valid ID format (though we expect valid IDs from new system)
      try {
        // We need to check if it looks like a valid ID or just query all and filter?
        // db.get needs a valid ID. 
        // Let's try to normalize.
        const exercise = await ctx.db.query("exercises")
          .filter(q => q.eq(q.field("_id"), id))
          .first();

        if (exercise) {
          const { ownMedia: _ownMedia, ...rest } = exercise;
          exercises.push(rest);
        }
      } catch (e) {
        // Ignore invalid IDs
      }
    }
    return exercises;
  },
});
