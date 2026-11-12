/**
 * Rehabify Learn protected lesson videos (owner brief 2026-11-12: low-cost protection, no paid DRM).
 *
 * Pipeline
 *   1. Source video → private R2 bucket: the admin uploads in the browser (multipart, presigned
 *      part links from adminStartVideoUpload), or the laptop script publishes directly.
 *   2. Encoder (Railway worker or `npm run video:publish`) asks the worker API for a job, encodes
 *      AES-128 HLS at 480p and 720p with ffmpeg, uploads through presigned links, then completes.
 *   3. Learner opens a lesson → learn:getLessonPlayback checks enrolment and mints a 10-minute
 *      playback token (mintPlayback). The player loads /learn/video/master.m3u8, whose rendition
 *      playlists point at short-lived R2 links for the encrypted segments and at /learn/video/key.
 *   4. /learn/video/key returns the 16-byte key only for a valid, unexpired token whose user still
 *      has access to that lesson, within a rate limit. Keys are derived (helpers/videoCrypto.ts),
 *      never stored, never public.
 *
 * Env (Convex): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
 * LEARN_VIDEO_MASTER_KEY, LEARN_VIDEO_WORKER_SECRET; optional LEARN_VIDEO_WORKER_URL (wakes the
 * encoder), LEARN_VIDEO_ALLOWED_ORIGINS (CORS), R2_ENDPOINT (tests).
 *
 * Known limit: this stops casual copying and makes every view attributable (watermark, tokens,
 * audit); it cannot stop screen recording.
 */
import { ConvexError, v } from "convex/values";
import { action, httpAction, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";
import { removeImagekitFilesLater } from "./helpers/imagekit";
import {
  r2AbortMultipart,
  r2CompleteMultipart,
  r2Config,
  r2CreateMultipart,
  r2Delete,
  r2ListKeys,
  r2Presign,
  type R2Config,
} from "./helpers/r2";
import { deriveVideoKey, randomHex, signPlaybackToken, toBase64, verifyPlaybackToken, videoMasterKey, workerSecretOk } from "./helpers/videoCrypto";
import { canUserWatchLesson } from "./learn";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const TOKEN_TTL_MS = 10 * MINUTE; // the player refreshes it while watching
const PART_BYTES = 32 * 1024 * 1024; // browser multipart part size
const MAX_SOURCE_BYTES = 8 * 1024 * 1024 * 1024;
const UPLOAD_LINK_SEC = 6 * 60 * 60;
const WORKER_LINK_SEC = 3 * 60 * 60;
const STALE_ENCODING_MS = 3 * HOUR; // a claimed job that never finished goes back in the queue
const MAX_ATTEMPTS = 3;

// Per user, fixed windows (learnVideoRateLimits)
const LIMITS = {
  mint: { limit: 120, windowMs: HOUR },
  key: { limit: 60, windowMs: 10 * MINUTE },
  playlist: { limit: 600, windowMs: 10 * MINUTE },
} as const;

const RENDITIONS = ["480p", "720p"] as const;
const OUTPUT_FILE = /^(master\.m3u8|(480p|720p)\/(index\.m3u8|seg_\d{4,6}\.ts))$/;

export type HlsPlayback = { masterUrl: string; token: string; expiresAt: number };

function siteUrl() {
  const url = process.env.CONVEX_SITE_URL?.replace(/\/+$/, "");
  if (!url) throw new Error("CONVEX_SITE_URL is not available");
  return url;
}

/** What's missing before protected video works (admin notice). Names only, never values. */
function missingSetup(): string[] {
  const missing: string[] = [];
  if (!r2Config()) missing.push("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET");
  if (!process.env.LEARN_VIDEO_MASTER_KEY) missing.push("LEARN_VIDEO_MASTER_KEY");
  if (!process.env.LEARN_VIDEO_WORKER_SECRET) missing.push("LEARN_VIDEO_WORKER_SECRET");
  return missing;
}

function requireR2(): R2Config {
  const config = r2Config();
  if (!config) throw new ConvexError("Protected video storage isn't set up yet.");
  return config;
}

const clean = (value: string | undefined | null, max: number) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// ─────────────────────────────────────────────────────────────────────────────
// Records
// ─────────────────────────────────────────────────────────────────────────────

export const adminUser = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"users">> => (await requireAdmin(ctx)).user._id,
});

export const createAsset = internalMutation({
  args: {
    title: v.string(),
    keyId: v.string(),
    source: v.union(v.literal("upload"), v.literal("script")),
    status: v.union(v.literal("uploading"), v.literal("encoding")),
    sourceBytes: v.optional(v.number()),
    sourceExt: v.optional(v.string()),
    lessonId: v.optional(v.id("learnVideoLessons")),
    createdBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    if (args.lessonId && !(await ctx.db.get(args.lessonId))) throw new ConvexError("That lesson wasn't found.");
    const now = Date.now();
    const assetId = await ctx.db.insert("learnVideoAssets", {
      title: clean(args.title, 140) || "Lesson video",
      lessonId: args.lessonId,
      status: args.status,
      path: "",
      keyId: args.keyId,
      source: args.source,
      sourceBytes: args.sourceBytes,
      claimedAt: args.status === "encoding" ? now : undefined,
      attempts: args.status === "encoding" ? 1 : 0,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    const sourceKey = args.source === "upload" ? `incoming/${assetId}/source.${args.sourceExt ?? "mp4"}` : undefined;
    await ctx.db.patch(assetId, { path: `videos/${assetId}/`, sourceKey });
    return { assetId, path: `videos/${assetId}/`, sourceKey };
  },
});

export const getAsset = internalQuery({
  args: { assetId: v.id("learnVideoAssets") },
  handler: async (ctx, args) => await ctx.db.get(args.assetId),
});

export const patchAsset = internalMutation({
  args: {
    assetId: v.id("learnVideoAssets"),
    status: v.optional(v.union(v.literal("uploading"), v.literal("queued"), v.literal("encoding"), v.literal("ready"), v.literal("failed"))),
    uploadId: v.optional(v.union(v.string(), v.null())),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return;
    await ctx.db.patch(asset._id, {
      ...(args.status ? { status: args.status } : {}),
      ...(args.uploadId !== undefined ? { uploadId: args.uploadId ?? undefined } : {}),
      ...(args.error !== undefined ? { error: clean(args.error, 300) } : {}),
      updatedAt: Date.now(),
    });
    if (args.status === "failed") await markLesson(ctx, asset, { failed: true });
  },
});

/** Keeps the lesson's copy of the video's state in step (lesson pages read only the lesson). */
async function markLesson(
  ctx: MutationCtx,
  asset: Doc<"learnVideoAssets">,
  state: { ready?: boolean; failed?: boolean; durationSec?: number; posterUrl?: string }
) {
  if (!asset.lessonId) return;
  const lesson = await ctx.db.get(asset.lessonId);
  if (!lesson?.hls || lesson.hls.assetId !== asset._id) return;
  await ctx.db.patch(lesson._id, {
    hls: {
      ...lesson.hls,
      ready: state.ready ?? lesson.hls.ready,
      failed: state.failed || undefined,
      durationSec: state.durationSec && state.durationSec > 0 ? state.durationSec : lesson.hls.durationSec,
      posterUrl: state.posterUrl ?? lesson.hls.posterUrl,
    },
    updatedAt: Date.now(),
  });
}

/** The next video to encode: oldest queued, or one whose encoder stopped answering. */
export const claimJob = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const queued = await ctx.db
      .query("learnVideoAssets")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .first();
    let job = queued;
    if (!job) {
      const stale = await ctx.db
        .query("learnVideoAssets")
        .withIndex("by_status", (q) => q.eq("status", "encoding"))
        .take(20);
      job = stale.find((a) => a.source === "upload" && (a.claimedAt ?? 0) < now - STALE_ENCODING_MS) ?? null;
      if (job && (job.attempts ?? 0) >= MAX_ATTEMPTS) {
        await ctx.db.patch(job._id, { status: "failed", error: "Encoding didn't finish after several tries.", updatedAt: now });
        await markLesson(ctx, job, { failed: true });
        return null;
      }
    }
    if (!job || !job.sourceKey) return null;
    await ctx.db.patch(job._id, { status: "encoding", claimedAt: now, attempts: (job.attempts ?? 0) + 1, error: undefined, updatedAt: now });
    return { assetId: job._id, title: job.title, keyId: job.keyId, sourceKey: job.sourceKey };
  },
});

export const completeAsset = internalMutation({
  args: {
    assetId: v.id("learnVideoAssets"),
    renditions: v.array(v.object({ name: v.string(), width: v.number(), height: v.number(), bandwidth: v.number() })),
    playlists: v.array(v.object({ name: v.string(), body: v.string() })),
    durationSec: v.number(),
    posterStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new ConvexError("Video not found.");
    if (asset.status !== "encoding") throw new ConvexError(`This video isn't being encoded (${asset.status}).`);
    const now = Date.now();
    const posterUrl = args.posterStorageId ? ((await ctx.storage.getUrl(args.posterStorageId)) ?? undefined) : undefined;
    if (asset.posterStorageId && asset.posterStorageId !== args.posterStorageId) await ctx.storage.delete(asset.posterStorageId);
    await ctx.db.patch(asset._id, {
      status: "ready",
      renditions: args.renditions,
      playlists: args.playlists,
      durationSec: Math.round(args.durationSec),
      posterStorageId: args.posterStorageId,
      posterUrl,
      error: undefined,
      readyAt: now,
      updatedAt: now,
    });

    // The script's --lesson: the lesson now plays this video (its old video is retired)
    if (asset.lessonId) {
      const lesson = await ctx.db.get(asset.lessonId);
      if (lesson && lesson.hls?.assetId !== asset._id && asset.source === "script") {
        if (lesson.hls) await ctx.scheduler.runAfter(0, internal.learnVideo.deleteAsset, { assetId: lesson.hls.assetId });
        if (lesson.video) await removeImagekitFilesLater(ctx, [lesson.video.fileId, lesson.video.posterFileId]);
        await ctx.db.patch(lesson._id, {
          video: undefined,
          youtube: undefined,
          hls: { assetId: asset._id, durationSec: Math.round(args.durationSec), posterUrl, ready: true },
          updatedAt: now,
        });
      } else {
        await markLesson(ctx, asset, { ready: true, failed: false, durationSec: Math.round(args.durationSec), posterUrl });
      }
    }
    return { sourceKey: asset.sourceKey ?? null };
  },
});

export const removeAssetRecord = internalMutation({
  args: { assetId: v.id("learnVideoAssets") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return;
    if (asset.posterStorageId) await ctx.storage.delete(asset.posterStorageId);
    await ctx.db.delete(asset._id);
  },
});

/** Deletes a video everywhere: its R2 files (encrypted output and any source), poster and record. */
export const deleteAsset = internalAction({
  args: { assetId: v.id("learnVideoAssets") },
  handler: async (ctx, args): Promise<void> => {
    const asset: Doc<"learnVideoAssets"> | null = await ctx.runQuery(internal.learnVideo.getAsset, { assetId: args.assetId });
    if (!asset) return;
    const config = r2Config();
    if (config) {
      if (asset.uploadId && asset.sourceKey) await r2AbortMultipart(config, asset.sourceKey, asset.uploadId).catch(() => {});
      const keys = asset.path ? await r2ListKeys(config, asset.path) : [];
      if (asset.sourceKey) keys.push(asset.sourceKey);
      for (const key of keys) await r2Delete(config, key).catch((e) => console.warn("[learnVideo] delete failed", String(e)));
    }
    await ctx.runMutation(internal.learnVideo.removeAssetRecord, { assetId: args.assetId });
  },
});

export const deleteSource = internalAction({
  args: { sourceKey: v.string() },
  handler: async (_ctx, args) => {
    const config = r2Config();
    if (config) await r2Delete(config, args.sourceKey).catch((e) => console.warn("[learnVideo] source delete failed", String(e)));
  },
});

/** Pings the encoder (Railway) so a sleeping worker starts on the queue. Optional. */
export const wakeWorker = internalAction({
  args: {},
  handler: async () => {
    const url = process.env.LEARN_VIDEO_WORKER_URL?.replace(/\/+$/, "");
    const secret = process.env.LEARN_VIDEO_WORKER_SECRET;
    if (!url || !secret) return;
    try {
      await fetch(`${url}/wake`, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      console.warn("[learnVideo] couldn't wake the encoder", String(error));
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin: browser upload (multipart straight to R2)
// ─────────────────────────────────────────────────────────────────────────────

/** Whether protected video is set up (names of missing env vars only, never values). */
export const adminVideoSetup = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const missing = missingSetup();
    return { ready: missing.length === 0, missing, encoder: Boolean(process.env.LEARN_VIDEO_WORKER_URL) };
  },
});

/** Recent protected videos, for the lesson drawer's picker and status. */
export const adminVideoAssets = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("learnVideoAssets").order("desc").take(60);
    return rows.map((a) => ({
      id: a._id,
      title: a.title,
      status: a.status,
      lessonId: a.lessonId ?? null,
      durationSec: a.durationSec ?? 0,
      posterUrl: a.posterUrl ?? null,
      source: a.source,
      error: a.error ?? null,
      createdAt: a.createdAt,
    }));
  },
});

export const adminStartVideoUpload = action({
  args: { title: v.string(), fileName: v.string(), contentType: v.string(), sizeBytes: v.number() },
  handler: async (
    ctx,
    args
  ): Promise<{ assetId: Id<"learnVideoAssets">; partBytes: number; parts: { partNumber: number; url: string }[] }> => {
    const userId: Id<"users"> = await ctx.runQuery(internal.learnVideo.adminUser, {});
    const config = requireR2();
    if (!videoMasterKey()) throw new ConvexError("Protected video isn't set up yet (LEARN_VIDEO_MASTER_KEY).");
    if (!(args.sizeBytes > 0) || args.sizeBytes > MAX_SOURCE_BYTES) throw new ConvexError("Videos must be 8 GB or smaller.");
    if (!args.contentType.startsWith("video/")) throw new ConvexError("Choose a video file.");
    const ext = (args.fileName.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "mp4").toLowerCase();
    const created: { assetId: Id<"learnVideoAssets">; sourceKey?: string } = await ctx.runMutation(internal.learnVideo.createAsset, {
      title: args.title || args.fileName.replace(/\.[^.]+$/, ""),
      keyId: randomHex(16),
      source: "upload",
      status: "uploading",
      sourceBytes: args.sizeBytes,
      sourceExt: ext,
      createdBy: userId,
    });
    const sourceKey = created.sourceKey!;
    const uploadId = await r2CreateMultipart(config, sourceKey, args.contentType);
    await ctx.runMutation(internal.learnVideo.patchAsset, { assetId: created.assetId, uploadId });
    const count = Math.ceil(args.sizeBytes / PART_BYTES);
    const parts = [];
    for (let partNumber = 1; partNumber <= count; partNumber++) {
      parts.push({ partNumber, url: await r2Presign(config, "PUT", sourceKey, UPLOAD_LINK_SEC, { partNumber: String(partNumber), uploadId }) });
    }
    return { assetId: created.assetId, partBytes: PART_BYTES, parts };
  },
});

export const adminFinishVideoUpload = action({
  args: { assetId: v.id("learnVideoAssets"), parts: v.array(v.object({ partNumber: v.number(), etag: v.string() })) },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runQuery(internal.learnVideo.adminUser, {});
    const config = requireR2();
    const asset: Doc<"learnVideoAssets"> | null = await ctx.runQuery(internal.learnVideo.getAsset, { assetId: args.assetId });
    if (!asset || asset.status !== "uploading" || !asset.uploadId || !asset.sourceKey) throw new ConvexError("This upload isn't open any more.");
    await r2CompleteMultipart(config, asset.sourceKey, asset.uploadId, args.parts);
    await ctx.runMutation(internal.learnVideo.patchAsset, { assetId: asset._id, status: "queued", uploadId: null });
    await ctx.scheduler.runAfter(0, internal.learnVideo.wakeWorker, {});
  },
});

export const adminAbortVideoUpload = action({
  args: { assetId: v.id("learnVideoAssets") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runQuery(internal.learnVideo.adminUser, {});
    await ctx.runAction(internal.learnVideo.deleteAsset, { assetId: args.assetId });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Playback: token, playlists, key
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed-window rate limit; returns false once over. */
export const hitRateLimit = internalMutation({
  args: { key: v.string(), limit: v.number(), windowMs: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await ctx.db
      .query("learnVideoRateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!row || row.windowStart + args.windowMs <= now) {
      if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
      else await ctx.db.insert("learnVideoRateLimits", { key: args.key, windowStart: now, count: 1 });
      return true;
    }
    if (row.count >= args.limit) return false;
    await ctx.db.patch(row._id, { count: row.count + 1 });
    return true;
  },
});

/** Called by learn:getLessonPlayback after it has checked the learner may watch this lesson. */
export const mintPlayback = internalMutation({
  args: { userId: v.id("users"), assetId: v.id("learnVideoAssets"), lessonId: v.id("learnVideoLessons") },
  handler: async (ctx, args): Promise<HlsPlayback> => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.status !== "ready") throw new ConvexError("This lesson is still being prepared. Try again in a few minutes.");
    const key = `mint:${args.userId}`;
    const now = Date.now();
    const row = await ctx.db
      .query("learnVideoRateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (row && row.windowStart + LIMITS.mint.windowMs > now) {
      if (row.count >= LIMITS.mint.limit) throw new ConvexError("Too many video requests. Please wait a few minutes.");
      await ctx.db.patch(row._id, { count: row.count + 1 });
    } else if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
    else await ctx.db.insert("learnVideoRateLimits", { key, windowStart: now, count: 1 });

    const expiresAt = now + TOKEN_TTL_MS;
    const token = await signPlaybackToken({ u: args.userId, a: args.assetId, l: args.lessonId, exp: expiresAt });
    return { masterUrl: `${siteUrl()}/learn/video/master.m3u8?t=${encodeURIComponent(token)}`, token, expiresAt };
  },
});

/** One rendition's playlist (segment names), for the media playlist endpoint. */
export const renditionPlaylist = internalQuery({
  args: { assetId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("learnVideoAssets", args.assetId);
    const asset = id ? await ctx.db.get(id) : null;
    return asset?.playlists?.find((p) => p.name === args.name)?.body ?? null;
  },
});

/** Re-checks, for every playlist and key request, that the token's user may still watch the lesson. */
export const playbackCheck = internalQuery({
  args: { userId: v.string(), lessonId: v.string(), assetId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.userId);
    const lessonId = ctx.db.normalizeId("learnVideoLessons", args.lessonId);
    const assetId = ctx.db.normalizeId("learnVideoAssets", args.assetId);
    if (!userId || !lessonId || !assetId) return { ok: false as const, status: 401 };
    const lesson = await ctx.db.get(lessonId);
    if (!lesson?.hls || lesson.hls.assetId !== assetId) return { ok: false as const, status: 403 };
    if (!(await canUserWatchLesson(ctx, userId, lessonId))) return { ok: false as const, status: 403 };
    const asset = await ctx.db.get(assetId);
    if (!asset || asset.status !== "ready") return { ok: false as const, status: 404 };
    return {
      ok: true as const,
      path: asset.path,
      keyId: asset.keyId,
      renditions: asset.renditions ?? [],
      durationSec: asset.durationSec ?? 0,
    };
  },
});

// ── HTTP helpers ─────────────────────────────────────────────────────────────

const DEFAULT_ORIGINS = ["https://learn.physioaroundme.com", "https://physioaroundme.com", "https://admin.physioaroundme.com", "http://localhost:3000"];

function corsHeaders(request: Request): Record<string, string> {
  const allowed = (process.env.LEARN_VIDEO_ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean)) ?? DEFAULT_ORIGINS;
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

function reply(request: Request, status: number, body: BodyInit | null, type = "text/plain; charset=utf-8") {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

const MESSAGES: Record<number, string> = {
  401: "Sign in again to keep watching.",
  403: "You don't have access to this lesson.",
  404: "This video isn't ready.",
  429: "Too many requests. Please wait a few minutes.",
  503: "Protected video isn't set up.",
};

/** Token from "Authorization: Bearer" (hls.js) or ?t= (players that can't send headers). */
function tokenFrom(request: Request) {
  const header = request.headers.get("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return new URL(request.url).searchParams.get("t");
}

type Authorised = { ok: true; token: string; claims: { u: string; a: string; l: string; exp: number }; asset: { path: string; keyId: string; renditions: { name: string; width: number; height: number; bandwidth: number }[]; durationSec: number } };

async function authorise(ctx: ActionCtx, request: Request, kind: keyof typeof LIMITS): Promise<Authorised | { ok: false; status: number }> {
  if (!videoMasterKey()) return { ok: false, status: 503 };
  const token = tokenFrom(request);
  const check = await verifyPlaybackToken(token);
  if (!check.ok) return { ok: false, status: 401 };
  const allowed: boolean = await ctx.runMutation(internal.learnVideo.hitRateLimit, {
    key: `${kind}:${check.claims.u}`,
    limit: LIMITS[kind].limit,
    windowMs: LIMITS[kind].windowMs,
  });
  if (!allowed) return { ok: false, status: 429 };
  const access = await ctx.runQuery(internal.learnVideo.playbackCheck, { userId: check.claims.u, lessonId: check.claims.l, assetId: check.claims.a });
  if (!access.ok) return { ok: false, status: access.status };
  return { ok: true, token: token!, claims: check.claims, asset: access };
}

export const videoPreflight = httpAction(async (_ctx, request) => new Response(null, { status: 204, headers: corsHeaders(request) }));

export const videoMaster = httpAction(async (ctx, request) => {
  const auth = await authorise(ctx, request, "playlist");
  if (!auth.ok) return reply(request, auth.status, MESSAGES[auth.status] ?? "Not allowed.");
  const t = encodeURIComponent(auth.token);
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
  for (const r of auth.asset.renditions) {
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${Math.round(r.bandwidth)},RESOLUTION=${r.width}x${r.height}`);
    lines.push(`${siteUrl()}/learn/video/media.m3u8?r=${encodeURIComponent(r.name)}&t=${t}`);
  }
  return reply(request, 200, `${lines.join("\n")}\n`, "application/vnd.apple.mpegurl");
});

export const videoMedia = httpAction(async (ctx, request) => {
  const auth = await authorise(ctx, request, "playlist");
  if (!auth.ok) return reply(request, auth.status, MESSAGES[auth.status] ?? "Not allowed.");
  const rendition = new URL(request.url).searchParams.get("r") ?? "";
  if (!auth.asset.renditions.some((r) => r.name === rendition)) return reply(request, 404, "Unknown quality.");
  const config = r2Config();
  if (!config) return reply(request, 503, MESSAGES[503]);
  const base = `${auth.asset.path}${rendition}/`;
  const source: string | null = await ctx.runQuery(internal.learnVideo.renditionPlaylist, { assetId: auth.claims.a, name: rendition });
  if (!source) return reply(request, 404, MESSAGES[404]);
  // Segment links last the lesson plus an hour (they're encrypted; the key needs a live token)
  const linkSec = Math.min(6 * 3600, Math.max(3600, Math.round(auth.asset.durationSec) + 3600));
  const keyUrl = `${siteUrl()}/learn/video/key?t=${encodeURIComponent(auth.token)}`;
  const out: string[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-KEY")) {
      out.push(line.replace(/URI="[^"]*"/, `URI="${keyUrl}"`));
    } else if (line.startsWith("#")) {
      out.push(line);
    } else if (/^seg_\d{4,6}\.ts$/.test(line)) {
      out.push(await r2Presign(config, "GET", `${base}${line}`, linkSec));
    }
  }
  return reply(request, 200, `${out.join("\n")}\n`, "application/vnd.apple.mpegurl");
});

export const videoKey = httpAction(async (ctx, request) => {
  const auth = await authorise(ctx, request, "key");
  if (!auth.ok) return reply(request, auth.status, MESSAGES[auth.status] ?? "Not allowed.");
  const key = await deriveVideoKey(auth.asset.keyId);
  return reply(request, 200, key.slice(), "application/octet-stream");
});

// ─────────────────────────────────────────────────────────────────────────────
// Encoder / laptop script API (Authorization: Bearer LEARN_VIDEO_WORKER_SECRET)
// ─────────────────────────────────────────────────────────────────────────────

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function workerGuard(request: Request) {
  if (!(await workerSecretOk(request.headers.get("Authorization")))) return json(401, { error: "unauthorised" });
  if (missingSetup().length) return json(503, { error: "protected video isn't set up", missing: missingSetup() });
  return null;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The script publishing from a laptop: a new video record and its key (sent once, over HTTPS). */
export const workerCreate = httpAction(async (ctx, request) => {
  const denied = await workerGuard(request);
  if (denied) return denied;
  const body = await readJson(request);
  let resolvedLesson: Id<"learnVideoLessons"> | null = null;
  if (typeof body.lessonId === "string") {
    resolvedLesson = await ctx.runQuery(internal.learnVideo.normaliseLessonId, { lessonId: body.lessonId });
    if (!resolvedLesson) return json(400, { error: "lesson not found" });
  }
  const keyId = randomHex(16);
  const created: { assetId: Id<"learnVideoAssets">; path: string } = await ctx.runMutation(internal.learnVideo.createAsset, {
    title: typeof body.title === "string" ? body.title : "Lesson video",
    keyId,
    source: "script",
    status: "encoding",
    sourceBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : undefined,
    lessonId: resolvedLesson ?? undefined,
  });
  return json(200, { assetId: created.assetId, key: toBase64(await deriveVideoKey(keyId)) });
});

export const normaliseLessonId = internalQuery({
  args: { lessonId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("learnVideoLessons", args.lessonId);
    return id && (await ctx.db.get(id)) ? id : null;
  },
});

/** The Railway encoder: the next uploaded video, a link to its source and its key. */
export const workerClaim = httpAction(async (ctx, request) => {
  const denied = await workerGuard(request);
  if (denied) return denied;
  const job: { assetId: Id<"learnVideoAssets">; title: string; keyId: string; sourceKey: string } | null = await ctx.runMutation(
    internal.learnVideo.claimJob,
    {}
  );
  if (!job) return json(200, { job: null });
  const config = requireR2();
  return json(200, {
    job: {
      assetId: job.assetId,
      title: job.title,
      key: toBase64(await deriveVideoKey(job.keyId)),
      sourceUrl: await r2Presign(config, "GET", job.sourceKey, WORKER_LINK_SEC),
    },
  });
});

/** Presigned PUT links for the encoded files (and a Convex storage link for the poster). */
export const workerUploadUrls = httpAction(async (ctx, request) => {
  const denied = await workerGuard(request);
  if (denied) return denied;
  const body = await readJson(request);
  const assetId = typeof body.assetId === "string" ? body.assetId : "";
  const files = Array.isArray(body.files) ? body.files.filter((f): f is string => typeof f === "string") : [];
  if (files.length === 0 || files.length > 5000 || files.some((f) => !OUTPUT_FILE.test(f))) return json(400, { error: "bad file list" });
  const asset = await ctx.runQuery(internal.learnVideo.assetForWorker, { assetId });
  if (!asset || asset.status !== "encoding") return json(409, { error: "video is not being encoded" });
  const config = requireR2();
  const urls: Record<string, string> = {};
  for (const file of files) urls[file] = await r2Presign(config, "PUT", `${asset.path}${file}`, WORKER_LINK_SEC);
  return json(200, { urls, posterUploadUrl: await ctx.storage.generateUploadUrl() });
});

export const assetForWorker = internalQuery({
  args: { assetId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("learnVideoAssets", args.assetId);
    const asset = id ? await ctx.db.get(id) : null;
    return asset ? { id: asset._id, path: asset.path, status: asset.status } : null;
  },
});

export const workerComplete = httpAction(async (ctx, request) => {
  const denied = await workerGuard(request);
  if (denied) return denied;
  const body = await readJson(request);
  const asset = await ctx.runQuery(internal.learnVideo.assetForWorker, { assetId: typeof body.assetId === "string" ? body.assetId : "" });
  if (!asset) return json(404, { error: "video not found" });
  const renditions = Array.isArray(body.renditions)
    ? body.renditions
        .filter((r): r is { name: string; width: number; height: number; bandwidth: number } =>
          Boolean(r && typeof r === "object" && RENDITIONS.includes((r as { name: string }).name as (typeof RENDITIONS)[number]))
        )
        .map((r) => ({ name: r.name, width: Number(r.width) || 0, height: Number(r.height) || 0, bandwidth: Number(r.bandwidth) || 0 }))
    : [];
  if (renditions.length === 0) return json(400, { error: "no renditions" });
  // Each rendition's playlist: only HLS tags and this video's segment names, encrypted with AES-128
  const playlists: { name: string; body: string }[] = [];
  const given = body.playlists && typeof body.playlists === "object" ? (body.playlists as Record<string, unknown>) : {};
  for (const r of renditions) {
    const text = given[r.name];
    if (typeof text !== "string" || text.length > 400_000) return json(400, { error: `missing playlist for ${r.name}` });
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines[0] !== "#EXTM3U" || !lines.some((l) => l.startsWith("#EXT-X-KEY:METHOD=AES-128"))) {
      return json(400, { error: `${r.name} isn't an encrypted HLS playlist` });
    }
    if (lines.some((l) => !l.startsWith("#") && !/^seg_\d{4,6}\.ts$/.test(l))) return json(400, { error: `unexpected entry in ${r.name}` });
    playlists.push({ name: r.name, body: lines.join("\n") });
  }
  const posterStorageId =
    typeof body.posterStorageId === "string" ? await ctx.runQuery(internal.learnVideo.normaliseStorageId, { id: body.posterStorageId }) : null;
  const done: { sourceKey: string | null } = await ctx.runMutation(internal.learnVideo.completeAsset, {
    assetId: asset.id,
    renditions,
    playlists,
    durationSec: Number(body.durationSec) || 0,
    posterStorageId: posterStorageId ?? undefined,
  });
  if (done.sourceKey) await ctx.scheduler.runAfter(0, internal.learnVideo.deleteSource, { sourceKey: done.sourceKey });
  return json(200, { ok: true });
});

export const normaliseStorageId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => ctx.db.normalizeId("_storage", args.id),
});

export const workerFail = httpAction(async (ctx, request) => {
  const denied = await workerGuard(request);
  if (denied) return denied;
  const body = await readJson(request);
  const asset = await ctx.runQuery(internal.learnVideo.assetForWorker, { assetId: typeof body.assetId === "string" ? body.assetId : "" });
  if (!asset) return json(404, { error: "video not found" });
  await ctx.runMutation(internal.learnVideo.patchAsset, {
    assetId: asset.id,
    status: "failed",
    error: typeof body.error === "string" ? body.error : "Encoding failed.",
  });
  return json(200, { ok: true });
});
