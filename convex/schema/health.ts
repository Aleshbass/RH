import { defineTable } from "convex/server";
import { v } from "convex/values";

export const healthTables = {
  vitalSigns: defineTable({
    patientId: v.id("users"),
    heartRate: v.optional(v.number()),
    bloodPressure: v.optional(v.object({
      systolic: v.number(),
      diastolic: v.number(),
    })),
    temperature: v.optional(v.number()),
    oxygenSaturation: v.optional(v.number()),
    weight: v.optional(v.number()),
    height: v.optional(v.number()),
    recordedAt: v.number(),
    source: v.union(v.literal("manual"), v.literal("fitbit"), v.literal("device")),
  })
    .index("by_patient", ["patientId"])
    .index("by_patient_date", ["patientId", "recordedAt"]),

  medications: defineTable({
    patientId: v.id("users"),
    name: v.string(),
    dosage: v.string(),
    frequency: v.string(),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    instructions: v.optional(v.string()),
    isActive: v.boolean(),
    createdBy: v.id("users"), // physiotherapist or doctor
  })
    .index("by_patient", ["patientId"])
    .index("by_patient_active", ["patientId", "isActive"]),

  medicationLogs: defineTable({
    medicationId: v.id("medications"),
    patientId: v.id("users"),
    takenAt: v.number(),
    scheduledFor: v.number(),
    status: v.union(v.literal("taken"), v.literal("missed"), v.literal("delayed")),
    notes: v.optional(v.string()),
  })
    .index("by_patient", ["patientId"])
    .index("by_medication", ["medicationId"])
    .index("by_patient_date", ["patientId", "takenAt"]),

  symptomLogs: defineTable({
    patientId: v.id("users"),
    symptomType: v.string(),
    severity: v.number(), // 1-10 scale
    description: v.optional(v.string()),
    triggers: v.optional(v.array(v.string())),
    loggedAt: v.number(),
  })
    .index("by_patient", ["patientId"])
    .index("by_patient_date", ["patientId", "loggedAt"])
    .index("by_symptom_type", ["patientId", "symptomType"]),

  painLogs: defineTable({
    patientId: v.id("users"),
    painLevel: v.number(), // 1-10 scale
    location: v.string(),
    description: v.optional(v.string()),
    activities: v.optional(v.array(v.string())),
    loggedAt: v.number(),
  })
    .index("by_patient", ["patientId"])
    .index("by_patient_date", ["patientId", "loggedAt"]),

  fitbitData: defineTable({
    patientId: v.id("users"),
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
    syncedAt: v.number(),
    date: v.string(), // YYYY-MM-DD format
  })
    .index("by_patient", ["patientId"])
    .index("by_patient_date", ["patientId", "date"]),

  healthGoals: defineTable({
    patientId: v.id("users"),
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
    isActive: v.boolean(),
    createdBy: v.id("users"), // physiotherapist or patient
  })
    .index("by_patient", ["patientId"])
    .index("by_patient_active", ["patientId", "isActive"]),

  fitbitTokens: defineTable({
    patientId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    scope: v.string(),
    isActive: v.boolean(),
  })
    .index("by_patient", ["patientId"])
    .index("by_patient_active", ["patientId", "isActive"]),
};
