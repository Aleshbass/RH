/**
 * After a Rehabify patient's visit is marked done, the patient is asked one private question:
 * did you pay the physio or clinic anything directly (cash, transfer, POS)? Rehabify Care patients
 * and patients Rehabify referred to a clinic pay through Rehabify, so a yes is flagged to admins
 * (visitCheckIns.answerVisitCheckIn). It's what catches money taken outside the platform.
 * Answered on /visit-check/<token> without signing in.
 */
import { makeFunctionReference } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { isRehabifyCare } from "../rehabifyFollowUps";
import { appLink } from "./appUrl";
import { randomToken } from "./exerciseCrypto";
import { lagosDate } from "./lagosTime";
import { insertNotification } from "./pushNotify";
import { isPlaceholderUser } from "./whatsappLink";

const sendEmail = makeFunctionReference<
  "action",
  { to: string; subject: string; greetingName?: string; heading: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string; footnote?: string }
>("actions/emails/sendPatientCareEmail:sendPatientCareEmail");

const CLINIC_REFERRAL_SOURCES = new Set(["rehabify_referral", "marketplace", "joy_whatsapp", "booking_link"]);

export function visitCheckInPath(token: string) {
  return `/visit-check/${token}`;
}

/** Who the patient saw: the clinic's name, else the physio's. */
export async function providerName(ctx: { db: QueryCtx["db"] }, physiotherapistId: Doc<"users">["_id"], clinicId?: Doc<"clinics">["_id"]) {
  if (clinicId) {
    const clinic = await ctx.db.get(clinicId);
    if (clinic?.name) return clinic.name;
  }
  const physio = await ctx.db.get(physiotherapistId);
  return [physio?.firstName, physio?.lastName].filter(Boolean).join(" ").trim() || "your physiotherapist";
}

/** Asks the patient once per visit, for Rehabify patients only. Safe to call more than once. */
export async function startVisitPaymentCheckIn(ctx: MutationCtx, appointment: Doc<"appointments">) {
  if (appointment.isRecordOnly || !appointment.physiotherapistId) return;
  const existing = await ctx.db
    .query("visitPaymentCheckIns")
    .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
    .first();
  if (existing) return;

  let kind: "rehabify_care" | "clinic_referral" | null = null;
  if (appointment.clinicId) {
    const rows = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient", (q) => q.eq("patientId", appointment.patientId))
      .take(50);
    if (rows.some((row) => row.clinicId === appointment.clinicId && CLINIC_REFERRAL_SOURCES.has(row.source ?? ""))) kind = "clinic_referral";
  }
  if (!kind && (await isRehabifyCare(ctx, appointment.patientId, appointment.physiotherapistId))) kind = "rehabify_care";
  if (!kind) return;

  const patient = await ctx.db.get(appointment.patientId);
  if (!patient) return;
  const token = randomToken(24);
  const now = Date.now();
  await ctx.db.insert("visitPaymentCheckIns", {
    appointmentId: appointment._id,
    patientId: appointment.patientId,
    physiotherapistId: appointment.physiotherapistId,
    clinicId: appointment.clinicId,
    kind,
    token,
    visitAt: appointment.startTime,
    sentAt: now,
  });

  const provider = await providerName(ctx, appointment.physiotherapistId, appointment.clinicId);
  const when = lagosDate(appointment.startTime);
  const question = `Did you pay ${provider} anything directly for your visit on ${when}, by cash, bank transfer or POS?`;
  await insertNotification(ctx, {
    userId: patient._id,
    type: "visit_payment_check",
    priority: "medium",
    status: "pending",
    payload: {
      title: "Quick question about your visit",
      body: question,
      link: visitCheckInPath(token),
      data: { entityType: "appointment", entityId: appointment._id, actionUrl: visitCheckInPath(token) },
    },
    createdAt: now,
  });
  if (patient.email && !isPlaceholderUser(patient)) {
    await ctx.scheduler.runAfter(0, sendEmail, {
      to: patient.email,
      subject: "Quick question about your visit",
      greetingName: patient.firstName,
      heading: "How did you pay for your visit?",
      paragraphs: [
        `Thanks for seeing ${provider} on ${when}. As a Rehabify patient, you pay through Rehabify, not to the physio or clinic directly.`,
        `${question} It takes ten seconds, and your answer goes to Rehabify only.`,
      ],
      buttonLabel: "Answer",
      buttonUrl: appLink(visitCheckInPath(token)),
      footnote: "Paid someone directly by mistake? Tell us here and we'll sort it out with you.",
    });
  }
}
