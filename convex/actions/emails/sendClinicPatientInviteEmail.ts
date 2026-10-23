"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { Resend } from "resend";
import { publicAppUrl } from "../../helpers/appUrl";
import { actions, button, greeting, linkFallback, paragraph, renderEmail } from "../../../lib/email/layout";

/** Names and clinic details are typed by people, so never put them in HTML raw. */
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Tell a patient their clinic has added them to Rehabify.
 * New patients are asked to create an account with this exact email: sign-up links their
 * account to the record the clinic made (users.claimPlaceholderPatient), so they see their
 * appointments and exercises. Patients who already have an account are asked to sign in.
 */
export const sendClinicPatientInviteEmail = internalAction({
  args: {
    patientEmail: v.string(),
    patientFirstName: v.optional(v.string()),
    clinicName: v.string(),
    clinicPhone: v.optional(v.string()),
    hasAccount: v.boolean(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[CLINIC PATIENT EMAIL] RESEND_API_KEY is not set; invite email not sent");
      return { success: false, error: "Email service not configured" };
    }

    const base = publicAppUrl();
    const destination = encodeURIComponent("/dashboard/patient");
    const link = args.hasAccount
      ? `${base}/sign-in?redirect_url=${destination}`
      : `${base}/sign-up?redirect_url=${destination}`;

    const clinic = escapeHtml(args.clinicName);
    const greetingName = escapeHtml(args.patientFirstName?.trim() || "there");
    const email = escapeHtml(args.patientEmail);
    const contactLine = args.clinicPhone?.trim()
      ? `If you have questions, call ${clinic} on ${escapeHtml(args.clinicPhone.trim())}.`
      : `If you have questions, contact ${clinic} directly.`;
    const actionText = args.hasAccount ? "Sign in" : "Create your account";
    const instruction = args.hasAccount
      ? `Sign in with <strong>${email}</strong> to see them.`
      : `Create your free account with <strong>${email}</strong> (use this exact email address) and everything ${clinic} adds will be there.`;

    const html = renderEmail({
      eyebrow: "Your clinic",
      title: `${clinic} added you on Rehabify`,
      preheader: `${args.clinicName} uses Rehabify Health for your physiotherapy.`,
      body: [
        greeting(greetingName),
        paragraph(`<strong>${clinic}</strong> uses Rehabify Health for your physiotherapy. Your appointments, home exercises and progress notes from the clinic will appear in your Rehabify account.`),
        paragraph(instruction),
        actions(button(actionText, link)),
        linkFallback(link),
        paragraph(contactLine, { muted: true, size: 15 }),
      ].join(""),
      footerNote: `If you aren't a patient at ${clinic}, you can ignore this email.`,
    });

    const text = [
      `Hello ${args.patientFirstName?.trim() || "there"},`,
      ``,
      `${args.clinicName} added you on Rehabify Health. Your appointments, home exercises and progress notes from the clinic will appear in your Rehabify account.`,
      ``,
      args.hasAccount
        ? `Sign in with ${args.patientEmail}: ${link}`
        : `Create your free account with ${args.patientEmail} (use this exact email address): ${link}`,
      ``,
      args.clinicPhone?.trim()
        ? `Questions? Call ${args.clinicName} on ${args.clinicPhone.trim()}.`
        : `Questions? Contact ${args.clinicName} directly.`,
    ].join("\n");

    try {
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: `${process.env.FROM_NAME || "Rehabify Health"} <info@physioaroundme.com>`,
        to: [args.patientEmail],
        subject: `${args.clinicName} added you on Rehabify Health`,
        html,
        text,
      });
      if (error) {
        console.error("[CLINIC PATIENT EMAIL] Resend error:", error);
        return { success: false, error: error.message || "Failed to send email" };
      }
      return { success: true, messageId: data?.id };
    } catch (err) {
      console.error("[CLINIC PATIENT EMAIL] Exception:", err);
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  },
});
