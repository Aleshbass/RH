/**
 * Rehabify Learn community rooms (owner 2026-11-12: one community, Learn rooms; students only ever
 * see Learn rooms, never the approved-physio community in community.ts).
 *
 * Rooms: three open rooms for every Learn member, a room per video course for its learners, and the
 * MSK Specialist Program room for its learners. Room documents are created on the first post.
 * Posts are questions or discussions with replies, "helpful" marks and reports (3 reports hide).
 * The patient-privacy check from lib/community/privacy.ts runs on every post and reply.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer } from "./helpers/partnerAccess";
import { groupRoleOf, isLearnAdminUser, requireLearnAdmin } from "./helpers/learnAccess";
import { insertNotification } from "./helpers/pushNotify";
import { blockingPrivacyIssue } from "../lib/community/privacy";
import { canUserWatchCourse, isMskProgramLearner, learnMemberInfo, type LearnMemberInfo } from "./learn";

type Ctx = QueryCtx | MutationCtx;

const LEARN_URL = (process.env.LEARN_PUBLIC_URL ?? "https://learn.physioaroundme.com").replace(/\/+$/, "");
const REPORTS_TO_HIDE = 3;
const LIMITS = { post: { limit: 10, windowMs: 60 * 60 * 1000 }, reply: { limit: 40, windowMs: 60 * 60 * 1000 } };

/** The open rooms every Learn member sees, before anyone has posted in them. */
const DEFAULT_ROOMS = [
  { slug: "student-lounge", title: "Student lounge", description: "For physio students: classes, exams, placements and life after graduation.", order: 1 },
  { slug: "ask-a-physio", title: "Ask a physio", description: "Questions about practice, careers and learning, answered by physiotherapists.", order: 2 },
  { slug: "study-group", title: "Study group", description: "Revise together: share notes, quiz each other and plan sessions.", order: 3 },
];

const clean = (value: string | undefined | null, max: number) =>
  (value ?? "").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

async function memberOrNull(ctx: Ctx) {
  const viewer = await getViewer(ctx);
  return viewer?.user ? await learnMemberInfo(ctx, viewer.user) : null;
}

async function requireMember(ctx: Ctx) {
  const member = await memberOrNull(ctx);
  if (!member) throw new ConvexError("Join Rehabify Learn to take part. Tell us who you are on the welcome page first.");
  return member;
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

type RoomView = {
  slug: string;
  title: string;
  description: string | null;
  kind: "open" | "course" | "program" | "group";
  courseId: Id<"learnVideoCourses"> | null;
  groupId: Id<"learnGroups"> | null;
  postCount: number;
  lastActivityAt: number | null;
  doc: Doc<"learnRooms"> | null;
};

function roomView(doc: Doc<"learnRooms">): RoomView {
  return {
    slug: doc.slug,
    title: doc.title,
    description: doc.description ?? null,
    kind: doc.kind,
    courseId: doc.courseId ?? null,
    groupId: doc.groupId ?? null,
    postCount: doc.postCount,
    lastActivityAt: doc.lastActivityAt ?? null,
    doc,
  };
}

/** A room by slug: its document, or the room it would be before its first post. */
async function resolveRoom(ctx: Ctx, slug: string): Promise<RoomView | null> {
  const doc = await ctx.db
    .query("learnRooms")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
  if (doc) return doc.archived ? null : roomView(doc);
  const preset = DEFAULT_ROOMS.find((r) => r.slug === slug);
  if (preset) return { ...preset, kind: "open", courseId: null, groupId: null, postCount: 0, lastActivityAt: null, doc: null };
  if (slug === "msk-program") {
    return {
      slug,
      title: "MSK Specialist Program",
      description: "For this cohort's learners: questions between sessions, cases and resources.",
      kind: "program",
      courseId: null, groupId: null,
      postCount: 0,
      lastActivityAt: null,
      doc: null,
    };
  }
  const match = slug.match(/^course-(.+)$/);
  const courseId = match ? ctx.db.normalizeId("learnVideoCourses", match[1]) : null;
  const course = courseId ? await ctx.db.get(courseId) : null;
  if (!course || course.status !== "published") return null;
  return {
    slug,
    title: course.title,
    description: "Questions and discussion for this course's learners.",
    kind: "course",
    courseId: course._id,
    groupId: null,
    postCount: 0,
    lastActivityAt: null,
    doc: null,
  };
}

async function canEnterRoom(ctx: Ctx, member: LearnMemberInfo, room: RoomView) {
  if (room.kind === "open" || member.isAdmin) return true;
  if (room.kind === "group") return Boolean(room.groupId && (await groupRoleOf(ctx, room.groupId, member.user._id)));
  if (room.kind === "program") return await isMskProgramLearner(ctx, member.user);
  const course = room.courseId ? await ctx.db.get(room.courseId) : null;
  if (!course) return false;
  if (course.createdBy === member.user._id) return true; // the course's instructor
  return await canUserWatchCourse(ctx, member.user, course);
}

/** Every room this member can open: open rooms, their courses' rooms, the MSK program room. */
async function roomsFor(ctx: Ctx, member: LearnMemberInfo | null) {
  const docs = (await ctx.db.query("learnRooms").withIndex("by_order").take(200)).filter((r) => !r.archived);
  const bySlug = new Map(docs.map((d) => [d.slug, roomView(d)]));
  const rooms: RoomView[] = [];
  for (const preset of DEFAULT_ROOMS) {
    rooms.push(bySlug.get(preset.slug) ?? { ...preset, kind: "open", courseId: null, groupId: null, postCount: 0, lastActivityAt: null, doc: null });
  }
  for (const d of docs) if (d.kind === "open" && !DEFAULT_ROOMS.some((p) => p.slug === d.slug)) rooms.push(roomView(d));
  if (!member) return rooms;

  // Their groups' private rooms (admins open other groups from Admin › Learn › Groups)
  const memberships = await ctx.db
    .query("learnGroupMembers")
    .withIndex("by_user", (q) => q.eq("userId", member.user._id))
    .take(50);
  for (const m of memberships) {
    const group = await ctx.db.get(m.groupId);
    const doc = group?.roomId && !group.archived ? await ctx.db.get(group.roomId) : null;
    if (doc && !doc.archived) rooms.push(roomView(doc));
  }

  if (await isMskProgramLearner(ctx, member.user)) {
    const program = bySlug.get("msk-program") ?? (await resolveRoom(ctx, "msk-program"));
    if (program) rooms.push(program);
  }
  const courses = await ctx.db
    .query("learnVideoCourses")
    .withIndex("by_status_order", (q) => q.eq("status", "published"))
    .take(100);
  for (const course of courses) {
    const allowed = member.isAdmin || course.createdBy === member.user._id || (await canUserWatchCourse(ctx, member.user, course));
    if (!allowed) continue;
    const slug = `course-${course._id}`;
    rooms.push(
      bySlug.get(slug) ?? {
        slug,
        title: course.title,
        description: "Questions and discussion for this course's learners.",
        kind: "course",
        courseId: course._id,
        groupId: null,
        postCount: 0,
        lastActivityAt: null,
        doc: null,
      }
    );
  }
  return rooms;
}

const publicRoom = ({ doc: _doc, ...room }: RoomView) => room;

// ── Authors ───────────────────────────────────────────────────────────────────

type Author = { id: Id<"users">; name: string; imageUrl: string | null; tag: LearnMemberInfo["tag"] | null };

async function authorsFor(ctx: Ctx, ids: Id<"users">[]) {
  const map = new Map<string, Author>();
  for (const id of new Set(ids)) {
    const user = await ctx.db.get(id);
    const info = await learnMemberInfo(ctx, user);
    map.set(id, {
      id,
      name: info?.name ?? "Former member",
      imageUrl: info?.imageUrl ?? null,
      tag: info?.tag ?? null,
    });
  }
  return map;
}

function postSummary(post: Doc<"learnPosts">, author: Author | undefined, room: { slug: string; title: string }) {
  return {
    id: post._id,
    kind: post.kind,
    title: post.title,
    excerpt: post.body.slice(0, 220),
    replyCount: post.replyCount,
    helpfulCount: post.helpfulCount,
    lastActivityAt: post.lastActivityAt,
    createdAt: post.createdAt,
    author: author ?? null,
    room: { slug: room.slug, title: room.title },
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Learn › Community: the rooms, the latest posts across them, and who's looking. */
export const getCommunityHome = query({
  args: {},
  handler: async (ctx) => {
    const member = await memberOrNull(ctx);
    const rooms = await roomsFor(ctx, member);
    const signedIn = Boolean(await ctx.auth.getUserIdentity());
    if (!member) {
      return { signedIn, member: null, rooms: rooms.filter((r) => r.kind === "open").map(publicRoom), latest: [], physioCommunity: false };
    }
    const roomIds = new Map(rooms.filter((r) => r.doc).map((r) => [r.doc!._id as string, { slug: r.slug, title: r.title }]));
    const recent = await ctx.db.query("learnPosts").withIndex("by_activity").order("desc").take(80);
    const latest = recent.filter((p) => p.status === "open" && roomIds.has(p.roomId)).slice(0, 12);
    const authors = await authorsFor(ctx, latest.map((p) => p.authorId));
    return {
      signedIn,
      member: { name: member.name, tag: member.tag, isStudent: member.isStudent },
      rooms: rooms.map(publicRoom),
      latest: latest.map((p) => postSummary(p, authors.get(p.authorId), roomIds.get(p.roomId)!)),
      // Approved Rehabify physios (and the team) also have the physio-only community
      physioCommunity: member.isRehabifyPhysio || member.isAdmin,
    };
  },
});

/**
 * Physio dashboard › Community › Learn (owner 2026-11-13): approved physios see the Learn rooms
 * from their own community too, with students' questions nobody has answered yet first.
 */
export const forClinicians = query({
  args: {},
  handler: async (ctx) => {
    const member = await memberOrNull(ctx);
    if (!member) return null;
    const rooms = await roomsFor(ctx, member);
    const roomIds = new Map(rooms.filter((r) => r.doc).map((r) => [r.doc!._id as string, { slug: r.slug, title: r.title }]));
    const recent = await ctx.db.query("learnPosts").withIndex("by_activity").order("desc").take(200);
    const visible = recent.filter((p) => p.status === "open" && roomIds.has(p.roomId));
    const unanswered = visible.filter((p) => p.kind === "question" && p.replyCount === 0).slice(0, 8);
    const shown = new Set(unanswered.map((p) => p._id as string));
    const latest = visible.filter((p) => !shown.has(p._id)).slice(0, 10);
    const authors = await authorsFor(ctx, [...unanswered, ...latest].map((p) => p.authorId));
    const summary = (p: Doc<"learnPosts">) => postSummary(p, authors.get(p.authorId), roomIds.get(p.roomId)!);
    return {
      rooms: rooms.map(publicRoom),
      unanswered: unanswered.map(summary),
      latest: latest.map(summary),
    };
  },
});

export const getRoom = query({
  args: { slug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const member = await memberOrNull(ctx);
    const room = await resolveRoom(ctx, args.slug);
    if (!room) return { state: "missing" as const };
    if (!member) return { state: "join" as const, room: publicRoom(room), signedIn: Boolean(await ctx.auth.getUserIdentity()) };
    if (!(await canEnterRoom(ctx, member, room))) return { state: "locked" as const, room: publicRoom(room) };
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
    const posts = room.doc
      ? (
          await ctx.db
            .query("learnPosts")
            .withIndex("by_room_activity", (q) => q.eq("roomId", room.doc!._id))
            .order("desc")
            .take(limit + 20)
        )
          .filter((p) => p.status === "open" || p.authorId === member.user._id || member.isAdmin)
          .slice(0, limit)
      : [];
    const authors = await authorsFor(ctx, posts.map((p) => p.authorId));
    return {
      state: "ok" as const,
      group: room.kind === "group" && room.groupId ? await groupCard(ctx, room.groupId, member) : null,
      room: publicRoom(room),
      posts: posts.map((p) => ({ ...postSummary(p, authors.get(p.authorId), room), hidden: p.status === "hidden" })),
      hasMore: posts.length === limit,
    };
  },
});

export const getPost = query({
  args: { postId: v.string() },
  handler: async (ctx, args) => {
    const member = await memberOrNull(ctx);
    const postId = ctx.db.normalizeId("learnPosts", args.postId);
    const post = postId ? await ctx.db.get(postId) : null;
    if (!post) return { state: "missing" as const };
    const roomDoc = await ctx.db.get(post.roomId);
    const room = roomDoc ? roomView(roomDoc) : null;
    if (!room) return { state: "missing" as const };
    if (!member) return { state: "join" as const, room: publicRoom(room), signedIn: Boolean(await ctx.auth.getUserIdentity()) };
    if (!(await canEnterRoom(ctx, member, room))) return { state: "locked" as const, room: publicRoom(room) };
    if (post.status === "hidden" && post.authorId !== member.user._id && !member.isAdmin) return { state: "missing" as const };

    const replies = (
      await ctx.db
        .query("learnReplies")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .take(300)
    ).filter((r) => r.status === "open" || r.authorId === member.user._id || member.isAdmin);
    const authors = await authorsFor(ctx, [post.authorId, ...replies.map((r) => r.authorId)]);
    const marks = new Set<string>();
    for (const target of [{ type: "post" as const, id: post._id as string }, ...replies.map((r) => ({ type: "reply" as const, id: r._id as string }))]) {
      const mark = await ctx.db
        .query("learnHelpful")
        .withIndex("by_user_target", (q) => q.eq("userId", member.user._id).eq("targetType", target.type).eq("targetId", target.id))
        .first();
      if (mark) marks.add(`${target.type}:${target.id}`);
    }
    return {
      state: "ok" as const,
      room: publicRoom(room),
      canModerate: member.isAdmin,
      viewerId: member.user._id,
      post: {
        id: post._id,
        kind: post.kind,
        title: post.title,
        body: post.body,
        helpfulCount: post.helpfulCount,
        markedHelpful: marks.has(`post:${post._id}`),
        hidden: post.status === "hidden",
        createdAt: post.createdAt,
        author: authors.get(post.authorId) ?? null,
      },
      replies: replies.map((r) => ({
        id: r._id,
        body: r.body,
        helpfulCount: r.helpfulCount,
        markedHelpful: marks.has(`reply:${r._id}`),
        hidden: r.status === "hidden",
        createdAt: r.createdAt,
        author: authors.get(r.authorId) ?? null,
      })),
    };
  },
});

/** A group room's header: name, colour, people (leads first) and the viewer's place in it. */
async function groupCard(ctx: Ctx, groupId: Id<"learnGroups">, member: LearnMemberInfo) {
  const group = await ctx.db.get(groupId);
  if (!group) return null;
  const rows = await ctx.db
    .query("learnGroupMembers")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .take(200);
  rows.sort((a, b) => (a.role === b.role ? a.addedAt - b.addedAt : a.role === "lead" ? -1 : 1));
  const people = await authorsFor(ctx, rows.slice(0, 24).map((r) => r.userId));
  return {
    id: group._id,
    name: group.name,
    description: group.description ?? null,
    color: group.color,
    memberCount: group.memberCount,
    myRole: rows.find((r) => r.userId === member.user._id)?.role ?? null,
    members: rows.slice(0, 24).map((r) => ({ ...(people.get(r.userId) ?? { id: r.userId, name: "Member", imageUrl: null, tag: null }), role: r.role })),
  };
}

// ── Writing ───────────────────────────────────────────────────────────────────

async function rateLimit(ctx: MutationCtx, kind: keyof typeof LIMITS, userId: Id<"users">) {
  const key = `community-${kind}:${userId}`;
  const now = Date.now();
  const row = await ctx.db
    .query("learnVideoRateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  const { limit, windowMs } = LIMITS[kind];
  if (!row || row.windowStart + windowMs <= now) {
    if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
    else await ctx.db.insert("learnVideoRateLimits", { key, windowStart: now, count: 1 });
    return;
  }
  if (row.count >= limit) throw new ConvexError("You're posting a lot. Take a short break and try again in a while.");
  await ctx.db.patch(row._id, { count: row.count + 1 });
}

function checkPrivacy(text: string) {
  const issue = blockingPrivacyIssue(text);
  if (issue) throw new ConvexError(`Keep patients unidentifiable: ${issue.message}`);
}

async function roomDocFor(ctx: MutationCtx, room: RoomView, userId: Id<"users">) {
  if (room.doc) return room.doc;
  const now = Date.now();
  const id = await ctx.db.insert("learnRooms", {
    slug: room.slug,
    title: room.title,
    description: room.description ?? undefined,
    kind: room.kind,
    courseId: room.courseId ?? undefined,
    groupId: room.groupId ?? undefined,
    order: room.kind === "open" ? (DEFAULT_ROOMS.find((r) => r.slug === room.slug)?.order ?? 50) : 100,
    postCount: 0,
    createdBy: userId,
    createdAt: now,
  });
  return (await ctx.db.get(id))!;
}

export const createPost = mutation({
  args: {
    roomSlug: v.string(),
    kind: v.union(v.literal("question"), v.literal("discussion")),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"learnPosts">> => {
    const member = await requireMember(ctx);
    const room = await resolveRoom(ctx, args.roomSlug);
    if (!room || !(await canEnterRoom(ctx, member, room))) throw new ConvexError("You can't post in this room.");
    const title = clean(args.title, 140);
    const body = clean(args.body, 5000);
    if (title.length < 4) throw new ConvexError("Give your post a short title.");
    if (!body) throw new ConvexError("Write something first.");
    checkPrivacy(`${title}\n${body}`);
    await rateLimit(ctx, "post", member.user._id);
    const doc = await roomDocFor(ctx, room, member.user._id);
    const now = Date.now();
    const postId = await ctx.db.insert("learnPosts", {
      roomId: doc._id,
      authorId: member.user._id,
      kind: args.kind,
      title,
      body,
      status: "open",
      replyCount: 0,
      helpfulCount: 0,
      reportCount: 0,
      lastActivityAt: now,
      createdAt: now,
    });
    await ctx.db.patch(doc._id, { postCount: doc.postCount + 1, lastActivityAt: now });
    if (room.kind === "group" && room.groupId) {
      const group = await ctx.db.get(room.groupId);
      const others = (
        await ctx.db
          .query("learnGroupMembers")
          .withIndex("by_group", (q) => q.eq("groupId", room.groupId!))
          .take(150)
      ).filter((m) => m.userId !== member.user._id);
      for (const m of others) {
        await insertNotification(ctx, {
          userId: m.userId,
          type: "learn_group_post",
          priority: "medium",
          status: "pending",
          payload: {
            title: `${member.name} posted in ${group?.name ?? "your group"}`,
            body: title,
            link: `${LEARN_URL}/community/post/${postId}`,
          },
          createdAt: now,
        });
      }
    }
    return postId;
  },
});

export const reply = mutation({
  args: { postId: v.id("learnPosts"), body: v.string() },
  handler: async (ctx, args): Promise<Id<"learnReplies">> => {
    const member = await requireMember(ctx);
    const post = await ctx.db.get(args.postId);
    const roomDoc = post ? await ctx.db.get(post.roomId) : null;
    if (!post || !roomDoc || post.status !== "open") throw new ConvexError("This post isn't open any more.");
    if (!(await canEnterRoom(ctx, member, roomView(roomDoc)))) throw new ConvexError("You can't reply in this room.");
    const body = clean(args.body, 4000);
    if (!body) throw new ConvexError("Write a reply first.");
    checkPrivacy(body);
    await rateLimit(ctx, "reply", member.user._id);
    const now = Date.now();
    const replyId = await ctx.db.insert("learnReplies", {
      postId: post._id,
      authorId: member.user._id,
      body,
      status: "open",
      helpfulCount: 0,
      reportCount: 0,
      createdAt: now,
    });
    await ctx.db.patch(post._id, { replyCount: post.replyCount + 1, lastActivityAt: now });
    await ctx.db.patch(roomDoc._id, { lastActivityAt: now });
    if (post.authorId !== member.user._id) {
      await insertNotification(ctx, {
        userId: post.authorId,
        type: "learn_community_reply",
        priority: "medium",
        status: "pending",
        payload: {
          title: `${member.name} replied to your post`,
          body: post.title,
          link: `${LEARN_URL}/community/post/${post._id}`,
        },
        createdAt: now,
      });
    }
    return replyId;
  },
});

async function target(ctx: MutationCtx, type: "post" | "reply", id: string) {
  if (type === "post") {
    const postId = ctx.db.normalizeId("learnPosts", id);
    const post = postId ? await ctx.db.get(postId) : null;
    return post ? { kind: "post" as const, doc: post, roomId: post.roomId } : null;
  }
  const replyId = ctx.db.normalizeId("learnReplies", id);
  const reply = replyId ? await ctx.db.get(replyId) : null;
  const post = reply ? await ctx.db.get(reply.postId) : null;
  return reply && post ? { kind: "reply" as const, doc: reply, roomId: post.roomId, post } : null;
}

const targetArgs = { targetType: v.union(v.literal("post"), v.literal("reply")), targetId: v.string() };

export const toggleHelpful = mutation({
  args: targetArgs,
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const t = await target(ctx, args.targetType, args.targetId);
    if (!t || t.doc.status !== "open") throw new ConvexError("This isn't available.");
    if (t.doc.authorId === member.user._id) throw new ConvexError("You can't mark your own post helpful.");
    const room = await ctx.db.get(t.roomId);
    if (!room || !(await canEnterRoom(ctx, member, roomView(room)))) throw new ConvexError("This isn't available.");
    const existing = await ctx.db
      .query("learnHelpful")
      .withIndex("by_user_target", (q) => q.eq("userId", member.user._id).eq("targetType", args.targetType).eq("targetId", args.targetId))
      .first();
    const delta = existing ? -1 : 1;
    if (existing) await ctx.db.delete(existing._id);
    else await ctx.db.insert("learnHelpful", { userId: member.user._id, targetType: args.targetType, targetId: args.targetId, createdAt: Date.now() });
    await ctx.db.patch(t.doc._id, { helpfulCount: Math.max(0, t.doc.helpfulCount + delta) });
    return { marked: !existing };
  },
});

export const report = mutation({
  args: { ...targetArgs, reason: v.string() },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const t = await target(ctx, args.targetType, args.targetId);
    if (!t) throw new ConvexError("This isn't available.");
    const already = (
      await ctx.db
        .query("learnReports")
        .withIndex("by_target", (q) => q.eq("targetType", args.targetType).eq("targetId", args.targetId))
        .take(50)
    ).some((r) => r.userId === member.user._id);
    if (already) return { hidden: t.doc.status === "hidden" };
    await ctx.db.insert("learnReports", {
      userId: member.user._id,
      targetType: args.targetType,
      targetId: args.targetId,
      reason: clean(args.reason, 300) || "No reason given",
      createdAt: Date.now(),
    });
    const reportCount = t.doc.reportCount + 1;
    const hide = reportCount >= REPORTS_TO_HIDE;
    await ctx.db.patch(t.doc._id, { reportCount, ...(hide ? { status: "hidden" as const } : {}) });
    return { hidden: hide };
  },
});

/** Delete your own post or reply (admins can delete any). */
export const remove = mutation({
  args: targetArgs,
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const t = await target(ctx, args.targetType, args.targetId);
    if (!t) return;
    if (t.doc.authorId !== member.user._id && !member.isAdmin) throw new ConvexError("You can only delete your own posts.");
    if (t.kind === "post") {
      const replies = await ctx.db
        .query("learnReplies")
        .withIndex("by_post", (q) => q.eq("postId", t.doc._id))
        .take(500);
      for (const r of replies) await ctx.db.delete(r._id);
      await ctx.db.delete(t.doc._id);
      const room = await ctx.db.get(t.roomId);
      if (room) await ctx.db.patch(room._id, { postCount: Math.max(0, room.postCount - 1) });
    } else {
      await ctx.db.delete(t.doc._id);
      await ctx.db.patch(t.post._id, { replyCount: Math.max(0, t.post.replyCount - 1) });
    }
  },
});

// ── Admin ─────────────────────────────────────────────────────────────────────

/** Open reports, grouped by post or reply. Empty for everyone but admins. */
export const adminReports = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!(await isLearnAdminUser(ctx, viewer?.user))) return [];
    const open = await ctx.db
      .query("learnReports")
      .withIndex("by_open", (q) => q.eq("resolvedAt", undefined))
      .order("desc")
      .take(100);
    const grouped = new Map<string, { targetType: "post" | "reply"; targetId: string; reasons: string[]; count: number; latestAt: number }>();
    for (const r of open) {
      const key = `${r.targetType}:${r.targetId}`;
      const g = grouped.get(key) ?? { targetType: r.targetType, targetId: r.targetId, reasons: [], count: 0, latestAt: r.createdAt };
      g.reasons.push(r.reason);
      g.count++;
      grouped.set(key, g);
    }
    const rows = [];
    for (const g of grouped.values()) {
      const doc =
        g.targetType === "post"
          ? await ctx.db.get(ctx.db.normalizeId("learnPosts", g.targetId)!)
          : await ctx.db.get(ctx.db.normalizeId("learnReplies", g.targetId)!);
      if (!doc) continue;
      const postId = g.targetType === "post" ? (doc as Doc<"learnPosts">)._id : (doc as Doc<"learnReplies">).postId;
      rows.push({
        ...g,
        postId,
        text: "title" in doc ? `${doc.title}\n${doc.body}` : doc.body,
        status: doc.status,
      });
    }
    return rows;
  },
});

export const adminModerate = mutation({
  args: { ...targetArgs, action: v.union(v.literal("hide"), v.literal("restore"), v.literal("dismiss")) },
  handler: async (ctx, args) => {
    await requireLearnAdmin(ctx);
    const t = await target(ctx, args.targetType, args.targetId);
    if (t && args.action !== "dismiss") await ctx.db.patch(t.doc._id, { status: args.action === "hide" ? "hidden" : "open", reportCount: 0 });
    const reports = await ctx.db
      .query("learnReports")
      .withIndex("by_target", (q) => q.eq("targetType", args.targetType).eq("targetId", args.targetId))
      .take(100);
    const now = Date.now();
    for (const r of reports) if (!r.resolvedAt) await ctx.db.patch(r._id, { resolvedAt: now });
  },
});

/** Extra open rooms (e.g. a study group for an exam). */
export const adminCreateRoom = mutation({
  args: { title: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { user } = await requireLearnAdmin(ctx);
    const title = clean(args.title, 60);
    if (title.length < 3) throw new ConvexError("Give the room a name.");
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    if (!slug || slug.startsWith("course-") || slug.startsWith("group-") || slug === "msk-program") throw new ConvexError("Choose another name.");
    const existing = await ctx.db
      .query("learnRooms")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing && !existing.archived) throw new ConvexError("A room with this name exists.");
    if (existing) {
      await ctx.db.patch(existing._id, { archived: false, title, description: clean(args.description, 200) || undefined });
      return existing._id;
    }
    return await ctx.db.insert("learnRooms", {
      slug,
      title,
      description: clean(args.description, 200) || undefined,
      kind: "open",
      order: 10,
      postCount: 0,
      createdBy: user._id,
      createdAt: Date.now(),
    });
  },
});

export const adminArchiveRoom = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    await requireLearnAdmin(ctx);
    const room = await ctx.db
      .query("learnRooms")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (room) await ctx.db.patch(room._id, { archived: true });
  },
});

/** Keeps room counts honest if they ever drift (run by hand). */
export const recountRooms = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const room of await ctx.db.query("learnRooms").take(500)) {
      const posts = await ctx.db
        .query("learnPosts")
        .withIndex("by_room_activity", (q) => q.eq("roomId", room._id))
        .take(5000);
      await ctx.db.patch(room._id, { postCount: posts.length });
    }
  },
});
