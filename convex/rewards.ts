/**
 * Reward points for physiotherapists, their tier, the rewards shop and their CPD record.
 *
 * - Earning: awardPoints() from the feature that earns them (outcomes, templates, library,
 *   community). Rules and caps in lib/rewards/rules.ts. Never for referrals, bookings or payments.
 * - Each change is a rewardLedger row; rewardAccounts keeps the running totals. Points last
 *   12 months: the daily expiry run takes off whatever the balance holds beyond points still valid.
 * - Spending: featured profile and referral boost start at once; a masterclass seat waits for the
 *   team; the CPD record is free. A cancelled request gives the points back.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { insertNotification } from "./helpers/pushNotify";
import { currentUser, physioOrNull, requirePhysio } from "./helpers/careAccess";
import { requireAdmin } from "./helpers/partnerAccess";
import { rewardKindValidator } from "./schema/rewards";
import {
  EARN,
  POINTS_LIFETIME_DAYS,
  REWARD_KIND,
  STARTER_REWARDS,
  TIERS,
  nextTier,
  tierFor,
  type EarnReason,
} from "../lib/rewards/rules";

type Ctx = QueryCtx | MutationCtx;

const DAY = 86_400_000;
const LAGOS_OFFSET = 60 * 60 * 1000;
const ME = "/dashboard/physiotherapist/me";

const startOfLagosDay = (now: number) => Math.floor((now + LAGOS_OFFSET) / DAY) * DAY - LAGOS_OFFSET;
const lagosYear = (now: number) => new Date(now + LAGOS_OFFSET).getUTCFullYear();
const tierRank = (key: string) => TIERS.findIndex((t) => t.key === key);

async function accountOf(ctx: Ctx, userId: Id<"users">) {
  return await ctx.db
    .query("rewardAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/** Works the account out again from the ledger and the CPD log. Returns the tier before and after. */
async function syncAccount(ctx: MutationCtx, userId: Id<"users">) {
  const now = Date.now();
  const rows = await ctx.db
    .query("rewardLedger")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const earned = rows.filter((r) => r.points > 0 && r.reason !== "refund");
  const year = lagosYear(now);
  const cpd = await ctx.db
    .query("cpdLog")
    .withIndex("by_user_year", (q) => q.eq("userId", userId).eq("year", year))
    .collect();
  const next = {
    balance: Math.max(0, rows.reduce((sum, r) => sum + r.points, 0)),
    earned12m: earned.filter((r) => r.createdAt > now - POINTS_LIFETIME_DAYS * DAY).reduce((sum, r) => sum + r.points, 0),
    lifetime: earned.reduce((sum, r) => sum + r.points, 0),
    cpdYear: year,
    cpdMinutes: cpd.reduce((sum, r) => sum + r.minutes, 0),
    updatedAt: now,
  };
  const tier = tierFor(next.earned12m).key;
  const existing = await accountOf(ctx, userId);
  if (existing) await ctx.db.patch(existing._id, { ...next, tier });
  else await ctx.db.insert("rewardAccounts", { userId, ...next, tier });
  return { before: existing?.tier ?? "bronze", after: tier, balance: next.balance };
}

/**
 * Gives a physio points for something that earns them. Safe to call more than once for the same
 * event (`dedupeKey`), and stops at the reason's daily cap. Returns the points given, or 0.
 */
export async function awardPoints(
  ctx: MutationCtx,
  input: { userId: Id<"users">; reason: EarnReason; dedupeKey: string; label?: string; refType?: string; refId?: string }
) {
  const rule = EARN[input.reason];
  const duplicate = await ctx.db
    .query("rewardLedger")
    .withIndex("by_dedupe", (q) => q.eq("dedupeKey", input.dedupeKey))
    .first();
  if (duplicate) return 0;
  const now = Date.now();
  const today = await ctx.db
    .query("rewardLedger")
    .withIndex("by_user", (q) => q.eq("userId", input.userId).gte("createdAt", startOfLagosDay(now)))
    .collect();
  const earnedToday = today.filter((r) => r.reason === input.reason).reduce((sum, r) => sum + r.points, 0);
  const points = Math.min(rule.points, rule.dailyCap - earnedToday);
  if (points <= 0) return 0;
  const label = input.label ?? rule.label;
  await ctx.db.insert("rewardLedger", {
    userId: input.userId,
    points,
    reason: input.reason,
    label,
    refType: input.refType,
    refId: input.refId,
    dedupeKey: input.dedupeKey,
    expiresAt: now + POINTS_LIFETIME_DAYS * DAY,
    expiryDone: false,
    createdAt: now,
  });
  const { before, after } = await syncAccount(ctx, input.userId);
  await insertNotification(ctx, {
    userId: input.userId,
    type: "reward_points",
    priority: "low",
    status: "pending",
    payload: { title: `+${points} points`, body: label, data: { actionUrl: ME } },
    createdAt: now,
  });
  if (tierRank(after) > tierRank(before)) {
    const name = TIERS[tierRank(after)].name;
    await insertNotification(ctx, {
      userId: input.userId,
      type: "reward_tier",
      priority: "medium",
      status: "pending",
      payload: { title: `You’re ${name} now`, body: `Your ${name} badge shows next to your name in Community and on your templates.`, data: { actionUrl: ME } },
      createdAt: now,
    });
  }
  return points;
}

/** Logs learning for the physio's yearly CPD record. Safe to call more than once (`dedupeKey`). */
export async function logCpd(
  ctx: MutationCtx,
  input: { userId: Id<"users">; minutes: number; source: string; label: string; refId?: string; dedupeKey: string }
) {
  const duplicate = await ctx.db
    .query("cpdLog")
    .withIndex("by_dedupe", (q) => q.eq("dedupeKey", input.dedupeKey))
    .first();
  if (duplicate) return false;
  const now = Date.now();
  await ctx.db.insert("cpdLog", {
    userId: input.userId,
    minutes: Math.max(1, Math.round(input.minutes)),
    source: input.source,
    label: input.label,
    refId: input.refId,
    dedupeKey: input.dedupeKey,
    year: lagosYear(now),
    createdAt: now,
  });
  await syncAccount(ctx, input.userId);
  return true;
}

/** A physio's tier, for badges next to their name (Community, templates). Bronze when unknown. */
export async function tierOf(ctx: Ctx, userId: Id<"users">) {
  const account = await accountOf(ctx, userId);
  return tierFor(account?.earned12m ?? 0);
}

/* ----------------------------------------------------------------------------------------------
 * Physio
 * --------------------------------------------------------------------------------------------*/

async function profileOf(ctx: Ctx, userId: Id<"users">) {
  return await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .first();
}

/** Me: points, tier, what was earned lately, what can be bought, and the CPD record. */
export const getMyRewards = query({
  args: {},
  handler: async (ctx) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return null;
    const now = Date.now();
    const account = await accountOf(ctx, physio._id);
    const earned12m = account?.earned12m ?? 0;
    const ledger = await ctx.db
      .query("rewardLedger")
      .withIndex("by_user", (q) => q.eq("userId", physio._id))
      .order("desc")
      .take(60);
    const week = ledger.filter((r) => r.createdAt > now - 7 * DAY && r.points > 0 && r.reason !== "refund");
    const items = await ctx.db
      .query("rewardItems")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    const redemptions = await ctx.db
      .query("rewardRedemptions")
      .withIndex("by_user", (q) => q.eq("userId", physio._id))
      .order("desc")
      .take(20);
    const year = lagosYear(now);
    const cpd = await ctx.db
      .query("cpdLog")
      .withIndex("by_user_year", (q) => q.eq("userId", physio._id).eq("year", year))
      .order("desc")
      .collect();
    const profile = await profileOf(ctx, physio._id);
    const featuredUntil = profile?.featuredStatus?.isFeatured ? (profile.featuredStatus.featuredUntil ?? null) : null;
    return {
      balance: account?.balance ?? 0,
      earned12m,
      tier: tierFor(earned12m),
      next: nextTier(earned12m),
      weekPoints: week.reduce((sum, r) => sum + r.points, 0),
      week: week.map((r) => ({ _id: r._id, points: r.points, label: r.label, at: r.createdAt })),
      history: ledger.map((r) => ({ _id: r._id, points: r.points, label: r.label, reason: r.reason, at: r.createdAt })),
      items: items
        .filter((i) => i.stock === undefined || i.stock > 0)
        .sort((a, b) => a.sort - b.sort)
        .map((i) => ({ _id: i._id, kind: i.kind, title: i.title, description: i.description, cost: i.cost, durationDays: i.durationDays ?? null })),
      redemptions: redemptions.map((r) => ({
        _id: r._id,
        kind: r.kind,
        title: r.title,
        cost: r.cost,
        status: r.status,
        endsAt: r.endsAt ?? null,
        note: r.note ?? null,
        at: r.createdAt,
      })),
      featuredUntil: featuredUntil && featuredUntil > now ? featuredUntil : null,
      boostUntil: profile?.referralBoostUntil && profile.referralBoostUntil > now ? profile.referralBoostUntil : null,
      cpd: {
        year,
        minutes: cpd.reduce((sum, r) => sum + r.minutes, 0),
        entries: cpd.map((r) => ({ _id: r._id, minutes: r.minutes, label: r.label, source: r.source, at: r.createdAt })),
      },
    };
  },
});

export const redeemReward = mutation({
  args: { itemId: v.id("rewardItems") },
  handler: async (ctx, args) => {
    const physio = await requirePhysio(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item || !item.active) throw new ConvexError("This reward isn’t available any more.");
    if (item.stock !== undefined && item.stock <= 0) throw new ConvexError("This reward has all been claimed.");
    const now = Date.now();
    const { balance } = await syncAccount(ctx, physio._id);
    if (balance < item.cost) throw new ConvexError(`You need ${item.cost - balance} more points for this.`);

    let status: Doc<"rewardRedemptions">["status"] = REWARD_KIND[item.kind].instant ? "active" : "pending";
    let startsAt: number | undefined;
    let endsAt: number | undefined;
    if (item.kind === "featured_profile" || item.kind === "referral_boost") {
      const profile = await profileOf(ctx, physio._id);
      if (!profile) throw new ConvexError("Finish your profile first.");
      const days = Math.max(1, item.durationDays ?? 7);
      const current = item.kind === "featured_profile" ? profile.featuredStatus?.featuredUntil : profile.referralBoostUntil;
      // Buying again while one runs adds the days on the end
      startsAt = current && current > now ? current : now;
      endsAt = startsAt + days * DAY;
      if (item.kind === "featured_profile") {
        await ctx.db.patch(profile._id, { featuredStatus: { ...(profile.featuredStatus ?? {}), isFeatured: true, featuredUntil: endsAt } });
      } else {
        await ctx.db.patch(profile._id, { referralBoostUntil: endsAt });
      }
    } else if (item.kind === "cpd_certificate") {
      status = "fulfilled";
    }

    const redemptionId = await ctx.db.insert("rewardRedemptions", {
      userId: physio._id,
      itemId: item._id,
      kind: item.kind,
      title: item.title,
      cost: item.cost,
      status,
      startsAt,
      endsAt,
      createdAt: now,
    });
    if (item.cost > 0) {
      await ctx.db.insert("rewardLedger", {
        userId: physio._id,
        points: -item.cost,
        reason: "spend",
        label: item.title,
        refType: "rewardRedemptions",
        refId: redemptionId,
        dedupeKey: `spend:${redemptionId}`,
        createdAt: now,
      });
    }
    if (item.stock !== undefined) await ctx.db.patch(item._id, { stock: item.stock - 1, updatedAt: now });
    const after = await syncAccount(ctx, physio._id);
    return { status, endsAt: endsAt ?? null, balance: after.balance, kind: item.kind };
  },
});

/** The CPD record for the PDF: name, year, and every entry. */
export const getMyCpdRecord = query({
  args: { year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const physio = await physioOrNull(ctx);
    if (!physio) return null;
    const year = args.year ?? lagosYear(Date.now());
    const entries = await ctx.db
      .query("cpdLog")
      .withIndex("by_user_year", (q) => q.eq("userId", physio._id).eq("year", year))
      .collect();
    const profile = await profileOf(ctx, physio._id);
    return {
      name: [physio.firstName, physio.lastName].filter(Boolean).join(" ") || "Physiotherapist",
      licence: profile?.licenseNumber ?? null,
      year,
      minutes: entries.reduce((sum, r) => sum + r.minutes, 0),
      entries: entries.map((r) => ({ minutes: r.minutes, label: r.label, source: r.source, at: r.createdAt })),
    };
  },
});

/* ----------------------------------------------------------------------------------------------
 * Daily run
 * --------------------------------------------------------------------------------------------*/

/** Cron, daily: points older than 12 months expire, and finished boosts and features end. */
export const runDailyRewards = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const lots = await ctx.db
      .query("rewardLedger")
      .withIndex("by_expiry", (q) => q.eq("expiryDone", false).lt("expiresAt", now))
      .take(1000);
    const users = new Set<Id<"users">>();
    for (const lot of lots) {
      users.add(lot.userId);
      await ctx.db.patch(lot._id, { expiryDone: true });
    }
    let expired = 0;
    for (const userId of users) {
      const rows = await ctx.db
        .query("rewardLedger")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const balance = rows.reduce((sum, r) => sum + r.points, 0);
      const stillValid = rows
        .filter((r) => r.points > 0 && r.reason !== "refund" && (r.expiresAt ?? Infinity) > now)
        .reduce((sum, r) => sum + r.points, 0);
      const over = balance - stillValid;
      if (over > 0) {
        await ctx.db.insert("rewardLedger", {
          userId,
          points: -over,
          reason: "expired",
          label: "Points older than 12 months",
          dedupeKey: `expired:${userId}:${startOfLagosDay(now)}`,
          createdAt: now,
        });
        expired += over;
      }
      await syncAccount(ctx, userId);
    }
    const running = await ctx.db
      .query("rewardRedemptions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    for (const r of running) {
      if (r.endsAt && r.endsAt < now) await ctx.db.patch(r._id, { status: "ended" });
    }
    return { expired, users: users.size };
  },
});

/* ----------------------------------------------------------------------------------------------
 * Admin
 * --------------------------------------------------------------------------------------------*/

export const adminRewardsOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const items = (await ctx.db.query("rewardItems").collect()).sort((a, b) => a.sort - b.sort);
    const pending = await ctx.db
      .query("rewardRedemptions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(100);
    const recent = await ctx.db.query("rewardRedemptions").order("desc").take(40);
    const top = await ctx.db.query("rewardAccounts").withIndex("by_earned").order("desc").take(20);
    const names = new Map<string, string>();
    const nameOf = async (id: Id<"users">) => {
      if (!names.has(id)) {
        const user = await ctx.db.get(id);
        names.set(id, [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Physiotherapist");
      }
      return names.get(id)!;
    };
    const row = async (r: Doc<"rewardRedemptions">) => ({
      _id: r._id,
      userId: r.userId,
      name: await nameOf(r.userId),
      kind: r.kind,
      title: r.title,
      cost: r.cost,
      status: r.status,
      endsAt: r.endsAt ?? null,
      note: r.note ?? null,
      at: r.createdAt,
    });
    return {
      items: items.map((i) => ({
        _id: i._id,
        kind: i.kind,
        title: i.title,
        description: i.description,
        cost: i.cost,
        durationDays: i.durationDays ?? null,
        stock: i.stock ?? null,
        active: i.active,
      })),
      pending: await Promise.all(pending.map(row)),
      recent: await Promise.all(recent.map(row)),
      top: await Promise.all(
        top.map(async (a) => ({
          userId: a.userId,
          name: await nameOf(a.userId),
          balance: a.balance,
          earned12m: a.earned12m,
          tier: tierFor(a.earned12m).name,
          cpdMinutes: a.cpdYear === lagosYear(Date.now()) ? a.cpdMinutes : 0,
        }))
      ),
    };
  },
});

export const adminAddStarterRewards = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.query("rewardItems").collect();
    const now = Date.now();
    let added = 0;
    for (const [i, starter] of STARTER_REWARDS.entries()) {
      if (existing.some((e) => e.kind === starter.kind)) continue;
      await ctx.db.insert("rewardItems", { ...starter, active: true, sort: (existing.length + i) * 10, createdAt: now, updatedAt: now });
      added += 1;
    }
    return { added };
  },
});

export const adminSaveRewardItem = mutation({
  args: {
    itemId: v.optional(v.id("rewardItems")),
    kind: rewardKindValidator,
    title: v.string(),
    description: v.string(),
    cost: v.number(),
    durationDays: v.optional(v.number()),
    stock: v.optional(v.number()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const title = args.title.trim();
    if (title.length < 3) throw new ConvexError("Give the reward a name.");
    if (!Number.isInteger(args.cost) || args.cost < 0) throw new ConvexError("The price must be a whole number of points.");
    const needsDays = args.kind === "featured_profile" || args.kind === "referral_boost";
    const fields = {
      kind: args.kind,
      title: title.slice(0, 80),
      description: args.description.trim().slice(0, 400) || REWARD_KIND[args.kind].effect,
      cost: args.cost,
      durationDays: needsDays ? Math.min(90, Math.max(1, Math.round(args.durationDays ?? 7))) : undefined,
      stock: args.stock === undefined ? undefined : Math.max(0, Math.round(args.stock)),
      active: args.active,
      updatedAt: Date.now(),
    };
    if (args.itemId) {
      await ctx.db.patch(args.itemId, fields);
      return { itemId: args.itemId };
    }
    const count = (await ctx.db.query("rewardItems").collect()).length;
    return { itemId: await ctx.db.insert("rewardItems", { ...fields, sort: count * 10, createdAt: Date.now() }) };
  },
});

/** Confirms a masterclass seat (or other request), or cancels it and gives the points back. */
export const adminHandleRedemption = mutation({
  args: { redemptionId: v.id("rewardRedemptions"), action: v.union(v.literal("fulfil"), v.literal("cancel")), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx);
    const redemption = await ctx.db.get(args.redemptionId);
    if (!redemption) throw new ConvexError("Request not found.");
    if (redemption.status !== "pending") throw new ConvexError("This request has already been handled.");
    const now = Date.now();
    const note = args.note?.trim().slice(0, 400) || undefined;
    await ctx.db.patch(redemption._id, {
      status: args.action === "fulfil" ? "fulfilled" : "cancelled",
      note,
      handledBy: admin._id,
      handledAt: now,
    });
    if (args.action === "cancel" && redemption.cost > 0) {
      await ctx.db.insert("rewardLedger", {
        userId: redemption.userId,
        points: redemption.cost,
        reason: "refund",
        label: `Points back: ${redemption.title}`,
        refType: "rewardRedemptions",
        refId: redemption._id,
        dedupeKey: `refund:${redemption._id}`,
        createdAt: now,
      });
      await syncAccount(ctx, redemption.userId);
    }
    await insertNotification(ctx, {
      userId: redemption.userId,
      type: "reward_redemption",
      priority: "medium",
      status: "pending",
      payload: {
        title: args.action === "fulfil" ? `${redemption.title}: confirmed` : `${redemption.title}: cancelled`,
        body: note ?? (args.action === "fulfil" ? "The Rehabify team has confirmed your reward." : "Your points have been given back."),
        data: { actionUrl: ME },
      },
      createdAt: now,
    });
    return { ok: true };
  },
});

/** Adds or takes away points by hand, always with a reason the physio can see. */
export const adminAdjustPoints = mutation({
  args: { email: v.string(), points: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx);
    const reason = args.reason.trim();
    if (reason.length < 5) throw new ConvexError("Say why, in a few words. The physio sees it.");
    if (!Number.isInteger(args.points) || args.points === 0 || Math.abs(args.points) > 10_000) {
      throw new ConvexError("Use a whole number of points between -10,000 and 10,000.");
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first();
    if (!user || user.role !== "physiotherapist") throw new ConvexError("No physiotherapist with that email.");
    const now = Date.now();
    await ctx.db.insert("rewardLedger", {
      userId: user._id,
      points: args.points,
      reason: "adjust",
      label: reason.slice(0, 120),
      dedupeKey: `adjust:${user._id}:${now}`,
      expiresAt: args.points > 0 ? now + POINTS_LIFETIME_DAYS * DAY : undefined,
      expiryDone: args.points > 0 ? false : undefined,
      createdBy: admin._id,
      createdAt: now,
    });
    const { balance } = await syncAccount(ctx, user._id);
    return { balance };
  },
});

/** For the signed-in user's own badge (shell, community): tier only. */
export const getMyTier = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "physiotherapist") return null;
    const account = await accountOf(ctx, user._id);
    return { tier: tierFor(account?.earned12m ?? 0), balance: account?.balance ?? 0 };
  },
});
