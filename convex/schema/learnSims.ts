import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Rehabify Learn clinical simulations (convex/learnSims.ts, engine in lib/learn/simulation/engine.ts).
 * Case definitions live in git (content/sim-cases/*.json) and are loaded here as drafts; a physio
 * signs off a version and an admin publishes it. Learners only ever play published snapshots.
 */
export const learnSimTables = {
  learnSimCases: defineTable({
    slug: v.string(),
    title: v.string(),
    order: v.number(),
    // The latest draft from the repo
    version: v.number(),
    definition: v.any(),
    signOff: v.optional(
      v.object({
        version: v.number(),
        reviewerName: v.string(),
        userId: v.id("users"),
        note: v.optional(v.string()),
        at: v.number(),
      })
    ),
    // What learners play
    published: v.optional(v.object({ version: v.number(), at: v.number(), by: v.id("users") })),
    plays: v.number(),
    completions: v.number(),
    passes: v.number(),
    scoreSum: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_order", ["order"]),

  // Immutable copy of every version an attempt can be played against
  learnSimVersions: defineTable({
    slug: v.string(),
    version: v.number(),
    definition: v.any(),
    createdAt: v.number(),
  }).index("by_slug_version", ["slug", "version"]),

  learnSimAttempts: defineTable({
    userId: v.id("users"),
    caseSlug: v.string(),
    version: v.number(),
    preview: v.boolean(), // a reviewer play-testing a draft: left out of stats
    state: v.any(),
    status: v.union(v.literal("active"), v.literal("finished"), v.literal("abandoned")),
    scorePct: v.optional(v.number()),
    passed: v.optional(v.boolean()),
    outcome: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_user_case", ["userId", "caseSlug", "startedAt"])
    .index("by_case", ["caseSlug", "startedAt"]),

  // One row per choice, for the admin's choice spread and drop-off
  learnSimEvents: defineTable({
    attemptId: v.id("learnSimAttempts"),
    caseSlug: v.string(),
    version: v.number(),
    nodeId: v.string(),
    choiceId: v.string(),
    clockSec: v.number(),
    preview: v.boolean(),
    at: v.number(),
  })
    .index("by_case", ["caseSlug", "at"])
    .index("by_attempt", ["attemptId"]),

  // "Sim Pass: get notified" (the Stage 1 demand test)
  learnSimInterest: defineTable({
    userId: v.id("users"),
    caseSlug: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
};
