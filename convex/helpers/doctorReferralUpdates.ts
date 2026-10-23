/**
 * Closed-loop updates for referring doctors. Partner organisations hear about referral
 * progress through webhooks; a doctor (a partner of type "doctor") has no webhook, so they get
 * an email at each milestone instead. Called from transitionReferral() whenever the public
 * status changes.
 */
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { makeFunctionReference } from "convex/server";
import { referralEnv, type PublicReferralStatus } from "./partnerShared";

const sendDoctorReferralUpdateEmailRef = makeFunctionReference<
  "action",
  { doctorEmail: string; doctorName: string; patientName: string; trackingCode: string; status: string }
>("actions/emails/sendReferralCreatedEmails:sendDoctorReferralUpdateEmail");

/** Milestones worth an email; the rest (e.g. "closed") are quiet. */
const DOCTOR_EMAIL_STATUSES = new Set<PublicReferralStatus>(["contacted", "booked", "in_treatment", "completed", "not_suitable", "cancelled"]);

export async function notifyReferringDoctor(
  ctx: MutationCtx,
  referralId: Id<"inboundReferrals">,
  status: PublicReferralStatus
) {
  if (!DOCTOR_EMAIL_STATUSES.has(status)) return;
  const referral = await ctx.db.get(referralId);
  if (!referral?.partnerId || referralEnv(referral) !== "live") return;
  const partner: Doc<"partners"> | null = await ctx.db
    .query("partners")
    .withIndex("by_code", (q) => q.eq("code", referral.partnerId!))
    .first();
  if (!partner || partner.type !== "doctor" || !partner.contactEmail) return;

  await ctx.scheduler.runAfter(0, sendDoctorReferralUpdateEmailRef, {
    doctorEmail: partner.contactEmail,
    doctorName: partner.contactName || partner.name,
    patientName: `${referral.patientFirstName} ${referral.patientLastName ?? ""}`.trim(),
    trackingCode: referral.trackingCode ?? "",
    status,
  });
}
