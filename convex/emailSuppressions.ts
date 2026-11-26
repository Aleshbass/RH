/**
 * Who campaigns leave out (emailSuppressions): people who unsubscribed (emailLinks.ts) and
 * addresses Amazon SES put on its suppression list after a hard bounce or a spam complaint.
 * SES already stops sending to those by itself; copying them here keeps them out of the next
 * campaign's list and shows the bounce or complaint on the campaign they came from.
 *
 * The SES list has no webhook here (the SES key has no SNS rights), so a cron reads it every
 * 30 minutes, looking back 3 days so a missed run loses nothing.
 */
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { listSesSuppressions } from "../lib/email/ses";
import { recordCampaignEvent } from "./emailEvents";

const LOOK_BACK_MS = 3 * 24 * 60 * 60 * 1000;
const CHUNK = 200;

const recordRef = makeFunctionReference<
  "mutation",
  { items: { email: string; reason: "BOUNCE" | "COMPLAINT"; at: number }[] },
  { added: number }
>("emailSuppressions:recordSesSuppressions");

export const syncFromSes = internalAction({
  args: {},
  handler: async (ctx) => {
    const result = await listSesSuppressions(Date.now() - LOOK_BACK_MS);
    if (!result.ok) {
      console.error(`[EMAIL] SES suppression list: ${result.error}`);
      return { added: 0 };
    }
    let added = 0;
    for (let i = 0; i < result.items.length; i += CHUNK) {
      added += (await ctx.runMutation(recordRef, { items: result.items.slice(i, i + CHUNK) })).added;
    }
    return { added };
  },
});

export const recordSesSuppressions = internalMutation({
  args: {
    items: v.array(v.object({ email: v.string(), reason: v.union(v.literal("BOUNCE"), v.literal("COMPLAINT")), at: v.number() })),
  },
  handler: async (ctx, args) => {
    let added = 0;
    for (const item of args.items) {
      const reason = item.reason === "BOUNCE" ? ("bounced" as const) : ("complained" as const);
      const existing = await ctx.db
        .query("emailSuppressions")
        .withIndex("by_email", (q) => q.eq("email", item.email))
        .collect();
      if (existing.some((row) => row.reason === reason)) continue;

      // The campaign it came from: the latest one sent to this address
      const sends = await ctx.db
        .query("marketingQueue")
        .withIndex("by_email", (q) => q.eq("email", item.email))
        .order("desc")
        .take(20);
      const last = sends.filter((row) => row.status === "sent" && (row.sentAt ?? 0) <= item.at + 60_000).sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))[0];
      await ctx.db.insert("emailSuppressions", { email: item.email, reason, at: item.at, campaignId: last?.campaignId });
      if (last) {
        await recordCampaignEvent(ctx, {
          eventId: `ses-${reason}:${item.email}:${item.at}`,
          type: reason,
          email: item.email,
          campaignId: last.campaignId,
          at: item.at,
        });
      }
      added++;
    }
    return { added };
  },
});
