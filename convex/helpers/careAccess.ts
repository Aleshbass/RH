/**
 * Who may work with a patient's care records. Shared by physioCare.ts (the patient workspace)
 * and exercisePrograms.ts (home exercise programmes).
 */
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { canUseArea, ensureClinicApproved, resolveClinicMember, type ClinicArea } from "../clinicTools";
import { subscriptionForClinic } from "./clinicSubscriptions";

type Ctx = QueryCtx | MutationCtx;

export async function currentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function isApproved(ctx: Ctx, userId: Id<"users">) {
  const approval = await ctx.db
    .query("accountApprovalStatus")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .first();
  return approval?.status === "approved";
}

/** The signed-in, approved physiotherapist, or null (queries return empty instead of throwing). */
export async function physioOrNull(ctx: Ctx) {
  const user = await currentUser(ctx);
  if (!user || user.role !== "physiotherapist") return null;
  return (await isApproved(ctx, user._id)) ? user : null;
}

export async function requirePhysio(ctx: Ctx) {
  const user = await currentUser(ctx);
  if (!user || user.role !== "physiotherapist") {
    throw new ConvexError("Only physiotherapists can do this.");
  }
  if (!(await isApproved(ctx, user._id))) {
    throw new ConvexError("Your account needs to be approved before you can work with patients.");
  }
  return user;
}

/** The physio's relationship with a patient: the active one if there is one, else the latest. */
export async function findRelationship(ctx: Ctx, physioId: Id<"users">, patientId: Id<"users">) {
  const rows = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", patientId).eq("physiotherapistId", physioId))
    .collect();
  if (rows.length === 0) return null;
  return rows.find((r) => r.status === "active") ?? rows.sort((a, b) => (b.endDate ?? b.startDate) - (a.endDate ?? a.startDate))[0];
}

const CARE_AREA_LABELS: Partial<Record<ClinicArea, string>> = {
  patients: "patient records",
  appointments: "appointments",
  billing: "billing",
};

/**
 * Changes to a clinic's patient (the care relationship carries the clinic) follow the clinic's
 * rules wherever they're made, the physio portal included: the clinician must still be on the
 * clinic's team and active, the clinic approved and not suspended, not read-only for an unpaid
 * Rehabify invoice (unless the change is allowed then: billing the patient), and the clinician's
 * clinic role must include the area. Mutations only: reading is never blocked here.
 */
export async function requireClinicCareAccess(
  ctx: Ctx,
  physio: Doc<"users">,
  clinicId: Id<"clinics">,
  opts: { area?: ClinicArea; allowBillingReadOnly?: boolean } = {}
) {
  if (!("insert" in ctx.db)) return;
  const clinic = await ctx.db.get(clinicId);
  if (!clinic) throw new ConvexError("This patient's clinic is no longer on Rehabify.");
  if (physio.clinicId !== clinicId) {
    throw new ConvexError(`${clinic.name} looks after this patient, and you're no longer on its team.`);
  }
  if (physio.status && physio.status !== "active") {
    throw new ConvexError("Your access to this clinic has been suspended. Contact the clinic owner.");
  }
  if (!opts.allowBillingReadOnly && (await subscriptionForClinic(ctx, clinicId))?.status === "read_only") {
    throw new ConvexError(
      `${clinic.name} is read-only because a Rehabify invoice is overdue. You can still see every record; changes come back once the clinic pays.`
    );
  }
  await ensureClinicApproved(ctx, clinic, { allowBillingReadOnly: true });
  if (opts.area) {
    const member = await resolveClinicMember(ctx, physio);
    if (!member || !canUseArea(member, opts.area)) {
      throw new ConvexError(
        `Your role at ${clinic.name} doesn't include ${CARE_AREA_LABELS[opts.area] ?? opts.area}. Ask the clinic owner for access.`
      );
    }
  }
}

export async function requireActiveRelationship(ctx: Ctx, physioId: Id<"users">, patientId: Id<"users">) {
  const relationship = await findRelationship(ctx, physioId, patientId);
  if (!relationship) throw new ConvexError("This patient isn't on your list.");
  // A clinic's patient: the clinic's rules apply (team, suspension, read-only, role)
  if (relationship.clinicId) {
    const physio = await ctx.db.get(physioId);
    if (physio) await requireClinicCareAccess(ctx, physio, relationship.clinicId, { area: "patients" });
  }
  if (relationship.status !== "active") {
    throw new ConvexError("Care with this patient has ended. Start a new course of care first.");
  }
  return relationship;
}
