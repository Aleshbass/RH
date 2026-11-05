"use node";

/**
 * Sends marketing campaigns created in convex/marketing.ts.
 *
 * Resend allows 10 API requests a second per team (shared with every other email the platform
 * sends) and the free plan allows 100 transactional emails a day. So:
 *  - group audiences go out as Broadcasts (their own allowance). Before sending, the segment's
 *    Resend audience is synced in chunks at ~4 requests a second, each run picking up where the
 *    last stopped, so a big audience never times out or gets stuck;
 *  - one-to-one emails go out with the batch endpoint (up to 100 emails in one request), under a
 *    daily cap; what doesn't fit today waits for the next UTC day automatically;
 *  - rate-limit (429) and server errors are retried with backoff.
 */
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { Resend } from "resend";
import { action, internalAction } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  AUDIENCE_LABEL,
  renderMarketingEmail,
  RESEND_FIRST_NAME,
  RESEND_UNSUBSCRIBE_URL,
  type MarketingContent,
  type MarketingSegment,
} from "../../lib/email/marketing";

const REQUEST_GAP_MS = 250; // ~4 requests a second, well under Resend's 10

/** Resend caps a broadcast's name at 70 characters (it only shows in Resend, never to recipients). */
const BROADCAST_NAME_MAX = 70;

/** "Subject · Physiotherapists", with a long subject shortened so the whole name fits. */
function broadcastName(subject: string, audienceLabel: string): string {
  const suffix = ` · ${audienceLabel}`;
  const room = BROADCAST_NAME_MAX - suffix.length;
  const title = subject.length > room ? `${subject.slice(0, room - 1).trimEnd()}…` : subject;
  return `${title}${suffix}`;
}
const SYNC_CHUNK = 100; // contacts added or removed per run (~25s), then the next run continues
const DIRECT_BATCH = 50;
const MAX_ATTEMPTS = 5;

type Recipient = { email: string; name?: string };
type ResendResult<T> = { data: T | null; error: { message: string; name: string } | null };

// Plain references to convex/marketing.ts (not in the generated api types until the next codegen)
const ref = {
  getCampaign: makeFunctionReference<"query", { campaignId: Id<"marketingCampaigns"> }, Doc<"marketingCampaigns"> | null>(
    "marketing:internalGetCampaign"
  ),
  audienceId: makeFunctionReference<"query", { segment: MarketingSegment }, string | null>("marketing:internalAudienceId"),
  saveAudience: makeFunctionReference<"mutation", { segment: MarketingSegment; resendAudienceId: string }, null>(
    "marketing:internalSaveAudience"
  ),
  syncPlan: makeFunctionReference<
    "query",
    { segment: MarketingSegment; limit: number },
    { toAdd: Recipient[]; toRemove: { email: string; contactId: string | null }[]; remaining: number; audienceSize: number }
  >("marketing:internalSyncPlan"),
  recordSync: makeFunctionReference<
    "mutation",
    { segment: MarketingSegment; added: { email: string; contactId?: string }[]; removed: string[] },
    null
  >("marketing:internalRecordSync"),
  segmentSent: makeFunctionReference<
    "mutation",
    { campaignId: Id<"marketingCampaigns">; segment: string; broadcastId: string; count: number },
    null
  >("marketing:internalSegmentSent"),
  skipSegment: makeFunctionReference<"mutation", { campaignId: Id<"marketingCampaigns">; segment: string }, null>(
    "marketing:internalSkipSegment"
  ),
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
      sent: Id<"marketingQueue">[];
      failed: { id: Id<"marketingQueue">; error: string; final: boolean }[];
    },
    { pendingLeft: number }
  >("marketing:internalRecordDirect"),
  processCampaign: makeFunctionReference<"action", { campaignId: Id<"marketingCampaigns"> }, null>(
    "actions/marketingSend:processCampaign"
  ),
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function client() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set in Convex.");
  return new Resend(key);
}

function fromAddress() {
  const email = process.env.MARKETING_FROM_EMAIL || process.env.FROM_EMAIL || "onboarding@resend.dev";
  return `${process.env.FROM_NAME || "Rehabify Health"} <${email}>`;
}

const RETRYABLE = new Set(["rate_limit_exceeded", "application_error", "internal_server_error"]);

/** Calls Resend, waiting and retrying on rate limits and server errors (1s, 2s, 4s…). */
async function call<T>(fn: () => Promise<ResendResult<T>>): Promise<ResendResult<T>> {
  let result: ResendResult<T> = { data: null, error: { message: "No response from Resend", name: "application_error" } };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      result = await fn();
    } catch (error) {
      result = { data: null, error: { message: error instanceof Error ? error.message : String(error), name: "application_error" } };
    }
    if (!result.error || !RETRYABLE.has(result.error.name)) return result;
    await sleep(1000 * 2 ** attempt);
  }
  return result;
}

function contentOf(c: Doc<"marketingCampaigns">): MarketingContent {
  return {
    subject: c.subject,
    previewText: c.previewText,
    heading: c.heading,
    body: c.body,
    ctaLabel: c.ctaLabel,
    ctaUrl: c.ctaUrl,
    imageUrl: c.imageUrl,
  };
}

/**
 * One step of a campaign. Each run does a bounded amount of work and schedules the next, so a
 * campaign of any size finishes without hitting action time limits or Resend's rate limit.
 */
export const processCampaign = internalAction({
  args: { campaignId: v.id("marketingCampaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.runQuery(ref.getCampaign, { campaignId: args.campaignId });
    if (!campaign || campaign.status === "sent" || campaign.status === "failed") return null;

    try {
      const resend = client();

      // ── One-to-one ──
      if (campaign.audience === "individual") {
        const { pending, remainingToday } = await ctx.runQuery(ref.directBatch, { campaignId: campaign._id, limit: DIRECT_BATCH });
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
        const result = await call(() =>
          resend.batch.send(
            batch.map((row) => ({
              from: fromAddress(),
              to: [row.email],
              subject: content.subject,
              html: renderMarketingEmail(content, { greetingName: row.name }),
              // Lets Resend's delivered / opened events find this campaign (emailEvents.ts)
              tags: [{ name: "campaign_id", value: String(campaign._id) }],
            }))
          )
        );

        if (result.error) {
          await ctx.runMutation(ref.recordDirect, {
            campaignId: campaign._id,
            sent: [],
            failed: batch.map((row) => ({ id: row._id, error: result.error!.message, final: row.attempts + 1 >= MAX_ATTEMPTS })),
          });
        } else {
          await ctx.runMutation(ref.recordDirect, { campaignId: campaign._id, sent: batch.map((row) => row._id), failed: [] });
        }
        // Next batch (or a retry) shortly; a failed batch waits a little longer
        await ctx.scheduler.runAfter(result.error ? 30_000 : 1_000, ref.processCampaign, { campaignId: campaign._id });
        return null;
      }

      // ── Group: one Resend Broadcast per segment ──
      const segment = campaign.segmentsToSend[0] as MarketingSegment | undefined;
      if (!segment) return null;

      let audienceId = await ctx.runQuery(ref.audienceId, { segment });
      if (!audienceId) {
        const created = await call(() => resend.audiences.create({ name: `Rehabify · ${AUDIENCE_LABEL[segment]}` }));
        if (created.error || !created.data) throw new Error(created.error?.message || "Could not create the Resend audience");
        audienceId = created.data.id;
        await ctx.runMutation(ref.saveAudience, { segment, resendAudienceId: audienceId });
      }

      const plan = await ctx.runQuery(ref.syncPlan, { segment, limit: SYNC_CHUNK });
      if (plan.toAdd.length > 0 || plan.toRemove.length > 0) {
        const added: { email: string; contactId?: string }[] = [];
        const removed: string[] = [];
        let lastError = "";
        for (const person of plan.toAdd) {
          const res = await call(() => resend.contacts.create({ audienceId: audienceId!, email: person.email, firstName: person.name }));
          if (!res.error || /already exists/i.test(res.error.message)) {
            added.push({ email: person.email, contactId: res.data?.id });
          } else {
            lastError = res.error.message;
            // Resend won't ever take this address (e.g. invalid): mark it done so it isn't retried forever
            if (!RETRYABLE.has(res.error.name)) added.push({ email: person.email });
          }
          await sleep(REQUEST_GAP_MS);
        }
        for (const person of plan.toRemove) {
          const res = await call(() =>
            resend.contacts.remove(person.contactId ? { audienceId: audienceId!, id: person.contactId } : { audienceId: audienceId!, email: person.email })
          );
          if (!res.error || !RETRYABLE.has(res.error.name)) removed.push(person.email);
          else lastError = res.error.message;
          await sleep(REQUEST_GAP_MS);
        }
        // Nothing went through even after retries: stop rather than loop, and show why
        if (added.length + removed.length === 0) throw new Error(lastError || "Resend didn't accept any contacts.");
        await ctx.runMutation(ref.recordSync, { segment, added, removed });
        // More to sync, or a contact that kept failing: continue in the next run
        if (plan.remaining > added.length + removed.length) {
          await ctx.scheduler.runAfter(1_000, ref.processCampaign, { campaignId: campaign._id });
          return null;
        }
      }

      if (plan.audienceSize === 0) {
        await ctx.runMutation(ref.skipSegment, { campaignId: campaign._id, segment });
      } else {
        const content = contentOf(campaign);
        const created = await call(() =>
          resend.broadcasts.create({
            audienceId: audienceId!,
            from: fromAddress(),
            subject: content.subject,
            previewText: content.previewText,
            name: broadcastName(content.subject, AUDIENCE_LABEL[segment]),
            html: renderMarketingEmail(content, { greetingName: RESEND_FIRST_NAME, unsubscribeUrl: RESEND_UNSUBSCRIBE_URL }),
          })
        );
        if (created.error || !created.data) throw new Error(created.error?.message || "Could not create the broadcast");
        const sent = await call(() => resend.broadcasts.send(created.data!.id));
        if (sent.error) throw new Error(sent.error.message);
        await ctx.runMutation(ref.segmentSent, { campaignId: campaign._id, segment, broadcastId: created.data.id, count: plan.audienceSize });
      }

      if (campaign.segmentsToSend.length > 1) {
        await ctx.scheduler.runAfter(1_000, ref.processCampaign, { campaignId: campaign._id });
      }
      return null;
    } catch (error) {
      console.error("Marketing campaign failed:", args.campaignId, error);
      await ctx.runMutation(ref.failed, { campaignId: args.campaignId, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  },
});

/** "Send me a test": the email exactly as it will look, to the admin who asked. */
// Admin-only guard: this query throws for anyone who isn't an admin
const adminGuardRef = makeFunctionReference<"query", Record<string, never>, unknown>("marketing:adminOverview");

/**
 * Admin › Emails: switch on Resend's open tracking for the domain campaigns are sent from, so
 * "opened" events reach emailEvents.ts. Click tracking stays off: it would rewrite every link
 * (payment and receipt links included) through Resend.
 */
export const adminEnableOpenTracking = action({
  args: {},
  handler: async (ctx): Promise<{ domain: string }> => {
    await ctx.runQuery(adminGuardRef, {});
    const fromEmail = process.env.MARKETING_FROM_EMAIL || process.env.FROM_EMAIL || "";
    const domainName = fromEmail.split("@")[1]?.toLowerCase();
    if (!domainName) throw new Error("No sending address is set (MARKETING_FROM_EMAIL or FROM_EMAIL).");
    const resend = client();
    const list = await resend.domains.list();
    if (list.error) throw new Error(`Resend: ${list.error.message}`);
    const domains = ((list.data as { data?: { id: string; name: string }[] } | null)?.data ?? []) as { id: string; name: string }[];
    const domain = domains.find((d) => d.name.toLowerCase() === domainName);
    if (!domain) throw new Error(`${domainName} isn't a domain in this Resend account.`);
    const updated = await resend.domains.update({ id: domain.id, openTracking: true });
    if (updated.error) throw new Error(`Resend: ${updated.error.message}`);
    return { domain: domain.name };
  },
});

export const sendTest = internalAction({
  args: {
    to: v.string(),
    name: v.optional(v.string()),
    subject: v.string(),
    previewText: v.optional(v.string()),
    heading: v.string(),
    body: v.string(),
    ctaLabel: v.optional(v.string()),
    ctaUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const { to, name, ...content } = args;
    const result = await call(() =>
      client().emails.send({
        from: fromAddress(),
        to: [to],
        subject: `[Test] ${content.subject}`,
        html: renderMarketingEmail(content, { greetingName: name || "there" }),
      })
    );
    if (result.error) console.error("Marketing test email failed:", result.error.message);
    return null;
  },
});
