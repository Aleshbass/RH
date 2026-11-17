/**
 * Learn group home (owner 2026-11-15: "Group home + invites, Group leaderboard, Assignments +
 * tracking"). Lives on the group's private room page: a note the lead pins, the group's upcoming
 * Spaces, work the lead sets (a course, a lesson or a simulation case, with a due date) with who
 * has done it, a leaderboard of the group's own points, and an invite link. Members see their own
 * groups; leads and Learn admins manage them.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { groupRoleOf, isLearnAdminUser } from "./helpers/learnAccess";
import { getViewer } from "./helpers/partnerAccess";
import { insertNotification } from "./helpers/pushNotify";
import { learnMemberInfo } from "./learn";
import { lagosMonth, monthLabel } from "../lib/learn/points";
import { groupCapacity, groupIsFull } from "./helpers/learnGroupRules";

type Ctx = QueryCtx | MutationCtx;

const LEARN_URL = (process.env.LEARN_PUBLIC_URL ?? "https://learn.physioaroundme.com").replace(/\/+$/, "");
const MAX_MEMBERS = 200;
const MAX_ASSIGNMENTS = 30;
const INVITE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const roomSlug = (groupId: Id<"learnGroups">) => `group-${groupId}`;
const clean = (value: string | undefined | null, max: number) => (value ?? "").replace(/[ \t]+/g, " ").trim().slice(0, max);
const fullName = (u: Doc<"users"> | null) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || "Someone" : "Someone");

/** Who is looking: a member or lead of the group, or a Learn admin. Null for anyone else. */
async function access(ctx: Ctx, groupId: Id<"learnGroups">) {
  const group = await ctx.db.get(groupId);
  if (!group || group.archived) return null;
  const user = (await getViewer(ctx))?.user ?? null;
  if (!user || user.deletedAt) return null;
  const role = await groupRoleOf(ctx, groupId, user._id);
  const admin = await isLearnAdminUser(ctx, user);
  if (!role && !admin) return null;
  return { group, user, role, admin, canManage: admin || role === "lead" };
}

async function manageOrThrow(ctx: Ctx, groupId: Id<"learnGroups">) {
  const a = await access(ctx, groupId);
  if (!a) throw new ConvexError("You're not in this group.");
  if (!a.canManage) throw new ConvexError("Only the group's leads can do that.");
  return a;
}

async function membersOf(ctx: Ctx, groupId: Id<"learnGroups">) {
  return await ctx.db
    .query("learnGroupMembers")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .take(MAX_MEMBERS + 50);
}

const newCode = () => Array.from({ length: 10 }, () => INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)]).join("");

// ── Home ──────────────────────────────────────────────────────────────────────

/** The top of the group page: pinned note, upcoming group Spaces, open work and (for leads) the invite. */
export const home = query({
  args: { groupId: v.id("learnGroups") },
  handler: async (ctx, args) => {
    const a = await access(ctx, args.groupId);
    if (!a) return null;
    const { group, user } = a;
    const by = group.announcement ? await ctx.db.get(group.announcement.by) : null;
    const now = Date.now();
    // Group Spaces on now or coming up (the index is by status, then time)
    const live = await ctx.db
      .query("learnSpaces")
      .withIndex("by_status_time", (q) => q.eq("status", "live"))
      .take(100);
    const scheduled = await ctx.db
      .query("learnSpaces")
      .withIndex("by_status_time", (q) => q.eq("status", "scheduled").gte("scheduledFor", now - 2 * 3600_000))
      .take(200);
    const spaces = [...live, ...scheduled]
      .filter((s) => s.groupId === group._id)
      .slice(0, 4)
      .map((s) => ({ id: s._id, title: s.title, status: s.status, at: s.status === "live" ? (s.startedAt ?? now) : (s.scheduledFor ?? null) }));
    // Work still to do for the viewer (the tab's badge)
    const assignments = await ctx.db
      .query("learnGroupAssignments")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .order("desc")
      .take(MAX_ASSIGNMENTS + 20);
    let open = 0;
    if (a.role) {
      const emails = await learnerEmails(ctx, user);
      for (const item of assignments) {
        if (item.archived) continue;
        if ((await statusFor(ctx, item, user, emails)).state !== "done") open++;
      }
    }
    return {
      canManage: a.canManage,
      myRole: a.role,
      announcement: group.announcement ? { text: group.announcement.text, at: group.announcement.at, by: fullName(by) } : null,
      spaces,
      openAssignments: open,
      invite: a.canManage ? { code: group.inviteCode ?? null, url: group.inviteCode ? `${LEARN_URL}/community/join/${group.inviteCode}` : null } : null,
    };
  },
});

export const setAnnouncement = mutation({
  args: { groupId: v.id("learnGroups"), text: v.string() },
  handler: async (ctx, args) => {
    const { user } = await manageOrThrow(ctx, args.groupId);
    const text = clean(args.text, 600);
    await ctx.db.patch(args.groupId, { announcement: text ? { text, by: user._id, at: Date.now() } : undefined, updatedAt: Date.now() });
    return null;
  },
});

// ── Invites ───────────────────────────────────────────────────────────────────

/** Turn the invite link on, make a new one (the old link stops working) or turn it off. */
export const setInvite = mutation({
  args: { groupId: v.id("learnGroups"), action: v.union(v.literal("on"), v.literal("new"), v.literal("off")) },
  handler: async (ctx, args) => {
    const { group } = await manageOrThrow(ctx, args.groupId);
    if (args.action === "off") {
      await ctx.db.patch(group._id, { inviteCode: undefined, updatedAt: Date.now() });
      return { code: null };
    }
    if (args.action === "on" && group.inviteCode) return { code: group.inviteCode };
    let code = newCode();
    for (let tries = 0; tries < 5; tries++) {
      const clash = await ctx.db
        .query("learnGroups")
        .withIndex("by_invite", (q) => q.eq("inviteCode", code))
        .first();
      if (!clash) break;
      code = newCode();
    }
    await ctx.db.patch(group._id, { inviteCode: code, updatedAt: Date.now() });
    return { code };
  },
});

async function groupByInvite(ctx: Ctx, code: string) {
  const c = clean(code, 32).toLowerCase();
  if (!/^[a-z0-9]{6,32}$/.test(c)) return null;
  const group = await ctx.db
    .query("learnGroups")
    .withIndex("by_invite", (q) => q.eq("inviteCode", c))
    .first();
  return group && !group.archived ? group : null;
}

/** The invite page: the group, and where the visitor stands (signed out, not on Learn yet, in, or ready to join). */
export const invitePreview = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const group = await groupByInvite(ctx, args.code);
    if (!group) return { state: "invalid" as const };
    const rows = await membersOf(ctx, group._id);
    const leads = [];
    for (const r of rows.filter((x) => x.role === "lead").slice(0, 3)) leads.push(fullName(await ctx.db.get(r.userId)).split(" ")[0]);
    const card = { name: group.name, description: group.description ?? null, color: group.color, memberCount: group.memberCount, leads, roomSlug: roomSlug(group._id) };
    const user = (await getViewer(ctx))?.user ?? null;
    if (!user) return { state: "signin" as const, group: card };
    if (!(await learnMemberInfo(ctx, user))) return { state: "welcome" as const, group: card };
    if (await groupRoleOf(ctx, group._id, user._id)) return { state: "member" as const, group: card };
    if (groupIsFull(group)) return { state: "full" as const, group: card };
    return { state: "ready" as const, group: card };
  },
});

export const joinByInvite = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = (await getViewer(ctx))?.user ?? null;
    if (!user) throw new ConvexError("Please sign in to join the group.");
    const info = await learnMemberInfo(ctx, user);
    if (!info) throw new ConvexError("Finish joining Rehabify Learn first.");
    const group = await groupByInvite(ctx, args.code);
    if (!group) throw new ConvexError("This invite link has been turned off. Ask the group's lead for a new one.");
    if (await groupRoleOf(ctx, group._id, user._id)) return { roomSlug: roomSlug(group._id) };
    if (groupIsFull(group)) throw new ConvexError(`This group is full (${groupCapacity(group)} people). Pick another group from Learn.`);
    const now = Date.now();
    await ctx.db.insert("learnGroupMembers", { groupId: group._id, userId: user._id, role: "member", addedBy: user._id, addedAt: now });
    await ctx.db.patch(group._id, { memberCount: group.memberCount + 1, updatedAt: now });
    // Tell the leads someone joined with their link
    const leads = (await membersOf(ctx, group._id)).filter((m) => m.role === "lead" && m.userId !== user._id).slice(0, 10);
    for (const lead of leads) {
      await insertNotification(ctx, {
        userId: lead.userId,
        type: "learn_group_joined",
        priority: "low",
        status: "pending",
        payload: { title: `${info.name} joined ${group.name}`, body: "They used the group's invite link.", link: `${LEARN_URL}/community/${roomSlug(group._id)}?tab=people` },
        createdAt: now,
      });
    }
    return { roomSlug: roomSlug(group._id) };
  },
});

// ── Assignments ───────────────────────────────────────────────────────────────

type Status = { state: "done" | "started" | "todo"; pct: number; detail: string | null; at: number | null };

/** Every email a learner's course progress can be under (Learn account, MSK registrations, or no email). */
async function learnerEmails(ctx: Ctx, user: Doc<"users">) {
  const out = new Set<string>();
  if (user.email) out.add(user.email.toLowerCase().trim());
  out.add(`user-${user._id}`);
  const regs = await ctx.db
    .query("learnRegistrations")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .take(10);
  for (const r of regs) if (r.email) out.add(r.email.toLowerCase().trim());
  return [...out];
}

async function progressFor(ctx: Ctx, courseId: Id<"learnVideoCourses">, emails: string[]) {
  for (const email of emails) {
    const row = await ctx.db
      .query("learnVideoProgress")
      .withIndex("by_email_course", (q) => q.eq("email", email).eq("courseId", courseId))
      .first();
    if (row) return row;
  }
  return null;
}

const lessonCounts = new Map<string, number>();
async function lessonCount(ctx: Ctx, courseId: Id<"learnVideoCourses">) {
  const cached = lessonCounts.get(courseId);
  if (cached !== undefined) return cached;
  const n = (
    await ctx.db
      .query("learnVideoLessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
      .take(300)
  ).length;
  lessonCounts.set(courseId, n);
  return n;
}

async function statusFor(ctx: Ctx, item: Doc<"learnGroupAssignments">, user: Doc<"users">, emails: string[]): Promise<Status> {
  if (item.kind === "sim" && item.caseSlug) {
    const attempts = await ctx.db
      .query("learnSimAttempts")
      .withIndex("by_user_case", (q) => q.eq("userId", user._id).eq("caseSlug", item.caseSlug!))
      .take(60);
    const finished = attempts.filter((x) => x.status === "finished" && !x.preview);
    if (finished.length) {
      const best = Math.max(...finished.map((x) => x.scorePct ?? 0));
      const passed = finished.some((x) => x.passed);
      const first = Math.min(...finished.map((x) => x.finishedAt ?? x.startedAt));
      return { state: "done", pct: 100, detail: `${passed ? "Passed" : "Finished"} · best ${best}%`, at: first };
    }
    return attempts.some((x) => x.status === "active" && !x.preview) ? { state: "started", pct: 0, detail: "Started", at: null } : { state: "todo", pct: 0, detail: null, at: null };
  }
  if (!item.courseId) return { state: "todo", pct: 0, detail: null, at: null };
  const row = await progressFor(ctx, item.courseId, emails);
  if (!row) return { state: "todo", pct: 0, detail: null, at: null };
  if (item.kind === "lesson") {
    return item.lessonId && row.completedLessonIds.includes(item.lessonId)
      ? { state: "done", pct: 100, detail: "Watched", at: row.updatedAt }
      : { state: "started", pct: 0, detail: "Started the course", at: null };
  }
  if (row.completedAt) return { state: "done", pct: 100, detail: "Finished", at: row.completedAt };
  const total = await lessonCount(ctx, item.courseId);
  const pct = total ? Math.round((row.completedLessonIds.length / total) * 100) : 0;
  return { state: "started", pct, detail: `${row.completedLessonIds.length} of ${total} lessons`, at: null };
}

/** The group's work, newest first, with the viewer's own progress on each. */
export const assignments = query({
  args: { groupId: v.id("learnGroups") },
  handler: async (ctx, args) => {
    const a = await access(ctx, args.groupId);
    if (!a) return null;
    const rows = await ctx.db
      .query("learnGroupAssignments")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .take(MAX_ASSIGNMENTS + 20);
    const emails = await learnerEmails(ctx, a.user);
    const items = [];
    for (const item of rows) {
      if (item.archived) continue;
      const by = await ctx.db.get(item.createdBy);
      items.push({
        id: item._id,
        kind: item.kind,
        title: item.title,
        note: item.note ?? null,
        dueAt: item.dueAt ?? null,
        createdAt: item.createdAt,
        by: fullName(by),
        courseId: item.courseId ?? null,
        caseSlug: item.caseSlug ?? null,
        // Leads who aren't doing the work themselves don't need their own tick
        mine: a.role ? await statusFor(ctx, item, a.user, emails) : null,
      });
    }
    return { canManage: a.canManage, items };
  },
});

/** For leads: where each member is on one piece of work. */
export const assignmentProgress = query({
  args: { assignmentId: v.id("learnGroupAssignments") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.assignmentId);
    if (!item || item.archived) return null;
    const a = await access(ctx, item.groupId);
    if (!a?.canManage) return null;
    const rows = await membersOf(ctx, item.groupId);
    const people = [];
    for (const r of rows) {
      const user = await ctx.db.get(r.userId);
      if (!user || user.deletedAt) continue;
      const info = await learnMemberInfo(ctx, user);
      const status = await statusFor(ctx, item, user, await learnerEmails(ctx, user));
      people.push({ userId: user._id, name: info?.name ?? fullName(user), imageUrl: info?.imageUrl ?? user.imageUrl ?? null, role: r.role, ...status });
    }
    const order = { done: 2, started: 1, todo: 0 } as const;
    people.sort((x, y) => order[x.state] - order[y.state] || x.name.localeCompare(y.name));
    return { done: people.filter((p) => p.state === "done").length, total: people.length, people };
  },
});

/** What a lead can set: published courses (with their lessons) and live simulation cases. */
export const assignable = query({
  args: { groupId: v.id("learnGroups") },
  handler: async (ctx, args) => {
    const a = await access(ctx, args.groupId);
    if (!a?.canManage) return null;
    const courses = await ctx.db
      .query("learnVideoCourses")
      .withIndex("by_status_order", (q) => q.eq("status", "published"))
      .take(100);
    const out = [];
    for (const c of courses) {
      const lessons = await ctx.db
        .query("learnVideoLessons")
        .withIndex("by_course_order", (q) => q.eq("courseId", c._id))
        .take(200);
      out.push({ id: c._id, title: c.title, lessons: lessons.map((l) => ({ id: l._id, title: l.title })) });
    }
    const cases = (await ctx.db.query("learnSimCases").withIndex("by_order").take(100)).filter((c) => c.published).map((c) => ({ slug: c.slug, title: c.title }));
    return { courses: out, cases };
  },
});

export const createAssignment = mutation({
  args: {
    groupId: v.id("learnGroups"),
    kind: v.union(v.literal("course"), v.literal("lesson"), v.literal("sim")),
    courseId: v.optional(v.id("learnVideoCourses")),
    lessonId: v.optional(v.id("learnVideoLessons")),
    caseSlug: v.optional(v.string()),
    note: v.optional(v.string()),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { group, user } = await manageOrThrow(ctx, args.groupId);
    const active = (
      await ctx.db
        .query("learnGroupAssignments")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .take(MAX_ASSIGNMENTS + 50)
    ).filter((x) => !x.archived);
    if (active.length >= MAX_ASSIGNMENTS) throw new ConvexError(`A group can have up to ${MAX_ASSIGNMENTS} pieces of work. Remove an old one first.`);
    let title = "";
    let courseId: Id<"learnVideoCourses"> | undefined;
    let lessonId: Id<"learnVideoLessons"> | undefined;
    let caseSlug: string | undefined;
    if (args.kind === "course") {
      const course = args.courseId ? await ctx.db.get(args.courseId) : null;
      if (!course || course.status !== "published") throw new ConvexError("Pick a published course.");
      title = course.title;
      courseId = course._id;
    } else if (args.kind === "lesson") {
      const lesson = args.lessonId ? await ctx.db.get(args.lessonId) : null;
      const course = lesson ? await ctx.db.get(lesson.courseId) : null;
      if (!lesson || !course || course.status !== "published") throw new ConvexError("Pick a lesson from a published course.");
      title = `${lesson.title} · ${course.title}`;
      courseId = course._id;
      lessonId = lesson._id;
    } else {
      const doc = args.caseSlug
        ? await ctx.db
            .query("learnSimCases")
            .withIndex("by_slug", (q) => q.eq("slug", args.caseSlug!))
            .first()
        : null;
      if (!doc?.published) throw new ConvexError("Pick a simulation case that's live.");
      title = doc.title;
      caseSlug = doc.slug;
    }
    const now = Date.now();
    if (args.dueAt !== undefined && (args.dueAt < now - 86400_000 || args.dueAt > now + 366 * 86400_000)) throw new ConvexError("Pick a due date within the next year.");
    const note = clean(args.note, 500) || undefined;
    const id = await ctx.db.insert("learnGroupAssignments", {
      groupId: group._id,
      kind: args.kind,
      courseId,
      lessonId,
      caseSlug,
      title,
      note,
      dueAt: args.dueAt,
      createdBy: user._id,
      createdAt: now,
    });
    // Everyone else in the group hears about it
    const due = args.dueAt ? ` Due ${new Date(args.dueAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" })}.` : "";
    for (const m of (await membersOf(ctx, group._id)).filter((x) => x.userId !== user._id)) {
      await insertNotification(ctx, {
        userId: m.userId,
        type: "learn_group_assignment",
        priority: "medium",
        status: "pending",
        payload: { title: `New in ${group.name}: ${title}`, body: `${note ?? "Your group lead set this."}${due}`, link: `${LEARN_URL}/community/${roomSlug(group._id)}?tab=work` },
        createdAt: now,
      });
    }
    return id;
  },
});

export const removeAssignment = mutation({
  args: { assignmentId: v.id("learnGroupAssignments") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.assignmentId);
    if (!item) return null;
    await manageOrThrow(ctx, item.groupId);
    await ctx.db.patch(item._id, { archived: true });
    return null;
  },
});

// ── Leaderboard and people ────────────────────────────────────────────────────

/** Everyone in the group with their points (this month and all time); people who hide stay off the board. */
export const people = query({
  args: { groupId: v.id("learnGroups") },
  handler: async (ctx, args) => {
    const a = await access(ctx, args.groupId);
    if (!a) return null;
    const month = lagosMonth(Date.now());
    const rows = await membersOf(ctx, args.groupId);
    const out = [];
    for (const r of rows) {
      const user = await ctx.db.get(r.userId);
      if (!user || user.deletedAt) continue;
      const info = await learnMemberInfo(ctx, user);
      const account = await ctx.db
        .query("learnPointsAccounts")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique();
      const monthly = await ctx.db
        .query("learnPointsMonthly")
        .withIndex("by_month_user", (q) => q.eq("month", month).eq("userId", user._id))
        .unique();
      out.push({
        userId: user._id,
        name: info?.name ?? fullName(user),
        imageUrl: info?.imageUrl ?? user.imageUrl ?? null,
        tag: info?.tag?.label ?? null,
        role: r.role,
        joinedAt: r.addedAt,
        isMe: user._id === a.user._id,
        hidden: Boolean(account?.hidden),
        month: monthly?.points ?? 0,
        total: account?.total ?? 0,
        streak: account?.streak ?? 0,
      });
    }
    return { monthLabel: monthLabel(month), people: out };
  },
});
