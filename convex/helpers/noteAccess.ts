/**
 * Who reads which of a patient's clinical notes (sessionLogs).
 *
 * - A physio reads the notes they wrote, while they have (or had) a care relationship with the
 *   patient (careAccess.findRelationship).
 * - A physio on a clinic team who treats or covers the patient (any care relationship) also reads
 *   their clinic colleagues' notes for that patient, when the patient belongs to the clinic. Only
 *   the author edits a note. Independent physios, and clinicians the clinic has suspended, see
 *   only their own.
 * - Clinic members with Patients access read their clinic's notes in the clinic record
 *   (clinicTools.getClinicPatientFullRecord); note history checks the same thing.
 *
 * Patients never read through here.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { assertPatientInClinic, getClinicMember, getClinicStaffUserIds } from "../clinicTools";
import { findRelationship, physioOrNull } from "./careAccess";

type Ctx = QueryCtx | MutationCtx;

export type NoteReader = {
  user: Doc<"users">;
  /** The clinic whose notes for this patient the reader also sees; null for their own notes only */
  clinicId: Id<"clinics"> | null;
  /** The clinic's clinicians (owner and team), for older notes saved without a clinic */
  staffIds: Set<Id<"users">>;
};

export function canReadNote(reader: NoteReader, note: Doc<"sessionLogs">) {
  if (note.physiotherapistId === reader.user._id) return true;
  if (!reader.clinicId) return false;
  return note.clinicId === reader.clinicId || (!note.clinicId && reader.staffIds.has(note.physiotherapistId));
}

async function patientInClinic(ctx: Ctx, clinic: Doc<"clinics">, patientId: Id<"users">) {
  try {
    await assertPatientInClinic(ctx, clinic, patientId);
    return true;
  } catch {
    return false;
  }
}

/** The signed-in physio as a reader of this patient's notes, or null when they have no access. */
export async function physioNoteReader(ctx: Ctx, patientId: Id<"users">): Promise<NoteReader | null> {
  const physio = await physioOrNull(ctx);
  if (!physio) return null;
  if (!(await findRelationship(ctx, physio._id, patientId))) return null;
  const ownOnly: NoteReader = { user: physio, clinicId: null, staffIds: new Set() };
  if (!physio.clinicId || (physio.status && physio.status !== "active")) return ownOnly;
  const clinic = await ctx.db.get(physio.clinicId);
  if (!clinic || !(await patientInClinic(ctx, clinic, patientId))) return ownOnly;
  return { user: physio, clinicId: clinic._id, staffIds: await getClinicStaffUserIds(ctx, clinic) };
}

/** A clinic owner or team member with Patients access, as a reader of the clinic's notes for this patient. */
export async function clinicNoteReader(ctx: Ctx, patientId: Id<"users">): Promise<NoteReader | null> {
  let member;
  try {
    member = await getClinicMember(ctx, "patients");
  } catch {
    return null;
  }
  if (!(await patientInClinic(ctx, member.clinic, patientId))) return null;
  return { user: member.user, clinicId: member.clinic._id, staffIds: await getClinicStaffUserIds(ctx, member.clinic) };
}

/** Whoever is signed in, if they may read this note: as a physio first, then as a clinic member. */
export async function noteReaderFor(ctx: Ctx, note: Doc<"sessionLogs">): Promise<NoteReader | null> {
  const physio = await physioNoteReader(ctx, note.patientId);
  if (physio && canReadNote(physio, note)) return physio;
  const clinic = await clinicNoteReader(ctx, note.patientId);
  if (clinic && canReadNote(clinic, note)) return clinic;
  return null;
}
