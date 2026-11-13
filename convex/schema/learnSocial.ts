import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Rehabify Learn community rooms and Spaces (learnCommunity.ts, learnSpaces.ts). Owner 2026-11-12:
 * one community, but students only ever see Learn rooms; the approved-physio community
 * (communityPosts) stays separate and physio-only.
 */
export const learnSocialTables = {
  // A room: "open" for every Learn member, or "course" for one course's learners (made on first post)
  learnRooms: defineTable({
    slug: v.string(), // "student-lounge", "course-<courseId>", "msk-program"
    title: v.string(),
    description: v.optional(v.string()),
    kind: v.union(v.literal("open"), v.literal("course"), v.literal("program")),
    courseId: v.optional(v.id("learnVideoCourses")),
    order: v.number(),
    archived: v.optional(v.boolean()),
    postCount: v.number(),
    lastActivityAt: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_order", ["order"]),

  learnPosts: defineTable({
    roomId: v.id("learnRooms"),
    authorId: v.id("users"),
    kind: v.union(v.literal("question"), v.literal("discussion")),
    title: v.string(),
    body: v.string(),
    status: v.union(v.literal("open"), v.literal("hidden")),
    replyCount: v.number(),
    helpfulCount: v.number(),
    reportCount: v.number(),
    lastActivityAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_room_activity", ["roomId", "lastActivityAt"])
    .index("by_activity", ["lastActivityAt"])
    .index("by_author", ["authorId", "createdAt"]),

  learnReplies: defineTable({
    postId: v.id("learnPosts"),
    authorId: v.id("users"),
    body: v.string(),
    status: v.union(v.literal("open"), v.literal("hidden")),
    helpfulCount: v.number(),
    reportCount: v.number(),
    createdAt: v.number(),
  }).index("by_post", ["postId", "createdAt"]),

  // "Helpful" marks, one per person per post or reply
  learnHelpful: defineTable({
    userId: v.id("users"),
    targetType: v.union(v.literal("post"), v.literal("reply")),
    targetId: v.string(),
    createdAt: v.number(),
  }).index("by_user_target", ["userId", "targetType", "targetId"]),

  learnReports: defineTable({
    userId: v.id("users"),
    targetType: v.union(v.literal("post"), v.literal("reply")),
    targetId: v.string(),
    reason: v.string(),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_target", ["targetType", "targetId"])
    .index("by_open", ["resolvedAt", "createdAt"]),

  // A live audio room (Stream "audio_room" call). Hosts: admins and approved Rehabify physios.
  learnSpaces: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    hostId: v.id("users"),
    status: v.union(v.literal("scheduled"), v.literal("live"), v.literal("ended"), v.literal("cancelled")),
    scheduledFor: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    callId: v.string(), // Stream call id (audio_room:<callId>)
    peakListeners: v.optional(v.number()),
    reminderCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_status_time", ["status", "scheduledFor"])
    .index("by_created", ["createdAt"]),

  learnSpaceReminders: defineTable({
    spaceId: v.id("learnSpaces"),
    userId: v.id("users"),
    notifiedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_user_space", ["userId", "spaceId"]),

  // Who's on stage in a live Space: a raised hand, or a speaker the host invited up.
  // Listeners have no row. Stream enforces the microphone (send-audio is granted to speakers).
  learnSpaceSeats: defineTable({
    spaceId: v.id("learnSpaces"),
    userId: v.id("users"),
    streamUserId: v.string(), // Clerk id, the person's Stream user id
    state: v.union(v.literal("hand"), v.literal("speaker")),
    updatedAt: v.number(),
  })
    .index("by_space", ["spaceId", "updatedAt"])
    .index("by_space_user", ["spaceId", "userId"]),
};
