/**
 * Bunny Stream: protected hosting for Rehabify Learn lesson videos (owner 2026-11-12: "hard to get
 * paid courses from the browser console"). Videos are encoded to HLS and played only through
 * Bunny's embedded player, with MediaCage Basic DRM switched on for the library (a per-session
 * key, no downloadable file) and embed token authentication (signed, expiring player links).
 *
 * Convex env (all four needed; without them uploads stay on ImageKit as before):
 *   BUNNY_STREAM_LIBRARY_ID   Stream › library › API: "Video Library ID"
 *   BUNNY_STREAM_API_KEY      Stream › library › API: "API Key" (library key, not the account key)
 *   BUNNY_STREAM_TOKEN_KEY    Stream › library › Security: "Token authentication key"
 *   BUNNY_STREAM_CDN_HOST     Stream › library › API: "CDN Hostname" (vz-….b-cdn.net), for thumbnails
 *
 * Web Crypto only, so it runs in queries, mutations and actions alike.
 */
import { ConvexError } from "convex/values";
import { sha256Hex } from "./exerciseCrypto";

const API = "https://video.bunnycdn.com";
const EMBED = "https://iframe.mediadelivery.net/embed";

export type BunnyConfig = { libraryId: string; apiKey: string; tokenKey: string; cdnHost: string };

export function bunnyConfig(): BunnyConfig | null {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID?.trim();
  const apiKey = process.env.BUNNY_STREAM_API_KEY?.trim();
  const tokenKey = process.env.BUNNY_STREAM_TOKEN_KEY?.trim();
  const cdnHost = process.env.BUNNY_STREAM_CDN_HOST?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return libraryId && apiKey && tokenKey && cdnHost ? { libraryId, apiKey, tokenKey, cdnHost } : null;
}

function requireConfig(): BunnyConfig {
  const config = bunnyConfig();
  if (!config) throw new ConvexError("Protected video hosting isn't set up yet.");
  return config;
}

const BUNNY_ID = /^[0-9a-f-]{36}$/i;

export function isBunnyVideoId(id: string) {
  return BUNNY_ID.test(id);
}

/** Creates an empty video in the library; the browser then uploads the file to it (TUS). */
export async function createBunnyVideo(title: string): Promise<string> {
  const { libraryId, apiKey } = requireConfig();
  const res = await fetch(`${API}/library/${libraryId}/videos`, {
    method: "POST",
    headers: { AccessKey: apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ title: title.slice(0, 200) || "Lesson" }),
  });
  if (!res.ok) throw new ConvexError(`Bunny Stream didn't accept the video (${res.status}).`);
  const body = (await res.json()) as { guid?: string };
  if (!body.guid || !isBunnyVideoId(body.guid)) throw new ConvexError("Bunny Stream didn't return a video id.");
  return body.guid;
}

/** Lets the browser upload one file straight to Bunny (TUS), without seeing the API key. */
export async function bunnyUploadAuth(videoId: string, expiresAtSec: number) {
  const { libraryId, apiKey } = requireConfig();
  return {
    endpoint: `${API}/tusupload`,
    libraryId,
    videoId,
    expires: expiresAtSec,
    signature: await sha256Hex(`${libraryId}${apiKey}${expiresAtSec}${videoId}`),
  };
}

export type BunnyVideoState = {
  /** 0 created, 1 uploaded, 2 processing, 3 transcoding, 4 finished, 5 error, 6 upload failed */
  status: number;
  ready: boolean;
  failed: boolean;
  durationSec: number;
  thumbnailUrl: string | null;
};

export async function getBunnyVideo(videoId: string): Promise<BunnyVideoState | null> {
  const { libraryId, apiKey, cdnHost } = requireConfig();
  const res = await fetch(`${API}/library/${libraryId}/videos/${videoId}`, { headers: { AccessKey: apiKey, Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Bunny Stream video lookup failed (${res.status})`);
  const body = (await res.json()) as { status?: number; length?: number; thumbnailFileName?: string };
  const status = Number(body.status ?? 0);
  return {
    status,
    ready: status === 4,
    failed: status === 5 || status === 6,
    durationSec: Math.max(0, Math.round(Number(body.length ?? 0))),
    thumbnailUrl: body.thumbnailFileName ? `https://${cdnHost}/${videoId}/${body.thumbnailFileName}` : null,
  };
}

export async function deleteBunnyVideo(videoId: string) {
  const config = bunnyConfig();
  if (!config) return;
  const res = await fetch(`${API}/library/${config.libraryId}/videos/${videoId}`, {
    method: "DELETE",
    headers: { AccessKey: config.apiKey },
  });
  // 404 means it's already gone; anything else is left for a manual clean-up, never retried
  if (!res.ok && res.status !== 404) console.warn(`Bunny Stream delete failed (${res.status})`);
}

/**
 * The player link for one learner session: Bunny checks the token (embed token authentication)
 * and refuses the link once it expires.
 */
export async function bunnyEmbedUrl(videoId: string, expiresAtSec: number) {
  const { libraryId, tokenKey } = requireConfig();
  const token = await sha256Hex(`${tokenKey}${videoId}${expiresAtSec}`);
  const params = new URLSearchParams({
    token,
    expires: String(expiresAtSec),
    autoplay: "true",
    preload: "true",
    responsive: "true",
  });
  return `${EMBED}/${libraryId}/${videoId}?${params.toString()}`;
}
