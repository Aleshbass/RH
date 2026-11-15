/**
 * Awarding Rehabify Learn points (rules in lib/learn/points.ts). Called from the places learners
 * do things: lessons and courses (learn.ts), simulations (learnSims.ts), the Learn community
 * (learnCommunity.ts) and Spaces (learnSpaces.ts). Every award has a unique key, so calling twice
 * for the same event is safe; daily caps stop farming. Also keeps the streak, the monthly totals
 * that drive the leaderboard, and unlocks badges.
 */
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { COUNT_FOR, LEARN_BADGES, LEARN_EARN, dayBefore, lagosDay, lagosMonth, type LearnEarnReason } from "../../lib/learn/points";

async function accountFor(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await ctx.db.query("learnPointsAccounts").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
  if (existing) return existing;
  const id = await ctx.db.insert("learnPointsAccounts", { userId, total: 0, counts: {}, streak: 0, bestStreak: 0, updatedAt: Date.now() });
  return (await ctx.db.get(id))!;
}

async function addMonthly(ctx: MutationCtx, userId: Id<"users">, month: string, points: number) {
  const row = await ctx.db
    .query("learnPointsMonthly")
    .withIndex("by_month_user", (q) => q.eq("month", month).eq("userId", userId))
    .unique();
  if (row) await ctx.db.patch(row._id, { points: Math.max(0, row.points + points), updatedAt: Date.now() });
  else if (points > 0) await ctx.db.insert("learnPointsMonthly", { month, userId, points, updatedAt: Date.now() });
}

/** Unlocks any count-based badges the account has reached. */
async function checkBadges(ctx: MutationCtx, userId: Id<"users">, total: number, bestStreak: number, counts: Record<string, number>) {
  const have = new Set(
    (await ctx.db.query("learnBadges").withIndex("by_user", (q) => q.eq("userId", userId)).collect()).map((b) => b.badge)
  );
  const now = Date.now();
  for (const badge of LEARN_BADGES) {
    if (!badge.count || have.has(badge.id)) continue;
    const value = badge.count.key === "total" ? total : badge.count.key === "bestStreak" ? bestStreak : (counts[badge.count.key] ?? 0);
    if (value >= badge.count.atLeast) await ctx.db.insert("learnBadges", { userId, badge: badge.id, earnedAt: now });
  }
}

/**
 * Gives a learner points for something they did. `key` must identify the event (e.g.
 * `lesson:<userId>:<lessonId>`). Returns the points given (0 when already given or capped).
 */
export async function awardLearnPoints(
  ctx: MutationCtx,
  input: { userId: Id<"users">; reason: LearnEarnReason; key: string; label?: string; backfill?: boolean }
): Promise<number> {
  const rule = LEARN_EARN[input.reason];
  const seen = await ctx.db.query("learnPointsLedger").withIndex("by_key", (q) => q.eq("key", input.key)).first();
  if (seen) return 0;
  const now = Date.now();
  const day = lagosDay(now);
  const month = lagosMonth(now);
  const today = await ctx.db
    .query("learnPointsLedger")
    .withIndex("by_user_day", (q) => q.eq("userId", input.userId).eq("day", day))
    .collect();
  const earnedToday = today.filter((r) => r.reason === input.reason).reduce((sum, r) => sum + r.points, 0);
  // Crediting past activity (one-off backfill) ignores today's caps
  const points = input.backfill ? rule.points : Math.min(rule.points, rule.dailyCap - earnedToday);
  if (points <= 0) return 0;
  await ctx.db.insert("learnPointsLedger", {
    userId: input.userId,
    points,
    reason: input.reason,
    label: input.label ?? rule.label,
    key: input.key,
    month,
    day,
    createdAt: now,
  });

  const account = await accountFor(ctx, input.userId);
  const counts = { ...account.counts };
  const countKey = COUNT_FOR[input.reason];
  if (countKey) counts[countKey] = (counts[countKey] ?? 0) + 1;
  // Streak: one learning day at a time (Lagos days)
  let streak = account.streak;
  if (!input.backfill && account.lastDay !== day) streak = account.lastDay === dayBefore(day) ? account.streak + 1 : 1;
  const bestStreak = Math.max(account.bestStreak, streak);
  const total = account.total + points;
  await ctx.db.patch(account._id, { total, counts, streak, bestStreak, lastDay: input.backfill ? account.lastDay : day, updatedAt: now });
  await addMonthly(ctx, input.userId, month, points);
  await checkBadges(ctx, input.userId, total, bestStreak, counts);

  // Every 7 days in a row earns a streak bonus (once that day)
  if (!input.backfill && input.reason !== "streak" && streak > account.streak && streak % 7 === 0) {
    await awardLearnPoints(ctx, { userId: input.userId, reason: "streak", key: `streak:${input.userId}:${day}`, label: `${streak} days of learning in a row` });
  }
  return points;
}

/** Takes back the points for an event that was undone (a "helpful" mark removed). Badges stay. */
export async function revokeLearnPoints(ctx: MutationCtx, key: string) {
  const row = await ctx.db.query("learnPointsLedger").withIndex("by_key", (q) => q.eq("key", key)).first();
  if (!row) return 0;
  await ctx.db.delete(row._id);
  const account = await accountFor(ctx, row.userId);
  const counts = { ...account.counts };
  const countKey = COUNT_FOR[row.reason as LearnEarnReason];
  if (countKey) counts[countKey] = Math.max(0, (counts[countKey] ?? 0) - 1);
  await ctx.db.patch(account._id, { total: Math.max(0, account.total - row.points), counts, updatedAt: Date.now() });
  await addMonthly(ctx, row.userId, row.month, -row.points);
  return row.points;
}
