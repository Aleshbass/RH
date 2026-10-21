/**
 * Permanent Rehabify IDs: RH-P-###### (patients), RH-C-###### (clinicians), RH-CL-###### (clinics).
 * Sequential from 100001 per kind. No digit means anything (clinic, place, year, condition).
 *
 * IDs are labels for finding and reporting on people, never credentials: they are guessable,
 * so access checks must always use the real relationships.
 *
 * Pure functions only, so the browser can import this file too.
 */

export type RehabifyIdKind = "patient" | "staff" | "clinic";

export const ID_START = 100001;

export const ID_PREFIX: Record<RehabifyIdKind, string> = {
  patient: "RH-P",
  staff: "RH-C",
  clinic: "RH-CL",
};

/** Roles that receive an RH-C staff number. */
export const STAFF_ROLES = ["physiotherapist", "clinic_owner", "clinic_staff"] as const;

export function isStaffRole(role: string | undefined | null): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

export function formatRehabifyId(kind: RehabifyIdKind, n: number): string {
  return `${ID_PREFIX[kind]}-${n}`;
}

const PREFIX_TO_KIND: Record<string, RehabifyIdKind> = { RHP: "patient", RHC: "staff", RHCL: "clinic" };

/**
 * Reads an ID typed by a person: "rh-p-100001", "RHP100001" and "RH P 100001" all work.
 * Returns the canonical form, or null when the text isn't a Rehabify ID.
 */
export function parseRehabifyId(input: string | undefined | null): { kind: RehabifyIdKind; value: string } | null {
  if (!input) return null;
  const compact = input.toUpperCase().replace(/[\s_-]+/g, "");
  const match = /^(RHCL|RHP|RHC)(\d{6,})$/.exec(compact);
  if (!match) return null;
  const kind = PREFIX_TO_KIND[match[1]];
  return { kind, value: formatRehabifyId(kind, Number(match[2])) };
}

/** True when free text contains a Rehabify ID or a run of its digits, e.g. "100234" matches "RH-P-100234". */
export function matchesRehabifyId(id: string | undefined | null, term: string): boolean {
  if (!id) return false;
  const needle = term.toUpperCase().replace(/[\s_-]+/g, "");
  return needle.length >= 3 && id.replace(/-/g, "").includes(needle);
}
