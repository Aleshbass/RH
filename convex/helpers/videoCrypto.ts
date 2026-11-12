/**
 * Keys and tokens for Rehabify Learn's protected lesson videos (AES-128 HLS).
 *
 * - Each video's AES-128 key is derived from LEARN_VIDEO_MASTER_KEY (base64, 32 random bytes)
 *   and the video's random key id with HKDF-SHA256, so no key is ever stored or uploaded. Only
 *   Convex and the encoder (which receives it over HTTPS with the worker secret) see a key.
 * - Playback tokens are short-lived and HMAC-signed with a key derived from the same master, so
 *   the key endpoint can trust them without a database lookup (it still re-checks access).
 * - LEARN_VIDEO_WORKER_SECRET authenticates the encoder and the laptop publish script.
 *
 * Web Crypto only and no imports, so it runs in every Convex runtime and in Node (tests).
 */

const encoder = new TextEncoder();
const SALT = encoder.encode("rehabify-learn-video-v1");

export function toBase64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function toBase64Url(bytes: Uint8Array) {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

async function hmacBytes(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key.slice(), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data.slice()));
}

/** The master key from the env, or null when protected video isn't set up. */
export function videoMasterKey(): Uint8Array | null {
  const b64 = process.env.LEARN_VIDEO_MASTER_KEY?.trim();
  if (!b64) return null;
  const bytes = fromBase64(b64);
  if (bytes.length < 32) throw new Error("LEARN_VIDEO_MASTER_KEY must be at least 32 random bytes (base64).");
  return bytes;
}

function requireMaster() {
  const master = videoMasterKey();
  if (!master) throw new Error("LEARN_VIDEO_MASTER_KEY is not set");
  return master;
}

/** HKDF-SHA256 (RFC 5869), up to 32 bytes: Expand T(1) = HMAC(PRK, info || 0x01). */
export async function hkdf(master: Uint8Array, info: string, length: number) {
  const prk = await hmacBytes(SALT, master);
  const infoBytes = encoder.encode(info);
  const block = new Uint8Array(infoBytes.length + 1);
  block.set(infoBytes);
  block[infoBytes.length] = 1;
  return (await hmacBytes(prk, block)).slice(0, length);
}

/** The 16-byte AES-128 key for one video. */
export async function deriveVideoKey(keyId: string, master = requireMaster()) {
  return hkdf(master, `learn-video:${keyId}`, 16);
}

// ── Playback tokens ──────────────────────────────────────────────────────────

export type PlaybackClaims = {
  u: string; // user id
  a: string; // video asset id
  l: string; // lesson id
  exp: number; // ms since epoch
};

async function tokenKey(master: Uint8Array) {
  return hkdf(master, "learn-video:playback-token", 32);
}

export async function signPlaybackToken(claims: PlaybackClaims, master = requireMaster()) {
  const body = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const sig = toBase64Url(await hmacBytes(await tokenKey(master), encoder.encode(body)));
  return `${body}.${sig}`;
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export type TokenCheck = { ok: true; claims: PlaybackClaims } | { ok: false; reason: "missing" | "malformed" | "signature" | "expired" };

export async function verifyPlaybackToken(token: string | null | undefined, now = Date.now(), master = requireMaster()): Promise<TokenCheck> {
  if (!token) return { ok: false, reason: "missing" };
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined || token.length > 2048) return { ok: false, reason: "malformed" };
  let given: Uint8Array;
  try {
    given = fromBase64Url(sig);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const expected = await hmacBytes(await tokenKey(master), encoder.encode(body));
  if (!equalBytes(given, expected)) return { ok: false, reason: "signature" };
  let claims: PlaybackClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof claims?.u !== "string" || typeof claims.a !== "string" || typeof claims.l !== "string" || typeof claims.exp !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (claims.exp <= now) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}

// ── Encoder / script authentication ─────────────────────────────────────────

/** Constant-time check of "Authorization: Bearer <LEARN_VIDEO_WORKER_SECRET>". */
export async function workerSecretOk(authorization: string | null) {
  const secret = process.env.LEARN_VIDEO_WORKER_SECRET?.trim();
  if (!secret || secret.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const given = authorization.slice(7).trim();
  // Compare digests so the comparison time doesn't depend on where the strings differ
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(given)),
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ]);
  return equalBytes(new Uint8Array(a), new Uint8Array(b));
}

/** A random id (hex). Call from actions/mutations: Math.random isn't used. */
export function randomHex(bytes: number) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
