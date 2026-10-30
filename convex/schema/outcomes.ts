import { defineTable } from "convex/server";
import { v } from "convex/values";

/** lib/outcomes/moments.ts OutcomeMoment */
export const outcomeMomentValidator = v.union(
  v.literal("intake"),
  v.literal("pre_session"),
  v.literal("post_session"),
  v.literal("check_in"),
  v.literal("discharge")
);

export const outcomeTables = {
  // "How are you?" asked at set moments of a course of care: before treatment starts, around each
  // visit, weekly in between, and at discharge (with a rating and feedback). Sent automatically as
  // a one-tap link (/o/<token>, no sign-in) by email, phone notification and, later, WhatsApp; or
  // typed in by the physio. Functions in outcomes.ts, maths in lib/outcomes/stats.ts.
  outcomeChecks: defineTable({
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    clinicId: v.optional(v.id("clinics")),
    episodeId: v.optional(v.id("careEpisodes")),
    appointmentId: v.optional(v.id("appointments")), // The visit it's about (before / after)
    moment: outcomeMomentValidator,
    status: v.union(v.literal("pending"), v.literal("answered"), v.literal("expired")),
    // Only the link token's SHA-256 hash is kept
    tokenHash: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    sentVia: v.array(v.string()), // "email", "app", "whatsapp"
    // Answers. Patient-reported answers can't be edited by anyone; the physio's are labelled.
    answeredBy: v.optional(v.union(v.literal("patient"), v.literal("physio"))),
    enteredBy: v.optional(v.id("users")), // The physio who typed it in
    pain: v.optional(v.number()), // 0-10
    functionScore: v.optional(v.number()), // 0-10, how well they manage daily activities
    goalActivity: v.optional(v.string()), // What they want to get back to (asked at the start)
    goalScore: v.optional(v.number()), // 0-10, how well they can do it now
    globalChange: v.optional(v.number()), // -3..3 compared with when they started (discharge)
    rating: v.optional(v.number()), // 1-5, how their care was (discharge)
    feedback: v.optional(v.string()), // In their own words (discharge)
    // The patient let their words be shared (lib/outcomes/moments.ts SHARE_CONSENT_TEXT)
    shareConsentAt: v.optional(v.number()),
    shareConsentVersion: v.optional(v.string()),
    shareRevokedAt: v.optional(v.number()),
    // Feedback cards the physio made from these words (outcomes.ts), and Rehabify featuring them on its website
    cardShares: v.optional(v.number()),
    featuredOnSite: v.optional(v.boolean()),
    answeredAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token", ["tokenHash"])
    .index("by_patient", ["patientId", "createdAt"])
    .index("by_physiotherapist", ["physiotherapistId", "createdAt"])
    .index("by_episode", ["episodeId", "createdAt"])
    .index("by_appointment", ["appointmentId"])
    .index("by_status_and_expiry", ["status", "expiresAt"])
    .index("by_featured", ["featuredOnSite"]),

  // A physio's outcome figures across their courses of care, worked out again after every answer
  // and discharge (lib/outcomes/stats.ts summarise). The physio chooses whether it shows publicly.
  outcomeSummaries: defineTable({
    physiotherapistId: v.id("users"),
    summary: v.any(), // OutcomeSummary
    showOnProfile: v.boolean(),
    updatedAt: v.number(),
  }).index("by_physiotherapist", ["physiotherapistId"]),
};
