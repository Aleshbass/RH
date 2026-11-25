/**
 * A clinic patient's care team: every clinician at the clinic with an active care relationship
 * to them. Clinic feedback (24 Nov 2026): some patients need two or more physios to keep up the
 * visits, so the clinic can add clinicians as well as switch them.
 *
 * - One clinician leads (isPrimaryPhysiotherapist): the clinic's record shows them as the
 *   patient's clinician, and "Change clinician" hands the lead over.
 * - Everyone on the team works on the same clinic record (notes, plan, programmes are scoped by
 *   clinicId), books their own visits and writes their own notes.
 * - The owner's account doesn't treat, so it's never on the team (a patient left with the owner
 *   is waiting for a clinician).
 */
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Link = Doc<"patientPhysiotherapistRelationships">;

/** The lead among a patient's active links: the one marked lead, else whoever has been with them longest. */
export function leadLink<T extends Pick<Link, "isPrimaryPhysiotherapist" | "startDate">>(links: T[]): T | null {
  return [...links].sort((a, b) => Number(b.isPrimaryPhysiotherapist) - Number(a.isPrimaryPhysiotherapist) || a.startDate - b.startDate)[0] ?? null;
}

/** The clinic's active links with this patient, one per clinician, without the owner's. */
export async function careTeamLinks(ctx: QueryCtx, patientId: Id<"users">, clinic: Pick<Doc<"clinics">, "_id" | "ownerId">) {
  const links = (
    await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect()
  ).filter((r) => r.clinicId === clinic._id && r.status === "active" && r.physiotherapistId !== clinic.ownerId);
  // Old data can hold two links to the same clinician: keep one
  const byClinician = new Map<Id<"users">, Link>();
  for (const link of links) {
    const seen = byClinician.get(link.physiotherapistId);
    if (!seen || (link.isPrimaryPhysiotherapist && !seen.isPrimaryPhysiotherapist)) byClinician.set(link.physiotherapistId, link);
  }
  const lead = leadLink([...byClinician.values()]);
  return [...byClinician.values()].sort((a, b) => Number(b === lead) - Number(a === lead) || a.startDate - b.startDate);
}

function personName(user: Doc<"users"> | null) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || "Clinician";
}

/** The care team for showing: the lead first. `viewerId` marks the signed-in clinician. */
export async function careTeamFor(ctx: QueryCtx, patientId: Id<"users">, clinicId: Id<"clinics">, viewerId?: Id<"users">) {
  const clinic = await ctx.db.get(clinicId);
  if (!clinic) return [];
  const links = await careTeamLinks(ctx, patientId, clinic);
  return await Promise.all(
    links.map(async (link, index) => ({
      id: link.physiotherapistId,
      name: personName(await ctx.db.get(link.physiotherapistId)),
      lead: index === 0,
      you: link.physiotherapistId === viewerId,
      since: link.startDate,
    }))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visits added after they happened (a visit agreed by phone and never entered, so its notes can
// be written). Independent physios can add them up to a year back. A clinic chooses for its own
// clinicians on the Team page (clinic feedback, 24 Nov 2026); its owner can always add them from
// the clinic dashboard.
// ─────────────────────────────────────────────────────────────────────────────

/** The choices the Team page offers, in days back. 0: only the clinic can add past visits. */
export const PAST_VISIT_CHOICES = [0, 7, 30, 365] as const;

/** Days back a clinic's clinicians may add a visit. Not set: a year, as before clinics could choose. */
export function pastVisitDaysOf(clinic: Pick<Doc<"clinics">, "pastVisitDays"> | null | undefined): number {
  const days = clinic?.pastVisitDays;
  return typeof days === "number" && days >= 0 ? Math.min(365, Math.floor(days)) : 365;
}

/** Why a clinic's clinician can't add this past visit, or null when they can. */
export function pastVisitRefusal(days: number, start: number, startOfToday: number): string | null {
  if (days === 0) return "Your clinic doesn't let clinicians add visits that already happened. Ask the clinic owner to add it.";
  if (start < startOfToday - days * 24 * 60 * 60 * 1000) {
    return `Your clinic lets clinicians add visits up to ${days} days back. Ask the clinic owner to add older ones.`;
  }
  return null;
}
