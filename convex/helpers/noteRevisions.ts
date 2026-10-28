/**
 * Clinical notes can be edited by the clinician who wrote them. Every earlier wording is kept as
 * a row in sessionLogRevisions, so nothing a clinician wrote is silently lost. Notes edited before
 * that table existed carry their history on the note (sessionLogs.revisions, oldest first); it is
 * still shown, and moved into the table the next time the note is edited.
 *
 * Every note write path also checks its text here, so a note stays far below Convex's 1 MB
 * document limit. History is for clinicians only: patient-facing reads never return it.
 */
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { ClinicalMeasure } from "./clinicalMeasures";

type Ctx = QueryCtx | MutationCtx;

/** The longest any one text section of a note (each SOAP section, assessment, goals) can be. */
export const MAX_NOTE_FIELD_LENGTH = 10_000;
/** Voice-note links and storage ids are short; anything longer isn't one. */
const MAX_NOTE_LINK_LENGTH = 2_048;

const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Section names as the physio's note shows them. Clinic notes pass their own. */
const DEFAULT_LABELS: Record<string, string> = {
  subjectiveAssessment: "Subjective",
  objectiveAssessment: "Objective",
  treatmentAdministered: "Treatment",
  planForNextSession: "Plan",
  diagnosis: "Assessment",
  goals: "Goals",
  voiceNoteUrl: "The voice note link",
};

/**
 * Throws a clear error when a section of a note is longer than MAX_NOTE_FIELD_LENGTH characters.
 * Pass the values that will be stored.
 */
export function assertNoteTextLength(
  fields: Record<string, string | null | undefined>,
  labels: Record<string, string> = DEFAULT_LABELS
) {
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== "string") continue;
    const max = key === "voiceNoteUrl" ? MAX_NOTE_LINK_LENGTH : MAX_NOTE_FIELD_LENGTH;
    if (value.length <= max) continue;
    const label = labels[key] ?? DEFAULT_LABELS[key] ?? "One section";
    throw new ConvexError(
      `${label} is too long (${withCommas(value.length)} characters). Keep each section under ${withCommas(max)} characters, or split it into two notes.`
    );
  }
}

/** How many earlier wordings a note has: rows in sessionLogRevisions plus any legacy inline ones. */
export function revisionCountOf(note: Doc<"sessionLogs">) {
  return (note.revisionCount ?? 0) + (note.revisions?.length ?? 0);
}

/** The note's current wording, as it is kept when the note is edited. */
export function noteRevision(note: Doc<"sessionLogs">, userId: Id<"users">, now: number) {
  return {
    savedAt: note.editedAt ?? note.sessionDate,
    replacedAt: now,
    replacedBy: userId,
    noteType: note.noteType,
    diagnosis: note.diagnosis,
    goals: note.goals,
    subjectiveAssessment: note.subjectiveAssessment,
    objectiveAssessment: note.objectiveAssessment,
    treatmentAdministered: note.treatmentAdministered,
    planForNextSession: note.planForNextSession,
    measures: note.measures,
  };
}

/**
 * Keeps the note's current wording before an edit: one new row in sessionLogRevisions, plus any
 * legacy inline history moved there. Returns the fields to patch on the note with the edit (they
 * clear the inline history).
 */
export async function keepRevision(ctx: MutationCtx, note: Doc<"sessionLogs">, userId: Id<"users">, now: number) {
  for (const legacy of note.revisions ?? []) {
    await ctx.db.insert("sessionLogRevisions", { noteId: note._id, patientId: note.patientId, ...legacy });
  }
  await ctx.db.insert("sessionLogRevisions", { noteId: note._id, patientId: note.patientId, ...noteRevision(note, userId, now) });
  return { editedAt: now, revisionCount: revisionCountOf(note) + 1, revisions: undefined };
}

/** An earlier wording of a note. `key` is stable for lists. */
export type NoteVersion = {
  key: string;
  savedAt: number;
  replacedAt: number;
  replacedBy: Id<"users">;
  noteType?: string;
  diagnosis?: string;
  goals?: string;
  subjectiveAssessment?: string;
  objectiveAssessment?: string;
  treatmentAdministered?: string;
  planForNextSession?: string;
  measures?: ClinicalMeasure[];
};

/** Safety cap on versions read for one note (a note is rarely edited more than a handful of times). */
const MAX_VERSIONS_READ = 500;

/** Every earlier wording of a note, newest first: table rows and any legacy inline history. */
export async function earlierVersions(ctx: Ctx, note: Doc<"sessionLogs">): Promise<NoteVersion[]> {
  const rows = await ctx.db
    .query("sessionLogRevisions")
    .withIndex("by_note_and_replaced_at", (q) => q.eq("noteId", note._id))
    .order("desc")
    .take(MAX_VERSIONS_READ);
  const versions: NoteVersion[] = [
    ...rows.map((row) => ({
      key: row._id as string,
      savedAt: row.savedAt,
      replacedAt: row.replacedAt,
      replacedBy: row.replacedBy,
      noteType: row.noteType,
      diagnosis: row.diagnosis,
      goals: row.goals,
      subjectiveAssessment: row.subjectiveAssessment,
      objectiveAssessment: row.objectiveAssessment,
      treatmentAdministered: row.treatmentAdministered,
      planForNextSession: row.planForNextSession,
      measures: row.measures,
    })),
    ...(note.revisions ?? []).map((version, index) => ({ key: `legacy-${index}`, ...version })),
  ];
  return versions.sort((a, b) => b.replacedAt - a.replacedAt || b.savedAt - a.savedAt);
}

/** Removes a deleted note's history with it, so no clinical text is left without its note. */
export async function deleteRevisions(ctx: MutationCtx, noteId: Id<"sessionLogs">) {
  const rows = await ctx.db
    .query("sessionLogRevisions")
    .withIndex("by_note_and_replaced_at", (q) => q.eq("noteId", noteId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}
