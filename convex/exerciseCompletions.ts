import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Log an exercise completion by a patient
 */
export const logExerciseCompletion = mutation({
    args: {
        treatmentPlanId: v.id("treatmentPlans"),
        phaseOrder: v.number(),
        exerciseId: v.string(),
        setsCompleted: v.number(),
        repsCompleted: v.number(),
        durationSeconds: v.optional(v.number()),
        difficultyRating: v.optional(v.number()),
        painLevel: v.optional(v.number()),
        notes: v.optional(v.string()),
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
            throw new Error("Only patients can log exercise completions");
        }

        // Get the treatment plan to ensure patient has access and get physiotherapist ID
        const treatmentPlan = await ctx.db.get(args.treatmentPlanId);
        if (!treatmentPlan) {
            throw new Error("Treatment plan not found");
        }

        if (treatmentPlan.patientId !== user._id) {
            throw new Error("This treatment plan does not belong to you");
        }

        // Create the completion record
        const completionId = await ctx.db.insert("exerciseCompletions", {
            treatmentPlanId: args.treatmentPlanId,
            patientId: user._id,
            physiotherapistId: treatmentPlan.physiotherapistId,
            phaseOrder: args.phaseOrder,
            exerciseId: args.exerciseId,
            completedAt: Date.now(),
            setsCompleted: args.setsCompleted,
            repsCompleted: args.repsCompleted,
            durationSeconds: args.durationSeconds,
            difficultyRating: args.difficultyRating,
            painLevel: args.painLevel,
            notes: args.notes,
            completionSource: "web",
        });

        return { success: true, completionId };
    },
});

/**
 * Get all completions for a patient's treatment plan
 */
export const getPatientCompletions = query({
    args: {
        treatmentPlanId: v.id("treatmentPlans"),
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

        if (!user) {
            throw new Error("User not found");
        }

        // Verify access to treatment plan
        const treatmentPlan = await ctx.db.get(args.treatmentPlanId);
        if (!treatmentPlan) {
            throw new Error("Treatment plan not found");
        }

        if (
            treatmentPlan.patientId !== user._id &&
            treatmentPlan.physiotherapistId !== user._id
        ) {
            throw new Error("Access denied");
        }

        const completions = await ctx.db
            .query("exerciseCompletions")
            .withIndex("by_patient_and_plan", (q) =>
                q
                    .eq("patientId", treatmentPlan.patientId)
                    .eq("treatmentPlanId", args.treatmentPlanId)
            )
            .order("desc")
            .take(args.limit || 100);

        return completions;
    },
});

/**
 * Get today's completed exercises for a patient
 */
export const getTodayProgress = query({
    args: {
        treatmentPlanId: v.id("treatmentPlans"),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            return [];
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user) {
            return [];
        }

        // Get start of today
        const now = new Date();
        const startOfDay = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        ).getTime();

        const completions = await ctx.db
            .query("exerciseCompletions")
            .withIndex("by_patient_and_plan", (q) =>
                q.eq("patientId", user._id).eq("treatmentPlanId", args.treatmentPlanId)
            )
            .filter((q) => q.gte(q.field("completedAt"), startOfDay))
            .collect();

        return completions;
    },
});

/**
 * Get completion history for a specific exercise
 */
export const getExerciseHistory = query({
    args: {
        treatmentPlanId: v.id("treatmentPlans"),
        exerciseId: v.string(),
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

        if (!user) {
            throw new Error("User not found");
        }

        const completions = await ctx.db
            .query("exerciseCompletions")
            .withIndex("by_exercise", (q) => q.eq("exerciseId", args.exerciseId))
            .filter((q) =>
                q.and(
                    q.eq(q.field("treatmentPlanId"), args.treatmentPlanId),
                    q.or(
                        q.eq(q.field("patientId"), user._id),
                        q.eq(q.field("physiotherapistId"), user._id)
                    )
                )
            )
            .order("desc")
            .take(args.limit || 30);

        return completions;
    },
});

/**
 * Get weekly progress summary
 */
export const getWeeklyProgress = query({
    args: {
        treatmentPlanId: v.id("treatmentPlans"),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            return { completions: [], totalExercises: 0, completionRate: 0 };
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user) {
            return { completions: [], totalExercises: 0, completionRate: 0 };
        }

        // Get treatment plan
        const treatmentPlan = await ctx.db.get(args.treatmentPlanId);
        if (!treatmentPlan) {
            return { completions: [], totalExercises: 0, completionRate: 0 };
        }

        // The patient, their physiotherapist, the plan's clinic owner or an admin may look
        let allowed = user._id === treatmentPlan.patientId || user._id === treatmentPlan.physiotherapistId || user.role === "admin";
        if (!allowed && treatmentPlan.clinicId) {
            const clinic = await ctx.db.get(treatmentPlan.clinicId);
            allowed = clinic?.ownerId === user._id;
        }
        if (!allowed) {
            return { completions: [], totalExercises: 0, completionRate: 0 };
        }

        // Get start of week (7 days ago)
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

        // Always the plan's patient, so the physio sees the patient's activity, not their own
        const completions = await ctx.db
            .query("exerciseCompletions")
            .withIndex("by_patient_and_plan", (q) =>
                q.eq("patientId", treatmentPlan.patientId).eq("treatmentPlanId", args.treatmentPlanId)
            )
            .filter((q) => q.gte(q.field("completedAt"), weekAgo))
            .collect();

        // Calculate total exercises in plan
        const totalExercises = treatmentPlan.phases.reduce(
            (acc, phase) => acc + phase.exercises.length,
            0
        );

        // Calculate expected completions (exercises * 7 days, assuming daily frequency)
        const expectedCompletions = totalExercises * 7;
        const actualCompletions = completions.length;
        const completionRate =
            expectedCompletions > 0
                ? (actualCompletions / expectedCompletions) * 100
                : 0;

        return {
            completions,
            totalExercises,
            completionRate: Math.min(100, completionRate), // Cap at 100%
            expectedCompletions,
            actualCompletions,
        };
    },
});

/**
 * Get adherence rate (percentage of prescribed exercises completed)
 */
export const getAdherenceRate = query({
    args: {
        treatmentPlanId: v.id("treatmentPlans"),
        days: v.optional(v.number()), // Number of days to look back (default: 7)
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            return 0;
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user) {
            return 0;
        }

        const treatmentPlan = await ctx.db.get(args.treatmentPlanId);
        if (!treatmentPlan) {
            return 0;
        }

        const daysToLookBack = args.days || 7;
        const startDate = Date.now() - daysToLookBack * 24 * 60 * 60 * 1000;

        const completions = await ctx.db
            .query("exerciseCompletions")
            .withIndex("by_patient_and_plan", (q) =>
                q.eq("patientId", user._id).eq("treatmentPlanId", args.treatmentPlanId)
            )
            .filter((q) => q.gte(q.field("completedAt"), startDate))
            .collect();

        // Count total prescribed exercises
        const totalExercises = treatmentPlan.phases.reduce(
            (acc, phase) => acc + phase.exercises.length,
            0
        );

        if (totalExercises === 0) return 0;

        // Expected completions = exercises per day * days
        const expectedCompletions = totalExercises * daysToLookBack;
        const actualCompletions = completions.length;

        const adherenceRate = (actualCompletions / expectedCompletions) * 100;
        return Math.min(100, Math.round(adherenceRate)); // Cap at 100% and round
    },
});

/**
 * Get completion streak (consecutive days with at least one exercise completed)
 */
export const getCompletionStreak = query({
    args: {
        treatmentPlanId: v.id("treatmentPlans"),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            return { currentStreak: 0, longestStreak: 0 };
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique();

        if (!user) {
            return { currentStreak: 0, longestStreak: 0 };
        }

        const completions = await ctx.db
            .query("exerciseCompletions")
            .withIndex("by_patient_and_plan", (q) =>
                q.eq("patientId", user._id).eq("treatmentPlanId", args.treatmentPlanId)
            )
            .order("desc")
            .collect();

        if (completions.length === 0) {
            return { currentStreak: 0, longestStreak: 0 };
        }

        // Group completions by day
        const completionDays = new Set<string>();
        completions.forEach((completion) => {
            const date = new Date(completion.completedAt);
            const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            completionDays.add(dayKey);
        });

        // Calculate current streak
        let currentStreak = 0;
        const today = new Date();
        const checkDate = new Date(today);

        while (true) {
            const dayKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
            if (completionDays.has(dayKey)) {
                currentStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }

        // For longest streak, we'd need more complex logic
        // For now, return current streak as longest
        return { currentStreak, longestStreak: currentStreak };
    },
});
