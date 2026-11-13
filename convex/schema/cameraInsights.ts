import { defineTable } from "convex/server";
import { v } from "convex/values";

export const cameraInsightTables = {
  // AI weekly summaries of a programme's camera-coach sessions (convex/cameraInsights.ts): a draft
  // for the physio to read, edit and copy into a note. Built from numbers only (no names, no patient
  // notes). Kept so the care team sees the last one without asking again; also the daily limit.
  cameraSummaries: defineTable({
    programId: v.id("exercisePrograms"),
    patientId: v.id("users"),
    requestedBy: v.id("users"),
    createdAt: v.number(),
    /** Sessions in the week summarised, and in the 60 days given as background */
    weekSessions: v.number(),
    totalSessions: v.number(),
    summary: v.object({
      headline: v.string(),
      points: v.array(
        v.object({
          text: v.string(),
          basis: v.string(),
          tone: v.union(v.literal("good"), v.literal("watch"), v.literal("concern")),
        })
      ),
      suggestions: v.array(v.string()),
    }),
    model: v.string(),
  })
    .index("by_program", ["programId", "createdAt"])
    .index("by_requester", ["requestedBy", "createdAt"]),
};
