import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Rehabify Learn points (rules in lib/learn/points.ts, functions in convex/learnPoints.ts).
 * Separate from the physio rewards ledger (rewardLedger): Learn points are earned by everyone who
 * learns (students and physios) and drive badges and the monthly leaderboard.
 */
export const learnPointsTables = {
  // Every award. `key` is unique, so the same event never pays twice (a removed "helpful" mark
  // deletes its row and takes the points back).
  learnPointsLedger: defineTable({
    userId: v.id("users"),
    points: v.number(),
    reason: v.string(), // LearnEarnReason
    label: v.string(), // What the learner sees in their activity
    key: v.string(),
    month: v.string(), // "YYYY-MM" Lagos
    day: v.string(), // "YYYY-MM-DD" Lagos
    createdAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_day", ["userId", "day"]),

  // Running totals, counts for badges, the streak, and whether they show on the leaderboard.
  learnPointsAccounts: defineTable({
    userId: v.id("users"),
    total: v.number(),
    counts: v.record(v.string(), v.number()),
    streak: v.number(),
    bestStreak: v.number(),
    lastDay: v.optional(v.string()),
    hidden: v.optional(v.boolean()), // "Hide me from the leaderboard"
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_total", ["total"]),

  // Points per learner per month: the monthly leaderboard reads this, highest first.
  learnPointsMonthly: defineTable({
    month: v.string(),
    userId: v.id("users"),
    points: v.number(),
    updatedAt: v.number(),
  })
    .index("by_month_points", ["month", "points"])
    .index("by_month_user", ["month", "userId"]),

  learnBadges: defineTable({
    userId: v.id("users"),
    badge: v.string(), // LearnBadgeId
    detail: v.optional(v.string()), // e.g. "#3 in November 2026"
    earnedAt: v.number(),
  })
    .index("by_user", ["userId", "earnedAt"])
    .index("by_user_badge", ["userId", "badge"]),

  // A month's top learners, frozen when the month closes (admins contact them privately).
  learnLeaderboardMonths: defineTable({
    month: v.string(),
    top: v.array(v.object({ userId: v.id("users"), points: v.number(), rank: v.number() })),
    closedAt: v.number(),
    contacted: v.optional(v.array(v.id("users"))),
  }).index("by_month", ["month"]),
};
