import type { Doc } from "../_generated/dataModel";

/**
 * Clinicians who join through a clinic invitation are approved automatically: the clinic
 * owner vetted them. That approval covers clinic work only, so it is recognisable by its note.
 */
export const CLINIC_INVITE_APPROVAL_NOTE = "Automatically approved via clinic invitation";

export function isClinicInviteApproval(row: Pick<Doc<"accountApprovalStatus">, "comments">): boolean {
  return row.comments === CLINIC_INVITE_APPROVAL_NOTE;
}
