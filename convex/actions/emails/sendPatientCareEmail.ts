"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { Resend } from "resend";

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
      console.error("[PATIENT CARE EMAIL] RESEND_API_KEY is not set; email not sent:", args.subject);
      return { success: false };
    }

    const button =
      args.buttonLabel && args.buttonUrl && /^https:\/\//.test(args.buttonUrl)
        ? `<p style="margin:28px 0 8px;"><a href="${escapeHtml(args.buttonUrl)}" style="display:inline-block;background:#005b57;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px;">${escapeHtml(args.buttonLabel)}</a></p>`
        : "";

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(args.subject)}</title></head>
<body style="margin:0;padding:0;background:#f7f5ef;font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;padding:28px 16px;">
    <p style="margin:0 0 16px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#005b57;">Rehabify Health</p>
    <div style="background:#ffffff;border-radius:20px;padding:30px 26px;box-shadow:0 10px 30px -14px rgba(0,46,44,0.2);">
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#002e2c;">${escapeHtml(args.heading)}</h1>
      <p style="margin:0 0 12px;">Hi ${escapeHtml(args.greetingName?.trim() || "there")},</p>
      ${args.paragraphs.map((text) => `<p style="margin:0 0 12px;">${escapeHtml(text)}</p>`).join("\n      ")}
      ${button}
    </div>
    <p style="margin:18px 4px 0;font-size:12px;color:#6b7280;">${escapeHtml(
      args.footnote ?? "You're receiving this because you're a patient on Rehabify Health. Questions? Write to support@rehabify.ng."
    )}</p>
  </div>
</body>
</html>`;

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
