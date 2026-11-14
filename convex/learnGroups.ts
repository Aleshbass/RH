/**
 * Learn groups (Mary 2026-11-14): small groups for group activities. Learn admins (platform admins
 * and Learn super admins) create them and assign people, as members or leads. Each group has a
 * private community room (learnRooms kind "group", slug "group-<id>") and can hold group-only
 * Spaces (learnSpaces.groupId; leads can host those). Members only see their own groups.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireLearnAdmin } from "./helpers/learnAccess";
import { getViewer } from "./helpers/partnerAccess";
import { insertNotification } from "./helpers/pushNotify";
import { learnMemberInfo } from "./learn";

type Ctx = QueryCtx | MutationCtx;

const LEARN_URL = (process.env.LEARN_PUBLIC_URL ?? "https://learn.physioaroundme.com").replace(/\/+$/, "");
/** Keep groups small enough to work together. */
const MAX_MEMBERS = 200;
export const GROUP_COLORS = ["lime", "sky", "amber", "rose", "violet", "teal"] as const;
const groupColor = v.union(v.literal("lime"), v.literal("sky"), v.literal("amber"), v.literal("rose"), v.literal("violet"), v.literal("teal"));

const clean = (value: string | undefined | null, max: number) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const roomSlug = (groupId: Id<"learnGroups">) => `group-${groupId}`;

async function groupOrThrow(ctx: Ctx, groupId: Id<"learnGroups">) {
  const group = await ctx.db.get(groupId);
  if (!group) throw new ConvexError("That group doesn't exist any more.");
  return group;
}

async function membersOf(ctx: Ctx, groupId: Id<"learnGroups">) {
  return await ctx.db
    .query("learnGroupMembers")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .take(MAX_MEMBERS + 50);
}

async function person(ctx: Ctx, user: Doc<"users"> | null) {
  const info = await learnMemberInfo(ctx, user);
  if (!user) return null;
  return {
    userId: user._id,
    name: info?.name ?? ([user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "Member"),
    email: user.email ?? null,
    imageUrl: info?.imageUrl ?? user.imageUrl ?? null,
    tag: info?.tag?.label ?? null,
    isLearnMember: Boolean(info),
  };
}

// ── Admin: groups ─────────────────────────────────────────────────────────────

export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireLearnAdmin(ctx);
    const groups = await ctx.db.query("learnGroups").withIndex("by_created").order("desc").take(200);
    const out = [];
    for (const g of groups) {
      const rows = await membersOf(ctx, g._id);
      const leads = [];
      for (const r of rows.filter((x) => x.role === "lead").slice(0, 3)) {
        const p = await person(ctx, await ctx.db.get(r.userId));
        if (p) leads.push(p.name);
      }
      const room = g.roomId ? await ctx.db.get(g.roomId) : null;
      out.push({
        id: g._id,
        name: g.name,
        description: g.description ?? null,
        color: g.color,
        memberCount: g.memberCount,
        archived: Boolean(g.archived),
        leads,
        roomSlug: roomSlug(g._id),
        postCount: room?.postCount ?? 0,
        lastActivityAt: room?.lastActivityAt ?? null,
        createdAt: g.createdAt,
      });
    }
    return out;
  },
});

/** One group with its people and a light view of how each is getting on. */
export const adminGroup = query({
  args: { groupId: v.id("learnGroups") },
  handler: async (ctx, args) => {
    await requireLearnAdmin(ctx);
    const group = await ctx.db.get(args.groupId);
    if (!group) return null;
    const rows = await membersOf(ctx, group._id);
    const posts = group.roomId
      ? await ctx.db
          .query("learnPosts")
          .withIndex("by_room_activity", (q) => q.eq("roomId", group.roomId!))
          .take(500)
      : [];
    const postsBy = new Map<string, number>();
    for (const p of posts) postsBy.set(p.authorId, (postsBy.get(p.authorId) ?? 0) + 1);

    const members = [];
    for (const r of rows) {
      const p = await person(ctx, await ctx.db.get(r.userId));
      if (!p) continue;
      const enrollments = await ctx.db
        .query("learnCourseEnrollments")
        .withIndex("by_user_course", (q) => q.eq("userId", r.userId))
        .take(50);
      const attempts = await ctx.db
        .query("learnSimAttempts")
        .withIndex("by_user_case", (q) => q.eq("userId", r.userId))
        .take(200);
      members.push({
        ...p,
        role: r.role,
        addedAt: r.addedAt,
        courses: enrollments.filter((e) => e.status === "active").length,
        casesPassed: new Set(attempts.filter((a) => a.passed).map((a) => a.caseSlug)).size,
        posts: postsBy.get(r.userId) ?? 0,
      });
    }
    members.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "lead" ? -1 : 1));
    return {
      id: group._id,
      name: group.name,
      description: group.description ?? null,
      color: group.color,
      archived: Boolean(group.archived),
      memberCount: group.memberCount,
      roomSlug: roomSlug(group._id),
      maxMembers: MAX_MEMBERS,
      members,
    };
  },
});

export const adminCreate = mutation({
  args: { name: v.string(), description: v.optional(v.string()), color: v.optional(groupColor) },
  handler: async (ctx, args): Promise<Id<"learnGroups">> => {
    const { user } = await requireLearnAdmin(ctx);
    const name = clean(args.name, 60);
    if (name.length < 3) throw new ConvexError("Give the group a name.");
    const description = clean(args.description, 240) || undefined;
    const count = (await ctx.db.query("learnGroups").take(500)).length;
    const now = Date.now();
    const groupId = await ctx.db.insert("learnGroups", {
      name,
      description,
      color: args.color ?? GROUP_COLORS[count % GROUP_COLORS.length],
      memberCount: 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    const roomId = await ctx.db.insert("learnRooms", {
      slug: roomSlug(groupId),
      title: name,
      description: description ?? "Your group's private room: plans, questions and work together.",
      kind: "group",
      groupId,
      order: 200,
      postCount: 0,
      createdBy: user._id,
      createdAt: now,
    });
    await ctx.db.patch(groupId, { roomId });
    return groupId;
  },
});

export const adminUpdate = mutation({
  args: {
    groupId: v.id("learnGroups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(groupColor),
  },
  handler: async (ctx, args) => {
    await requireLearnAdmin(ctx);
    const group = await groupOrThrow(ctx, args.groupId);
    const name = args.name === undefined ? group.name : clean(args.name, 60);
    if (name.length < 3) throw new ConvexError("Give the group a name.");
    const description = args.description === undefined ? group.description : clean(args.description, 240) || undefined;
    await ctx.db.patch(group._id, { name, description, color: args.color ?? group.color, updatedAt: Date.now() });
    if (group.roomId) await ctx.db.patch(group.roomId, { title: name, description: description ?? "Your group's private room." });
  },
});

export const adminSetArchived = mutation({
  args: { groupId: v.id("learnGroups"), archived: v.boolean() },
  handler: async (ctx, args) => {
    await requireLearnAdmin(ctx);
    const group = await groupOrThrow(ctx, args.groupId);
    await ctx.db.patch(group._id, { archived: args.archived, updatedAt: Date.now() });
    if (group.roomId) await ctx.db.patch(group.roomId, { archived: args.archived });
  },
});

// ── Admin: people ─────────────────────────────────────────────────────────────

/** Learn members by name or email, to add to a group. */
export const adminSearchPeople = query({
  args: { q: v.string(), groupId: v.optional(v.id("learnGroups")) },
  handler: async (ctx, args) => {
    await requireLearnAdmin(ctx);
    const q = args.q.toLowerCase().trim();
    if (q.length < 2) return [];
    const inGroup = new Set(args.groupId ? (await membersOf(ctx, args.groupId)).map((r) => r.userId as string) : []);

    let candidates: Doc<"users">[] = [];
    if (q.includes("@")) {
      const u = await ctx.db
        .query("users")
        .withIndex("by_email", (x) => x.eq("email", q))
        .first();
      if (u) candidates = [u];
    } else {
      const seen = new Set<string>();
      const matches = (u: Doc<"users"> | null) => {
        if (!u || u.deletedAt || seen.has(u._id)) return false;
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ").toLowerCase();
        return name.includes(q) || (u.email ?? "").toLowerCase().includes(q);
      };
      // Students and other Learn sign-ups have a Learn profile; clinicians are members by role
      for (const profile of await ctx.db.query("learnProfiles").take(2500)) {
        if (candidates.length >= 25) break;
        const u = await ctx.db.get(profile.userId);
        if (matches(u)) {
          seen.add(u!._id);
          candidates.push(u!);
        }
      }
      for (const role of ["physiotherapist", "learn_instructor", "clinic_owner"] as const) {
        if (candidates.length >= 25) break;
        for (const u of await ctx.db
          .query("users")
          .withIndex("by_role", (x) => x.eq("role", role))
          .take(1500)) {
          if (candidates.length >= 25) break;
          if (matches(u)) {
            seen.add(u._id);
            candidates.push(u);
          }
        }
      }
    }
    const out = [];
    for (const u of candidates.slice(0, 15)) {
      const p = await person(ctx, u);
      if (p) out.push({ ...p, inGroup: inGroup.has(u._id) });
    }
    return out;
  },
});

export const adminAddMembers = mutation({
  args: {
    groupId: v.id("learnGroups"),
    userIds: v.array(v.id("users")),
    role: v.optional(v.union(v.literal("member"), v.literal("lead"))),
  },
  handler: async (ctx, args) => {
    const { user: admin } = await requireLearnAdmin(ctx);
    const group = await groupOrThrow(ctx, args.groupId);
    if (group.archived) throw new ConvexError("Bring the group back from the archive first.");
    if (args.userIds.length > 50) throw new ConvexError("Add up to 50 people at a time.");
    let count = group.memberCount;
    const added: string[] = [];
    const skipped: string[] = [];
    const now = Date.now();
    for (const userId of new Set(args.userIds)) {
      const user = await ctx.db.get(userId);
      const info = await learnMemberInfo(ctx, user);
      if (!user || !info) {
        skipped.push(user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "Someone" : "Someone");
        continue;
      }
      const existing = await ctx.db
        .query("learnGroupMembers")
        .withIndex("by_group_user", (q) => q.eq("groupId", group._id).eq("userId", userId))
        .first();
      if (existing) {
        if (args.role && existing.role !== args.role) await ctx.db.patch(existing._id, { role: args.role });
        continue;
      }
      if (count >= MAX_MEMBERS) throw new ConvexError(`Groups hold up to ${MAX_MEMBERS} people.`);
      await ctx.db.insert("learnGroupMembers", { groupId: group._id, userId, role: args.role ?? "member", addedBy: admin._id, addedAt: now });
      count++;
      added.push(info.name);
      await insertNotification(ctx, {
        userId,
        type: "learn_group_added",
        priority: "medium",
        status: "pending",
        payload: {
          title: `You've joined ${group.name}`,
          body: args.role === "lead" ? "You're a lead: you can hold Spaces for the group." : "Say hello in your group's private room.",
          link: `${LEARN_URL}/community/${roomSlug(group._id)}`,
        },
        createdAt: now,
      });
    }
    await ctx.db.patch(group._id, { memberCount: count, updatedAt: now });
    return { added: added.length, skipped };
  },
});

export const adminRemoveMember = mutation({
  args: { groupId: v.id("learnGroups"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireLearnAdmin(ctx);
    const group = await groupOrThrow(ctx, args.groupId);
    const rows = await ctx.db
      .query("learnGroupMembers")
      .withIndex("by_group_user", (q) => q.eq("groupId", group._id).eq("userId", args.userId))
      .take(5);
    for (const r of rows) await ctx.db.delete(r._id);
    if (rows.length) await ctx.db.patch(group._id, { memberCount: Math.max(0, group.memberCount - rows.length), updatedAt: Date.now() });
  },
});

export const adminSetMemberRole = mutation({
  args: { groupId: v.id("learnGroups"), userId: v.id("users"), role: v.union(v.literal("member"), v.literal("lead")) },
  handler: async (ctx, args) => {
    await requireLearnAdmin(ctx);
    const row = await ctx.db
      .query("learnGroupMembers")
      .withIndex("by_group_user", (q) => q.eq("groupId", args.groupId).eq("userId", args.userId))
      .first();
    if (!row) throw new ConvexError("They're not in this group.");
    await ctx.db.patch(row._id, { role: args.role });
  },
});

// ── Members ───────────────────────────────────────────────────────────────────

/** The signed-in member's groups (Learn › Community › Your groups). */
export const myGroups = query({
  args: {},
  handler: async (ctx) => {
    const user = (await getViewer(ctx))?.user ?? null;
    if (!user) return [];
    const rows = await ctx.db
      .query("learnGroupMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(50);
    const out = [];
    for (const r of rows) {
      const g = await ctx.db.get(r.groupId);
      if (!g || g.archived) continue;
      const room = g.roomId ? await ctx.db.get(g.roomId) : null;
      out.push({
        id: g._id,
        name: g.name,
        description: g.description ?? null,
        color: g.color,
        memberCount: g.memberCount,
        role: r.role,
        roomSlug: roomSlug(g._id),
        postCount: room?.postCount ?? 0,
        lastActivityAt: room?.lastActivityAt ?? null,
      });
    }
    return out.sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
  },
});
