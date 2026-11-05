/**
 * Email campaign tracking: Resend tells us when a campaign email is delivered, opened, clicked,
 * bounced or marked as spam (webhook, Svix-signed with RESEND_WEBHOOK_SECRET). Each counts once
 * per person per campaign on the campaign (deliveredCount, openedCount, …) for Admin › Emails.
 *
 * Opens come from a tracking image, so they're an estimate: Apple Mail can count opens that didn't
 * happen and some apps block images. Emails that aren't from a campaign are ignored.
 *
 * Resend setup (once): Domains › open tracking on (Admin › Emails can switch it on), and
 * Webhooks › add https://<deployment>.convex.site/resend/webhook with the email.delivered,
 * email.opened, email.clicked, email.bounced and email.complained events; put its signing
 * secret in Convex as RESEND_WEBHOOK_SECRET.
 */
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { httpAction, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

type EventType = "delivered" | "opened" | "clicked" | "bounced" | "complained";
const TYPES: Record<string, EventType> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};
const COUNTER: Record<EventType, "deliveredCount" | "openedCount" | "clickedCount" | "bouncedCount" | "complainedCount"> = {
  delivered: "deliveredCount",
  opened: "openedCount",
  clicked: "clickedCount",
  bounced: "bouncedCount",
  complained: "complainedCount",
};
const TOLERANCE_MS = 5 * 60 * 1000;

const recordRef = makeFunctionReference<
  "mutation",
  { eventId: string; type: EventType; email: string; campaignId?: string; broadcastId?: string; at: number },
  { counted: boolean }
>("emailEvents:recordEmailEvent");

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Svix signature check: v1 = base64 HMAC-SHA256 of "<id>.<timestamp>.<body>". */
async function verifySvix(secret: string, id: string, timestamp: string, body: string, header: string): Promise<boolean> {
  const sent = Number(timestamp) * 1000;
  if (!Number.isFinite(sent) || Math.abs(Date.now() - sent) > TOLERANCE_MS) return false;
  const keyBytes = base64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  const expected = bytesToBase64(new Uint8Array(signature));
  return header.split(" ").some((part) => {
    const [version, value] = part.split(",");
    return version === "v1" && typeof value === "string" && sameText(value, expected);
  });
}

/** Tags come as [{ name, value }] or { name: value }. */
function tagValue(tags: unknown, name: string): string | undefined {
  if (Array.isArray(tags)) {
    const found = tags.find((t) => t && typeof t === "object" && (t as { name?: unknown }).name === name) as { value?: unknown } | undefined;
    return typeof found?.value === "string" ? found.value : undefined;
  }
  if (tags && typeof tags === "object") {
    const value = (tags as Record<string, unknown>)[name];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

export const resendWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  const body = await request.text();
  const id = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signature = request.headers.get("svix-signature") ?? "";
  if (!id || !timestamp || !signature || !(await verifySvix(secret, id, timestamp, body, signature))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let event: { type?: string; created_at?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const type = TYPES[event.type ?? ""];
  const data = event.data ?? {};
  const to = Array.isArray(data.to) ? data.to[0] : data.to;
  if (!type || typeof to !== "string") return new Response("Ignored", { status: 200 });
  const at = Date.parse(String(event.created_at ?? data.created_at ?? "")) || Date.now();
  await ctx.runMutation(recordRef, {
    eventId: id,
    type,
    email: to.trim().toLowerCase(),
    campaignId: tagValue(data.tags, "campaign_id"),
    broadcastId: typeof data.broadcast_id === "string" ? data.broadcast_id : undefined,
    at,
  });
  return new Response("OK", { status: 200 });
});

/** Records one event once (by Svix id), counting each person once per campaign and event type. */
export const recordEmailEvent = internalMutation({
  args: {
    eventId: v.string(),
    type: v.union(v.literal("delivered"), v.literal("opened"), v.literal("clicked"), v.literal("bounced"), v.literal("complained")),
    email: v.string(),
    campaignId: v.optional(v.string()),
    broadcastId: v.optional(v.string()),
    at: v.number(),
  },
  handler: async (ctx, args) => {
    let campaign: Doc<"marketingCampaigns"> | null = null;
    const tagged = args.campaignId ? ctx.db.normalizeId("marketingCampaigns", args.campaignId) : null;
    if (tagged) campaign = await ctx.db.get(tagged);
    if (!campaign && args.broadcastId) {
      const recent = await ctx.db.query("marketingCampaigns").withIndex("by_created").order("desc").take(300);
      campaign = recent.find((c) => c.broadcastIds.includes(args.broadcastId!)) ?? null;
    }
    // Not a campaign email (receipts, reminders…): nothing to record
    if (!campaign) return { counted: false };

    const seen = await ctx.db
      .query("marketingEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .first();
    if (seen) return { counted: false };
    const already = await ctx.db
      .query("marketingEvents")
      .withIndex("by_campaign_email_type", (q) => q.eq("campaignId", campaign!._id).eq("email", args.email).eq("type", args.type))
      .first();
    await ctx.db.insert("marketingEvents", {
      campaignId: campaign._id as Id<"marketingCampaigns">,
      email: args.email,
      type: args.type,
      at: args.at,
      eventId: args.eventId,
    });
    if (already) return { counted: false };
    const field = COUNTER[args.type];
    await ctx.db.patch(campaign._id, { [field]: (campaign[field] ?? 0) + 1 });
    return { counted: true };
  },
});
