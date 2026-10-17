/**
 * Crypto for the exercise library: per-asset keys, share-link tokens and PIN hashes.
 * Web Crypto only, so it runs in the default Convex runtime.
 */

const SALT = new TextEncoder().encode("rehabify-exercise-library-v1");
const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function hmacSha256(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

let prk: Promise<Uint8Array<ArrayBuffer>> | null = null;

/** HKDF-Extract (RFC 5869): PRK = HMAC-SHA256(salt, master key). */
function pseudoRandomKey() {
  const b64 = process.env.EXERCISE_ASSET_MASTER_KEY;
  if (!b64) throw new Error("EXERCISE_ASSET_MASTER_KEY is not set");
  prk ??= hmacSha256(SALT, base64ToBytes(b64));
  return prk;
}

/**
 * The AES-256-GCM key for one published asset. Must match scripts/exercise-3d/publish.mjs:
 * HKDF-SHA256(master, salt, info "<assetId>:<version>", 32 bytes). Built from HMAC (the same
 * Web Crypto primitive the payment webhooks use) so it runs in the default Convex runtime.
 */
export async function deriveAssetKey(assetId: string, version: string): Promise<string> {
  const info = new TextEncoder().encode(`${assetId}:${version}`);
  const block = new Uint8Array(new ArrayBuffer(info.length + 1));
  block.set(info);
  block[info.length] = 1; // HKDF-Expand T(1) = HMAC(PRK, info || 0x01); 32 bytes is one block
  return bytesToBase64(await hmacSha256(await pseudoRandomKey(), block));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Unbiased base62 string from crypto.getRandomValues. Call from actions, where randomness is real. */
export function randomToken(length: number): string {
  const limit = Math.floor(256 / 62) * 62;
  let out = "";
  const buf = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) out += BASE62[buf[0] % 62];
  }
  return out;
}

export function randomDigits(length: number): string {
  let out = "";
  const buf = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    if (buf[0] < 250) out += String(buf[0] % 10);
  }
  return out;
}

/** Last four digits of a phone number, or null when there aren't enough digits. */
export function phoneLast4(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-4) : null;
}

/** Hash for a 4-digit PIN, salted per link so equal PINs never share a hash. */
export function pinHash(salt: string, pin: string) {
  return sha256Hex(`${salt}:${pin}`);
}
