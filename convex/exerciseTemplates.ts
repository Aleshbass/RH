// @ts-nocheck
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser } from "./auth";

/**
 * Save an exercise as a template
 */
export const saveExerciseTemplate = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    videoUrl: v.optional(v.string()),
    youtubeId: v.optional(v.string()),
    sets: v.number(),
    reps: v.number(),
    duration: v.optional(v.string()),
    frequency: v.string(),
    instructions: v.array(v.string()),
    targetMuscles: v.array(v.string()),
    equipment: v.array(v.string()),
    difficulty: v.union(
      v.literal("beginner"),
      v.literal("intermediate"),
      v.literal("advanced")
    ),
    bodyParts: v.array(v.string()),
    conditions: v.array(v.string()),
    precautions: v.optional(v.array(v.string())),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist") throw new Error("Access denied");

    // Get physiotherapist profile for clinic context
    const physioProfile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();

    const templateId = await ctx.db.insert("exercises", {
      name: args.name,
      description: args.description,
      instructions: args.instructions,
      bodyParts: args.bodyParts,
      targetMuscles: args.targetMuscles,
      secondaryMuscles: [],
      conditions: args.conditions,
      equipmentNeeded: args.equipment,
      difficultyLevel: args.difficulty,
      contraindications: [],
      precautions: args.precautions,
      exerciseDbId: undefined,
      videoUrl: args.videoUrl,
      imageUrl: undefined,
      alternativeVideos: [],
      defaultSets: args.sets,
      defaultReps: args.reps,
      defaultDuration: undefined,
      defaultFrequency: args.frequency,
      createdBy: user._id,
      isPublic: args.isPublic,
      clinicId: physioProfile?.clinicId,
      tags: [],
      timesAssigned: 0,
      averageRating: undefined,
      media: args.videoUrl
        ? [{ type: "video" as const, url: args.videoUrl }]
        : undefined,
      translations: undefined,
    });

    return templateId;
  },
});

/**
 * Get my exercise templates (created by current physiotherapist)
 */
export const getMyExerciseTemplates = query({
  args: {
    search: v.optional(v.string()),
    difficulty: v.optional(v.string()),
    bodyPart: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist") throw new Error("Access denied");

    let templates = await ctx.db
      .query("exercises")
      .filter((q) => q.eq(q.field("createdBy"), user._id))
      .collect();

    // Apply filters
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(searchLower) ||
          t.description.toLowerCase().includes(searchLower)
      );
    }

    if (args.difficulty) {
      templates = templates.filter((t) => t.difficultyLevel === args.difficulty);
    }

    if (args.bodyPart) {
      templates = templates.filter((t) => t.bodyParts.includes(args.bodyPart));
    }

    return templates.sort((a, b) => (b.timesAssigned || 0) - (a.timesAssigned || 0));
  },
});

/**
 * Get shared/public exercise templates
 */
export const getPublicExerciseTemplates = query({
  args: {
    search: v.optional(v.string()),
    difficulty: v.optional(v.string()),
    bodyPart: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist") throw new Error("Access denied");

    let templates = await ctx.db
      .query("exercises")
      .filter((q) => q.eq(q.field("isPublic"), true))
      .collect();

    // Apply filters
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(searchLower) ||
          t.description.toLowerCase().includes(searchLower)
      );
    }

    if (args.difficulty) {
      templates = templates.filter((t) => t.difficultyLevel === args.difficulty);
    }

    if (args.bodyPart) {
      templates = templates.filter((t) => t.bodyParts.includes(args.bodyPart));
    }

    return templates.sort((a, b) => (b.timesAssigned || 0) - (a.timesAssigned || 0));
  },
});

/**
 * Get exercise template by ID
 */
export const getExerciseTemplate = query({
  args: { templateId: v.id("exercises") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist") throw new Error("Access denied");

    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    // Check access: must be public or created by current user
    if (!template.isPublic && template.createdBy !== user._id) {
      throw new Error("Access denied");
    }

    return template;
  },
});

/**
 * Update exercise template
 */
export const updateExerciseTemplate = mutation({
  args: {
    templateId: v.id("exercises"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    sets: v.optional(v.number()),
    reps: v.optional(v.number()),
    frequency: v.optional(v.string()),
    instructions: v.optional(v.array(v.string())),
    targetMuscles: v.optional(v.array(v.string())),
    equipment: v.optional(v.array(v.string())),
    difficulty: v.optional(
      v.union(
        v.literal("beginner"),
        v.literal("intermediate"),
        v.literal("advanced")
      )
    ),
    bodyParts: v.optional(v.array(v.string())),
    conditions: v.optional(v.array(v.string())),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist") throw new Error("Access denied");

    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    // Only creator can update
    if (template.createdBy !== user._id) {
      throw new Error("Only the creator can update this template");
    }

    const updates: any = {};
    if (args.name) updates.name = args.name;
    if (args.description) updates.description = args.description;
    if (args.videoUrl !== undefined) updates.videoUrl = args.videoUrl;
    if (args.sets) updates.defaultSets = args.sets;
    if (args.reps) updates.defaultReps = args.reps;
    if (args.frequency) updates.defaultFrequency = args.frequency;
    if (args.instructions) updates.instructions = args.instructions;
    if (args.targetMuscles) updates.targetMuscles = args.targetMuscles;
    if (args.equipment) updates.equipmentNeeded = args.equipment;
    if (args.difficulty) updates.difficultyLevel = args.difficulty;
    if (args.bodyParts) updates.bodyParts = args.bodyParts;
    if (args.conditions) updates.conditions = args.conditions;
    if (args.isPublic !== undefined) updates.isPublic = args.isPublic;

    await ctx.db.patch(args.templateId, updates);

    return { success: true };
  },
});

/**
 * Delete exercise template
 */
export const deleteExerciseTemplate = mutation({
  args: { templateId: v.id("exercises") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist") throw new Error("Access denied");

    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    // Only creator can delete
    if (template.createdBy !== user._id) {
      throw new Error("Only the creator can delete this template");
    }

    await ctx.db.delete(args.templateId);

    return { success: true };
  },
});

/**
 * Increment usage count when template is used
 */
export const incrementTemplateUsage = mutation({
  args: { templateId: v.id("exercises") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (user.role !== "physiotherapist") throw new Error("Access denied");

    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    await ctx.db.patch(args.templateId, {
      timesAssigned: (template.timesAssigned || 0) + 1,
    });

    return { success: true };
  },
});
