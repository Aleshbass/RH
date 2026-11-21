/**
 * Shared by clinic outreach (outreach.ts, outreachSend.ts) and employer outreach
 * (employerOutreach.ts): which list a lead or sequence belongs to, the do-not-contact check, and
 * the employer pipeline's automatic moves and activity log.
 *
 * Clinic leads have no `kind` (older rows) or "clinic"; employers always have "employer". Every
 * clinic list filters with isClinicLead, so companies never show up among clinics.
 */
import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canAutoAdvance, STAGE_LABEL, type EmployerStage } from "../../lib/employerOutreach";

type Ctx = QueryCtx | MutationCtx;

// Internal steps of clinic outreach that Employer outreach also runs (neither is an admin
// function). Named here rather than in employerOutreach.ts, so the admin-access map
// (scripts/admin-access/gen-function-pages.mjs) doesn't open Clinic outreach's admin functions to
// admins who only have Employer outreach.
export const crawlPendingRef = makeFunctionReference<"action", Record<string, never>, null>("outreach:crawlPending");
export const testPayloadRef = makeFunctionReference<
  "query",
  { sequenceId: Id<"outreachSequences">; leadId?: Id<"outreachLeads"> },
  { fromName: string; emails: { subject: string; text: string }[] }
>("outreachSend:testPayload");

export const isClinicLead = (lead: Pick<Doc<"outreachLeads">, "kind">) => lead.kind !== "employer";
export const isClinicSequence = (seq: Pick<Doc<"outreachSequences">, "audience">) => seq.audience !== "employer";

/** Clinic leads, newest first: rows without a kind, plus any tagged "clinic". */
export async function clinicLeadsDesc(ctx: Ctx, limit: number): Promise<Doc<"outreachLeads">[]> {
  const unset = await ctx.db
    .query("outreachLeads")
    .withIndex("by_kind_stage", (q) => q.eq("kind", undefined))
    .order("desc")
    .take(limit);
  const tagged = await ctx.db
    .query("outreachLeads")
    .withIndex("by_kind_stage", (q) => q.eq("kind", "clinic"))
    .order("desc")
    .take(limit);
  if (tagged.length === 0) return unset;
  return [...unset, ...tagged].sort((a, b) => b._creationTime - a._creationTime).slice(0, limit);
}

/**
 * Is this address on the do-not-contact list? A lead marked so, or a person at a company who asked
 * not to be emailed. It sticks to the address, whichever list it turns up in later.
 */
export async function emailDoNotContact(ctx: Ctx, email: string | undefined): Promise<boolean> {
  if (!email) return false;
  const leads = await ctx.db.query("outreachLeads").withIndex("by_email", (q) => q.eq("email", email)).take(20);
  if (leads.some((r) => r.status === "do_not_contact")) return true;
  const people = await ctx.db.query("outreachContacts").withIndex("by_email", (q) => q.eq("email", email)).take(20);
  return people.some((p) => p.doNotContact === true);
}

/** Takes an enrollment out of the schedule (nothing more is sent). */
export async function stopEnrollment(
  ctx: MutationCtx,
  e: Doc<"outreachEnrollments">,
  status: Doc<"outreachEnrollments">["status"],
  reason?: string
) {
  await ctx.db.patch(e._id, { status, nextSendAt: undefined, claimedAt: undefined, stoppedReason: reason, updatedAt: Date.now() });
}

/** Updates a person at a company if they're still there (a reply can arrive after the team removed them). */
export async function patchPerson(ctx: MutationCtx, contactId: Id<"outreachContacts">, patch: Partial<Doc<"outreachContacts">>) {
  if (await ctx.db.get(contactId)) await ctx.db.patch(contactId, patch);
}

export async function logActivity(
  ctx: MutationCtx,
  leadId: Id<"outreachLeads">,
  kind: Doc<"outreachActivities">["kind"],
  text: string,
  byUserId?: Id<"users">
) {
  await ctx.db.insert("outreachActivities", { leadId, kind, text: text.slice(0, 600), byUserId, at: Date.now() });
}

/**
 * The pipeline's automatic moves (contacts found, first email sent, a reply): forward only, never
 * over a stage the team set further on, "lost" or "do not contact". Clinics are left alone.
 */
export async function autoAdvanceStage(ctx: MutationCtx, leadId: Id<"outreachLeads">, next: EmployerStage, why: string): Promise<boolean> {
  const lead = await ctx.db.get(leadId);
  if (!lead || lead.kind !== "employer" || !canAutoAdvance(lead.stage, next)) return false;
  const now = Date.now();
  await ctx.db.patch(lead._id, { stage: next, stageChangedAt: now, updatedAt: now });
  await logActivity(ctx, lead._id, "stage", `${STAGE_LABEL[next]}: ${why}`);
  return true;
}
