import { v } from "convex/values";
import { query, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { findRelationship } from "./helpers/careAccess";

/** Patients see their own health data, physios only their own patients', admins everyone's. */
async function assertCanSeeHealth(ctx: QueryCtx | MutationCtx, user: Doc<"users">, patientId: Id<"users">) {
  if (user._id === patientId || user.role === "admin") return;
  if (user.role === "physiotherapist" && (await findRelationship(ctx, user._id, patientId))) return;
  throw new Error("Unauthorized");
}

// VITAL SIGNS QUERIES AND MUTATIONS

export const getPatientVitalSigns = query({
  args: { 
    patientId: v.id("users"),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    // Authorization: patient can view their own data, physiotherapists can view their patients' data
    await assertCanSeeHealth(ctx, user, args.patientId);

    return await ctx.db
      .query("vitalSigns")
      .withIndex("by_patient_date", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(args.limit || 10);
  },
});

export const addVitalSigns = mutation({
  args: {
    heartRate: v.optional(v.number()),
    bloodPressure: v.optional(v.object({
      systolic: v.number(),
      diastolic: v.number(),
    })),
    temperature: v.optional(v.number()),
    oxygenSaturation: v.optional(v.number()),
    weight: v.optional(v.number()),
    height: v.optional(v.number()),
    source: v.union(v.literal("manual"), v.literal("fitbit"), v.literal("device")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "patient") {
      throw new Error("Only patients can add vital signs");
    }

    return await ctx.db.insert("vitalSigns", {
      patientId: user._id,
      ...args,
      recordedAt: Date.now(),
    });
  },
});

// MEDICATION QUERIES AND MUTATIONS

export const getPatientMedications = query({
  args: { 
    patientId: v.id("users"),
    activeOnly: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    // Authorization check
    await assertCanSeeHealth(ctx, user, args.patientId);

    let query = ctx.db.query("medications").withIndex("by_patient", (q) => q.eq("patientId", args.patientId));
    
    if (args.activeOnly) {
      query = ctx.db.query("medications").withIndex("by_patient_active", (q) => 
        q.eq("patientId", args.patientId).eq("isActive", true)
      );
    }

    return await query.collect();
  },
});

export const addMedication = mutation({
  args: {
    patientId: v.id("users"),
    name: v.string(),
    dosage: v.string(),
    frequency: v.string(),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || !["physiotherapist", "patient"].includes(user.role || "")) {
      throw new Error("Unauthorized");
    }
    await assertCanSeeHealth(ctx, user, args.patientId);

    return await ctx.db.insert("medications", {
      ...args,
      isActive: true,
      createdBy: user._id,
    });
  },
});

export const getMedicationLogs = query({
  args: { 
    patientId: v.id("users"),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    await assertCanSeeHealth(ctx, user, args.patientId);

    return await ctx.db
      .query("medicationLogs")
      .withIndex("by_patient_date", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(args.limit || 20);
  },
});

export const logMedicationTaken = mutation({
  args: {
    medicationId: v.id("medications"),
    status: v.union(v.literal("taken"), v.literal("missed"), v.literal("delayed")),
    notes: v.optional(v.string()),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "patient") {
      throw new Error("Only patients can log medication");
    }

    const medication = await ctx.db.get(args.medicationId);
    if (!medication || medication.patientId !== user._id) {
      throw new Error("Medication not found or unauthorized");
    }

    return await ctx.db.insert("medicationLogs", {
      medicationId: args.medicationId,
      patientId: user._id,
      takenAt: Date.now(),
      scheduledFor: args.scheduledFor || Date.now(),
      status: args.status,
      notes: args.notes,
    });
  },
});

// SYMPTOM AND PAIN LOGGING

export const getSymptomLogs = query({
  args: { 
    patientId: v.id("users"),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    await assertCanSeeHealth(ctx, user, args.patientId);

    return await ctx.db
      .query("symptomLogs")
      .withIndex("by_patient_date", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(args.limit || 20);
  },
});

export const addSymptomLog = mutation({
  args: {
    symptomType: v.string(),
    severity: v.number(),
    description: v.optional(v.string()),
    triggers: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "patient") {
      throw new Error("Only patients can log symptoms");
    }

    return await ctx.db.insert("symptomLogs", {
      patientId: user._id,
      ...args,
      loggedAt: Date.now(),
    });
  },
});

export const getPainLogs = query({
  args: { 
    patientId: v.id("users"),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    await assertCanSeeHealth(ctx, user, args.patientId);

    return await ctx.db
      .query("painLogs")
      .withIndex("by_patient_date", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(args.limit || 20);
  },
});

export const addPainLog = mutation({
  args: {
    painLevel: v.number(),
    location: v.string(),
    description: v.optional(v.string()),
    activities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "patient") {
      throw new Error("Only patients can log pain");
    }

    return await ctx.db.insert("painLogs", {
      patientId: user._id,
      ...args,
      loggedAt: Date.now(),
    });
  },
});

// FITBIT DATA

export const getFitbitData = query({
  args: { 
    patientId: v.id("users"),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    await assertCanSeeHealth(ctx, user, args.patientId);

    return await ctx.db
      .query("fitbitData")
      .withIndex("by_patient_date", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(args.limit || 7); // Default to last 7 days
  },
});

export const syncFitbitData = mutation({
  args: {
    steps: v.number(),
    distance: v.number(),
    caloriesBurned: v.number(),
    activeMinutes: v.number(),
    heartRateZones: v.optional(v.object({
      fatBurn: v.number(),
      cardio: v.number(),
      peak: v.number(),
    })),
    sleepData: v.optional(v.object({
      totalMinutes: v.number(),
      efficiency: v.number(),
      stages: v.object({
        deep: v.number(),
        light: v.number(),
        rem: v.number(),
        wake: v.number(),
      }),
    })),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "patient") {
      throw new Error("Only patients can sync Fitbit data");
    }

    // Check if data for this date already exists
    const existing = await ctx.db
      .query("fitbitData")
      .withIndex("by_patient_date", (q) => q.eq("patientId", user._id).eq("date", args.date))
      .unique();

    if (existing) {
      // Update existing record
      return await ctx.db.patch(existing._id, {
        ...args,
        syncedAt: Date.now(),
      });
    } else {
      // Create new record
      return await ctx.db.insert("fitbitData", {
        patientId: user._id,
        ...args,
        syncedAt: Date.now(),
      });
    }
  },
});

// HEALTH GOALS

export const getHealthGoals = query({
  args: { 
    patientId: v.id("users"),
    activeOnly: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    await assertCanSeeHealth(ctx, user, args.patientId);

    let query = ctx.db.query("healthGoals").withIndex("by_patient", (q) => q.eq("patientId", args.patientId));
    
    if (args.activeOnly) {
      query = ctx.db.query("healthGoals").withIndex("by_patient_active", (q) => 
        q.eq("patientId", args.patientId).eq("isActive", true)
      );
    }

    return await query.collect();
  },
});

export const addHealthGoal = mutation({
  args: {
    type: v.union(
      v.literal("steps"),
      v.literal("weight"),
      v.literal("pain_reduction"),
      v.literal("medication_adherence")
    ),
    title: v.string(),
    target: v.number(),
    current: v.number(),
    unit: v.string(),
    deadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "patient") {
      throw new Error("Only patients can create health goals");
    }

    return await ctx.db.insert("healthGoals", {
      patientId: user._id,
      ...args,
      isActive: true,
      createdBy: user._id,
    });
  },
});

export const updateHealthGoalProgress = mutation({
  args: {
    goalId: v.id("healthGoals"),
    current: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "patient") {
      throw new Error("Only patients can update their goals");
    }

    const goal = await ctx.db.get(args.goalId);
    if (!goal || goal.patientId !== user._id) {
      throw new Error("Goal not found or unauthorized");
    }

    return await ctx.db.patch(args.goalId, {
      current: args.current,
    });
  },
});

// HEALTH DASHBOARD STATS

export const getHealthDashboardStats = query({
  args: { patientId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    await assertCanSeeHealth(ctx, user, args.patientId);

    // Get latest Fitbit data
    const latestFitbit = await ctx.db
      .query("fitbitData")
      .withIndex("by_patient_date", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .first();

    // Get latest vital signs
    const latestVitals = await ctx.db
      .query("vitalSigns")
      .withIndex("by_patient_date", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .first();

    // Get recent pain logs for average
    const recentPainLogs = await ctx.db
      .query("painLogs")
      .withIndex("by_patient_date", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(7); // Last 7 entries

    // Calculate medication adherence
    const recentMedLogs = await ctx.db
      .query("medicationLogs")
      .withIndex("by_patient_date", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(30); // Last 30 entries

    const adherenceRate = recentMedLogs.length > 0 
      ? (recentMedLogs.filter(log => log.status === "taken").length / recentMedLogs.length) * 100
      : 0;

    const avgPainLevel = recentPainLogs.length > 0
      ? recentPainLogs.reduce((sum, log) => sum + log.painLevel, 0) / recentPainLogs.length
      : 0;

    return {
      todaySteps: latestFitbit?.steps || 0,
      stepGoal: 10000, // Could be from health goals
      avgHeartRate: latestVitals?.heartRate || 0,
      medicationAdherence: Math.round(adherenceRate),
      painLevel: Math.round(avgPainLevel * 10) / 10,
      lastSync: latestFitbit?.syncedAt || Date.now(),
    };
  },
});
