/**
 * Rehabify Learn: points, badges, the monthly leaderboard and "My progress" (owner 2026-11-14).
 * Awards happen in helpers/learnPoints.ts; this file reads them. The leaderboard is live (Convex
 * queries update as points land). The Rehabify team never ranks, and anyone can hide themselves.
 * Each month's top 10 is frozen on the 1st (crons.ts) for admins to contact privately; prizes are
 * never shown.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer } from "./helpers/partnerAccess";
import { awardLearnPoints } from "./helpers/learnPoints";
import { requireLearnAdmin } from "./helpers/learnAccess";
import { learnMemberInfo, type LearnMemberInfo } from "./learn";
import { LEARN_BADGES, lagosMonth, monthBefore, monthLabel } from "../lib/learn/points";

const PHYSIO_KINDS = new Set(["rehabify_physio", "physio", "physio_pending"]);
type Scope = "all" | "students" | "physios";
const scopeValidator = v.union(v.literal("all"), v.literal("students"), v.literal("physios"));

async function accountOf(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db.query("learnPointsAccounts").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
}

/** Whether this learner can appear on the leaderboard in this scope. */
function ranks(member: LearnMemberInfo | null, hidden: boolean | undefined, scope: Scope) {
  if (!member || hidden || member.isAdmin || member.tag.kind === "team") return false;
  if (scope === "students") return member.isStudent || member.tag.kind === "student";
  if (scope === "physios") return PHYSIO_KINDS.has(member.tag.kind);
  return true;
}

type Ranked = { userId: Id<"users">; points: number; member: LearnMemberInfo };

/** The ranked learners for a month (or all time), best first, ties sharing a rank. */
async function rankedRows(ctx: QueryCtx, period: "month" | "all", month: string, scope: Scope, limit = 400): Promise<(Ranked & { rank: number })[]> {
  const source: { userId: Id<"users">; points: number }[] =
    period === "month"
      ? (await ctx.db.query("learnPointsMonthly").withIndex("by_month_points", (q) => q.eq("month", month)).order("desc").take(limit)).map((r) => ({
          userId: r.userId,
          points: r.points,
        }))
      : (await ctx.db.query("learnPointsAccounts").withIndex("by_total").order("desc").take(limit)).map((r) => ({ userId: r.userId, points: r.total }))
  const out: (Ranked & { rank: number })[] = [];
  for (const row of source) {
    if (row.points <= 0) continue;
    const user = await ctx.db.get(row.userId);
    const member = await learnMemberInfo(ctx, user);
    const hidden = (await accountOf(ctx, row.userId))?.hidden;
    if (!member || !ranks(member, hidden, scope)) continue;
    const prev = out[out.length - 1];
    out.push({ userId: row.userId, points: row.points, member, rank: prev && prev.points === row.points ? prev.rank : out.length + 1 });
  }
  return out;
}

const publicRow = (r: Ranked & { rank: number }, meId: Id<"users"> | null) => ({
  rank: r.rank,
  name: r.member.name,
  imageUrl: r.member.imageUrl,
  tag: { kind: r.member.tag.kind, label: r.member.tag.label },
  points: r.points,
  isMe: r.userId === meId,
});

/** The leaderboard for signed-in Learn members (live). */
export const leaderboard = query({
  args: { period: v.union(v.literal("month"), v.literal("all")), scope: scopeValidator },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const me = await learnMemberInfo(ctx, viewer?.user ?? null);
    if (!me) return { state: "join" as const, signedIn: Boolean(viewer) };
    const month = lagosMonth(Date.now());
    const rows = await rankedRows(ctx, args.period, month, args.scope);
    const mine = rows.find((r) => r.userId === me.user._id);
    const account = await accountOf(ctx, me.user._id);
    const myMonth =
      args.period === "month"
        ? ((await ctx.db.query("learnPointsMonthly").withIndex("by_month_user", (q) => q.eq("month", month).eq("userId", me.user._id)).unique())?.points ?? 0)
        : (account?.total ?? 0);
    return {
      state: "ok" as const,
      month,
      monthLabel: monthLabel(month),
      rows: rows.slice(0, 50).map((r) => publicRow(r, me.user._id)),
      me: {
        name: me.name,
        imageUrl: me.imageUrl,
        points: myMonth,
        rank: mine?.rank ?? null,
        hidden: Boolean(account?.hidden),
        // The team and people outside this filter don't rank
        ranks: ranks(me, false, args.scope),
        // Why not: admins and the Rehabify team never rank (prizes go to learners)
        team: Boolean(me.isAdmin || me.tag.kind === "team"),
      },
      totalRanked: rows.length,
    };
  },
});

/** "My progress": points, this month's rank, streak, badges, a 12-week chart and recent activity. */
export const myProgress = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    const me = await learnMemberInfo(ctx, viewer?.user ?? null);
    if (!me) return { state: "join" as const, signedIn: Boolean(viewer) };
    const now = Date.now();
    const month = lagosMonth(now);
    const account = await accountOf(ctx, me.user._id);
    const badges = await ctx.db.query("learnBadges").withIndex("by_user", (q) => q.eq("userId", me.user._id)).collect();
    const since = now - 84 * 86400000;
    const ledger = await ctx.db
      .query("learnPointsLedger")
      .withIndex("by_user", (q) => q.eq("userId", me.user._id).gte("createdAt", since))
      .order("desc")
      .collect();
    // 12 weeks, oldest first (week = 7 days ending today)
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const end = now - (11 - i) * 7 * 86400000;
      const start = end - 7 * 86400000;
      return { start, points: ledger.filter((r) => r.createdAt > start && r.createdAt <= end).reduce((s, r) => s + r.points, 0) };
    });
    const monthRows = await rankedRows(ctx, "month", month, "all");
    const mine = monthRows.find((r) => r.userId === me.user._id);
    const monthPoints =
      (await ctx.db.query("learnPointsMonthly").withIndex("by_month_user", (q) => q.eq("month", month).eq("userId", me.user._id)).unique())?.points ?? 0;
    // Simulations: best score per case
    const attempts = await ctx.db
      .query("learnSimAttempts")
      .withIndex("by_user_case", (q) => q.eq("userId", me.user._id))
      .collect();
    const best = new Map<string, { slug: string; score: number; passed: boolean }>();
    for (const a of attempts) {
      if (a.preview || a.status !== "finished") continue;
      const prev = best.get(a.caseSlug);
      const score = a.scorePct ?? 0;
      if (!prev || score > prev.score) best.set(a.caseSlug, { slug: a.caseSlug, score, passed: Boolean(a.passed) || Boolean(prev?.passed) });
    }
    const sims = await Promise.all(
      [...best.values()].map(async (b) => {
        const doc = await ctx.db.query("learnSimCases").withIndex("by_slug", (q) => q.eq("slug", b.slug)).unique();
        return { ...b, title: doc?.title ?? b.slug };
      })
    );
    return {
      state: "ok" as const,
      name: me.name,
      imageUrl: me.imageUrl,
      total: account?.total ?? 0,
      monthPoints,
      monthLabel: monthLabel(month),
      rank: mine?.rank ?? null,
      ranked: monthRows.length,
      canRank: ranks(me, false, "all"),
      hidden: Boolean(account?.hidden),
      streak: account?.lastDay && (account.lastDay === lagosDayOf(now) || account.lastDay === lagosDayOf(now - 86400000)) ? account.streak : 0,
      bestStreak: account?.bestStreak ?? 0,
      counts: account?.counts ?? {},
      badges: LEARN_BADGES.map((b) => {
        const got = badges.find((x) => x.badge === b.id);
        return { id: b.id, name: b.name, how: b.how, earnedAt: got?.earnedAt ?? null, detail: got?.detail ?? null };
      }),
      weeks,
      recent: ledger.slice(0, 15).map((r) => ({ label: r.label, points: r.points, at: r.createdAt })),
      sims,
    };
  },
});

const lagosDayOf = (ms: number) => new Date(ms + 3600000).toISOString().slice(0, 10);

/** "Hide me from the leaderboard" (and show me again). */
export const setLeaderboardHidden = mutation({
  args: { hidden: v.boolean() },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const me = await learnMemberInfo(ctx, viewer?.user ?? null);
    if (!me) throw new ConvexError("Join Rehabify Learn first.");
    const account = await accountOf(ctx, me.user._id);
    if (account) await ctx.db.patch(account._id, { hidden: args.hidden, updatedAt: Date.now() });
    else await ctx.db.insert("learnPointsAccounts", { userId: me.user._id, total: 0, counts: {}, streak: 0, bestStreak: 0, hidden: args.hidden, updatedAt: Date.now() });
    return { hidden: args.hidden };
  },
});

// ── Admin ────────────────────────────────────────────────────────────────────

/** A month's top 10 with contact details (live for this month, frozen for closed months). */
export const adminMonthTop = query({
  args: { month: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireLearnAdmin(ctx);
    const current = lagosMonth(Date.now());
    const month = args.month ?? current;
    const frozen = await ctx.db.query("learnLeaderboardMonths").withIndex("by_month", (q) => q.eq("month", month)).unique();
    const contacted = new Set((frozen?.contacted ?? []).map(String));
    const live = frozen ? null : (await rankedRows(ctx, "month", month, "all")).slice(0, 10);
    const top = frozen
      ? await Promise.all(
          frozen.top.map(async (t) => {
            const user = await ctx.db.get(t.userId);
            const member = await learnMemberInfo(ctx, user);
            return { userId: t.userId, rank: t.rank, points: t.points, user, member };
          })
        )
      : live!.map((r) => ({ userId: r.userId, rank: r.rank, points: r.points, user: r.member.user, member: r.member }));
    const months: string[] = [];
    for (let m = current, i = 0; i < 6; i++, m = monthBefore(m)) months.push(m);
    return {
      month,
      monthLabel: monthLabel(month),
      closed: Boolean(frozen),
      months: months.map((m) => ({ month: m, label: monthLabel(m) })),
      top: top.map((t) => ({
        userId: t.userId,
        rank: t.rank,
        points: t.points,
        name: t.member?.name ?? "Former learner",
        tag: t.member?.tag.label ?? "",
        email: t.user && !t.user.email?.startsWith("wa-") ? (t.user.email ?? null) : null,
        phone: t.user?.phoneNumber ?? null,
        contacted: contacted.has(String(t.userId)),
      })),
    };
  },
});

/** Tick off a top learner once someone has been in touch (closed months only). */
export const adminMarkContacted = mutation({
  args: { month: v.string(), userId: v.id("users"), contacted: v.boolean() },
  handler: async (ctx, args) => {
    await requireLearnAdmin(ctx);
    const frozen = await ctx.db.query("learnLeaderboardMonths").withIndex("by_month", (q) => q.eq("month", args.month)).unique();
    if (!frozen) throw new ConvexError("This month hasn't closed yet.");
    const list = new Set((frozen.contacted ?? []).map(String));
    if (args.contacted) list.add(String(args.userId));
    else list.delete(String(args.userId));
    await ctx.db.patch(frozen._id, { contacted: [...list] as Id<"users">[] });
  },
});

/** On the 1st (crons.ts): freeze last month's top 10 and give them the Top 10 badge. */
export const closeMonth = internalMutation({
  args: { month: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const month = args.month ?? monthBefore(lagosMonth(Date.now()));
    const existing = await ctx.db.query("learnLeaderboardMonths").withIndex("by_month", (q) => q.eq("month", month)).unique();
    if (existing) return { month, already: true };
    const top = (await rankedRows(ctx, "month", month, "all")).filter((r) => r.rank <= 10).slice(0, 15);
    const now = Date.now();
    await ctx.db.insert("learnLeaderboardMonths", { month, top: top.map((t) => ({ userId: t.userId, points: t.points, rank: t.rank })), closedAt: now });
    for (const t of top) {
      const has = await ctx.db
        .query("learnBadges")
        .withIndex("by_user_badge", (q) => q.eq("userId", t.userId).eq("badge", "top-10"))
        .first();
      const detail = `#${t.rank} in ${monthLabel(month)}`;
      if (has) await ctx.db.patch(has._id, { detail, earnedAt: now });
      else await ctx.db.insert("learnBadges", { userId: t.userId, badge: "top-10", detail, earnedAt: now });
    }
    return { month, ranked: top.length };
  },
});

/** Joining a live Space to listen (from learnSpacesNode.joinSpace). */
export const awardSpaceListen = internalMutation({
  args: { spaceId: v.string(), clerkId: v.string() },
  handler: async (ctx, args) => {
    const spaceId = ctx.db.normalizeId("learnSpaces", args.spaceId);
    const space = spaceId ? await ctx.db.get(spaceId) : null;
    const user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId)).unique();
    if (!space || !user || space.status !== "live" || space.hostId === user._id) return null;
    await awardLearnPoints(ctx, { userId: user._id, reason: "space_listen", key: `spacelisten:${space._id}:${user._id}`, label: `Joined a Space: ${space.title}` });
    return null;
  },
});

/** The header's points pill: just the total (cheap; updates live as points land). */
export const myPoints = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.user) return null;
    const account = await accountOf(ctx, viewer.user._id);
    return { total: account?.total ?? 0 };
  },
});

/**
 * One-off: credit what learners did before points existed (owner 2026-11-14: "credit past
 * activity"). Uses the same unique keys as the live awards, so running it again (or alongside new
 * activity) never pays twice. Daily caps and streaks don't apply to past activity.
 * `npx convex run --prod learnPoints:backfillPoints '{"dryRun":true}'` first, then with false.
 */
export const backfillPoints = internalMutation({
  args: { dryRun: v.boolean() },
  handler: async (ctx, args) => {
    const plan: { userId: Id<"users">; reason: Parameters<typeof awardLearnPoints>[1]["reason"]; key: string; label?: string }[] = [];
    // Lessons and whole courses
    for (const row of await ctx.db.query("learnVideoProgress").collect()) {
      if (!row.userId) continue;
      for (const lessonId of row.completedLessonIds) {
        const lesson = await ctx.db.get(lessonId);
        plan.push({ userId: row.userId, reason: "lesson", key: `lesson:${row.userId}:${lessonId}`, label: lesson ? `Finished: ${lesson.title}` : undefined });
      }
      if (row.completedAt) {
        const course = await ctx.db.get(row.courseId);
        plan.push({ userId: row.userId, reason: "course", key: `course:${row.userId}:${row.courseId}`, label: course ? `Finished the course: ${course.title}` : undefined });
      }
    }
    // Simulation cases (not previews)
    for (const a of await ctx.db.query("learnSimAttempts").collect()) {
      if (a.preview || a.status !== "finished") continue;
      const doc = await ctx.db.query("learnSimCases").withIndex("by_slug", (q) => q.eq("slug", a.caseSlug)).unique();
      const title = doc?.title ?? a.caseSlug;
      plan.push({ userId: a.userId, reason: "sim_finish", key: `simfinish:${a.userId}:${a.caseSlug}`, label: `Finished: ${title}` });
      if (a.passed) plan.push({ userId: a.userId, reason: "sim_pass", key: `simpass:${a.userId}:${a.caseSlug}`, label: `Passed: ${title}` });
    }
    // Community posts, replies and helpful marks
    for (const p of await ctx.db.query("learnPosts").collect()) plan.push({ userId: p.authorId, reason: "post", key: `post:${p._id}` });
    for (const r of await ctx.db.query("learnReplies").collect()) plan.push({ userId: r.authorId, reason: "reply", key: `reply:${r._id}` });
    for (const h of await ctx.db.query("learnHelpful").collect()) {
      const id = h.targetType === "post" ? ctx.db.normalizeId("learnPosts", h.targetId) : ctx.db.normalizeId("learnReplies", h.targetId);
      const target = id ? await ctx.db.get(id) : null;
      if (!target || target.authorId === h.userId) continue;
      plan.push({ userId: target.authorId, reason: "helpful", key: `helpful:${h.targetType}:${h.targetId}:${h.userId}` });
    }
    // MSK program: passed assessments and certificates
    for (const reg of await ctx.db.query("learnRegistrations").collect()) {
      if (!reg.userId) continue;
      if (reg.certificateCode && !reg.certificateRevokedAt) plan.push({ userId: reg.userId, reason: "certificate", key: `certificate:${reg._id}` });
    }
    for (const att of await ctx.db.query("learnAttempts").collect()) {
      if (!att.passed) continue;
      const reg = await ctx.db.get(att.registrationId);
      if (reg?.userId) plan.push({ userId: reg.userId, reason: "assessment", key: `assessment:${reg._id}` });
    }
    // Spaces that went live
    for (const s of await ctx.db.query("learnSpaces").collect()) {
      if (s.startedAt) plan.push({ userId: s.hostId, reason: "space_host", key: `spacehost:${s._id}`, label: `Hosted a Space: ${s.title}` });
    }
    // Skip what's already been paid
    const fresh = [];
    for (const item of plan) {
      const seen = await ctx.db.query("learnPointsLedger").withIndex("by_key", (q) => q.eq("key", item.key)).first();
      if (!seen) fresh.push(item);
    }
    const byReason: Record<string, number> = {};
    for (const item of fresh) byReason[item.reason] = (byReason[item.reason] ?? 0) + 1;
    if (args.dryRun) return { dryRun: true, awards: fresh.length, learners: new Set(fresh.map((f) => String(f.userId))).size, byReason };
    let points = 0;
    for (const item of fresh) points += await awardLearnPoints(ctx, { ...item, backfill: true });
    return { dryRun: false, awards: fresh.length, points, byReason };
  },
});

/** Your badges (ids and when), for the "badge unlocked" celebration in the Learn header. */
export const myBadges = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.user) return null;
    const userId = viewer.user._id;
    const rows = await ctx.db.query("learnBadges").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return rows.map((b) => ({ id: b.badge, earnedAt: b.earnedAt, detail: b.detail ?? null }));
  },
});
