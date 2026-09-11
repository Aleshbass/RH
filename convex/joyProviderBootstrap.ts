import { v } from "convex/values";
import { mutation } from "./_generated/server";

const ALL_SERVICE_MODES = ["home_visit", "clinic", "online"] as const;
const DEFAULT_SERVICE_AREAS = ["Abuja", "Lagos"];
const DEFAULT_INITIAL_CONSULT_RATE_KOBO = 2_500_000; // ₦25,000
const LEGACY_SPECIALTY_TAGS: Record<string, string> = {
  musculoskeletal: "MSK_GENERAL",
  orthopedic: "MSK_ORTHOPAEDIC",
  orthopaedic: "MSK_ORTHOPAEDIC",
  sports: "MSK_SPORTS",
  neurological: "NEURO_REHAB",
  pediatric: "PAEDIATRIC_PHYSIO",
  paediatric: "PAEDIATRIC_PHYSIO",
  geriatric: "GERIATRIC_REHAB",
};

function tagsFromExistingSpecializations(labels: string[] | undefined): string[] {
  return [...new Set((labels ?? [])
    .map((label) => LEGACY_SPECIALTY_TAGS[label.trim().toLowerCase()])
    .filter((tag): tag is string => Boolean(tag)))];
}

/**
 * A deliberately constrained, operator-run migration. It never invents
 * reviewer authority or clinical specializations. The client-approved service
 * areas and initial consultation price below are controlled migration defaults.
 * The server secret prevents this public Convex mutation from becoming a
 * general profile-editing API.
 */
export const applyBatch = mutation({
  args: {
    secret: v.string(),
    cursor: v.optional(v.string()),
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.JOY_PROVIDER_BOOTSTRAP_SECRET;
    if (!expectedSecret || args.secret !== expectedSecret) {
      throw new Error("Unauthorized provider bootstrap operation");
    }

    const batch = await ctx.db.query("physiotherapistProfiles")
      .order("asc")
      .paginate({ cursor: args.cursor ?? null, numItems: 30 });

    const report = {
      scanned: batch.page.length,
      eligible: 0,
      serviceModesDefaulted: 0,
      serviceModesAlreadyConfigured: 0,
      serviceAreasDefaulted: 0,
      ratesDefaulted: 0,
      specialtyTagsAdded: 0,
      skipped: 0,
      profiles: [] as Array<{ profileId: string; action: string; missing: string[] }>,
    };

    for (const profile of batch.page) {
      const approval = await ctx.db.query("accountApprovalStatus")
        .withIndex("by_user_id", (q) => q.eq("userId", profile.userId))
        .first();
      if (profile.isAvailableOnMarketplace !== true || approval?.status !== "approved") {
        report.skipped += 1;
        report.profiles.push({ profileId: profile._id, action: "skipped_not_eligible", missing: [] });
        continue;
      }

      report.eligible += 1;
      const missing: string[] = [];
      const patch: Record<string, unknown> = {};
      if (profile.joyServiceModes?.length) {
        report.serviceModesAlreadyConfigured += 1;
      } else {
        patch.joyServiceModes = [...ALL_SERVICE_MODES];
        report.serviceModesDefaulted += 1;
      }

      if (!profile.joySpecialtyTags?.length) {
        const tags = tagsFromExistingSpecializations(profile.specializations);
        if (tags.length) {
          patch.joySpecialtyTags = tags;
          report.specialtyTagsAdded += 1;
        } else {
          missing.push("joySpecialtyTags");
        }
      }
      if (!profile.joyServiceAreas?.length) {
        patch.joyServiceAreas = [...DEFAULT_SERVICE_AREAS];
        report.serviceAreasDefaulted += 1;
      }
      if (!(profile.initialConsultRate ?? profile.hourlyRate)) {
        patch.initialConsultRate = DEFAULT_INITIAL_CONSULT_RATE_KOBO;
        report.ratesDefaulted += 1;
      }
      if (!args.dryRun && Object.keys(patch).length) {
        await ctx.db.patch(profile._id, patch);
      }
      report.profiles.push({
        profileId: profile._id,
        action: Object.keys(patch).length ? (args.dryRun ? "would_update" : "updated") : "unchanged",
        missing,
      });
    }

    return {
      dryRun: args.dryRun,
      report,
      nextCursor: batch.isDone ? null : batch.continueCursor,
      isDone: batch.isDone,
    };
  },
});
