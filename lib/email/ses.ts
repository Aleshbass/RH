/**
 * Amazon SES, the main email sender (Resend is the backup: lib/email/deliver.ts). Group campaigns
 * go through it too (convex/actions/marketingSend.ts).
 * Calls the SES v2 API directly, signed with AWS Signature V4 through Web Crypto, so it needs no
 * AWS SDK and runs anywhere: Convex actions (Node or default runtime) and Next routes.
 *
 * Env (Convex and Vercel): SES_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY, SES_REGION (eu-north-1, Stockholm: the only region the AWS project account allows).
 * Not the usual AWS_* names: Vercel reserves those for its own runtime.
 */

export type SesEmail = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | string[];
  /** Extra headers, e.g. List-Unsubscribe for campaigns (SES allows up to 15) */
  headers?: { name: string; value: string }[];
};

export type SesResult = { ok: true; messageId?: string } | { ok: false; error: string; status?: number };

function sesConfig() {
  const accessKeyId = process.env.SES_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.SES_SECRET_ACCESS_KEY?.trim();
  const region = process.env.SES_REGION?.trim() || "eu-north-1";
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey, region } : null;
}

export function sesConfigured(): boolean {
  return sesConfig() !== null;
}

/** The sandbox sender only works on Resend; SES needs an address on our verified domain. */
export function sesFromAddress(from: string): string {
  if (!/@resend\.dev>?\s*$/i.test(from)) return from;
  const name = /^\s*"?([^"<]*?)"?\s*</.exec(from)?.[1] || "Rehabify Health";
  return `${name} <${process.env.SES_FROM_EMAIL || "noreply@physioaroundme.com"}>`;
}

const encoder = new TextEncoder();
const toHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
const sha256Hex = async (data: string) => toHex(await crypto.subtle.digest("SHA-256", encoder.encode(data)));

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

const list = (value: string | string[] | undefined) => (value === undefined ? [] : Array.isArray(value) ? value : [value]).filter(Boolean);

/** `Name <a@b.c>` with a non-ASCII name becomes RFC 2047 so SES accepts it. */
function encodeAddress(address: string): string {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(address);
  if (!match) return address.trim();
  const [, name, email] = match;
  if (!name) return email;
  if (/^[\x20-\x7e]*$/.test(name)) return `"${name.replace(/["\\]/g, "")}" <${email}>`;
  const b64 = btoa(String.fromCharCode(...encoder.encode(name)));
  return `=?UTF-8?B?${b64}?= <${email}>`;
}

/** AWS's strict URI encoding for the canonical query string. */
const awsEncode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

type SesResponse = { ok: true; json: Record<string, unknown> } | { ok: false; error: string; status?: number };

/** One signed call to the SES v2 API. Never throws. */
async function sesRequest(method: "GET" | "POST", path: string, query: [string, string][] = [], body = ""): Promise<SesResponse> {
  const config = sesConfig();
  if (!config) return { ok: false, error: "Amazon SES is not configured (SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY)" };

  const host = `email.${config.region}.amazonaws.com`;
  const canonicalQuery = query
    .map(([k, v]) => [awsEncode(k), awsEncode(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  try {
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20261120T101500Z
    const day = amzDate.slice(0, 8);
    const scope = `${day}/${config.region}/ses/aws4_request`;
    const payloadHash = await sha256Hex(body);
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      method,
      path,
      canonicalQuery,
      `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");

    let key = await hmac(encoder.encode(`AWS4${config.secretAccessKey}`), day);
    for (const part of [config.region, "ses", "aws4_request"]) key = await hmac(key, part);
    const signature = toHex(await hmac(key, stringToSign));

    const response = await fetch(`https://${host}${path}${canonicalQuery ? `?${canonicalQuery}` : ""}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      ...(method === "POST" ? { body } : {}),
    });
    const text = await response.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      // SES answers JSON; anything else is reported as text below
    }
    if (!response.ok) {
      const kind = response.headers.get("x-amzn-errortype")?.split(":")[0];
      const message = (json.message as string) || (json.Message as string) || text.slice(0, 200);
      return { ok: false, status: response.status, error: `SES ${response.status}${kind ? ` ${kind}` : ""}: ${message}` };
    }
    return { ok: true, json };
  } catch (error) {
    return { ok: false, error: `SES request failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Sends one email through SES. Never throws; the error says what SES answered. */
export async function sendViaSes(email: SesEmail): Promise<SesResult> {
  const body = JSON.stringify({
    FromEmailAddress: encodeAddress(email.from),
    Destination: { ToAddresses: list(email.to) },
    ...(list(email.replyTo).length ? { ReplyToAddresses: list(email.replyTo) } : {}),
    Content: {
      Simple: {
        Subject: { Data: email.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: email.html, Charset: "UTF-8" },
          ...(email.text ? { Text: { Data: email.text, Charset: "UTF-8" } } : {}),
        },
        ...(email.headers?.length ? { Headers: email.headers.map((h) => ({ Name: h.name, Value: h.value })) } : {}),
      },
    },
  });
  const result = await sesRequest("POST", "/v2/email/outbound-emails", [], body);
  if (!result.ok) return result;
  return { ok: true, messageId: typeof result.json.MessageId === "string" ? result.json.MessageId : undefined };
}

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

export type SesSuppression = { email: string; reason: "BOUNCE" | "COMPLAINT"; at: number };

/**
 * Addresses SES added to the account's suppression list since `since` (hard bounces and spam
 * complaints; SES stops sending to them by itself). Up to 10 pages of 1,000.
 */
export async function listSesSuppressions(since: number): Promise<{ ok: true; items: SesSuppression[] } | { ok: false; error: string }> {
  const items: SesSuppression[] = [];
  let next: string | undefined;
  for (let page = 0; page < 10; page++) {
    const query: [string, string][] = [
      // Timestamps in a REST query string are ISO 8601
      ["StartDate", iso(since)],
      ["EndDate", iso(Date.now())],
      ["PageSize", "1000"],
      ...(next ? ([["NextToken", next]] as [string, string][]) : []),
    ];
    const result = await sesRequest("GET", "/v2/email/suppression/addresses", query);
    if (!result.ok) return { ok: false, error: result.error };
    const rows = (result.json.SuppressedDestinationSummaries ?? []) as { EmailAddress?: string; Reason?: string; LastUpdateTime?: number | string }[];
    for (const row of rows) {
      if (!row.EmailAddress || (row.Reason !== "BOUNCE" && row.Reason !== "COMPLAINT")) continue;
      const raw = row.LastUpdateTime;
      const at = typeof raw === "number" ? (raw < 1e12 ? raw * 1000 : raw) : Date.parse(String(raw ?? "")) || Date.now();
      items.push({ email: row.EmailAddress.trim().toLowerCase(), reason: row.Reason, at });
    }
    next = typeof result.json.NextToken === "string" ? result.json.NextToken : undefined;
    if (!next) break;
  }
  return { ok: true, items };
}
