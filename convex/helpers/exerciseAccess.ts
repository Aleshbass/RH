/**
 * Access rules for the exercise library, programmes and share links.
 *
 * - Care team: an approved physiotherapist with an active relationship to the patient, or a
 *   clinic member with access to Patients whose clinic the patient belongs to. Writes also need
 *   the clinic to be approved.
 * - Library: Rehabify staff (approved physios, clinic members, admins) and members of an active
 *   library licence see everything; patients see only what's in their own programmes. A paid
 *   Rehabify Learn course gives no library access: learners see only the published courses.
 * - Share links: a valid, unexpired, unrevoked link plus a device session created by the PIN.
 */
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  getClinicMember,
  requireClinicWrite,
  assertPatientInClinic,
  requireTreatingClinician,
  type ClinicMember,
} from "../clinicTools";
import { clipIdFor } from "../exerciseLibraryContent";
import { currentUser, findRelationship, isApproved, requireClinicCareAccess } from "./careAccess";
import { sha256Hex } from "./exerciseCrypto";
import { endOfLagosDay } from "./learnFormat";

type Ctx = QueryCtx | MutationCtx;

/** Course physios keep the library this long after their cohort ends. */
export const LEARNER_ACCESS_DAYS = 90;

/** The signed-in person's email, only when Clerk has verified it. */
export async function verifiedIdentityEmail(ctx: Ctx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.emailVerified && typeof identity.email === "string" ? identity.email.toLowerCase().trim() : null;
}

/** Whether a cohort's study access is still open (until LEARNER_ACCESS_DAYS after it ends). */
export function learnerAccessOpen(cohort: Doc<"learnCohorts">, now = Date.now()) {
  const ended = endOfLagosDay(cohort.endDate);
  return ended === null || now <= ended + LEARNER_ACCESS_DAYS * 86_400_000;
}

/**
 * Paid Rehabify Learn registrations for this person, matched by account or by their verified
 * email (people often pay before they have an account), newest cohort first.
 */
export async function paidLearnRegistrations(ctx: Ctx, user: Doc<"users"> | null, email: string | null) {
  const found = new Map<Id<"learnRegistrations">, Doc<"learnRegistrations">>();
  if (user) {
    for (const r of await ctx.db.query("learnRegistrations").withIndex("by_user", (q) => q.eq("userId", user._id)).take(20)) {
      found.set(r._id, r);
    }
  }
  if (email) {
    for (const r of await ctx.db.query("learnRegistrations").withIndex("by_email", (q) => q.eq("email", email)).take(20)) {
      found.set(r._id, r);
    }
  }
  const rows: { registration: Doc<"learnRegistrations">; cohort: Doc<"learnCohorts"> }[] = [];
  for (const registration of found.values()) {
    if (registration.status !== "paid") continue;
    const cohort = await ctx.db.get(registration.cohortId);
    if (cohort) rows.push({ registration, cohort });
  }
  return rows.sort((a, b) => b.cohort.startDate.localeCompare(a.cohort.startDate));
}

export function displayName(user: Doc<"users"> | null | undefined, fallback = "Your physiotherapist") {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || fallback;
}

export function initials(user: Doc<"users"> | null | undefined) {
  return [user?.firstName, user?.lastName].map((n) => (n ? n[0].toUpperCase() : "")).join("") || "P";
}

async function clinicMemberOrNull(ctx: Ctx): Promise<ClinicMember | null> {
  try {
    return await getClinicMember(ctx, "patients");
  } catch {
    return null;
  }
}

export type CareTeamAccess = {
  user: Doc<"users">;
  kind: "physio" | "clinic";
  clinicId?: Id<"clinics">;
  /** Shown to the patient: the physio's name, or the clinic's name. */
  senderName: string;
};

/** The signed-in user if they look after this patient; throws otherwise. */
export async function requireCareTeam(ctx: Ctx, patientId: Id<"users">, opts: { write: boolean }): Promise<CareTeamAccess> {
  const user = await currentUser(ctx);
  if (!user) throw new ConvexError("Sign in to continue.");

  let careEnded = false;
  if (user.role === "physiotherapist" && (await isApproved(ctx, user._id))) {
    const rel = await findRelationship(ctx, user._id, patientId);
    // A clinic's patient follows the clinic's rules (team, suspension, read-only for an unpaid
    // invoice under agreement 7.4, role); reading is never blocked
    if (opts.write && rel?.clinicId) await requireClinicCareAccess(ctx, user, rel.clinicId, { area: "patients" });
    if (rel && (rel.status === "active" || !opts.write)) {
      // The programme belongs to the care relationship's clinic, never the physio's other work.
      // A clinic's patient sees who and where: "Mary Okafor — Lighthouse Physiotherapy".
      const clinic = rel.clinicId ? await ctx.db.get(rel.clinicId) : null;
      const senderName = clinic ? `${displayName(user)} — ${clinic.name}` : displayName(user);
      return { user, kind: "physio", clinicId: rel.clinicId ?? undefined, senderName };
    }
    careEnded = Boolean(rel);
  }

  const member = await clinicMemberOrNull(ctx);
  if (member) {
    await assertPatientInClinic(ctx, member.clinic, patientId);
    if (opts.write) {
      await requireClinicWrite(ctx, "patients");
      // Prescribing stays with the patient's own clinician; the owner and colleagues can read
      await requireTreatingClinician(ctx, member, patientId);
    }
    return { user, kind: "clinic", clinicId: member.clinic._id, senderName: member.clinic.name };
  }

  if (!opts.write) throw new ConvexError("You can't see this patient's exercises.");
  throw new ConvexError(
    careEnded
      ? "Your care of this patient has ended. Start a new course of care before changing their exercises."
      : "This patient isn't in your care."
  );
}

/**
 * Which of a patient's programmes this care team may see. A clinic's patient: every programme
 * from that clinic, whoever on the team wrote it, so a new clinician carries on where the last one
 * left off. Anyone else: only their own; another clinic's or provider's programmes stay theirs.
 */
export function programmeInScope(team: CareTeamAccess, program: Pick<Doc<"exercisePrograms">, "clinicId" | "createdBy">) {
  if (team.clinicId) return program.clinicId === team.clinicId;
  return !program.clinicId && program.createdBy === team.user._id;
}

/** Like requireCareTeam but returns null instead of throwing (for queries). */
export async function careTeamOrNull(ctx: Ctx, patientId: Id<"users">) {
  try {
    return await requireCareTeam(ctx, patientId, { write: false });
  } catch {
    return null;
  }
}

export type LibraryAccess =
  | { kind: "staff"; user: Doc<"users">; label: string }
  | { kind: "licence"; user: Doc<"users">; label: string; licence: Doc<"libraryLicences"> }
  | { kind: "patient"; user: Doc<"users">; label: string };

export async function activeLicenceFor(ctx: Ctx, userId: Id<"users">) {
  const memberships = await ctx.db
    .query("libraryLicenceMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const now = Date.now();
  for (const m of memberships) {
    const licence = await ctx.db.get(m.licenceId);
    if (licence && licence.status === "active" && (!licence.expiresAt || licence.expiresAt > now)) return licence;
  }
  return null;
}

/** What the signed-in user may see in the library, or null when signed out. */
export async function libraryAccess(ctx: Ctx): Promise<LibraryAccess | null> {
  const user = await currentUser(ctx);
  if (!user) return null;

  if (user.role === "admin") return { kind: "staff", user, label: "Rehabify" };
  if (user.role === "physiotherapist" && (await isApproved(ctx, user._id))) {
    const clinic = user.clinicId ? await ctx.db.get(user.clinicId) : null;
    return { kind: "staff", user, label: clinic?.name ?? displayName(user) };
  }
  const member = await clinicMemberOrNull(ctx);
  if (member) return { kind: "staff", user, label: member.clinic.name };

  const licence = await activeLicenceFor(ctx, user._id);
  if (licence) return { kind: "licence", user, label: licence.watermarkLabel || licence.orgName, licence };

  if (user.role === "patient") return { kind: "patient", user, label: initials(user) };
  return null;
}

/** Clip ids an item in a programme plays (null for exercises without a 3D demonstration). */
export function itemClipId(exercise: Doc<"exercises"> | null, side?: "L" | "R") {
  if (!exercise?.animationSlug) return null;
  return clipIdFor(exercise.animationSlug, Boolean(exercise.sided), side);
}

/** Clips a patient may watch in this programme: only approved animations. */
export async function programClipIds(ctx: Ctx, program: Doc<"exercisePrograms">) {
  const ids = new Set<string>();
  for (const item of program.items) {
    if (!item.exerciseId) continue; // the care team's own exercises and education have no 3D clip
    const exercise = await ctx.db.get(item.exerciseId);
    if (exercise?.animationStatus !== "approved") continue;
    const clip = itemClipId(exercise, item.side);
    if (clip) ids.add(clip);
  }
  return ids;
}

export type ShareFailure = "not_found" | "expired" | "revoked" | "locked";

export async function linkByCode(ctx: Ctx, code: string) {
  if (!/^[A-Za-z0-9]{12,40}$/.test(code)) return null;
  const tokenHash = await sha256Hex(code);
  return await ctx.db
    .query("exerciseShareLinks")
    .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
    .first();
}

export function linkState(link: Doc<"exerciseShareLinks"> | null, now = Date.now()): ShareFailure | "ok" {
  if (!link) return "not_found";
  if (link.revokedAt) return "revoked";
  if (link.expiresAt <= now) return "expired";
  if (link.lockedOut) return "locked";
  return "ok";
}

/** A link and its programme, if this device session unlocked it; otherwise the reason it can't open. */
export async function resolveShareSession(ctx: Ctx, code: string, session: string) {
  const link = await linkByCode(ctx, code);
  const state = linkState(link);
  if (state !== "ok" || !link) return { ok: false as const, reason: state as ShareFailure };
  if (!/^[A-Za-z0-9]{20,64}$/.test(session)) return { ok: false as const, reason: "needs_pin" as const };
  const sessionHash = await sha256Hex(session);
  const row = await ctx.db
    .query("exerciseShareSessions")
    .withIndex("by_session", (q) => q.eq("sessionHash", sessionHash))
    .first();
  if (!row || row.linkId !== link._id || row.expiresAt <= Date.now()) return { ok: false as const, reason: "needs_pin" as const };
  const program = await ctx.db.get(link.programId);
  if (!program || program.status !== "active") return { ok: false as const, reason: "revoked" as const };
  return { ok: true as const, link, program };
}
