/**
 * ImageKit for private files (course videos, physios' own exercise media): browser upload
 * signatures, signed playback links and clean-up. Web Crypto only, so it runs in queries,
 * mutations and actions alike.
 */
import { ConvexError } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { MutationCtx } from "../_generated/server";

export const IMAGEKIT_URL = /^https:\/\/ik\.imagekit\.io\/[^\s]+$/i;

export async function hmacSha1Hex(key: string, data: string) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function imagekitPrivateKey() {
  const key = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!key) throw new ConvexError("Video hosting isn't set up yet (IMAGEKIT_PRIVATE_KEY).");
  return key;
}

/**
 * ImageKit signed URL: HMAC-SHA1(private key, the path after the URL endpoint + expiry), sent
 * as ik-t (expiry, epoch seconds) and ik-s (signature).
 */
export async function signedImagekitUrl(url: string, filePath: string, expiresAt: number) {
  const endpoint = url.endsWith(filePath) ? url.slice(0, url.length - filePath.length) : process.env.IMAGEKIT_URL_ENDPOINT;
  if (!endpoint) throw new ConvexError("Video hosting isn't set up yet (IMAGEKIT_URL_ENDPOINT).");
  const base = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
  const expiry = Math.floor(expiresAt / 1000);
  const signature = await hmacSha1Hex(imagekitPrivateKey(), url.slice(base.length) + expiry);
  return `${url}${url.includes("?") ? "&" : "?"}ik-t=${expiry}&ik-s=${signature}`;
}

/** Signature for one browser upload into `folder`. Each upload needs a fresh one. */
export async function imagekitUploadAuth(folder: string) {
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  if (!publicKey) throw new ConvexError("Video hosting isn't set up yet (IMAGEKIT_PUBLIC_KEY).");
  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 30 * 60; // ImageKit allows up to an hour
  const signature = await hmacSha1Hex(imagekitPrivateKey(), token + expire);
  return { token, expire, signature, publicKey, folder };
}

const deleteFilesRef = makeFunctionReference<"action", { fileIds: string[] }>("learn:deleteImagekitFiles");

/** Removes replaced or deleted files from ImageKit so they stop using storage. */
export async function removeImagekitFilesLater(ctx: MutationCtx, fileIds: (string | undefined)[]) {
  const ids = fileIds.filter((id): id is string => Boolean(id));
  if (ids.length) await ctx.scheduler.runAfter(0, deleteFilesRef, { fileIds: ids });
}
