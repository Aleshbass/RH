import { defineTable } from "convex/server";
import { v } from "convex/values";
import { scribeDraftValidator } from "../helpers/scribeDraft";

export const scribeTables = {
  // The AI scribe (convex/scribe.ts): one recorded session or dictation, its transcript and the
  // AI's draft note. It stays here until the physio signs it (it then becomes a clinical note in
  // sessionLogs, with aiAssisted) or discards it, so patients, payouts and reports never see an
  // unsigned AI draft. Audio is never stored. Discarded and unsigned rows are deleted after 7 days.
  scribeSessions: defineTable({
    physiotherapistId: v.id("users"),
    patientId: v.id("users"),
    clinicId: v.optional(v.id("clinics")),
    /** The visit the note is for, when the physio started from one */
    appointmentId: v.optional(v.id("appointments")),
    source: v.union(v.literal("in_person"), v.literal("video_call"), v.literal("dictation")),
    /** The physio confirmed the patient agreed to the recording (always needed unless dictation) */
    consentRecorded: v.boolean(),
    consentAt: v.optional(v.number()),
    status: v.union(
      v.literal("recording"), // transcript still being built
      v.literal("draft"), // the AI has drafted a note; waiting for the physio
      v.literal("signed"), // the physio signed it: see noteId
      v.literal("discarded") // thrown away; transcript and draft already cleared
    ),
    transcript: v.string(),
    /** Seconds of audio transcribed, for the daily limit */
    audioSeconds: v.number(),
    /** Drafts asked for (Regenerate counts), for the daily limit */
    generations: v.number(),
    draft: v.optional(scribeDraftValidator),
    draftModel: v.optional(v.string()),
    draftAt: v.optional(v.number()),
    noteId: v.optional(v.id("sessionLogs")),
    createdAt: v.number(),
    updatedAt: v.number(),
    signedAt: v.optional(v.number()),
    discardedAt: v.optional(v.number()),
  })
    .index("by_physio_and_created", ["physiotherapistId", "createdAt"])
    .index("by_patient_and_physio", ["patientId", "physiotherapistId"])
    .index("by_status_and_updated", ["status", "updatedAt"]),

  // One-time "New" introductions a user has seen, one row per feature key (e.g. "rehabify_scribe"),
  // so each is shown once on any device. Any feature can use it.
  featureIntros: defineTable({
    userId: v.id("users"),
    key: v.string(),
    seenAt: v.number(),
  }).index("by_user_and_key", ["userId", "key"]),
};
