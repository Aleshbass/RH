/**
 * Clinician Community: Case of the Week and open questions.
 *
 * - Who: approved physiotherapists post, answer and vote. Case leads (communityRoles, set by
 *   admins) and admins publish the Case of the Week and mark helpful answers on it; a question's
 *   asker marks helpful answers on theirs. Moderators and admins hide things.
 * - Patients stay unidentifiable: every post carries the author's anonymisation statement, and
 *   phone numbers, emails, titled names and ID numbers are refused (lib/community/privacy.ts).
 *   No images. Three reports hide an answer or question until an admin looks.
 * - Case of the Week: the case, then a poll whose results show once you've voted (so nobody is
 *   anchored), then answers. It closes on its date (cron); voting and answering logs 1 CPD hour.
 *   The lead then posts the reveal: the answer and teaching points.
 * - Points (rewards.ts): +5 for answering the case, +50 when an answer is marked helpful.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { insertNotification } from "./helpers/pushNotify";
import { currentUser, isApproved } from "./helpers/careAccess";
import { awardPoints, logCpd, tierOf } from "./rewards";
import { blockingPrivacyIssue } from "../lib/community/privacy";

type Ctx = QueryCtx | MutationCtx;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const HIDE_AFTER_REPORTS = 3;
const CASE_CPD_MINUTES = 60;
const BASE = "/dashboard/physiotherapist/community";

type Member = { user: Doc<"users">; isAdmin: boolean; role: "lead" | "moderator" | null };

async function memberOrNull(ctx: Ctx): Promise<Member | null> {
  const user = await currentUser(ctx);
  if (!user) return null;
  const isAdmin = user.role === "admin";
  if (!isAdmin && (user.role !== "physiotherapist" || !(await isApproved(ctx, user._id)))) return null;
  const role = await ctx.db
    .query("communityRoles")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();
  return { user, isAdmin, role: role?.role ?? null };
}

async function requireMember(ctx: Ctx) {
  const member = await memberOrNull(ctx);
  if (!member) throw new ConvexError("Community is for approved physiotherapists.");
  return member;
}

const canLead = (m: Member) => m.isAdmin || m.role === "lead";
const canModerate = (m: Member) => m.isAdmin || m.role === "moderator" || m.role === "lead";

function cleanText(text: string, min: number, max: number, label: string) {
  const value = text.trim().replace(/\n{3,}/g, "\n\n");
  if (value.length < min) throw new ConvexError(`${label} is too short.`);
  if (value.length > max) throw new ConvexError(`${label} is too long (${max} characters at most).`);
  const issue = blockingPrivacyIssue(value);
  if (issue) throw new ConvexError(`To keep the patient anonymous: ${issue.message}`);
  return value;
}

async function authorView(ctx: Ctx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  const tier = await tierOf(ctx, userId);
  const role = await ctx.db
    .query("communityRoles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return {
    name: user?.firstName ? `${user.firstName}${user.lastName ? ` ${user.lastName[0]}.` : ""}` : "A physio",
    tierKey: tier.key,
    tierName: tier.name,
    role: user?.role === "admin" ? ("rehabify" as const) : (role?.role ?? null),
  };
}

async function postRow(ctx: Ctx, post: Doc<"communityPosts">) {
  return {
    _id: post._id,
    kind: post.kind,
    title: post.title,
    excerpt: post.body.slice(0, 160),
    bodyRegion: post.bodyRegion ?? null,
    needsSenior: Boolean(post.needsSenior),
    status: post.status,
    caseNumber: post.caseNumber ?? null,
    closesAt: post.closesAt ?? null,
    revealed: Boolean(post.reveal),
    cpdMinutes: post.cpdMinutes ?? null,
    answerCount: post.answerCount,
    helpfulCount: post.helpfulCount,
    author: await authorView(ctx, post.authorId),
    lastActivityAt: post.lastActivityAt,
    createdAt: post.createdAt,
  };
}

/* ----------------------------------------------------------------------------------------------
 * Reading
 * --------------------------------------------------------------------------------------------*/

/** The Community home: this week's case, recent cases, open questions, and the viewer's standing. */
export const getCommunityHome = query({
  args: {},
  handler: async (ctx) => {
    const member = await memberOrNull(ctx);
    if (!member) return null;
    const cases = (
      await ctx.db
        .query("communityPosts")
        .withIndex("by_kind", (q) => q.eq("kind", "case"))
        .order("desc")
        .take(30)
    )
      .filter((p) => p.status !== "hidden")
      .sort((a, b) => (b.caseNumber ?? 0) - (a.caseNumber ?? 0));
    const questions = (
      await ctx.db
        .query("communityPosts")
        .withIndex("by_kind", (q) => q.eq("kind", "question"))
        .order("desc")
        .take(80)
    ).filter((p) => p.status !== "hidden");
    const account = await ctx.db
      .query("rewardAccounts")
      .withIndex("by_user", (q) => q.eq("userId", member.user._id))
      .unique();
    const meAsAuthor = await authorView(ctx, member.user._id);
    return {
      current: cases[0] ? await postRow(ctx, cases[0]) : null,
      pastCases: await Promise.all(cases.slice(1, 12).map((p) => postRow(ctx, p))),
      questions: await Promise.all(questions.map((p) => postRow(ctx, p))),
      me: {
        canLead: canLead(member),
        canModerate: canModerate(member),
        cpdMinutes: account && account.cpdYear === new Date(Date.now() + HOUR).getUTCFullYear() ? account.cpdMinutes : 0,
        tierKey: meAsAuthor.tierKey,
        tierName: meAsAuthor.tierName,
      },
    };
  },
});

/** The viewer's own questions and answers. */
export const getMyCommunityActivity = query({
  args: {},
  handler: async (ctx) => {
    const member = await memberOrNull(ctx);
    if (!member) return null;
    const posts = await ctx.db
      .query("communityPosts")
      .withIndex("by_author", (q) => q.eq("authorId", member.user._id))
      .order("desc")
      .take(50);
    const answers = await ctx.db
      .query("communityAnswers")
      .withIndex("by_author", (q) => q.eq("authorId", member.user._id))
      .order("desc")
      .take(50);
    const answered = await Promise.all(
      answers.map(async (a) => {
        const post = await ctx.db.get(a.postId);
        return post && post.status !== "hidden"
          ? { answerId: a._id, postId: post._id, title: post.title, kind: post.kind, usefulCount: a.usefulCount, helpful: Boolean(a.markedHelpfulAt), at: a.createdAt }
          : null;
      })
    );
    return {
      posts: await Promise.all(posts.filter((p) => p.status !== "hidden").map((p) => postRow(ctx, p))),
      answers: answered.filter((a): a is NonNullable<typeof a> => a !== null),
      helpfulTotal: answers.filter((a) => a.markedHelpfulAt).length,
      usefulTotal: answers.reduce((sum, a) => sum + a.usefulCount, 0),
    };
  },
});

/** One case or question with its poll, reveal and answers. */
export const getCommunityPost = query({
  args: { postId: v.id("communityPosts") },
  handler: async (ctx, args) => {
    const member = await memberOrNull(ctx);
    const post = await ctx.db.get(args.postId);
    if (!member || !post || (post.status === "hidden" && !canModerate(member))) return null;
    const me = member.user._id;
    const myVote = await ctx.db
      .query("communityVotes")
      .withIndex("by_post_and_user", (q) => q.eq("postId", post._id).eq("userId", me).eq("kind", "poll"))
      .first();
    let poll = null;
    if (post.pollOptions?.length) {
      const votes = await ctx.db
        .query("communityVotes")
        .withIndex("by_post_and_kind", (q) => q.eq("postId", post._id).eq("kind", "poll"))
        .collect();
      // Results only after you've voted, once the case closes, or for the lead
      const showResults = Boolean(myVote) || post.status !== "open" || canLead(member) || post.authorId === me;
      poll = {
        total: votes.length,
        myVote: myVote?.option ?? null,
        showResults,
        options: post.pollOptions.map((o) => ({
          key: o.key,
          label: o.label,
          votes: showResults ? votes.filter((v) => v.option === o.key).length : null,
        })),
      };
    }
    const answers = (
      await ctx.db
        .query("communityAnswers")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .collect()
    ).filter((a) => !a.hidden || canModerate(member));
    const myUseful = new Set(
      (
        await Promise.all(
          answers.map((a) =>
            ctx.db
              .query("communityVotes")
              .withIndex("by_answer_and_user", (q) => q.eq("answerId", a._id).eq("userId", me))
              .first()
          )
        )
      )
        .filter(Boolean)
        .map((vote) => vote!.answerId as string)
    );
    const isAuthor = post.authorId === me;
    const canMarkHelpful = post.kind === "case" ? canLead(member) : isAuthor || canLead(member);
    const sorted = answers.sort(
      (a, b) => Number(Boolean(b.markedHelpfulAt)) - Number(Boolean(a.markedHelpfulAt)) || b.usefulCount - a.usefulCount || a.createdAt - b.createdAt
    );
    return {
      post: {
        ...(await postRow(ctx, post)),
        body: post.body,
        reveal: post.reveal ?? null,
      },
      poll,
      answers: await Promise.all(
        sorted.map(async (a) => ({
          _id: a._id,
          body: a.body,
          usefulCount: a.usefulCount,
          helpful: Boolean(a.markedHelpfulAt),
          helpfulByLead: Boolean(a.markedHelpfulBy && a.markedHelpfulBy !== post.authorId),
          hidden: Boolean(a.hidden),
          mine: a.authorId === me,
          iFoundUseful: myUseful.has(a._id),
          author: await authorView(ctx, a.authorId),
          createdAt: a.createdAt,
        }))
      ),
      me: {
        isAuthor,
        canMarkHelpful,
        canLead: canLead(member),
        canModerate: canModerate(member),
        answered: answers.some((a) => a.authorId === me),
      },
    };
  },
});

/* ----------------------------------------------------------------------------------------------
 * Writing
 * --------------------------------------------------------------------------------------------*/

export const askQuestion = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    bodyRegion: v.optional(v.string()),
    needsSenior: v.optional(v.boolean()),
    anonymised: v.boolean(),
  },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    if (!args.anonymised) throw new ConvexError("Confirm the patient can’t be identified first.");
    const title = cleanText(args.title, 10, 160, "The question");
    const body = cleanText(args.body, 20, 3000, "The details");
    const recent = await ctx.db
      .query("communityPosts")
      .withIndex("by_author", (q) => q.eq("authorId", member.user._id).gte("createdAt", Date.now() - DAY))
      .collect();
    if (recent.filter((p) => p.kind === "question").length >= 5) throw new ConvexError("You can ask up to 5 questions a day.");
    const now = Date.now();
    const postId = await ctx.db.insert("communityPosts", {
      kind: "question",
      authorId: member.user._id,
      title,
      body,
      bodyRegion: args.bodyRegion?.trim().slice(0, 40) || undefined,
      needsSenior: args.needsSenior || undefined,
      status: "open",
      anonymisedAt: now,
      answerCount: 0,
      helpfulCount: 0,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { postId };
  },
});

/** A case lead or admin publishes the Case of the Week. Every approved physio is told. */
export const publishCase = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    bodyRegion: v.optional(v.string()),
    pollOptions: v.array(v.string()),
    closesAt: v.number(),
    anonymised: v.boolean(),
  },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    if (!canLead(member)) throw new ConvexError("Only case leads publish the Case of the Week.");
    if (!args.anonymised) throw new ConvexError("Confirm the case is anonymised, with the patient’s consent.");
    const title = cleanText(args.title, 10, 200, "The case title");
    const body = cleanText(args.body, 40, 4000, "The case");
    const options = args.pollOptions.map((o) => o.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 5) throw new ConvexError("Give 2 to 5 options for the poll.");
    for (const o of options) cleanText(o, 2, 80, "A poll option");
    const now = Date.now();
    if (args.closesAt < now + 12 * HOUR || args.closesAt > now + 21 * DAY) throw new ConvexError("Close the case between 12 hours and 3 weeks from now.");
    const last = (
      await ctx.db
        .query("communityPosts")
        .withIndex("by_kind", (q) => q.eq("kind", "case"))
        .collect()
    ).reduce((max, p) => Math.max(max, p.caseNumber ?? 0), 0);
    const postId = await ctx.db.insert("communityPosts", {
      kind: "case",
      authorId: member.user._id,
      title,
      body,
      bodyRegion: args.bodyRegion?.trim().slice(0, 40) || undefined,
      status: "open",
      caseNumber: last + 1,
      closesAt: args.closesAt,
      pollOptions: options.map((label, i) => ({ key: `o${i + 1}`, label })),
      cpdMinutes: CASE_CPD_MINUTES,
      anonymisedAt: now,
      answerCount: 0,
      helpfulCount: 0,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.community.announceCase, { postId });
    return { postId, caseNumber: last + 1 };
  },
});

/** Tells every approved physio about a new Case of the Week, in batches. */
export const announceCase = internalMutation({
  args: { postId: v.id("communityPosts"), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.status !== "open") return;
    const page = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .paginate({ numItems: 200, cursor: args.cursor ?? null });
    for (const row of page.page) {
      if (row.userId === post.authorId) continue;
      const user = await ctx.db.get(row.userId);
      if (user?.role !== "physiotherapist") continue;
      await insertNotification(ctx, {
        userId: row.userId,
        type: "community_case",
        priority: "low",
        status: "pending",
        payload: {
          title: `Case of the Week #${post.caseNumber}`,
          body: `${post.title.slice(0, 120)}. Vote, answer and log 1 CPD hour.`,
          data: { actionUrl: `${BASE}/${post._id}` },
        },
        createdAt: Date.now(),
      });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.community.announceCase, { postId: args.postId, cursor: page.continueCursor });
  },
});

export const answerPost = mutation({
  args: { postId: v.id("communityPosts"), body: v.string() },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.status === "hidden") throw new ConvexError("This post isn’t available.");
    if (post.status !== "open") throw new ConvexError(post.kind === "case" ? "This case has closed." : "This question is closed.");
    const body = cleanText(args.body, 15, 2000, "Your answer");
    const now = Date.now();
    const mine = await ctx.db
      .query("communityAnswers")
      .withIndex("by_author", (q) => q.eq("authorId", member.user._id).gte("createdAt", now - DAY))
      .collect();
    if (mine.length >= 30) throw new ConvexError("That’s a lot of answers today. Come back tomorrow.");
    const answerId = await ctx.db.insert("communityAnswers", {
      postId: post._id,
      authorId: member.user._id,
      body,
      usefulCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(post._id, { answerCount: post.answerCount + 1, lastActivityAt: now });
    if (post.kind === "case") {
      await awardPoints(ctx, {
        userId: member.user._id,
        reason: "case_answered",
        dedupeKey: `case_answered:${post._id}:${member.user._id}`,
        label: `Answered Case #${post.caseNumber}`,
        refType: "communityPosts",
        refId: post._id,
      });
    }
    if (post.authorId !== member.user._id) {
      await insertNotification(ctx, {
        userId: post.authorId,
        type: "community_answer",
        priority: "low",
        status: "pending",
        payload: {
          title: post.kind === "case" ? `New answer on Case #${post.caseNumber}` : "New answer to your question",
          body: `${(await authorView(ctx, member.user._id)).name}: ${body.slice(0, 120)}`,
          data: { actionUrl: `${BASE}/${post._id}` },
        },
        createdAt: now,
      });
    }
    return { answerId };
  },
});

export const voteOnCase = mutation({
  args: { postId: v.id("communityPosts"), option: v.string() },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post?.pollOptions || post.status !== "open") throw new ConvexError("Voting has closed.");
    if (!post.pollOptions.some((o) => o.key === args.option)) throw new ConvexError("Choose one of the options.");
    const existing = await ctx.db
      .query("communityVotes")
      .withIndex("by_post_and_user", (q) => q.eq("postId", post._id).eq("userId", member.user._id).eq("kind", "poll"))
      .first();
    if (existing) throw new ConvexError("You’ve already voted on this case.");
    await ctx.db.insert("communityVotes", { postId: post._id, userId: member.user._id, kind: "poll", option: args.option, createdAt: Date.now() });
    return { ok: true };
  },
});

/** "Found this useful": on and off, not on your own answer. */
export const toggleUseful = mutation({
  args: { answerId: v.id("communityAnswers") },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const answer = await ctx.db.get(args.answerId);
    if (!answer || answer.hidden) throw new ConvexError("This answer isn’t available.");
    if (answer.authorId === member.user._id) throw new ConvexError("You can’t mark your own answer.");
    const existing = await ctx.db
      .query("communityVotes")
      .withIndex("by_answer_and_user", (q) => q.eq("answerId", answer._id).eq("userId", member.user._id))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(answer._id, { usefulCount: Math.max(0, answer.usefulCount - 1) });
      return { useful: false };
    }
    await ctx.db.insert("communityVotes", { postId: answer.postId, answerId: answer._id, userId: member.user._id, kind: "useful", createdAt: Date.now() });
    await ctx.db.patch(answer._id, { usefulCount: answer.usefulCount + 1 });
    return { useful: true };
  },
});

/** The asker (questions) or a case lead marks an answer helpful: +50 points for its author. */
export const markHelpful = mutation({
  args: { answerId: v.id("communityAnswers") },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const answer = await ctx.db.get(args.answerId);
    const post = answer ? await ctx.db.get(answer.postId) : null;
    if (!answer || !post || answer.hidden) throw new ConvexError("This answer isn’t available.");
    const allowed = post.kind === "case" ? canLead(member) : post.authorId === member.user._id || canLead(member);
    if (!allowed) throw new ConvexError(post.kind === "case" ? "Only the case lead marks helpful answers." : "Only the person who asked can do this.");
    if (answer.authorId === member.user._id) throw new ConvexError("You can’t mark your own answer.");
    if (answer.markedHelpfulAt) return { ok: true };
    const now = Date.now();
    await ctx.db.patch(answer._id, { markedHelpfulAt: now, markedHelpfulBy: member.user._id });
    await ctx.db.patch(post._id, { helpfulCount: post.helpfulCount + 1, lastActivityAt: now });
    await awardPoints(ctx, {
      userId: answer.authorId,
      reason: "answer_helpful",
      dedupeKey: `answer_helpful:${answer._id}`,
      label: post.kind === "case" ? `Answer marked helpful · Case #${post.caseNumber}` : "Answer marked helpful",
      refType: "communityAnswers",
      refId: answer._id,
    });
    await insertNotification(ctx, {
      userId: answer.authorId,
      type: "community_helpful",
      priority: "medium",
      status: "pending",
      payload: {
        title: "Your answer was marked helpful",
        body: `${post.kind === "case" ? `Case #${post.caseNumber}` : post.title.slice(0, 80)} · +50 points`,
        data: { actionUrl: `${BASE}/${post._id}` },
      },
      createdAt: now,
    });
    return { ok: true };
  },
});

/** Logs CPD for everyone who both voted and answered on a case. Safe to run again. */
async function logCaseCpd(ctx: MutationCtx, post: Doc<"communityPosts">) {
  const answers = await ctx.db
    .query("communityAnswers")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .collect();
  const voters = new Set(
    (
      await ctx.db
        .query("communityVotes")
        .withIndex("by_post_and_kind", (q) => q.eq("postId", post._id).eq("kind", "poll"))
        .collect()
    ).map((v) => v.userId as string)
  );
  const done = new Set<string>();
  for (const a of answers) {
    if (a.hidden || done.has(a.authorId) || !voters.has(a.authorId)) continue;
    done.add(a.authorId);
    await logCpd(ctx, {
      userId: a.authorId,
      minutes: post.cpdMinutes ?? CASE_CPD_MINUTES,
      source: "community_case",
      label: `Case of the Week #${post.caseNumber}: ${post.title.slice(0, 80)}`,
      refId: post._id,
      dedupeKey: `cpd_case:${post._id}:${a.authorId}`,
    });
  }
  return done.size;
}

/** The lead closes the case early (if needed) and posts the answer with teaching points. */
export const revealCase = mutation({
  args: { postId: v.id("communityPosts"), answer: v.string(), teaching: v.string() },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    if (!canLead(member)) throw new ConvexError("Only case leads post the reveal.");
    const post = await ctx.db.get(args.postId);
    if (!post || post.kind !== "case") throw new ConvexError("Case not found.");
    const now = Date.now();
    await ctx.db.patch(post._id, {
      status: post.status === "hidden" ? "hidden" : "closed",
      reveal: { answer: cleanText(args.answer, 3, 200, "The answer"), teaching: cleanText(args.teaching, 20, 3000, "The teaching points"), at: now },
      lastActivityAt: now,
      updatedAt: now,
    });
    const logged = await logCaseCpd(ctx, post);
    return { logged };
  },
});

/** Cron, hourly: cases past their closing time close and log CPD. */
export const closeDueCases = internalMutation({
  args: {},
  handler: async (ctx) => {
    const due = await ctx.db
      .query("communityPosts")
      .withIndex("by_status_and_close", (q) => q.eq("status", "open").lt("closesAt", Date.now()))
      .take(20);
    let logged = 0;
    for (const post of due) {
      if (post.kind !== "case") continue;
      await ctx.db.patch(post._id, { status: "closed", updatedAt: Date.now() });
      logged += await logCaseCpd(ctx, post);
    }
    return { closed: due.length, logged };
  },
});

/** The asker closes their question (answered), or opens it again. */
export const setQuestionClosed = mutation({
  args: { postId: v.id("communityPosts"), closed: v.boolean() },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.kind !== "question" || (post.authorId !== member.user._id && !canModerate(member))) throw new ConvexError("You can’t change this.");
    if (post.status === "hidden") throw new ConvexError("This question is hidden.");
    await ctx.db.patch(post._id, { status: args.closed ? "closed" : "open", updatedAt: Date.now() });
    return { ok: true };
  },
});

/* ----------------------------------------------------------------------------------------------
 * Safety
 * --------------------------------------------------------------------------------------------*/

export const reportCommunity = mutation({
  args: { postId: v.id("communityPosts"), answerId: v.optional(v.id("communityAnswers")), reason: v.string() },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const reason = args.reason.trim().slice(0, 300);
    if (reason.length < 3) throw new ConvexError("Say what’s wrong, in a few words.");
    const reports = await ctx.db
      .query("communityReports")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
    const target = reports.filter((r) => r.answerId === args.answerId && r.status === "open");
    if (target.some((r) => r.by === member.user._id)) return { ok: true };
    await ctx.db.insert("communityReports", { postId: args.postId, answerId: args.answerId, by: member.user._id, reason, status: "open", createdAt: Date.now() });
    if (target.length + 1 >= HIDE_AFTER_REPORTS) await setHidden(ctx, args.postId, args.answerId, true);
    return { ok: true };
  },
});

async function setHidden(ctx: MutationCtx, postId: Id<"communityPosts">, answerId: Id<"communityAnswers"> | undefined, hidden: boolean, by?: Id<"users">) {
  if (answerId) {
    await ctx.db.patch(answerId, { hidden: hidden || undefined });
    return;
  }
  const post = await ctx.db.get(postId);
  if (!post) return;
  await ctx.db.patch(postId, {
    status: hidden ? "hidden" : post.closesAt && post.closesAt < Date.now() ? "closed" : "open",
    hiddenBy: hidden ? by : undefined,
  });
}

/** Moderators hide or bring back a post or an answer. */
export const moderateCommunity = mutation({
  args: { postId: v.id("communityPosts"), answerId: v.optional(v.id("communityAnswers")), hidden: v.boolean() },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    if (!canModerate(member)) throw new ConvexError("Only moderators can do this.");
    await setHidden(ctx, args.postId, args.answerId, args.hidden, member.user._id);
    const reports = await ctx.db
      .query("communityReports")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
    for (const r of reports.filter((r) => r.answerId === args.answerId && r.status === "open")) {
      await ctx.db.patch(r._id, { status: args.hidden ? "hidden" : "dismissed", handledBy: member.user._id });
    }
    return { ok: true };
  },
});

/** Admin: open reports, case leads and moderators. */
export const adminCommunityOverview = query({
  args: {},
  handler: async (ctx) => {
    const member = await memberOrNull(ctx);
    if (!member?.isAdmin) return null;
    const open = await ctx.db
      .query("communityReports")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(100);
    const hiddenPosts = (await ctx.db.query("communityPosts").order("desc").take(300)).filter((p) => p.status === "hidden");
    const roles = await ctx.db.query("communityRoles").collect();
    return {
      reports: await Promise.all(
        open.map(async (r) => {
          const post = await ctx.db.get(r.postId);
          const answer = r.answerId ? await ctx.db.get(r.answerId) : null;
          return {
            _id: r._id,
            postId: r.postId,
            answerId: r.answerId ?? null,
            postTitle: post?.title ?? "Deleted",
            text: (answer?.body ?? post?.body ?? "").slice(0, 300),
            hidden: answer ? Boolean(answer.hidden) : post?.status === "hidden",
            reason: r.reason,
            by: (await authorView(ctx, r.by)).name,
            at: r.createdAt,
          };
        })
      ),
      hiddenPosts: hiddenPosts.map((p) => ({ _id: p._id, title: p.title, kind: p.kind })),
      roles: await Promise.all(
        roles.map(async (r) => {
          const user = await ctx.db.get(r.userId);
          return { _id: r._id, role: r.role, name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Unknown", email: user?.email ?? "" };
        })
      ),
    };
  },
});

export const adminSetCommunityRole = mutation({
  args: { email: v.string(), role: v.union(v.literal("lead"), v.literal("moderator"), v.literal("none")) },
  handler: async (ctx, args) => {
    const member = await memberOrNull(ctx);
    if (!member?.isAdmin) throw new ConvexError("Administrator access required.");
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first();
    if (!user || user.role !== "physiotherapist") throw new ConvexError("No physiotherapist with that email.");
    const existing = await ctx.db
      .query("communityRoles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    if (args.role !== "none") {
      await ctx.db.insert("communityRoles", { userId: user._id, role: args.role, grantedBy: member.user._id, createdAt: Date.now() });
    }
    return { ok: true };
  },
});
