/**
 * The unsubscribe link, open pixel and tracked links in campaign emails (helpers/emailLinks.ts
 * signs them; convex/http.ts routes /e/u, /e/o and /e/c here).
 *
 * Unsubscribing adds the address to emailSuppressions, which every later campaign leaves out.
 * Appointment, payment and account emails are not campaigns and still arrive.
 */
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { httpAction, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { publicAppUrl } from "./helpers/appUrl";
import { signatureOk, signedData } from "./helpers/emailLinks";
import { recordCampaignEvent } from "./emailEvents";
import { EMAIL_COLORS as C, EMAIL_LOGO_ON_DARK, escapeEmailText } from "../lib/email/layout";
import { SUPPORT_EMAIL } from "../lib/contact";

const unsubscribeRef = makeFunctionReference<"mutation", { rowId: string; confirm: boolean }, { email: string | null; done: boolean }>(
  "emailLinks:unsubscribeRow"
);
const trackRef = makeFunctionReference<"mutation", { rowId: string; type: "opened" | "clicked" }, null>("emailLinks:trackRow");

const maskEmail = (email: string) => email.replace(/^(.)(.*?)(.?)(@.*)$/, (_, a: string, mid: string, b: string, domain: string) => `${a}${mid ? "•••" : ""}${b}${domain}`);

/** Unsubscribes the queue row's address (confirm), or only looks it up for the confirm page. */
export const unsubscribeRow = internalMutation({
  args: { rowId: v.string(), confirm: v.boolean() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("marketingQueue", args.rowId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row) return { email: null, done: false };
    const existing = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", row.email))
      .first();
    if (!args.confirm) return { email: row.email, done: Boolean(existing) };
    if (!existing) {
      await ctx.db.insert("emailSuppressions", { email: row.email, reason: "unsubscribed", at: Date.now(), campaignId: row.campaignId });
      const campaign = await ctx.db.get(row.campaignId);
      if (campaign) await ctx.db.patch(campaign._id, { unsubscribedCount: (campaign.unsubscribedCount ?? 0) + 1 });
    }
    return { email: row.email, done: true };
  },
});

/** An open or a click, counted once per person per campaign (a click counts as an open too). */
export const trackRow = internalMutation({
  args: { rowId: v.string(), type: v.union(v.literal("opened"), v.literal("clicked")) },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("marketingQueue", args.rowId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row) return null;
    const types = args.type === "clicked" ? (["opened", "clicked"] as const) : (["opened"] as const);
    for (const type of types) {
      await recordCampaignEvent(ctx, {
        eventId: `${type}:${row._id}`,
        type,
        email: row.email,
        campaignId: row.campaignId as Id<"marketingCampaigns">,
        at: Date.now(),
      });
    }
    return null;
  },
});

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeEmailText(title)} · Rehabify</title></head>
<body style="margin:0;background:${C.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.text};">
<div style="max-width:480px;margin:0 auto;padding:40px 20px;">
<img src="${EMAIL_LOGO_ON_DARK}" alt="Rehabify" width="180" style="display:block;margin:0 auto 28px;width:180px;height:auto;">
<div style="background:#ffffff;border-radius:20px;padding:32px 28px;">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${C.ink};">${escapeEmailText(title)}</h1>
${body}
</div></div></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

const p = (text: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${text}</p>`;
const stillGet = p("You'll still get emails about your appointments, payments and account.");

function invalidLink() {
  return page(
    "This link doesn't work",
    p(`It may have been copied only in part. To stop our emails, write to <a href="mailto:${SUPPORT_EMAIL}?subject=Unsubscribe" style="color:${C.brand};">${SUPPORT_EMAIL}</a> and we'll take you off the list.`),
    400
  );
}

/** /e/u: GET asks to confirm (so link checkers can't unsubscribe anyone); POST unsubscribes. */
export const unsubscribeLink = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const rowId = url.searchParams.get("r") ?? "";
  const ok = rowId && (await signatureOk(signedData.unsubscribe(rowId), url.searchParams.get("t")));
  if (!ok) return invalidLink();

  if (request.method === "POST") {
    const result = await ctx.runMutation(unsubscribeRef, { rowId, confirm: true });
    if (!result.email) return invalidLink();
    return page(
      "You're unsubscribed",
      p(`<strong>${escapeEmailText(maskEmail(result.email))}</strong> won't get Rehabify news and updates any more.`) + stillGet
    );
  }

  const result = await ctx.runMutation(unsubscribeRef, { rowId, confirm: false });
  if (!result.email) return invalidLink();
  if (result.done) {
    return page("You're already unsubscribed", p(`<strong>${escapeEmailText(maskEmail(result.email))}</strong> doesn't get Rehabify news and updates.`) + stillGet);
  }
  const action = `${url.pathname}${url.search}`;
  return page(
    "Unsubscribe from Rehabify emails?",
    p(`<strong>${escapeEmailText(maskEmail(result.email))}</strong> will stop getting Rehabify news and updates.`) +
      stillGet +
      `<form method="post" action="${escapeEmailText(action)}" style="margin:8px 0 0;">
<button type="submit" style="width:100%;min-height:48px;border:0;border-radius:999px;background:${C.lime};color:${C.ink};font-size:16px;font-weight:700;cursor:pointer;">Unsubscribe</button>
</form>`
  );
});

// 1×1 transparent GIF
const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

/** /e/o: the open pixel. Always answers with the image, counted only when the link is ours. */
export const openPixel = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const rowId = url.searchParams.get("r") ?? "";
  if (rowId && (await signatureOk(signedData.open(rowId), url.searchParams.get("t")))) {
    await ctx.runMutation(trackRef, { rowId, type: "opened" }).catch(() => null);
  }
  return new Response(PIXEL, { status: 200, headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0" } });
});

/** /e/c: a tracked link. Counts the click, then goes on to the link we signed (never anywhere else). */
export const clickLink = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const rowId = url.searchParams.get("r") ?? "";
  const target = url.searchParams.get("u") ?? "";
  const ok = rowId && /^https?:\/\//i.test(target) && (await signatureOk(signedData.click(rowId, target), url.searchParams.get("t")));
  if (!ok) return Response.redirect(publicAppUrl(), 302);
  await ctx.runMutation(trackRef, { rowId, type: "clicked" }).catch(() => null);
  return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store" } });
});
