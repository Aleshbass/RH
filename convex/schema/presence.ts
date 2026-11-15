import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Who is on the platform right now (owner 2026-11-15: "how many users currently live and active,
 * really accurate"). Every open, visible tab sends a heartbeat (convex/presence.ts beat); the admin
 * Live now page counts the ones seen in the last 2 minutes.
 */
export const presenceTables = {
  // One row per browser (or per page view, for visitors who haven't allowed analytics)
  presenceSessions: defineTable({
    sid: v.string(),
    userId: v.optional(v.id("users")),
    kind: v.string(), // patient | physio | clinic | learner | admin | family | doctor | partner | team | new | visitor
    area: v.string(), // site | learn | patient | physio | clinic | admin | family | partner | call | blog
    device: v.string(), // phone | tablet | computer
    startedAt: v.number(),
    lastSeen: v.number(),
  })
    .index("by_sid", ["sid"])
    .index("by_lastSeen", ["lastSeen"]),

  // Who was active on each day (Lagos), for active today / 7 days / 30 days
  presenceDays: defineTable({
    day: v.string(), // "YYYY-MM-DD" Lagos
    key: v.string(), // "u:<userId>" or "d:<sid>"
    kind: v.string(),
    signedIn: v.boolean(),
    firstSeen: v.number(),
  })
    .index("by_day_key", ["day", "key"])
    .index("by_day", ["day"]),
};
