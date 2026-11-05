/**
 * Where a patient came from decides who bills them (rehabifyFollowUps.isRehabifyCare). A patient
 * who just paid Rehabify for a visit with a physio is Rehabify Care from then on: an older row for
 * the pair (an invite, "existing patient") is retagged so later sessions are billed through Rehabify
 * too. A clinic's row, or one already from Rehabify, keeps its source.
 */
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

const KEEP_SOURCES = new Set(["marketplace", "joy_whatsapp", "booking_link", "rehabify_referral"]);

export async function tagPaidRehabifyRelationship(
  ctx: MutationCtx,
  relationship: Doc<"patientPhysiotherapistRelationships">,
  source: "marketplace" | "joy_whatsapp"
) {
  if (relationship.clinicId || KEEP_SOURCES.has(relationship.source ?? "")) return;
  await ctx.db.patch(relationship._id, { source });
}
