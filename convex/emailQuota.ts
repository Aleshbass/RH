/**
 * Resend quota alerts (owner 2026-11-17: "let admin know when the Resend 100/day free tier is
 * exhausted"). Any email sender that gets daily_quota_exceeded / monthly_quota_exceeded from
 * Resend posts here (lib/email/resendQuota.ts). The first one each day alerts every admin by bell
 * and push (email can't go out, so it never emails); later ones only add to the day's count.
 */
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { httpAction, internalMutation, query } from "./_generated/server";
import { insertNotification } from "./helpers/pushNotify";
import { requireAdmin } from "./helpers/partnerAccess";
import { resendQuotaToken } from "../lib/email/resendQuota";

const ADMIN_EMAILS_PAGE = "/dashboard/admin/emails";
const kindValidator = v.union(v.literal("daily"), v.literal("monthly"));

const recordRef = makeFunctionReference<"mutation", { kind: "daily" | "monthly"; source: string }, null>("emailQuota:recordQuotaHit");

/** POST /email/quota-hit, from our own servers only (the token is derived from the Resend key). */
export const quotaHit = httpAction(async (ctx, request) => {
  const apiKey = process.env.RESEND_API_KEY;
  const token = request.headers.get("x-quota-token") ?? "";
  if (!apiKey || token.length !== 64 || token !== (await resendQuotaToken(apiKey))) return new Response("Forbidden", { status: 403 });
  let body: { kind?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const kind = body.kind === "monthly" ? "monthly" : body.kind === "daily" ? "daily" : null;
  if (!kind) return new Response("Bad request", { status: 400 });
  await ctx.runMutation(recordRef, { kind, source: typeof body.source === "string" ? body.source.slice(0, 60) : "unknown" });
  return new Response(null, { status: 204 });
});

/** Counts the day's refusals; the first one of the day alerts the admins. */
export const recordQuotaHit = internalMutation({
  args: { kind: kindValidator, source: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10); // Resend's daily quota resets at midnight UTC
    const existing = await ctx.db
      .query("emailQuotaAlerts")
      .withIndex("by_day_kind", (q) => q.eq("day", day).eq("kind", args.kind))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { hits: existing.hits + 1, lastAt: now });
      return null;
    }
    await ctx.db.insert("emailQuotaAlerts", { day, kind: args.kind, firstAt: now, lastAt: now, hits: 1, firstSource: args.source });

    const title = args.kind === "daily" ? "Emails have stopped for today" : "Emails have stopped for this month";
    const body =
      args.kind === "daily"
        ? "Resend's free plan sends 100 emails a day and today's are used up. Receipts, approvals, reminders and other emails won't go out until 1:00 am Lagos time. Upgrade Resend to the Pro plan to stop this happening."
        : "Resend's monthly email limit is used up. No emails will go out until it resets or the Resend plan is upgraded.";
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .take(50);
    for (const admin of admins) {
      await insertNotification(ctx, {
        userId: admin._id,
        type: "system_alert",
        priority: "high",
        status: "pending",
        payload: { title, body, data: { entityType: "email_quota", actionUrl: ADMIN_EMAILS_PAGE } },
        createdAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

/** Admin › Emails: today's quota state, so the page can say why emails aren't arriving. */
export const getQuotaStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "emailQuota:getQuotaStatus");
    const day = new Date().toISOString().slice(0, 10);
    const rows = await ctx.db
      .query("emailQuotaAlerts")
      .withIndex("by_day_kind", (q) => q.eq("day", day))
      .take(5);
    const recent = await ctx.db.query("emailQuotaAlerts").order("desc").take(10);
    return {
      today: rows.map((r) => ({ kind: r.kind, firstAt: r.firstAt, hits: r.hits })),
      recentDays: recent.map((r) => ({ day: r.day, kind: r.kind, hits: r.hits })),
    };
  },
});
