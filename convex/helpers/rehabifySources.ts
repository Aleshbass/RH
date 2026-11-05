/**
 * Where a patient came from decides who bills them (rehabifyFollowUps.isRehabifyCare):
 * - A patient who just paid Rehabify for a visit with a physio is Rehabify Care from then on. An
 *   older row for the pair (an invite, "existing patient") is retagged so later sessions are billed
 *   through Rehabify too. A clinic's row, or one already from Rehabify, keeps its source.
 * - A patient Rehabify sent to one physio who is then added by another physio or a clinic keeps
 *   the tag (inheritedRehabifySource): with a physio they stay Rehabify Care, with a clinic they're
 *   a referral (Rehabify's split). Admins are told and can change it for a genuine walk-in
 *   (admin.setPatientBillingSource).
 */
import { makeFunctionReference } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { platformAdminEmails } from "./adminRecipients";
import { appLink } from "./appUrl";
import { insertNotification } from "./pushNotify";

const KEEP_SOURCES = new Set(["marketplace", "joy_whatsapp", "booking_link", "rehabify_referral"]);
const REHABIFY_CARE_SOURCES = new Set(["marketplace", "joy_whatsapp", "booking_link"]);
/** How long after their last Rehabify link a patient still counts as Rehabify's */
const RECENT_MS = 90 * 24 * 60 * 60 * 1000;

const sendEmail = makeFunctionReference<
  "action",
  { to: string; subject: string; skipGreeting?: boolean; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

export type RehabifySource = "marketplace" | "joy_whatsapp" | "booking_link" | "rehabify_referral";

export async function tagPaidRehabifyRelationship(
  ctx: MutationCtx,
  relationship: Doc<"patientPhysiotherapistRelationships">,
  source: "marketplace" | "joy_whatsapp"
) {
  if (relationship.clinicId || KEEP_SOURCES.has(relationship.source ?? "")) return;
  await ctx.db.patch(relationship._id, { source });
}

/** The patient's Rehabify Care link with another physio: active, or ended in the last 90 days. */
async function recentRehabifyLink(ctx: QueryCtx, patientId: Id<"users">, exceptPhysioId: Id<"users">) {
  const rows = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .take(50);
  const since = Date.now() - RECENT_MS;
  return (
    rows.find(
      (row) =>
        row.physiotherapistId !== exceptPhysioId &&
        REHABIFY_CARE_SOURCES.has(row.source ?? "") &&
        (row.status === "active" || (row.endDate ?? row.startDate ?? 0) >= since)
    ) ?? null
  );
}

/**
 * The source a new link should carry when this patient is already Rehabify's: the same Rehabify
 * source with a physio, or "rehabify_referral" with a clinic. Null when they aren't.
 */
export async function inheritedRehabifySource(
  ctx: QueryCtx,
  patientId: Id<"users">,
  newPhysioId: Id<"users">,
  clinicId?: Id<"clinics"> | null
): Promise<{ source: RehabifySource; from: Doc<"patientPhysiotherapistRelationships"> } | null> {
  const from = await recentRehabifyLink(ctx, patientId, newPhysioId);
  if (!from) return null;
  return { source: clinicId ? "rehabify_referral" : (from.source as RehabifySource), from };
}

const nameOf = (user: Doc<"users"> | null, fallback: string) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || fallback;

/** Bell, push and email to the team: a Rehabify patient was added by another provider and kept the tag. */
export async function alertAdminsOfInheritedTag(
  ctx: MutationCtx,
  args: { patientId: Id<"users">; newPhysioId: Id<"users">; clinicId?: Id<"clinics"> | null; from: Doc<"patientPhysiotherapistRelationships"> }
) {
  const [patient, newPhysio, previous, clinic] = await Promise.all([
    ctx.db.get(args.patientId),
    ctx.db.get(args.newPhysioId),
    ctx.db.get(args.from.physiotherapistId),
    args.clinicId ? ctx.db.get(args.clinicId) : Promise.resolve(null),
  ]);
  const who = patient?.patientNumber ?? "A patient";
  const provider = clinic?.name ?? nameOf(newPhysio, "another physio");
  const title = "Rehabify patient added by another provider";
  const body = `${who}, a Rehabify patient of ${nameOf(previous, "a Rehabify physio")}, was added by ${provider}. They stay a Rehabify patient${clinic ? " (referral, with Rehabify's share)" : ""}. If they genuinely walked in, change it on the physio's page in Admin › Physiotherapists.`;
  const link = "/dashboard/admin/physiotherapists";
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .take(25);
  const now = Date.now();
  for (const admin of admins) {
    await insertNotification(ctx, {
      userId: admin._id,
      type: "system_alert",
      priority: "high",
      status: "pending",
      payload: { title, body, link, data: { entityType: "patient", entityId: args.patientId, actionUrl: link } },
      createdAt: now,
    });
  }
  for (const to of platformAdminEmails()) {
    await ctx.scheduler.runAfter(0, sendEmail, {
      to,
      subject: title,
      skipGreeting: true,
      heading: title,
      paragraphs: [body],
      buttonLabel: "Open physiotherapists",
      buttonUrl: appLink(link),
    });
  }
}
