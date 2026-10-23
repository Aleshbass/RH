"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { Resend } from "resend";
import { actions, button, greeting, paragraph, renderEmail } from "../../../lib/email/layout";

/** Everything here is typed by people (names, notes), so it never goes into HTML raw. */
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * One plain, branded email for the moments in a patient's care: a payment request, the end of
 * treatment, and Rehabify's follow-up a couple of weeks later. Callers pass plain text; this
 * action escapes it and adds an optional button.
 */
export const sendPatientCareEmail = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    greetingName: v.optional(v.string()),
    heading: v.string(),
    paragraphs: v.array(v.string()),
    buttonLabel: v.optional(v.string()),
    buttonUrl: v.optional(v.string()),
    footnote: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[PATIENT CARE EMAIL] RESEND_API_KEY is not set; email not sent");
      return { success: false };
    }

    const cta =
      args.buttonLabel && args.buttonUrl && /^https:\/\//.test(args.buttonUrl)
        ? actions(button(escapeHtml(args.buttonLabel), escapeHtml(args.buttonUrl)))
        : "";

    const html = renderEmail({
      title: escapeHtml(args.heading),
      preheader: args.paragraphs[0],
      body: [
        greeting(args.greetingName?.trim() ? escapeHtml(args.greetingName.trim()) : undefined),
        ...args.paragraphs.map((text) => paragraph(escapeHtml(text))),
        cta,
      ].join(""),
      footerNote: escapeHtml(
        args.footnote ?? "You're receiving this because you're a patient on Rehabify Health. Questions? Write to support@rehabify.ng."
      ),
    });

    try {
      const resend = new Resend(apiKey);
      // Same verified sender as the other Rehabify emails
      const from = `${process.env.FROM_NAME || "Rehabify Health"} <info@physioaroundme.com>`;
      await resend.emails.send({ from, to: args.to, subject: args.subject, html });
      return { success: true };
    } catch (error) {
      console.error("[PATIENT CARE EMAIL] Failed to send:", error);
      return { success: false };
    }
  },
});
