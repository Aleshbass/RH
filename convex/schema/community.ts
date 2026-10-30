import { defineTable } from "convex/server";
import { v } from "convex/values";

export const communityTables = {
  // Clinician Community (community.ts): the weekly case set by a case lead, and open questions
  // any approved physio can ask. Patients are never named: the author confirms it's anonymised
  // and identifiers are refused (lib/community/privacy.ts).
  communityPosts: defineTable({
    kind: v.union(v.literal("case"), v.literal("question")),
    authorId: v.id("users"),
    title: v.string(),
    body: v.string(),
    bodyRegion: v.optional(v.string()), // lib/outcomes/stats.ts Region
    needsSenior: v.optional(v.boolean()), // "Needs a senior view"
    status: v.union(v.literal("open"), v.literal("closed"), v.literal("hidden")),
    // Case of the Week
    caseNumber: v.optional(v.number()),
    closesAt: v.optional(v.number()),
    pollOptions: v.optional(v.array(v.object({ key: v.string(), label: v.string() }))),
    reveal: v.optional(v.object({ answer: v.string(), teaching: v.string(), at: v.number() })),
    cpdMinutes: v.optional(v.number()),
    anonymisedAt: v.number(), // The author ticked the anonymisation statement
    answerCount: v.number(),
    helpfulCount: v.number(), // Answers marked helpful
    lastActivityAt: v.number(),
    hiddenBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_kind", ["kind", "lastActivityAt"])
    .index("by_kind_and_status", ["kind", "status", "lastActivityAt"])
    .index("by_author", ["authorId", "createdAt"])
    .index("by_status_and_close", ["status", "closesAt"]),

  communityAnswers: defineTable({
    postId: v.id("communityPosts"),
    authorId: v.id("users"),
    body: v.string(),
    usefulCount: v.number(),
    markedHelpfulAt: v.optional(v.number()),
    markedHelpfulBy: v.optional(v.id("users")),
    hidden: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_post", ["postId", "createdAt"])
    .index("by_author", ["authorId", "createdAt"]),

  // One per person per thing: a poll vote on a case, or "found this useful" on an answer.
  communityVotes: defineTable({
    postId: v.id("communityPosts"),
    answerId: v.optional(v.id("communityAnswers")),
    userId: v.id("users"),
    kind: v.union(v.literal("poll"), v.literal("useful")),
    option: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_post_and_user", ["postId", "userId", "kind"])
    .index("by_answer_and_user", ["answerId", "userId"])
    .index("by_post_and_kind", ["postId", "kind"]),

  communityReports: defineTable({
    postId: v.id("communityPosts"),
    answerId: v.optional(v.id("communityAnswers")),
    by: v.id("users"),
    reason: v.string(),
    status: v.union(v.literal("open"), v.literal("hidden"), v.literal("dismissed")),
    handledBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_post", ["postId"]),

  // Case leads publish the Case of the Week and mark helpful answers; moderators can hide posts.
  communityRoles: defineTable({
    userId: v.id("users"),
    role: v.union(v.literal("lead"), v.literal("moderator")),
    grantedBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
};
