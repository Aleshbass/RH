import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Home-visit safety (homeVisitSafety.ts, owner 2026-11-14). A physio going to a patient's home
 * taps "On my way", checks in at the door with the patient's 4-digit code, and taps "Left safely".
 * A visit that runs over gets an "Are you OK?" check; no answer alerts the care team. The help
 * button raises an alert straight away.
 */
export const visitSafetyTables = {
  // One home visit's safety record, made when the physio taps "On my way"
  homeVisitSafety: defineTable({
    appointmentId: v.id("appointments"),
    physiotherapistId: v.id("users"),
    patientId: v.id("users"),
    // The patient gives this to the physio at the door, after checking their face against the photo
    doorCode: v.string(),
    // Unguessable link token for the "who's at your door" page (/visit/<token>), no sign-in needed
    publicToken: v.string(),
    stage: v.union(v.literal("on_the_way"), v.literal("arrived"), v.literal("left")),
    onTheWayAt: v.number(),
    arrivedAt: v.optional(v.number()),
    leftAt: v.optional(v.number()),
    // Who closed it: the physio, their next visit starting, the care team, or the 24-hour sweep
    leftBy: v.optional(v.union(v.literal("physio"), v.literal("next_visit"), v.literal("care_team"), v.literal("auto"))),
    // When the visit should be over: the appointment's end, later if they arrived late or asked for more time
    expectedEndAt: v.number(),
    extensions: v.optional(v.number()),
    // How they got in: with the patient's code, or without it (with a reason the care team sees)
    doorCheck: v.optional(v.union(v.literal("code"), v.literal("skipped"))),
    doorSkipReason: v.optional(v.string()),
    codeAttempts: v.number(),
    // Positions from the physio's phone (kept 30 days, then cleared by the purge cron)
    arrivedLat: v.optional(v.number()),
    arrivedLng: v.optional(v.number()),
    leftLat: v.optional(v.number()),
    leftLng: v.optional(v.number()),
    lastLat: v.optional(v.number()),
    lastLng: v.optional(v.number()),
    lastAccuracy: v.optional(v.number()),
    lastPingAt: v.optional(v.number()),
    // Overdue checks: "check_sent" = the physio was asked "Are you OK?"; "escalated" = the care team was alerted
    check: v.union(v.literal("ok"), v.literal("check_sent"), v.literal("escalated")),
    checkSentAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_appointment", ["appointmentId"])
    .index("by_token", ["publicToken"])
    .index("by_physio_and_stage", ["physiotherapistId", "stage"])
    .index("by_patient_and_stage", ["patientId", "stage"])
    .index("by_stage_and_expected_end", ["stage", "expectedEndAt"]),

  // A call for help: the physio's help button, or a visit that ran over with no answer
  safetyAlerts: defineTable({
    kind: v.union(v.literal("panic"), v.literal("overdue")),
    status: v.union(v.literal("open"), v.literal("handling"), v.literal("resolved")),
    physiotherapistId: v.id("users"),
    visitId: v.optional(v.id("homeVisitSafety")),
    appointmentId: v.optional(v.id("appointments")),
    patientId: v.optional(v.id("users")),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    accuracy: v.optional(v.number()),
    locatedAt: v.optional(v.number()),
    // The physio pressed "I'm safe" afterwards (a help alert still needs a person to close it)
    physioSafeAt: v.optional(v.number()),
    handledBy: v.optional(v.id("users")),
    handledAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    resolution: v.optional(v.string()),
    falseAlarm: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_physio", ["physiotherapistId", "createdAt"])
    .index("by_visit", ["visitId"]),
};
