"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { Resend } from "resend";
import { sendEmail } from "../../../lib/email/emailService";
import { actions, button, details, greeting, paragraph, renderEmail } from "../../../lib/email/layout";
import { publicAppUrl } from "../../helpers/appUrl";

/** Patient/partner-supplied text is escaped before it is placed into email HTML. */
function esc(value: string | undefined | null): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const result = v.object({ success: v.boolean(), messageId: v.optional(v.string()), error: v.optional(v.string()) });

/**
 * Confirmation to the partner's contact that a live referral was received.
 * Internal only — scheduled by the referral core, never callable from clients.
 */
export const sendPartnerReferralCreatedEmail = internalAction({
  args: {
    partnerEmail: v.string(),
    partnerName: v.string(),
    contactName: v.optional(v.string()),
    patientName: v.string(),
    trackingCode: v.string(),
    trackingUrl: v.string(),
    whatsappIntakeUrl: v.string(),
    whatsappPhone: v.string(),
    condition: v.optional(v.string()),
    priority: v.string(),
    createdAt: v.number(),
  },
  returns: result,
  handler: async (_ctx, args) => {
    try {
      const sent = await sendEmail({
        to: args.partnerEmail,
        template: "PARTNER_REFERRAL_CREATED",
        data: {
          partnerName: esc(args.partnerName),
          contactName: esc(args.contactName),
          patientName: esc(args.patientName),
          trackingCode: esc(args.trackingCode),
          trackingUrl: encodeURI(args.trackingUrl),
          whatsappIntakeUrl: encodeURI(args.whatsappIntakeUrl),
          whatsappPhone: esc(args.whatsappPhone),
          condition: esc(args.condition || "Not specified"),
          priority: esc(args.priority),
          createdAt: args.createdAt,
        } as any,
      });
      return sent.success ? { success: true, messageId: sent.messageId } : { success: false, error: sent.error };
    } catch (error) {
      console.error("sendPartnerReferralCreatedEmail failed:", error);
      return { success: false, error: String(error) };
    }
  },
});

/** Operations alert for a new live referral (contact the patient). Internal only. */
export const sendAdminReferralCreatedEmail = internalAction({
  args: {
    adminEmail: v.string(),
    partnerName: v.string(),
    patientName: v.string(),
    patientPhone: v.string(),
    patientEmail: v.optional(v.string()),
    trackingCode: v.string(),
    trackingUrl: v.string(),
    whatsappIntakeUrl: v.string(),
    whatsappPhone: v.string(),
    condition: v.optional(v.string()),
    priority: v.string(),
    city: v.optional(v.string()),
    recommendedSessions: v.optional(v.number()),
    createdAt: v.number(),
  },
  returns: result,
  handler: async (_ctx, args) => {
    try {
      const patientWhatsApp = `https://wa.me/${args.patientPhone.replace(/\D/g, "")}`;
      const sent = await sendEmail({
        to: args.adminEmail,
        template: "ADMIN_REFERRAL_CREATED",
        data: {
          partnerName: esc(args.partnerName),
          patientName: esc(args.patientName),
          patientPhone: esc(args.patientPhone),
          patientEmail: args.patientEmail ? esc(args.patientEmail) : undefined,
          trackingCode: esc(args.trackingCode),
          trackingUrl: encodeURI(args.trackingUrl),
          // The care team contacts the patient directly on WhatsApp.
          whatsappIntakeUrl: patientWhatsApp,
          whatsappPhone: esc(args.whatsappPhone),
          condition: esc(args.condition || "Not specified"),
          priority: esc(args.priority),
          city: args.city ? esc(args.city) : undefined,
          recommendedSessions: args.recommendedSessions,
          adminDashboardLink: `${publicAppUrl()}/dashboard/admin/referrals`,
          createdAt: args.createdAt,
        },
      });
      return sent.success ? { success: true, messageId: sent.messageId } : { success: false, error: sent.error };
    } catch (error) {
      console.error("sendAdminReferralCreatedEmail failed:", error);
      return { success: false, error: String(error) };
    }
  },
});

/** What each referral milestone means for the referring doctor. Statuses are partner-facing (public). */
const DOCTOR_UPDATE_COPY: Record<string, { subject: string; title: string; body: string; tone: "brand" | "success" | "warning" }> = {
  contacted: {
    subject: "We've reached your patient",
    title: "We've reached your patient",
    body: "Our care team has been in touch with {patient} and is helping them arrange their first session.",
    tone: "brand",
  },
  booked: {
    subject: "Your patient's first session is booked",
    title: "First session booked",
    body: "{patient} has booked their first physiotherapy session through Rehabify.",
    tone: "success",
  },
  in_treatment: {
    subject: "Your patient has started treatment",
    title: "Treatment has started",
    body: "{patient} has attended their first session and is now in treatment.",
    tone: "success",
  },
  completed: {
    subject: "Your patient completed treatment",
    title: "Treatment completed",
    body: "{patient} has completed their course of physiotherapy. Their sessions summary is in your portal.",
    tone: "success",
  },
  not_suitable: {
    subject: "Update on your referral",
    title: "Referral not suitable for our service",
    body: "After speaking with {patient}, our team advised them on more appropriate care. No further sessions are planned through Rehabify.",
    tone: "warning",
  },
  cancelled: {
    subject: "Update on your referral",
    title: "Referral cancelled",
    body: "The referral for {patient} was cancelled. You can refer them again at any time.",
    tone: "warning",
  },
};

/**
 * Closed-loop update to a referring doctor when their patient's referral reaches a milestone.
 * Internal only: scheduled from helpers/doctorReferralUpdates.ts. Carries no clinical detail.
 */
export const sendDoctorReferralUpdateEmail = internalAction({
  args: {
    doctorEmail: v.string(),
    doctorName: v.string(),
    patientName: v.string(),
    trackingCode: v.string(),
    status: v.string(),
  },
  returns: result,
  handler: async (_ctx, args) => {
    const copy = DOCTOR_UPDATE_COPY[args.status];
    if (!copy) return { success: false, error: `No update email for status ${args.status}` };
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[DOCTOR REFERRAL EMAIL] RESEND_API_KEY is not set; update email not sent");
      return { success: false, error: "Email service not configured" };
    }
    const portalUrl = `${publicAppUrl()}/partners/portal`;
    const patient = esc(args.patientName);
    const html = renderEmail({
      eyebrow: "Referral update",
      title: copy.title,
      tone: copy.tone,
      preheader: copy.body.replace("{patient}", args.patientName),
      body: [
        greeting(esc(args.doctorName)),
        paragraph(copy.body.replace("{patient}", `<strong>${patient}</strong>`)),
        details([
          ["Patient", patient],
          ["Tracking code", esc(args.trackingCode)],
        ]),
        actions(button("Open your referrals", portalUrl)),
      ].join(""),
      footerNote: "You receive these updates because you referred this patient to Rehabify Health.",
    });
    const text = [
      `Hello ${args.doctorName},`,
      "",
      copy.body.replace("{patient}", args.patientName),
      `Tracking code: ${args.trackingCode}`,
      "",
      `Open your referrals: ${portalUrl}`,
    ].join("\n");

    try {
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: `${process.env.FROM_NAME || "Rehabify Health"} <info@physioaroundme.com>`,
        to: [args.doctorEmail],
        subject: `${copy.subject}: ${args.patientName}`,
        html,
        text,
      });
      if (error) return { success: false, error: error.message || "Failed to send email" };
      return { success: true, messageId: data?.id };
    } catch (error) {
      console.error("sendDoctorReferralUpdateEmail failed:", error);
      return { success: false, error: String(error) };
    }
  },
});
