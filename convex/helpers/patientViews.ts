/**
 * Which physio profiles a patient opened on Find a Physio (patientPhysioViews), so the care team
 * can see who they were considering. One row per patient and physio.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function recordPatientView(ctx: MutationCtx, patientId: Id<"users">, physiotherapistId: Id<"users">, at = Date.now()) {
  const row = await ctx.db
    .query("patientPhysioViews")
    .withIndex("by_patient_and_physio", (q) => q.eq("patientId", patientId).eq("physiotherapistId", physiotherapistId))
    .first();
  if (row) {
    await ctx.db.patch(row._id, { lastViewedAt: Math.max(row.lastViewedAt, at), count: row.count + 1 });
  } else {
    await ctx.db.insert("patientPhysioViews", { patientId, physiotherapistId, firstViewedAt: at, lastViewedAt: at, count: 1 });
  }
}

/** The physios a patient looked at most recently, newest first. */
export async function recentPatientViews(ctx: QueryCtx, patientId: Id<"users">, limit = 6) {
  const rows = await ctx.db
    .query("patientPhysioViews")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .order("desc")
    .take(limit);
  return Promise.all(
    rows.map(async (row) => {
      const physio = await ctx.db.get(row.physiotherapistId);
      return {
        physioId: row.physiotherapistId,
        name: [physio?.firstName, physio?.lastName].filter(Boolean).join(" ") || "Physiotherapist",
        lastViewedAt: row.lastViewedAt,
        count: row.count,
      };
    })
  );
}

/** Physio user IDs sent from a browser: kept only if they're real physiotherapists. */
export async function validPhysioIds(ctx: QueryCtx, ids: string[] | undefined, max = 10): Promise<Id<"users">[]> {
  const out: Id<"users">[] = [];
  for (const raw of (ids ?? []).slice(0, max)) {
    const id = ctx.db.normalizeId("users", raw);
    if (!id || out.includes(id)) continue;
    const user = await ctx.db.get(id);
    if (user?.role === "physiotherapist" && !user.deletedAt) out.push(id);
  }
  return out;
}
