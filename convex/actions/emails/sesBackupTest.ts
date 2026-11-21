"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { deliverEmailViaSes } from "../../../lib/email/deliver";
import { paragraph, renderEmail } from "../../../lib/email/layout";

/**
 * Sends one email straight through Amazon SES, skipping Resend, to check the backup sender
 * (lib/email/deliver.ts). Internal, so only the CLI can run it:
 *   npx convex run --prod actions/emails/sesBackupTest:send '{"to":"someone@physioaroundme.com"}'
 * While SES is in its sandbox it only delivers to verified addresses (any @physioaroundme.com
 * address once the domain is verified).
 */
export const send = internalAction({
  args: { to: v.string() },
  handler: async (_ctx, args) => {
    const from = `${process.env.FROM_NAME || "Rehabify Health"} <${process.env.FROM_EMAIL || "noreply@physioaroundme.com"}>`;
    const result = await deliverEmailViaSes({
      from,
      to: [args.to],
      subject: "Rehabify email backup test (Amazon SES)",
      html: renderEmail({
        eyebrow: "System check",
        title: "Amazon SES backup is working",
        preheader: "This email was sent through Amazon SES, Rehabify's backup email sender.",
        body: paragraph(
          "This email went out through Amazon SES, the backup sender Rehabify uses when Resend is down or its daily limit is used up. Nothing to do."
        ),
        signOff: false,
        safetyNote: false,
        footerNote: "Internal test from the Rehabify team.",
      }),
      text: "This email went out through Amazon SES, Rehabify's backup email sender. Nothing to do.",
    });
    return { success: result.success, provider: result.provider ?? null, id: result.id ?? null, error: result.error ?? null };
  },
});
