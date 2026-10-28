/**
 * The measured notes a physio may read on a patient's record: their own and, on a clinic team,
 * their colleagues' (noteAccess.ts). The same set physioCare.getClinicalNoteMeasures returns, so
 * a goal's baseline saved with the plan, the referrer report and what the physio sees on screen
 * all come from the same values. Server only (it reads clinic membership).
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { canReadNote, physioNoteReader, type NoteReader } from "./noteAccess";

/** Matches getClinicalNoteMeasures: the newest 400 readable notes, of at most 1,000 looked at. */
const MAX_READABLE_NOTES = 400;
const MAX_NOTES_SCANNED = 1_000;

export async function readableMeasuredNotes(
  ctx: QueryCtx | MutationCtx,
  reader: NoteReader,
  patientId: Id<"users">
): Promise<Doc<"sessionLogs">[]> {
  const found: Doc<"sessionLogs">[] = [];
  let readable = 0;
  let scanned = 0;
  for await (const note of ctx.db
    .query("sessionLogs")
    .withIndex("by_patient_id_and_date", (q) => q.eq("patientId", patientId))
    .order("desc")) {
    scanned += 1;
    if (canReadNote(reader, note)) {
      readable += 1;
      if (note.measures?.length) found.push(note);
    }
    if (readable >= MAX_READABLE_NOTES || scanned >= MAX_NOTES_SCANNED) break;
  }
  return found;
}

/** The signed-in physio's readable measured notes for a patient; empty without access. */
export async function physioMeasuredNotes(ctx: QueryCtx | MutationCtx, patientId: Id<"users">) {
  const reader = await physioNoteReader(ctx, patientId);
  return reader ? await readableMeasuredNotes(ctx, reader, patientId) : [];
}
