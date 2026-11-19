/**
 * Files on a patient's record (referral letters, scans, reports, HMO cards): who may rename,
 * re-type or delete them (clinic feedback, Nov 2026).
 *
 * - Anyone on the care team who can add files for the patient may change a file the team added
 *   during its first 24 hours, so a wrong upload can be fixed straight away.
 * - After that only the clinic admin can: the owner, or a team member with full access
 *   (isClinicAdmin in clinicTools.ts). An independent physio is their own admin.
 * - Files the patient added stay the patient's: only the admin can change them.
 * - Deleting keeps the stored file (deletedAt): medical records need an audit trail. Normal views
 *   hide deleted files; erasing an account (users.ts) still removes them.
 *
 * Who counts as "can add files" is checked by the caller, the same way as adding one (files.ts).
 */
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export const DOCUMENT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Someone on the care team who may change this patient's files, and how far. */
export type DocumentEditor = {
  userId: Id<"users">;
  /** The clinic admin, or an independent physio with their own patient: any file, any time */
  isAdmin: boolean;
  /** The patient's account, to tell their own uploads apart */
  patientUserId: Id<"users">;
};

type DocumentFields = Pick<Doc<"patientDocuments">, "uploadedAt" | "uploadedBy" | "deletedAt">;

/** Still on the record (not deleted). */
export function isShownDocument(doc: Pick<Doc<"patientDocuments">, "deletedAt">) {
  return !doc.deletedAt;
}

/** Added by the care team. Older files don't say who added them, and count as the team's. */
export function isStaffUpload(doc: DocumentFields, patientUserId: Id<"users">) {
  return !doc.uploadedBy || doc.uploadedBy !== patientUserId;
}

export type DocumentRight = { canEdit: true; editableUntil?: number } | { canEdit: false; reason: string };

/**
 * Whether `editor` may change (or delete) this file now. `editableUntil` is set when the right
 * only lasts until 24 hours after the upload.
 */
export function documentRight(
  doc: DocumentFields,
  editor: DocumentEditor | null,
  now: number,
  verb: "change" | "delete" = "change"
): DocumentRight {
  if (doc.deletedAt) return { canEdit: false, reason: "This file was already deleted." };
  if (!editor) return { canEdit: false, reason: `You can't ${verb} this patient's files.` };
  if (editor.isAdmin) return { canEdit: true };
  if (!isStaffUpload(doc, editor.patientUserId)) {
    return { canEdit: false, reason: `Only the clinic admin can ${verb} files the patient added.` };
  }
  const editableUntil = doc.uploadedAt + DOCUMENT_EDIT_WINDOW_MS;
  if (now < editableUntil) return { canEdit: true, editableUntil };
  return { canEdit: false, reason: `Only the clinic admin can ${verb} files after 24 hours.` };
}

/**
 * A new name for a file, keeping its extension ("Knee MRI" stays "Knee MRI.pdf"). Empty when
 * the new name is blank.
 */
export function renamedFileName(next: string, current: string) {
  const name = next.replace(/\s+/g, " ").trim();
  if (!name) return "";
  const extension = /\.[a-z0-9]{1,5}$/i.exec(current)?.[0] ?? "";
  const keepsExtension = !extension || name.toLowerCase().endsWith(extension.toLowerCase());
  return keepsExtension ? name.slice(0, 200) : `${name.slice(0, 200 - extension.length)}${extension}`;
}

/**
 * What the care team sees next to each file: who added it, whether the viewer may change it, and
 * why not when only the clinic admin can. `editor` is null when the viewer can't change this
 * patient's files at all (no reason shown then: nothing on the list can be changed).
 */
export async function withDocumentRights<T extends Doc<"patientDocuments">>(
  ctx: QueryCtx,
  docs: T[],
  editor: DocumentEditor | null,
  patientUserId: Id<"users">,
  now: number
) {
  const names = new Map<Id<"users">, string>();
  const nameOf = async (userId: Id<"users">) => {
    const known = names.get(userId);
    if (known !== undefined) return known;
    const user = await ctx.db.get(userId);
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || "Care team";
    names.set(userId, name);
    return name;
  };
  const rows = [];
  for (const doc of docs) {
    const right = documentRight(doc, editor, now);
    rows.push({
      doc,
      uploadedByName: !doc.uploadedBy ? null : doc.uploadedBy === patientUserId ? "Patient" : await nameOf(doc.uploadedBy),
      canEdit: right.canEdit,
      editableUntil: right.canEdit ? right.editableUntil : undefined,
      lockedReason: !right.canEdit && editor ? right.reason : undefined,
    });
  }
  return rows;
}
