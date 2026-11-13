"use node";

/**
 * Rehabify Spaces audio (Stream "audio_room" calls). Only hosts and the speakers they bring up
 * can send audio: Stream enforces it with the send-audio permission, granted here, server-side.
 *
 * Crisp audio: Opus with RED (redundant coding, so a lost packet doesn't become a click) and
 * DTX (silence costs nothing, so speech keeps the bandwidth); the browser side asks for 48 kHz
 * mono with echo cancellation and noise suppression (SpaceRoom.tsx).
 */
import { ConvexError, v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { StreamClient } from "@stream-io/node-sdk";

const CALL_TYPE = "audio_room";
const TOKEN_TTL_SECONDS = 4 * 60 * 60;
const MAX_SECONDS = 3 * 60 * 60; // a Space runs at most three hours
const SWEEP_MS = 5 * 60 * 1000;

type Access =
  | { ok: false; reason: string }
  | {
      ok: true;
      spaceId: Id<"learnSpaces">;
      callId: string;
      status: "scheduled" | "live" | "ended" | "cancelled";
      title: string;
      userId: Id<"users">;
      name: string;
      imageUrl: string | null;
      isHost: boolean;
      canModerate: boolean;
      isSpeaker: boolean;
    };

// Plain references: the generated api type is at TypeScript's depth limit (TS2589)
const accessRef = makeFunctionReference<"query", { spaceId: string; clerkId: string }, Access>("learnSpaces:access");
const markLiveRef = makeFunctionReference<"mutation", { spaceId: Id<"learnSpaces"> }, null>("learnSpaces:markLive");
const markEndedRef = makeFunctionReference<"mutation", { spaceId: Id<"learnSpaces">; peakListeners?: number }, null>("learnSpaces:markEnded");
const recordListenersRef = makeFunctionReference<"mutation", { spaceId: Id<"learnSpaces">; count: number }, null>("learnSpaces:recordListeners");
const setSeatRef = makeFunctionReference<"mutation", { spaceId: Id<"learnSpaces">; userId: Id<"users">; speaker: boolean }, null>("learnSpaces:setSeat");
const streamIdForRef = makeFunctionReference<"query", { userId: Id<"users"> }, string | null>("learnSpaces:streamIdFor");
const liveSpacesRef = makeFunctionReference<"query", Record<string, never>, { id: Id<"learnSpaces">; callId: string; startedAt: number }[]>(
  "learnSpaces:liveSpaces"
);
const checkSpaceRef = makeFunctionReference<"action", { spaceId: Id<"learnSpaces">; callId: string; startedAt: number }, null>(
  "learnSpacesNode:checkSpace"
);

function stream() {
  const apiKey = process.env.STREAM_API_KEY;
  const secret = process.env.STREAM_SECRET;
  if (!apiKey || !secret) throw new ConvexError("Spaces aren't switched on yet.");
  return { apiKey, client: new StreamClient(apiKey, secret) };
}

async function viewerAccess(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> }; runQuery: any }, spaceId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to join Spaces.");
  const access: Access = await ctx.runQuery(accessRef, { spaceId, clerkId: identity.subject });
  if (!access.ok) throw new ConvexError(access.reason);
  return { clerkId: identity.subject, access };
}

/** A token for this one Space's audio, for anyone who may listen. */
export const joinSpace = action({
  args: { spaceId: v.string() },
  handler: async (ctx, args) => {
    const { clerkId, access } = await viewerAccess(ctx, args.spaceId);
    if (access.status === "ended" || access.status === "cancelled") throw new ConvexError("This Space has ended.");
    if (access.status !== "live" && !access.isHost) throw new ConvexError("This Space hasn't started yet.");
    const { apiKey, client } = stream();
    await client.upsertUsers([{ id: clerkId, name: access.name, image: access.imageUrl ?? undefined, role: "user" }]);
    const token = client.generateCallToken({
      user_id: clerkId,
      call_cids: [`${CALL_TYPE}:${access.callId}`],
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    });
    return {
      apiKey,
      token,
      streamUserId: clerkId,
      callType: CALL_TYPE,
      callId: access.callId,
      isHost: access.isHost,
      canModerate: access.canModerate,
      isSpeaker: access.isSpeaker,
    };
  },
});

/** The host opens the Space: the audio room goes live and reminders go out. */
export const startSpace = action({
  args: { spaceId: v.string() },
  handler: async (ctx, args) => {
    const { clerkId, access } = await viewerAccess(ctx, args.spaceId);
    if (!access.isHost) throw new ConvexError("Only the host can start this Space.");
    if (access.status === "live") return { ok: true };
    if (access.status !== "scheduled") throw new ConvexError("This Space has ended.");
    const { client } = stream();
    await client.upsertUsers([{ id: clerkId, name: access.name, image: access.imageUrl ?? undefined, role: "user" }]);
    const call = client.video.call(CALL_TYPE, access.callId);
    await call.getOrCreate({
      data: {
        created_by_id: clerkId,
        members: [{ user_id: clerkId, role: "host" }],
        custom: { title: access.title, source: "rehabify-learn-space" },
        settings_override: {
          audio: {
            default_device: "speaker",
            access_request_enabled: true,
            mic_default_on: true,
            speaker_default_on: true,
            opus_dtx_enabled: true,
            redundant_coding_enabled: true,
          },
          backstage: { enabled: true },
          limits: { max_duration_seconds: MAX_SECONDS },
          recording: { mode: "disabled" },
        },
      },
    });
    await call.goLive();
    await ctx.runMutation(markLiveRef, { spaceId: access.spaceId });
    await ctx.scheduler.runAfter(SWEEP_MS, checkSpaceRef, { spaceId: access.spaceId, callId: access.callId, startedAt: Date.now() });
    return { ok: true };
  },
});

/** The host (or the Learn team) ends the Space for everyone. */
export const endSpace = action({
  args: { spaceId: v.string() },
  handler: async (ctx, args) => {
    const { access } = await viewerAccess(ctx, args.spaceId);
    if (!access.canModerate) throw new ConvexError("Only the host can end this Space.");
    const { client } = stream();
    let peak: number | undefined;
    try {
      const call = client.video.call(CALL_TYPE, access.callId);
      peak = (await call.get()).call.session?.participants?.length;
      await call.end();
    } catch {
      // Already ended on Stream's side
    }
    await ctx.runMutation(markEndedRef, { spaceId: access.spaceId, peakListeners: peak });
    return { ok: true };
  },
});

/** Bring someone up to speak, or back to listening. */
export const setSpeaker = action({
  args: { spaceId: v.string(), userId: v.id("users"), speaker: v.boolean() },
  handler: async (ctx, args) => {
    const { clerkId, access } = await viewerAccess(ctx, args.spaceId);
    const self = args.userId === access.userId;
    if (!access.canModerate && !(self && !args.speaker)) throw new ConvexError("Only the host can bring people up to speak.");
    if (access.status !== "live") throw new ConvexError("This Space isn't live.");
    const target = await ctx.runQuery(streamIdForRef, { userId: args.userId });
    if (!target) throw new ConvexError("This person has left.");
    if (target === clerkId && access.isHost) return { ok: true }; // the host is always on stage
    const { client } = stream();
    const call = client.video.call(CALL_TYPE, access.callId);
    if (args.speaker) {
      await ctx.runMutation(setSeatRef, { spaceId: access.spaceId, userId: args.userId, speaker: true });
      try {
        await call.updateUserPermissions({ user_id: target, grant_permissions: ["send-audio"] });
      } catch (err) {
        await ctx.runMutation(setSeatRef, { spaceId: access.spaceId, userId: args.userId, speaker: false });
        throw new ConvexError("Couldn't bring them up. They may have left the Space.");
      }
    } else {
      try {
        await call.updateUserPermissions({ user_id: target, revoke_permissions: ["send-audio"] });
        await call.muteUsers({ user_ids: [target], audio: true, muted_by_id: clerkId });
      } catch {
        // They already left
      }
      await ctx.runMutation(setSeatRef, { spaceId: access.spaceId, userId: args.userId, speaker: false });
    }
    return { ok: true };
  },
});

/**
 * Every five minutes while a Space is live: keeps the listener peak, and closes the Space once
 * Stream's room is empty or over time, so a host who just shut the laptop doesn't leave it "live".
 */
export const checkSpace = internalAction({
  args: { spaceId: v.id("learnSpaces"), callId: v.string(), startedAt: v.number() },
  handler: async (ctx, args) => {
    let participants = 0;
    let ended = false;
    try {
      const { client } = stream();
      const res = await client.video.call(CALL_TYPE, args.callId).get();
      participants = res.call.session?.participants?.length ?? 0;
      ended = Boolean(res.call.ended_at || res.call.session?.ended_at);
    } catch {
      // Stream unreachable: look again next time
      await ctx.scheduler.runAfter(SWEEP_MS, checkSpaceRef, args);
      return null;
    }
    const overTime = Date.now() - args.startedAt > MAX_SECONDS * 1000 + SWEEP_MS;
    if (ended || participants === 0 || overTime) {
      if (!ended) {
        try {
          await stream().client.video.call(CALL_TYPE, args.callId).end();
        } catch {
          // ignore
        }
      }
      await ctx.runMutation(markEndedRef, { spaceId: args.spaceId });
      return null;
    }
    await ctx.runMutation(recordListenersRef, { spaceId: args.spaceId, count: participants });
    await ctx.scheduler.runAfter(SWEEP_MS, checkSpaceRef, args);
    return null;
  },
});

/** By hand, if a sweep chain was ever lost: re-checks every live Space. */
export const sweepLiveSpaces = internalAction({
  args: {},
  handler: async (ctx) => {
    const live = await ctx.runQuery(liveSpacesRef, {});
    for (const s of live) await ctx.scheduler.runAfter(0, checkSpaceRef, { spaceId: s.id, callId: s.callId, startedAt: s.startedAt });
    return null;
  },
});
