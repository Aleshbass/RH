/**
 * Cloudflare R2 (S3 API) for Rehabify Learn's protected lesson videos: AWS Signature V4
 * presigned links, so the bucket stays private and the R2 keys never leave Convex. The browser,
 * the encoder and the laptop script only ever get short-lived links for single objects.
 *
 * Convex env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * (optional R2_ENDPOINT, e.g. a local S3-compatible server for tests).
 *
 * Web Crypto only and no imports, so it runs in queries, mutations, actions, HTTP actions and
 * Node (tests) alike.
 */

export type R2Config = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const endpoint = process.env.R2_ENDPOINT?.trim().replace(/\/+$/, "") || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  return endpoint && accessKeyId && secretAccessKey && bucket ? { endpoint, bucket, accessKeyId, secretAccessKey } : null;
}

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

async function hmac(key: ArrayBuffer | Uint8Array, text: string) {
  const raw = key instanceof Uint8Array ? key.slice() : new Uint8Array(key);
  const k = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, encoder.encode(text));
}

/** RFC 3986 encoding, as SigV4 requires (encodeURIComponent leaves !'()* alone). */
export function uriEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** An object key as a URL path: each segment encoded, slashes kept. */
export function encodeKeyPath(key: string) {
  return key.split("/").map(uriEncode).join("/");
}

// The signing key only changes per day; a playlist presigns hundreds of segment links at once
const signingKeys = new Map<string, ArrayBuffer>();

async function signingKey(secret: string, dateStamp: string, region: string, service: string) {
  const cacheKey = `${await sha256Hex(secret)}|${dateStamp}|${region}|${service}`;
  const cached = signingKeys.get(cacheKey);
  if (cached) return cached;
  const kDate = await hmac(encoder.encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  if (signingKeys.size > 20) signingKeys.clear();
  signingKeys.set(cacheKey, kSigning);
  return kSigning;
}

function amzDates(at: Date) {
  const iso = at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/**
 * SigV4 query-string signing for any request ("presigned URL"). The payload is unsigned, so the
 * link works for PUT and POST bodies too. Matches AWS's documented example (tests/learn-video).
 */
export async function presignRaw(input: {
  method: string;
  origin: string; // https://host[:port]
  path: string; // already encoded, starting with "/"
  query?: Record<string, string>;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  expiresSec: number;
  now?: Date;
}) {
  const service = input.service ?? "s3";
  const { amzDate, dateStamp } = amzDates(input.now ?? new Date());
  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const host = new URL(input.origin).host;
  const params: Record<string, string> = {
    ...(input.query ?? {}),
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.max(1, Math.min(604800, Math.floor(input.expiresSec)))),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(params[k])}`)
    .join("&");
  const canonicalRequest = [input.method.toUpperCase(), input.path, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const kSigning = await signingKey(input.secretAccessKey, dateStamp, input.region, service);
  const signature = hex(await hmac(kSigning, stringToSign));
  return `${input.origin}${input.path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** A presigned link for one object in the R2 bucket (path-style, region "auto"). */
export async function r2Presign(
  config: R2Config,
  method: "GET" | "PUT" | "POST" | "DELETE" | "HEAD",
  key: string,
  expiresSec: number,
  query?: Record<string, string>
) {
  return presignRaw({
    method,
    origin: config.endpoint,
    path: `/${uriEncode(config.bucket)}/${encodeKeyPath(key)}`,
    query,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: "auto",
    expiresSec,
  });
}

/** A presigned link on the bucket itself (listing). */
export async function r2PresignBucket(config: R2Config, method: "GET", expiresSec: number, query: Record<string, string>) {
  return presignRaw({
    method,
    origin: config.endpoint,
    path: `/${uriEncode(config.bucket)}`,
    query,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: "auto",
    expiresSec,
  });
}

/** Every object key under a prefix (ListObjectsV2, paged). */
export async function r2ListKeys(config: R2Config, prefix: string, max = 5000): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const query: Record<string, string> = { "list-type": "2", prefix, "max-keys": "1000" };
    if (token) query["continuation-token"] = token;
    const res = await fetch(await r2PresignBucket(config, "GET", 300, query));
    if (!res.ok) throw new Error(`R2 list failed (${res.status})`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(decodeXml(m[1]));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] : undefined;
  } while (token && keys.length < max);
  return keys;
}

export function decodeXml(text: string) {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function escapeXml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Multipart upload (browser → R2 for large source files) ───────────────────

export async function r2CreateMultipart(config: R2Config, key: string, contentType: string) {
  const url = await r2Presign(config, "POST", key, 300, { uploads: "" });
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": contentType } });
  const xml = await res.text();
  const uploadId = xml.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
  if (!res.ok || !uploadId) throw new Error(`R2 didn't start the upload (${res.status})`);
  return decodeXml(uploadId);
}

export async function r2CompleteMultipart(config: R2Config, key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
  const body = `<CompleteMultipartUpload>${parts
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${escapeXml(p.etag)}</ETag></Part>`)
    .join("")}</CompleteMultipartUpload>`;
  const res = await fetch(await r2Presign(config, "POST", key, 300, { uploadId }), {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body,
  });
  const text = await res.text();
  // S3 can report an error with status 200 inside the body
  if (!res.ok || /<Error>/.test(text)) throw new Error(`R2 didn't finish the upload (${res.status})`);
}

export async function r2AbortMultipart(config: R2Config, key: string, uploadId: string) {
  await fetch(await r2Presign(config, "DELETE", key, 300, { uploadId }), { method: "DELETE" });
}

export async function r2Delete(config: R2Config, key: string) {
  const res = await fetch(await r2Presign(config, "DELETE", key, 300), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed (${res.status})`);
}
