/**
 * Live presence (owner 2026-11-15: admins see how many people are on the platform right now,
 * accurately). Each visible tab calls `beat` every 45 s (components/presence/PresenceBeat.tsx).
 *
 * Accuracy: signed-in people count once however many tabs or devices they have open. Visitors
 * who allowed analytics count once per browser; visitors who didn't are counted per page view (no
 * id is stored on their device), so "visitors" can run slightly high, never low. A tab in the
 * background stops beating, so it drops off within 2 minutes.
 */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getViewer } from "./helpers/partnerAccess";
import { lagosDay } from "../lib/learn/points";

const LIVE_MS = 2 * 60 * 1000;
const MIN_GAP_MS = 15 * 1000;
const AREAS = new Set(["site", "learn", "patient", "physio", "clinic", "admin", "family", "partner", "call", "blog"]);
const DEVICES = new Set(["phone", "tablet", "computer"]);

/** What sort of person this is, for the counts. */
async function kindOf(ctx: QueryCtx | MutationCtx, user: Doc<"users"> | null): Promise<string> {
  if (!user) return "visitor";
  switch (user.role) {
    case "patient":
      return "patient";
    case "physiotherapist":
      return "physio";
    case "clinic_owner":
    case "clinic_staff":
      return "clinic";
    case "admin":
      return "admin";
    case "family_member":
      return "family";
    case "doctor":
      return "doctor";
    case "partner":
      return "partner";
    case "blog_editor":
    case "learn_instructor":
      return "team";
  }
  const learner = await ctx.db
    .query("learnProfiles")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();
  return learner ? "learner" : "new";
}

export const beat = mutation({
  args: { sid: v.string(), area: v.string(), device: v.string() },
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(args.sid)) return null;
    const area = AREAS.has(args.area) ? args.area : "site";
    const device = DEVICES.has(args.device) ? args.device : "computer";
    const now = Date.now();
    const viewer = await getViewer(ctx);
    const user = viewer?.user && !viewer.user.deletedAt ? viewer.user : null;
    const row = await ctx.db
      .query("presenceSessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .first();
    let kind: string;
    if (row) {
      // Same person, same place, beat too soon: nothing to write
      if (now - row.lastSeen < MIN_GAP_MS && row.area === area && row.userId === user?._id) return null;
      kind = row.userId === user?._id && row.kind !== "new" ? row.kind : await kindOf(ctx, user);
      await ctx.db.patch(row._id, { lastSeen: now, area, device, userId: user?._id, kind });
    } else {
      kind = await kindOf(ctx, user);
      await ctx.db.insert("presenceSessions", { sid: args.sid, userId: user?._id, kind, area, device, startedAt: now, lastSeen: now });
    }
    // Active today (once per person or browser per Lagos day)
    const day = lagosDay(now);
    const key = user ? `u:${user._id}` : `d:${args.sid}`;
    const seenToday = await ctx.db
      .query("presenceDays")
      .withIndex("by_day_key", (q) => q.eq("day", day).eq("key", key))
      .first();
    if (!seenToday) await ctx.db.insert("presenceDays", { day, key, kind, signedIn: Boolean(user), firstSeen: now });
    return null;
  },
});

const KIND_ORDER = ["patient", "physio", "clinic", "learner", "family", "doctor", "partner", "team", "admin", "new", "visitor"];
const lagosDayBefore = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

/** The admin Live now page. `at` moves the 2-minute window forward even when nobody new arrives. */
export const adminLive = query({
  args: { at: v.number() },
  handler: async (ctx, args) => {
    // Platform admins only (Learn and blog team members get nothing)
    const viewer = await getViewer(ctx);
    if (!viewer?.isAdmin || !viewer.user) return null;
    const now = Math.max(args.at, 0);
    const rows = await ctx.db
      .query("presenceSessions")
      .withIndex("by_lastSeen", (q) => q.gte("lastSeen", now - LIVE_MS))
      .take(5000);
    // One entry per person: signed-in people by account (their latest tab), others by browser
    const people = new Map<string, Doc<"presenceSessions">>();
    for (const r of rows) {
      const key = r.userId ? `u:${r.userId}` : `d:${r.sid}`;
      const prev = people.get(key);
      if (!prev || r.lastSeen > prev.lastSeen) people.set(key, prev ? { ...r, startedAt: Math.min(prev.startedAt, r.startedAt) } : r);
    }
    const list = [...people.values()];
    const count = (pick: (r: Doc<"presenceSessions">) => string) => {
      const out: Record<string, number> = {};
      for (const r of list) out[pick(r)] = (out[pick(r)] ?? 0) + 1;
      return out;
    };
    const byKind = count((r) => r.kind);
    const signedIn = list.filter((r) => r.userId);
    const online = [];
    for (const r of signedIn.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.lastSeen - a.lastSeen).slice(0, 150)) {
      const user = r.userId ? await ctx.db.get(r.userId) : null;
      online.push({
        userId: r.userId!,
        name: user ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "Someone" : "Someone",
        kind: r.kind,
        area: r.area,
        device: r.device,
        since: r.startedAt,
        lastSeen: r.lastSeen,
      });
    }

    // Active today / 7 days / 30 days: distinct people (signed in) and browsers
    const today = lagosDay(now);
    const active = async (days: number) => {
      const keys = new Set<string>();
      let signed = 0;
      for (let i = 0; i < days; i++) {
        const rowsForDay = await ctx.db
          .query("presenceDays")
          .withIndex("by_day", (q) => q.eq("day", lagosDayBefore(today, i)))
          .take(4000);
        for (const d of rowsForDay) {
          if (keys.has(d.key)) continue;
          keys.add(d.key);
          if (d.signedIn) signed++;
        }
      }
      return { total: keys.size, signedIn: signed, visitors: keys.size - signed };
    };

    return {
      at: now,
      live: { total: list.length, signedIn: signedIn.length, visitors: list.length - signedIn.length, tabs: rows.length },
      byKind: KIND_ORDER.filter((k) => byKind[k]).map((k) => ({ kind: k, count: byKind[k] })),
      byArea: Object.entries(count((r) => r.area))
        .map(([area, n]) => ({ area, count: n }))
        .sort((a, b) => b.count - a.count),
      byDevice: Object.entries(count((r) => r.device)).map(([device, n]) => ({ device, count: n })),
      online,
      today: await active(1),
      week: await active(7),
      month: await active(30),
    };
  },
});

/** Hourly: drop old heartbeat rows (live counts only look back 2 minutes; days are kept 120 days). */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("presenceSessions")
      .withIndex("by_lastSeen", (q) => q.lt("lastSeen", now - 6 * 3600_000))
      .take(1000);
    for (const r of stale) await ctx.db.delete(r._id);
    const cutoff = lagosDayBefore(lagosDay(now), 120);
    const oldDays = await ctx.db
      .query("presenceDays")
      .withIndex("by_day", (q) => q.lt("day", cutoff))
      .take(1000);
    for (const r of oldDays) await ctx.db.delete(r._id);
    return { sessions: stale.length, days: oldDays.length };
  },
});
