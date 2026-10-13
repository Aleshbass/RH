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
import { isPartnerApproved, linkEnv, referralEnv, toPublicStatus } from "./partnerShared";
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
  if (!current.referredByPartnerCode) return {};
  let referralId = current.linkedReferralId;
  if (referralId) {
    const referral = await ctx.db.get(referralId);
    if (!referral || referral.partnerId !== current.referredByPartnerCode || referralEnv(referral) !== "live") referralId = undefined;
  }
  return { partnerId: current.referredByPartnerCode, referralId, referralLinkId: current.referralLinkId };
}

/** A completed appointment moves the patient's booked live referral into treatment. */
export async function onPatientSessionCompleted(ctx: MutationCtx, patientId: Id<"users">) {
  const patient = await ctx.db.get(patientId);
  const candidates: Doc<"inboundReferrals">[] = [];
  if (patient?.linkedReferralId) {
    const linked = await ctx.db.get(patient.linkedReferralId);
    if (linked) candidates.push(linked);
  }
  const byPatient = await ctx.db
    .query("inboundReferrals")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .take(10);
  for (const referral of byPatient) if (!candidates.some((c) => c._id === referral._id)) candidates.push(referral);
  for (const referral of candidates) {
    if (referralEnv(referral) !== "live") continue;
    if (toPublicStatus(referral.status) === "booked") {
      await transitionReferral(ctx, referral._id, "treatment_active", {
        actorType: "system",
        actorId: "appointment.completed",
      });
    }
  }
}
