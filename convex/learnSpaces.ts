/**
 * Rehabify Spaces: live audio rooms on Learn, like X Spaces (owner 2026-11-12). Admins and approved
 * Rehabify physios host; every Learn member can listen, raise a hand and speak when the host
 * brings them up. The audio is a Stream "audio_room" call (learnSpacesNode.ts); who's on stage
 * lives here (learnSpaceSeats), so every listener sees hands and speakers change in real time.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer } from "./helpers/partnerAccess";
import { groupRoleOf } from "./helpers/learnAccess";
import { insertNotification } from "./helpers/pushNotify";
import { learnMemberInfo, type LearnMemberInfo } from "./learn";

type Ctx = QueryCtx | MutationCtx;

const LEARN_URL = (process.env.LEARN_PUBLIC_URL ?? "https://learn.physioaroundme.com").replace(/\/+$/, "");
export const SPACE_CALL_TYPE = "audio_room";
/** Most people on stage at once, host included (X allows 13). */
const MAX_SPEAKERS = 10;
const CREATE_LIMIT = { limit: 6, windowMs: 24 * 60 * 60 * 1000 };

const clean = (value: string | undefined | null, max: number) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const canHost = (m: LearnMemberInfo | null) => Boolean(m && (m.isAdmin || m.isRehabifyPhysio));

/** Group-only Spaces (Mary 2026-11-14): just the group's members, its host and the Learn admins. */
async function canSeeSpace(ctx: Ctx, space: Doc<"learnSpaces">, member: LearnMemberInfo | null) {
  if (!space.groupId) return true;
  if (!member) return false;
  if (member.isAdmin || space.hostId === member.user._id) return true;
  return Boolean(await groupRoleOf(ctx, space.groupId, member.user._id));
}

/** Groups this person may hold a group Space for: Learn admins any active group, leads their own. */
async function hostGroups(ctx: Ctx, member: LearnMemberInfo | null) {
  if (!member) return [];
  if (member.isAdmin) {
    const all = await ctx.db.query("learnGroups").withIndex("by_created").order("desc").take(60);
    return all.filter((g) => !g.archived).map((g) => ({ id: g._id, name: g.name, color: g.color }));
  }
  const rows = await ctx.db
    .query("learnGroupMembers")
    .withIndex("by_user", (q) => q.eq("userId", member.user._id))
    .take(50);
  const out: { id: Id<"learnGroups">; name: string; color: string }[] = [];
  for (const r of rows) {
    if (r.role !== "lead") continue;
    const g = await ctx.db.get(r.groupId);
    if (g && !g.archived) out.push({ id: g._id, name: g.name, color: g.color });
  }
  return out;
}

async function groupLabel(ctx: Ctx, groupId: Id<"learnGroups">) {
  const g = await ctx.db.get(groupId);
  return g ? { id: g._id, name: g.name, color: g.color } : null;
}

async function memberOrNull(ctx: Ctx) {
  const viewer = await getViewer(ctx);
  return viewer?.user ? await learnMemberInfo(ctx, viewer.user) : null;
}

async function requireMember(ctx: Ctx) {
  const member = await memberOrNull(ctx);
  if (!member) throw new ConvexError("Join Rehabify Learn to take part in Spaces.");
  return member;
}

async function spaceById(ctx: Ctx, id: string) {
  const spaceId = ctx.db.normalizeId("learnSpaces", id);
  return spaceId ? await ctx.db.get(spaceId) : null;
}

/** A person shown in Spaces. Their Stream id (Clerk id) only goes to Learn members. */
async function personFor(ctx: Ctx, userId: Id<"users">, withStreamId = false) {
  const user = await ctx.db.get(userId);
  const info = await learnMemberInfo(ctx, user);
  return {
    id: userId,
    streamUserId: withStreamId ? (user?.clerkId ?? null) : null,
    name: info?.name ?? ([user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Rehabify"),
    imageUrl: info?.imageUrl ?? user?.imageUrl ?? null,
    tag: info?.tag ?? null,
  };
}

async function spaceCard(ctx: Ctx, space: Doc<"learnSpaces">, member: LearnMemberInfo | null, withStreamId = false) {
  const reminded = member
    ? Boolean(
        await ctx.db
          .query("learnSpaceReminders")
          .withIndex("by_user_space", (q) => q.eq("userId", member.user._id).eq("spaceId", space._id))
          .first()
      )
    : false;
  return {
    id: space._id,
    title: space.title,
    description: space.description ?? null,
    status: space.status,
    scheduledFor: space.scheduledFor ?? null,
    startedAt: space.startedAt ?? null,
    endedAt: space.endedAt ?? null,
    peakListeners: space.peakListeners ?? 0,
    reminderCount: space.reminderCount,
    host: await personFor(ctx, space.hostId, withStreamId),
    reminded,
    isHost: member?.user._id === space.hostId,
    group: space.groupId ? await groupLabel(ctx, space.groupId) : null,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export const listSpaces = query({
  args: {},
  handler: async (ctx) => {
    const member = await memberOrNull(ctx);
    const now = Date.now();
    const live = await ctx.db
      .query("learnSpaces")
      .withIndex("by_status_time", (q) => q.eq("status", "live"))
      .take(20);
    const upcoming = await ctx.db
      .query("learnSpaces")
      .withIndex("by_status_time", (q) => q.eq("status", "scheduled").gte("scheduledFor", now - 6 * 60 * 60 * 1000))
      .take(20);
    const recent = (await ctx.db.query("learnSpaces").withIndex("by_created").order("desc").take(40))
      .filter((s) => s.status === "ended")
      .slice(0, 6);
    const visible = async (list: Doc<"learnSpaces">[]) => {
      const out: Doc<"learnSpaces">[] = [];
      for (const s of list) if (await canSeeSpace(ctx, s, member)) out.push(s);
      return out;
    };
    const groups = await hostGroups(ctx, member);
    return {
      signedIn: Boolean(await ctx.auth.getUserIdentity()),
      member: member ? { name: member.name, imageUrl: member.imageUrl } : null,
      canHost: canHost(member) || groups.length > 0,
      // Whether they can hold a Space for everyone (group leads only hold their group's)
      canHostOpen: canHost(member),
      hostGroups: groups,
      live: await Promise.all((await visible(live)).map((s) => spaceCard(ctx, s, member))),
      upcoming: await Promise.all((await visible(upcoming)).map((s) => spaceCard(ctx, s, member))),
      recent: await Promise.all((await visible(recent)).map((s) => spaceCard(ctx, s, member))),
    };
  },
});

export const getSpace = query({
  args: { spaceId: v.string() },
  handler: async (ctx, args) => {
    const space = await spaceById(ctx, args.spaceId);
    if (!space) return null;
    const member = await memberOrNull(ctx);
    if (!(await canSeeSpace(ctx, space, member))) return null;
    return {
      space: await spaceCard(ctx, space, member, Boolean(member)),
      viewer: {
        signedIn: Boolean(await ctx.auth.getUserIdentity()),
        member: Boolean(member),
        userId: member?.user._id ?? null,
        streamUserId: member?.user.clerkId ?? null,
        name: member?.name ?? null,
        imageUrl: member?.imageUrl ?? null,
        // The host, and the Learn team, run the stage
        canModerate: Boolean(member && (member.user._id === space.hostId || member.isAdmin)),
      },
    };
  },
});

/** Hands and speakers, live for everyone in the Space. */
export const getStage = query({
  args: { spaceId: v.string() },
  handler: async (ctx, args) => {
    const space = await spaceById(ctx, args.spaceId);
    const member = await memberOrNull(ctx);
    if (!space || !member || space.status !== "live" || !(await canSeeSpace(ctx, space, member))) return [];
    const seats = await ctx.db
      .query("learnSpaceSeats")
      .withIndex("by_space", (q) => q.eq("spaceId", space._id))
      .take(200);
    return await Promise.all(
      seats.map(async (seat) => ({ ...(await personFor(ctx, seat.userId)), streamUserId: seat.streamUserId, state: seat.state, since: seat.updatedAt }))
    );
  },
});

// ── Hosting ───────────────────────────────────────────────────────────────────

export const createSpace = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    scheduledFor: v.optional(v.number()),
    groupId: v.optional(v.id("learnGroups")),
  },
  handler: async (ctx, args): Promise<Id<"learnSpaces">> => {
    const member = await requireMember(ctx);
    const group = args.groupId ? await ctx.db.get(args.groupId) : null;
    if (args.groupId) {
      if (!group || group.archived) throw new ConvexError("That group isn't active.");
      const lead = (await groupRoleOf(ctx, group._id, member.user._id)) === "lead";
      if (!member.isAdmin && !lead) throw new ConvexError("Group Spaces are hosted by the group's leads and the Learn team.");
    } else if (!canHost(member)) {
      throw new ConvexError("Spaces are hosted by the Rehabify team and approved Rehabify physiotherapists.");
    }
    const title = clean(args.title, 100);
    if (title.length < 4) throw new ConvexError("Give your Space a title.");
    const now = Date.now();
    if (args.scheduledFor && (args.scheduledFor < now - 5 * 60 * 1000 || args.scheduledFor > now + 60 * 24 * 60 * 60 * 1000)) {
      throw new ConvexError("Choose a time in the next two months.");
    }

    // A few new Spaces a day per host
    const key = `space-create:${member.user._id}`;
    const row = await ctx.db
      .query("learnVideoRateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (!row || row.windowStart + CREATE_LIMIT.windowMs <= now) {
      if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
      else await ctx.db.insert("learnVideoRateLimits", { key, windowStart: now, count: 1 });
    } else {
      if (row.count >= CREATE_LIMIT.limit) throw new ConvexError("You've set up a lot of Spaces today. Try again tomorrow.");
      await ctx.db.patch(row._id, { count: row.count + 1 });
    }

    const random = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, "0")).join("");
    const spaceId = await ctx.db.insert("learnSpaces", {
      title,
      description: clean(args.description, 280) || undefined,
      hostId: member.user._id,
      status: "scheduled",
      scheduledFor: args.scheduledFor ?? now,
      callId: `learn-space-${random}`,
      reminderCount: 0,
      groupId: group?._id,
      createdAt: now,
    });
    // A group Space: every member hears about it now, and gets the "it's live" alert later
    if (group) {
      const rows = (
        await ctx.db
          .query("learnGroupMembers")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .take(200)
      ).filter((r) => r.userId !== member.user._id);
      for (const r of rows) {
        await ctx.db.insert("learnSpaceReminders", { spaceId, userId: r.userId, createdAt: now });
        await insertNotification(ctx, {
          userId: r.userId,
          type: "learn_group_space",
          priority: "medium",
          status: "pending",
          payload: { title: `${member.name} set up a Space for ${group.name}`, body: title, link: `${LEARN_URL}/spaces/${spaceId}` },
          createdAt: now,
        });
      }
      await ctx.db.patch(spaceId, { reminderCount: rows.length });
    }
    return spaceId;
  },
});

export const cancelSpace = mutation({
  args: { spaceId: v.id("learnSpaces") },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const space = await ctx.db.get(args.spaceId);
    if (!space || (space.hostId !== member.user._id && !member.isAdmin)) throw new ConvexError("Only the host can cancel this Space.");
    if (space.status !== "scheduled") throw new ConvexError("This Space has already started.");
    await ctx.db.patch(space._id, { status: "cancelled", endedAt: Date.now() });
  },
});

export const toggleReminder = mutation({
  args: { spaceId: v.id("learnSpaces") },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const space = await ctx.db.get(args.spaceId);
    if (!space || space.status !== "scheduled" || !(await canSeeSpace(ctx, space, member))) throw new ConvexError("This Space isn't coming up.");
    const existing = await ctx.db
      .query("learnSpaceReminders")
      .withIndex("by_user_space", (q) => q.eq("userId", member.user._id).eq("spaceId", space._id))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(space._id, { reminderCount: Math.max(0, space.reminderCount - 1) });
      return { reminded: false };
    }
    await ctx.db.insert("learnSpaceReminders", { spaceId: space._id, userId: member.user._id, createdAt: Date.now() });
    await ctx.db.patch(space._id, { reminderCount: space.reminderCount + 1 });
    return { reminded: true };
  },
});

// ── On stage ──────────────────────────────────────────────────────────────────

async function seatFor(ctx: Ctx, spaceId: Id<"learnSpaces">, userId: Id<"users">) {
  return await ctx.db
    .query("learnSpaceSeats")
    .withIndex("by_space_user", (q) => q.eq("spaceId", spaceId).eq("userId", userId))
    .first();
}

/** A listener raises (or lowers) their hand to ask to speak. */
export const setHand = mutation({
  args: { spaceId: v.id("learnSpaces"), raised: v.boolean() },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const space = await ctx.db.get(args.spaceId);
    if (!space || space.status !== "live" || !(await canSeeSpace(ctx, space, member))) throw new ConvexError("This Space isn't live.");
    if (space.hostId === member.user._id) return;
    const seat = await seatFor(ctx, space._id, member.user._id);
    if (seat?.state === "speaker") return;
    if (!args.raised) {
      if (seat) await ctx.db.delete(seat._id);
      return;
    }
    if (!seat) {
      await ctx.db.insert("learnSpaceSeats", {
        spaceId: space._id,
        userId: member.user._id,
        streamUserId: member.user.clerkId,
        state: "hand",
        updatedAt: Date.now(),
      });
    }
  },
});

/** A speaker steps back down to listening. */
export const leaveStage = mutation({
  args: { spaceId: v.id("learnSpaces") },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const seat = await seatFor(ctx, args.spaceId, member.user._id);
    if (seat) await ctx.db.delete(seat._id);
  },
});

// ── Internal (learnSpacesNode.ts) ─────────────────────────────────────────────

/** Who this Stream (Clerk) user is in this Space, and what they may do. */
export const access = internalQuery({
  args: { spaceId: v.string(), clerkId: v.string() },
  handler: async (ctx, args) => {
    const space = await spaceById(ctx, args.spaceId);
    if (!space) return { ok: false as const, reason: "This Space doesn't exist." };
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    const member = await learnMemberInfo(ctx, user);
    if (!member) return { ok: false as const, reason: "Join Rehabify Learn to listen to Spaces." };
    if (!(await canSeeSpace(ctx, space, member))) return { ok: false as const, reason: "This Space is for a group you're not in." };
    const seat = await seatFor(ctx, space._id, member.user._id);
    const isHost = space.hostId === member.user._id;
    return {
      ok: true as const,
      spaceId: space._id,
      callId: space.callId,
      status: space.status,
      title: space.title,
      userId: member.user._id,
      name: member.name,
      imageUrl: member.imageUrl,
      isHost,
      canModerate: isHost || member.isAdmin,
      isSpeaker: isHost || seat?.state === "speaker",
    };
  },
});

export const markLive = internalMutation({
  args: { spaceId: v.id("learnSpaces") },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space || space.status !== "scheduled") return;
    const now = Date.now();
    await ctx.db.patch(space._id, { status: "live", startedAt: now });
    // Everyone who asked to be reminded hears it's live
    const host = await personFor(ctx, space.hostId);
    const reminders = await ctx.db
      .query("learnSpaceReminders")
      .withIndex("by_space", (q) => q.eq("spaceId", space._id))
      .take(1000);
    for (const r of reminders) {
      if (r.notifiedAt || r.userId === space.hostId) continue;
      await insertNotification(ctx, {
        userId: r.userId,
        type: "learn_space_live",
        priority: "high",
        status: "pending",
        payload: { title: `${host.name} is live: ${space.title}`, body: "Tap to listen in on Rehabify Spaces.", link: `${LEARN_URL}/spaces/${space._id}` },
        createdAt: now,
      });
      await ctx.db.patch(r._id, { notifiedAt: now });
    }
  },
});

export const markEnded = internalMutation({
  args: { spaceId: v.id("learnSpaces"), peakListeners: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space || space.status === "ended" || space.status === "cancelled") return;
    await ctx.db.patch(space._id, {
      status: "ended",
      endedAt: Date.now(),
      peakListeners: Math.max(space.peakListeners ?? 0, args.peakListeners ?? 0),
    });
    const seats = await ctx.db
      .query("learnSpaceSeats")
      .withIndex("by_space", (q) => q.eq("spaceId", space._id))
      .take(500);
    for (const s of seats) await ctx.db.delete(s._id);
  },
});

export const recordListeners = internalMutation({
  args: { spaceId: v.id("learnSpaces"), count: v.number() },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (space && args.count > (space.peakListeners ?? 0)) await ctx.db.patch(space._id, { peakListeners: args.count });
  },
});

export const setSeat = internalMutation({
  args: { spaceId: v.id("learnSpaces"), userId: v.id("users"), speaker: v.boolean() },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    const user = await ctx.db.get(args.userId);
    if (!space || !user || space.status !== "live") throw new ConvexError("This Space isn't live.");
    const seat = await seatFor(ctx, space._id, user._id);
    if (!args.speaker) {
      if (seat) await ctx.db.delete(seat._id);
      return;
    }
    const speakers = (
      await ctx.db
        .query("learnSpaceSeats")
        .withIndex("by_space", (q) => q.eq("spaceId", space._id))
        .take(200)
    ).filter((s) => s.state === "speaker").length;
    if (seat?.state !== "speaker" && speakers + 1 >= MAX_SPEAKERS) throw new ConvexError(`Up to ${MAX_SPEAKERS} people can be on stage at once.`);
    const now = Date.now();
    if (seat) await ctx.db.patch(seat._id, { state: "speaker", updatedAt: now });
    else await ctx.db.insert("learnSpaceSeats", { spaceId: space._id, userId: user._id, streamUserId: user.clerkId, state: "speaker", updatedAt: now });
  },
});

export const streamIdFor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => (await ctx.db.get(args.userId))?.clerkId ?? null,
});

/** Live Spaces, for the safety sweep in learnSpacesNode.ts. */
export const liveSpaces = internalQuery({
  args: {},
  handler: async (ctx) => {
    const live = await ctx.db
      .query("learnSpaces")
      .withIndex("by_status_time", (q) => q.eq("status", "live"))
      .take(50);
    return live.map((s) => ({ id: s._id, callId: s.callId, startedAt: s.startedAt ?? s.createdAt }));
  },
});
