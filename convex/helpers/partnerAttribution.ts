/**
 * Patient → partner attribution. Rules (documented for partners):
 *  - First partner wins: once a patient is attributed it never changes.
 *  - Attribution comes only from server-validated sources: an active, live referral
 *    link (cookie claim at sign-up/booking or Joy), or a live partner referral linked
 *    to the patient. Client-supplied partner codes are never trusted.
 *  - Sandbox links/referrals never attribute real patients.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isPartnerApproved, linkEnv, normalizePhone, phonesMatch, referralEnv, toPublicStatus } from "./partnerShared";
import { transitionReferral } from "./partnerEvents";

type LinkCounter = "clicks" | "leads" | "joyStarts" | "signups" | "bookings" | "payments";

export async function bumpLinkCounter(ctx: MutationCtx, linkId: Id<"partnerReferralLinks"> | undefined, field: LinkCounter) {
  if (!linkId) return;
  const link = await ctx.db.get(linkId);
  if (!link) return;
  await ctx.db.patch(linkId, { [field]: (link[field] ?? 0) + 1, updatedAt: Date.now() });
}

/** An active, unexpired, LIVE link whose partner is approved — or null. */
export async function resolveAttributableLink(
  ctx: QueryCtx | MutationCtx,
  publicCode: string | undefined | null
): Promise<{ link: Doc<"partnerReferralLinks">; partner: Doc<"partners"> } | null> {
  const code = publicCode?.trim();
  if (!code || code.length > 64) return null;
  const link = await ctx.db
    .query("partnerReferralLinks")
    .withIndex("by_public_code", (q) => q.eq("publicCode", code))
    .first();
  if (!link || link.status !== "active" || linkEnv(link) !== "live") return null;
  if (link.expiresAt && link.expiresAt <= Date.now()) return null;
  const partner = await ctx.db
    .query("partners")
    .withIndex("by_code", (q) => q.eq("code", link.partnerId))
    .first();
  if (!partner || !isPartnerApproved(partner)) return null;
  return { link, partner };
}

export async function attributeUserToLink(
  ctx: MutationCtx,
  user: Doc<"users">,
  publicCode: string | undefined | null,
  source: "referral_link" | "joy",
  options: { countSignup?: boolean } = {}
): Promise<{ attributed: boolean; partnerCode?: string; linkId?: Id<"partnerReferralLinks">; reason?: string }> {
  if (user.referredByPartnerCode) {
    return { attributed: false, partnerCode: user.referredByPartnerCode, linkId: user.referralLinkId, reason: "already_attributed" };
  }
  const resolved = await resolveAttributableLink(ctx, publicCode);
  if (!resolved) return { attributed: false, reason: "link_not_attributable" };
  await ctx.db.patch(user._id, {
    referredByPartnerCode: resolved.link.partnerId,
    referralPublicCode: resolved.link.publicCode,
    referralLinkId: resolved.link._id,
    referralAttributedAt: Date.now(),
    referralAttributionSource: source,
  });
  if (options.countSignup) await bumpLinkCounter(ctx, resolved.link._id, "signups");
  return { attributed: true, partnerCode: resolved.link.partnerId, linkId: resolved.link._id };
}

/** Attributes a patient to the partner that referred them (API/landing referral, Joy). */
export async function attributeUserToReferral(ctx: MutationCtx, userId: Id<"users">, referral: Doc<"inboundReferrals">) {
  if (!referral.partnerId || referralEnv(referral) !== "live") return;
  const user = await ctx.db.get(userId);
  if (!user) return;
  // The referral knows its patient too, so the referrer's portal can show sessions and reports
  if (!referral.patientId) await ctx.db.patch(referral._id, { patientId: userId, updatedAt: Date.now() });
  const patch: Partial<Doc<"users">> = {};
  if (!user.linkedReferralId) {
    patch.linkedReferralId = referral._id;
    patch.linkedReferralTrackingCode = referral.trackingCode;
  }
  if (!user.referredByPartnerCode) {
    patch.referredByPartnerCode = referral.partnerId;
    patch.referralLinkId = referral.linkId;
    patch.referralAttributedAt = Date.now();
    patch.referralAttributionSource = "partner_referral";
  }
  if (Object.keys(patch).length > 0) await ctx.db.patch(userId, patch);
}

/**
 * Partner attribution for a new booking. Uses the patient's stored attribution; when
 * the patient is not yet attributed and the browser carries a referral-link code, the
 * code is validated and claimed first.
 */
export async function attributionForBooking(
  ctx: MutationCtx,
  patient: Doc<"users">,
  referralPublicCode?: string
): Promise<{ partnerId?: string; referralId?: Id<"inboundReferrals">; referralLinkId?: Id<"partnerReferralLinks"> }> {
  let current = patient;
  if (!current.referredByPartnerCode && referralPublicCode) {
    const result = await attributeUserToLink(ctx, current, referralPublicCode, "referral_link");
    if (result.attributed) current = (await ctx.db.get(patient._id)) ?? current;
  }
  // A doctor referred them but they booked on the website (not through Joy): find that referral by phone
  if (!current.referredByPartnerCode || !current.linkedReferralId) {
    const open = await findOpenReferralForPatient(ctx, current);
    if (open && (!current.referredByPartnerCode || current.referredByPartnerCode === open.partnerId)) {
      await attributeUserToReferral(ctx, current._id, open);
      current = (await ctx.db.get(patient._id)) ?? current;
    }
  }
  if (!current.referredByPartnerCode) return {};
  let referralId = current.linkedReferralId;
  if (referralId) {
    const referral = await ctx.db.get(referralId);
    if (!referral || referral.partnerId !== current.referredByPartnerCode || referralEnv(referral) !== "live") referralId = undefined;
  }
  return { partnerId: current.referredByPartnerCode, referralId, referralLinkId: current.referralLinkId };
}

/**
 * The patient's open live referral that came in by phone (a doctor's form or link) and hasn't been
 * booked yet: the last 90 days, newest first. Lets a patient who books on the website (not through
 * Joy) still count for the doctor who referred them.
 */
export async function findOpenReferralForPatient(ctx: MutationCtx | QueryCtx, patient: Doc<"users">) {
  const phone = normalizePhone(patient.phoneNumber);
  if (!phone) return null;
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const candidates = await ctx.db
    .query("inboundReferrals")
    .withIndex("by_phone_normalized", (q) => q.eq("patientPhoneNormalized", phone))
    .order("desc")
    .take(10);
  return (
    candidates.find(
      (r) =>
        referralEnv(r) === "live" &&
        Boolean(r.partnerId) &&
        (r.createdAt ?? r._creationTime) >= cutoff &&
        (!r.patientId || r.patientId === patient._id) &&
        phonesMatch(r.patientPhone, phone) &&
        ["received", "contacted"].includes(toPublicStatus(r.status))
    ) ?? null
  );
}

/** The care path a referral moves along; later steps only, never back. */
const CARE_PATH: InternalStatus[] = [
  "received",
  "consent_pending",
  "contacted",
  "intake_started",
  "intake_completed",
  "qualified",
  "booked",
  "attended",
  "treatment_active",
  "completed",
];
type InternalStatus = Doc<"inboundReferrals">["status"];

/** The patient's live referrals: the one linked to their account and any naming them. */
async function liveReferralsOf(ctx: MutationCtx, patientId: Id<"users">) {
  const patient = await ctx.db.get(patientId);
  const found: Doc<"inboundReferrals">[] = [];
  if (patient?.linkedReferralId) {
    const linked = await ctx.db.get(patient.linkedReferralId);
    if (linked) found.push(linked);
  }
  const byPatient = await ctx.db
    .query("inboundReferrals")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .take(10);
  for (const referral of byPatient) if (!found.some((r) => r._id === referral._id)) found.push(referral);
  return found.filter((r) => referralEnv(r) === "live");
}

/**
 * Moves the patient's referrals forward to `to` (never back, never out of a closed state such as
 * cancelled or not suitable). Each move goes through transitionReferral, so the milestone time,
 * the partner's webhook and the referring doctor's update all happen.
 */
export async function advancePatientReferrals(
  ctx: MutationCtx,
  patientId: Id<"users">,
  to: "attended" | "treatment_active" | "completed",
  actor: { actorType: string; actorId: string }
) {
  const target = CARE_PATH.indexOf(to);
  for (const referral of await liveReferralsOf(ctx, patientId)) {
    const current = CARE_PATH.indexOf(referral.status);
    if (current === -1 || current >= target) continue;
    await transitionReferral(ctx, referral._id, to, actor);
  }
}

/**
 * A completed visit: the first one means the patient was seen ("attended"), the next ones that
 * they're in treatment. Referrals not booked yet catch up too (e.g. booked outside Rehabify).
 */
export async function onPatientSessionCompleted(ctx: MutationCtx, patientId: Id<"users">) {
  for (const referral of await liveReferralsOf(ctx, patientId)) {
    const current = CARE_PATH.indexOf(referral.status);
    if (current === -1) continue;
    const next = current < CARE_PATH.indexOf("attended") ? "attended" : referral.status === "attended" ? "treatment_active" : null;
    if (next) await transitionReferral(ctx, referral._id, next, { actorType: "system", actorId: "appointment.completed" });
  }
}
