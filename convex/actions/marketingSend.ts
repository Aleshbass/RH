"use node";

/**
 * Sends marketing campaigns created in convex/marketing.ts through Amazon SES (owner, 26 Nov 2026:
 * "move campaigns to SES"; they were Resend Broadcasts before). Every email goes one by one from
 * marketingQueue, so each person gets their own name, their own unsubscribe link (also as a
 * one-click List-Unsubscribe header for Gmail, Yahoo and Apple Mail) and an open pixel, and its
 * links are counted as clicks (convex/emailLinks.ts).
 *
 *  - a group campaign first fills its queue, segment by segment ("preparing");
 *  - each run then sends up to RUN_SIZE emails at about 8 a second (SES allows 14 a second for
 *    everything we send, receipts and reminders included) and schedules the next run;
 *  - a day's campaign emails stop at MARKETING_DAILY_LIMIT (convex/marketing.ts); the rest go
 *    just after midnight UTC;
 *  - throttling and SES server errors are retried in a later run, up to MAX_ATTEMPTS.
 */
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { fillMergeTags, renderMarketingEmail, type MarketingContent } from "../../lib/email/marketing";
import { sendViaSes, sesConfigured, sesFromAddress } from "../../lib/email/ses";
import { addOpenPixel, campaignLinks, trackClicks } from "../helpers/emailLinks";

const RUN_SIZE = 200;
const PARALLEL = 4;
const PER_SECOND = 8;
const MAX_ATTEMPTS = 5;

const ref = {
  getCampaign: makeFunctionReference<"query", { campaignId: Id<"marketingCampaigns"> }, Doc<"marketingCampaigns"> | null>(
    "marketing:internalGetCampaign"
  ),
  fillQueue: makeFunctionReference<"mutation", { campaignId: Id<"marketingCampaigns"> }, { more: boolean }>("marketing:internalFillQueue"),
  failed: makeFunctionReference<"mutation", { campaignId: Id<"marketingCampaigns">; error: string }, null>(
    "marketing:internalCampaignFailed"
  ),
  directBatch: makeFunctionReference<
    "query",
    { campaignId: Id<"marketingCampaigns">; limit: number },
    { pending: Doc<"marketingQueue">[]; remainingToday: number }
  >("marketing:internalDirectBatch"),
  recordDirect: makeFunctionReference<
    "mutation",
    {
      campaignId: Id<"marketingCampaigns">;
      sent: { id: Id<"marketingQueue">; messageId?: string }[];
      failed: { id: Id<"marketingQueue">; error: string; final: boolean }[];
    },
    { pendingLeft: number }
  >("marketing:internalRecordDirect"),
  processCampaign: makeFunctionReference<"action", { campaignId: Id<"marketingCampaigns"> }, null>(
    "actions/marketingSend:processCampaign"
  ),
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fromAddress() {
  const email = process.env.MARKETING_FROM_EMAIL || process.env.FROM_EMAIL || "";
  return sesFromAddress(`${process.env.FROM_NAME || "Rehabify Health"} <${email || "noreply@physioaroundme.com"}>`);
}

/** SES is busy or briefly down: worth another try in a later run. */
const RETRYABLE = /SES (429|5\d\d)|Throttl|TooManyRequests|request failed/i;

function contentOf(c: Doc<"marketingCampaigns">): MarketingContent {
  return {
    subject: c.subject,
    previewText: c.previewText,
    heading: c.heading,
    body: c.body,
    ctaLabel: c.ctaLabel,
    ctaUrl: c.ctaUrl,
    imageUrl: c.imageUrl,
    imageLinkUrl: c.imageLinkUrl,
    greetBy: c.greetBy,
  };
}

/** One person's email: their names filled in, their unsubscribe link, open pixel and tracked links. */
async function personalEmail(content: MarketingContent, row: Doc<"marketingQueue">) {
  const merge = { firstName: row.name, clinicName: row.clinicName };
  const links = await campaignLinks(row._id);
  let html = renderMarketingEmail(content, { greetingName: row.name, unsubscribeUrl: links.unsubscribeUrl, merge });
  html = addOpenPixel(await trackClicks(html, row._id), links.openPixelUrl);
  return {
    from: fromAddress(),
    to: row.email,
    subject: fillMergeTags(content.subject, merge),
    html,
    headers: [
      { name: "List-Unsubscribe", value: `<${links.oneClickUrl}>` },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ],
  };
}

/**
 * One step of a campaign. Each run does a bounded amount of work and schedules the next, so a
 * campaign of any size finishes without hitting action time limits or SES's sending rate.
 */
export const processCampaign = internalAction({
  args: { campaignId: v.id("marketingCampaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.runQuery(ref.getCampaign, { campaignId: args.campaignId });
    if (!campaign || campaign.status === "sent" || campaign.status === "failed") return null;

    try {
      if (!sesConfigured()) throw new Error("Amazon SES isn't set up in Convex (SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY).");

      // A group campaign queues its people first
      if (campaign.status === "preparing") {
        const { more } = await ctx.runMutation(ref.fillQueue, { campaignId: campaign._id });
        if (more) await ctx.scheduler.runAfter(500, ref.processCampaign, { campaignId: campaign._id });
        return null;
      }

      const { pending, remainingToday } = await ctx.runQuery(ref.directBatch, { campaignId: campaign._id, limit: RUN_SIZE });
      if (pending.length === 0) {
        await ctx.runMutation(ref.recordDirect, { campaignId: campaign._id, sent: [], failed: [] });
        return null;
      }
      if (remainingToday === 0) {
        // Today's allowance is used up: carry on just after midnight UTC
        const now = new Date();
        const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5);
        await ctx.scheduler.runAt(nextDay, ref.processCampaign, { campaignId: campaign._id });
        return null;
      }

      const content = contentOf(campaign);
      const batch = pending.slice(0, remainingToday);
      const sent: { id: Id<"marketingQueue">; messageId?: string }[] = [];
      const failed: { id: Id<"marketingQueue">; error: string; final: boolean }[] = [];
      let throttled = false;

      for (let i = 0; i < batch.length && !throttled; i += PARALLEL) {
        const started = Date.now();
        const group = batch.slice(i, i + PARALLEL);
        const results = await Promise.all(group.map(async (row) => ({ row, result: await sendViaSes(await personalEmail(content, row)) })));
        for (const { row, result } of results) {
          if (result.ok) {
            sent.push({ id: row._id, messageId: result.messageId });
          } else {
            const retry = RETRYABLE.test(result.error);
            if (/429|Throttl|TooManyRequests/i.test(result.error)) throttled = true;
            failed.push({ id: row._id, error: result.error, final: !retry || row.attempts + 1 >= MAX_ATTEMPTS });
          }
        }
        // Stay near PER_SECOND, leaving the rest of SES's 14 a second for platform emails
        const wait = (group.length / PER_SECOND) * 1000 - (Date.now() - started);
        if (wait > 0) await sleep(wait);
      }

      await ctx.runMutation(ref.recordDirect, { campaignId: campaign._id, sent, failed });
      // Next run shortly; after throttling or errors, a little later
      await ctx.scheduler.runAfter(throttled ? 30_000 : failed.length ? 5_000 : 500, ref.processCampaign, { campaignId: campaign._id });
      return null;
    } catch (error) {
      console.error("Marketing campaign failed:", args.campaignId, error);
      await ctx.runMutation(ref.failed, { campaignId: args.campaignId, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  },
});

/** "Send me a test": the email exactly as it will look, to the admin who asked. */
export const sendTest = internalAction({
  args: {
    to: v.string(),
    name: v.optional(v.string()),
    clinicName: v.optional(v.string()),
    subject: v.string(),
    previewText: v.optional(v.string()),
    heading: v.string(),
    body: v.string(),
    ctaLabel: v.optional(v.string()),
    ctaUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    imageLinkUrl: v.optional(v.string()),
    greetBy: v.optional(v.union(v.literal("first_name"), v.literal("clinic_name"), v.literal("none"))),
  },
  handler: async (_ctx, args) => {
    const { to, name, clinicName, ...content } = args;
    const merge = { firstName: name, clinicName };
    // The unsubscribe link is shown but goes nowhere: a test isn't from a campaign
    const result = await sendViaSes({
      from: fromAddress(),
      to,
      subject: `[Test] ${fillMergeTags(content.subject, merge)}`,
      html: renderMarketingEmail(content, { greetingName: name || "there", unsubscribeUrl: "#", merge }),
    });
    if (!result.ok) console.error("Marketing test email failed:", result.error);
    return null;
  },
});
