import { defineTable } from "convex/server";
import { v } from "convex/values";

/** lib/rewards/rules.ts RewardKind */
export const rewardKindValidator = v.union(
  v.literal("featured_profile"),
  v.literal("referral_boost"),
  v.literal("masterclass_seat"),
  v.literal("cpd_certificate"),
  v.literal("custom")
);

export const rewardTables = {
  // Every change to a physio's points: earned (with when they expire), spent, expired, or adjusted
  // by an admin with a reason. `dedupeKey` is unique, so the same event never pays twice.
  // Functions in rewards.ts, rules in lib/rewards/rules.ts.
  rewardLedger: defineTable({
    userId: v.id("users"),
    points: v.number(), // + earned, − spent or expired
    reason: v.string(), // EarnReason, or "spend", "expired", "adjust"
    label: v.string(), // What the physio sees in their list
    refType: v.optional(v.string()),
    refId: v.optional(v.string()),
    dedupeKey: v.string(),
    expiresAt: v.optional(v.number()), // Earned points only
    expiryDone: v.optional(v.boolean()), // The expiry run has dealt with this lot
    createdBy: v.optional(v.id("users")), // Admin adjustments
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_dedupe", ["dedupeKey"])
    .index("by_expiry", ["expiryDone", "expiresAt"]),

  // Running totals per physio, kept in step with the ledger.
  rewardAccounts: defineTable({
    userId: v.id("users"),
    balance: v.number(),
    earned12m: v.number(), // Sets the tier
    lifetime: v.number(),
    tier: v.string(), // TierKey
    cpdYear: v.number(),
    cpdMinutes: v.number(), // CPD logged in cpdYear
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_earned", ["earned12m"]),

  // What points can buy, set by admins.
  rewardItems: defineTable({
    kind: rewardKindValidator,
    title: v.string(),
    description: v.string(),
    cost: v.number(),
    durationDays: v.optional(v.number()), // Featured profile, referral boost
    stock: v.optional(v.number()), // Left to claim; unlimited when missing
    active: v.boolean(),
    sort: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_active", ["active", "sort"]),

  rewardRedemptions: defineTable({
    userId: v.id("users"),
    itemId: v.id("rewardItems"),
    kind: rewardKindValidator,
    title: v.string(),
    cost: v.number(),
    // active: running now (featured, boost) · pending: the team arranges it · fulfilled / cancelled / ended
    status: v.union(v.literal("active"), v.literal("pending"), v.literal("fulfilled"), v.literal("cancelled"), v.literal("ended")),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    note: v.optional(v.string()), // From the team to the physio
    handledBy: v.optional(v.id("users")),
    handledAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_status", ["status", "createdAt"]),

  // Learning a physio has done on Rehabify (Case of the Week, Learn sessions, masterclasses),
  // for their yearly CPD record. Not accredited CPD credit.
  cpdLog: defineTable({
    userId: v.id("users"),
    minutes: v.number(),
    source: v.string(), // "community_case", "learn_session", "masterclass", ...
    label: v.string(),
    refId: v.optional(v.string()),
    dedupeKey: v.string(),
    year: v.number(),
    createdAt: v.number(),
  })
    .index("by_user_year", ["userId", "year", "createdAt"])
    .index("by_dedupe", ["dedupeKey"]),
};
