"use node";
/**
 * Admin › Employer outreach › Sequences › Send me a test: every email of an employer sequence to
 * one address, now, from the outreach inbox. The mail connection itself is in ./outreachMail.ts;
 * this file only exists so Employer outreach has its own admin access (employerOutreach.ts).
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { buildMessage } from "../helpers/outreachMail";
import { testPayloadRef as testRef } from "../helpers/outreachShared";
import { config, newMessageId, smtpSend } from "./outreachMail";

const guardRef = makeFunctionReference<"query", Record<string, never>, { adminId: Id<"users"> }>("employerOutreach:adminGuard");

export const adminSendTest = action({
  args: { sequenceId: v.id("outreachSequences"), to: v.string() },
  handler: async (ctx, args): Promise<{ sent: number }> => {
    await ctx.runQuery(guardRef, {});
    const cfg = config();
    if (!cfg) throw new ConvexError("Connect the inbox first: OUTREACH_SMTP_USER and OUTREACH_SMTP_PASS on Convex.");
    const to = args.to.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new ConvexError("Type the email address to send the test to.");
    const payload = await ctx.runQuery(testRef, { sequenceId: args.sequenceId });
    let sent = 0;
    for (const email of payload.emails) {
      try {
        await smtpSend(
          cfg,
          to,
          buildMessage({ fromName: payload.fromName, fromEmail: cfg.user, to, subject: email.subject, text: email.text, messageId: newMessageId(cfg), sentAt: Date.now() })
        );
        sent++;
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        throw new ConvexError(sent ? `Sent ${sent}, then Zoho said: ${text}` : `Zoho said: ${text}`);
      }
    }
    return { sent };
  },
});
