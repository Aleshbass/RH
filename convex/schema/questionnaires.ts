import { defineTable } from "convex/server";
import { v } from "convex/values";

/** One answer per item: the value, -1 for "doesn't apply", null when left blank (lib/questionnaires/types.ts). */
export const questionnaireAnswersValidator = v.array(v.union(v.number(), v.null()));

/** PSFS: the patient's own activities, each rated 0–10. */
export const psfsActivitiesValidator = v.array(v.object({ activity: v.string(), score: v.union(v.number(), v.null()) }));

/** Scores worked out on the server when the questionnaire is completed (lib/questionnaires/scoring.ts). */
export const questionnaireScoresValidator = v.object({
  total: v.union(v.number(), v.null()),
  subscales: v.array(v.object({ key: v.string(), label: v.string(), value: v.union(v.number(), v.null()) })),
  answered: v.number(),
  missing: v.number(),
});

export const questionnaireTables = {
  // Outcome questionnaires (LEFS, SPADI, KOOS-12, HOOS-12, PSFS, NPRS) a physio asks a patient to
  // fill in, usually before a visit, or types in from a paper form at the visit. Wording and
  // scoring live in lib/questionnaires; functions in questionnaires.ts. One row per questionnaire.
  patientQuestionnaires: defineTable({
    patientId: v.id("users"),
    physiotherapistId: v.id("users"), // Who asked for it (or entered it)
    clinicId: v.optional(v.id("clinics")),
    episodeId: v.optional(v.id("careEpisodes")),
    appointmentId: v.optional(v.id("appointments")), // The visit it's for
    instrument: v.string(), // InstrumentKey in lib/questionnaires/types.ts
    instrumentVersion: v.number(),
    status: v.union(v.literal("pending"), v.literal("completed"), v.literal("cancelled")),
    message: v.optional(v.string()), // The physio's note to the patient
    dueAt: v.optional(v.number()),
    sentAt: v.number(),
    remindedAt: v.optional(v.number()),
    // The patient's answers so far, saved between screens
    draftAnswers: v.optional(questionnaireAnswersValidator),
    draftPsfs: v.optional(psfsActivitiesValidator),
    draftSavedAt: v.optional(v.number()),
    // Once completed
    answers: v.optional(questionnaireAnswersValidator),
    psfs: v.optional(psfsActivitiesValidator),
    scores: v.optional(questionnaireScoresValidator),
    completedAt: v.optional(v.number()),
    completedBy: v.optional(v.union(v.literal("patient"), v.literal("physio"))),
    enteredBy: v.optional(v.id("users")), // The physio who typed in a paper form
    reviewedAt: v.optional(v.number()), // The physio who asked opened the result
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.id("users")),
  })
    .index("by_patient_and_status", ["patientId", "status"])
    .index("by_patient_and_instrument", ["patientId", "instrument"])
    .index("by_physiotherapist_and_status", ["physiotherapistId", "status"]),
};
