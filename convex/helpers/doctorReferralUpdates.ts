/**
 * Closed-loop updates for referring doctors. Partner organisations hear about referral
 * progress through webhooks; a doctor (a partner of type "doctor") has no webhook, so they get
 * an in-app notification (which also reaches their phone) at each step of the referral, and an
 * email at each milestone. Called from transitionReferral() on every status change, from
 * markProviderMatched() / clinic routing when the care team changes, and when a physio shares a
 * progress report with them.
 */
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { makeFunctionReference } from "convex/server";
import { insertNotification } from "./pushNotify";
import { toPublicStatus, type PublicReferralStatus } from "./partnerShared";
import { DOCTOR_STAGE_UPDATES, doctorStageOf, shortPatientName } from "./doctorStages";
import {
  doctorEmails,
  doctorPartnerForReferral,
  doctorReferralLink,
  doctorUserFor,
  latestLiveReferral,
  reportIsForDoctor,
} from "./doctorReferrals";

const sendDoctorReferralUpdateEmailRef = makeFunctionReference<
  "action",
  { doctorEmail: string; doctorName: string; patientName: string; trackingCode: string; status: string }
>("actions/emails/sendReferralCreatedEmails:sendDoctorReferralUpdateEmail");

/** Milestones worth an email; the rest (e.g. "closed") are in-app only. */
const DOCTOR_EMAIL_STATUSES = new Set<PublicReferralStatus>(["contacted", "booked", "in_treatment", "completed", "not_suitable", "cancelled"]);

async function notifyDoctor(
  ctx: MutationCtx,
  user: Doc<"users">,
  referral: Doc<"inboundReferrals">,
  message: { title: string; body: string; kind: string }
) {
  const now = Date.now();
  const link = doctorReferralLink(referral._id);
  await insertNotification(ctx, {
    userId: user._id,
    type: "referral_update",
    priority: "medium",
    status: "pending",
    payload: {
      title: message.title,
      body: message.body,
      link,
      data: { referralId: referral._id, trackingCode: referral.trackingCode ?? null, kind: message.kind, actionUrl: link },
    },
    createdAt: now,
    updatedAt: now,
  });
}

const fill = (text: string, patient: string) => text.replace("{patient}", patient);

/**
 * A referral's status changed (transitionReferral). In-app whenever the doctor's step changes
 * (e.g. Booked → Seen → In treatment); email when the public milestone changes, as before.
 */
export async function notifyReferringDoctor(
  ctx: MutationCtx,
  referralId: Id<"inboundReferrals">,
  change: { fromStatus: string; toStatus: string }
) {
  const referral = await ctx.db.get(referralId);
  if (!referral) return;
  const partner = await doctorPartnerForReferral(ctx, referral);
  if (!partner) return;

  const fromPublic = toPublicStatus(change.fromStatus);
  const toPublic = toPublicStatus(change.toStatus);
  if (fromPublic !== toPublic && toPublic !== "received" && DOCTOR_EMAIL_STATUSES.has(toPublic) && partner.contactEmail) {
    await ctx.scheduler.runAfter(0, sendDoctorReferralUpdateEmailRef, {
      doctorEmail: partner.contactEmail,
      doctorName: partner.contactName || partner.name,
      patientName: `${referral.patientFirstName} ${referral.patientLastName ?? ""}`.trim(),
      trackingCode: referral.trackingCode ?? "",
      status: toPublic,
    });
  }

  const fromStage = doctorStageOf(change.fromStatus, referral);
  const toStage = doctorStageOf(change.toStatus, referral);
  const update = DOCTOR_STAGE_UPDATES[toStage];
  if (fromStage === toStage || toStage === "received" || !update) return;
  const user = await doctorUserFor(ctx, partner, referral);
  if (!user) return;
  const patient = shortPatientName(referral.patientFirstName, referral.patientLastName);
  await notifyDoctor(ctx, user, referral, { title: fill(update.title, patient), body: update.body, kind: toStage });
}

/** The care team changed: a physio was matched, or Rehabify routed the referral to a clinic. */
export async function notifyDoctorOfCareTeam(
  ctx: MutationCtx,
  referralId: Id<"inboundReferrals">,
  team: { physioUserId?: Id<"users"> | null; clinicId?: Id<"clinics"> | null }
) {
  const referral = await ctx.db.get(referralId);
  if (!referral) return;
  const partner = await doctorPartnerForReferral(ctx, referral);
  if (!partner) return;
  const user = await doctorUserFor(ctx, partner, referral);
  if (!user) return;
  const patient = shortPatientName(referral.patientFirstName, referral.patientLastName);

  if (team.physioUserId) {
    const physio = await ctx.db.get(team.physioUserId);
    const name = physio ? `${physio.firstName ?? ""} ${physio.lastName ?? ""}`.trim() : "";
    await notifyDoctor(ctx, user, referral, {
      title: `${patient} has a physiotherapist`,
      body: name ? `${name} is looking after them.` : "A verified physiotherapist is looking after them.",
      kind: "care_team",
    });
  } else if (team.clinicId) {
    const clinic = await ctx.db.get(team.clinicId);
    await notifyDoctor(ctx, user, referral, {
      title: `${patient} has a clinic`,
      body: clinic?.name ? `${clinic.name} will look after them.` : "A Rehabify partner clinic will look after them.",
      kind: "care_team",
    });
  }
}

/** A patient opened the doctor's referral link (or QR code) and asked for care. */
export async function notifyDoctorOfLinkLead(ctx: MutationCtx, referralId: Id<"inboundReferrals">) {
  const referral = await ctx.db.get(referralId);
  if (!referral) return;
  const partner = await doctorPartnerForReferral(ctx, referral);
  if (!partner) return;
  const user = await doctorUserFor(ctx, partner, referral);
  if (!user) return;
  const patient = shortPatientName(referral.patientFirstName, referral.patientLastName);
  await notifyDoctor(ctx, user, referral, {
    title: `${patient} asked for care through your link`,
    body: "We'll contact them on WhatsApp. Follow them in My referrals.",
    kind: "received",
  });
}

/** A physio shared a progress or discharge report that is meant for the referring doctor. */
export async function notifyDoctorOfReport(
  ctx: MutationCtx,
  report: Pick<Doc<"progressReports">, "patientId" | "recipientEmail" | "snapshot">
) {
  const referral = await latestLiveReferral(ctx, report.patientId);
  if (!referral) return;
  const partner = await doctorPartnerForReferral(ctx, referral);
  if (!partner) return;
  if (!reportIsForDoctor(report, await doctorEmails(ctx, partner), true)) return;
  const user = await doctorUserFor(ctx, partner, referral);
  if (!user) return;
  const patient = shortPatientName(referral.patientFirstName, referral.patientLastName);
  const discharge = Boolean(report.snapshot.care.completedAt);
  await notifyDoctor(ctx, user, referral, {
    title: `${discharge ? "Discharge" : "Progress"} report for ${patient}`,
    body: `${report.snapshot.physio.name} shared a report with you. Open it from the referral.`,
    kind: "report",
  });
}
