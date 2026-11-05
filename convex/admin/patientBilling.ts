/**
 * Admin: who bills a patient seen by a physio. Rehabify patients keep their tag when another
 * provider adds them (helpers/rehabifySources.ts); a genuine walk-in can be switched to the
 * provider's own patient here, or the other way round. Every change is in the audit log.
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireAdmin } from "../helpers/partnerAccess";

export const setPatientBillingSource = mutation({
  args: {
    patientId: v.id("users"),
    physiotherapistId: v.id("users"),
    /** true: Rehabify patient (Rehabify Care, or a referral at a clinic). false: the provider's own. */
    rehabify: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx);
    const rows = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", args.patientId).eq("physiotherapistId", args.physiotherapistId))
      .take(10);
    if (rows.length === 0) throw new ConvexError("This physio doesn't see this patient.");

    const now = Date.now();
    for (const row of rows) {
      const source = args.rehabify
        ? row.clinicId
          ? ("rehabify_referral" as const)
          : ("marketplace" as const)
        : row.clinicId
          ? ("clinic_direct" as const)
          : ("existing_patient" as const);
      if (row.source === source) continue;
      await ctx.db.patch(row._id, { source });
      await ctx.db.insert("auditLogs", {
        actorUserId: admin._id,
        action: "patient_billing_source_changed",
        targetEntityType: "patientPhysiotherapistRelationship",
        targetEntityId: row._id,
        timestamp: now,
        details: { patientId: args.patientId, physiotherapistId: args.physiotherapistId, from: row.source ?? null, to: source },
      });
    }
    return { rehabify: args.rehabify };
  },
});
