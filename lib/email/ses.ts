/**
 * Amazon SES, the backup email sender (owner 2026-11-20: "make Amazon SES the backup for Resend").
 * Calls the SES v2 SendEmail API directly, signed with AWS Signature V4 through Web Crypto, so it
 * needs no AWS SDK and runs anywhere: Convex actions (Node or default runtime) and Next routes.
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
};

export type SesResult = { ok: true; messageId?: string } | { ok: false; error: string };

function sesConfig() {
  const accessKeyId = process.env.SES_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.SES_SECRET_ACCESS_KEY?.trim();
  const region = process.env.SES_REGION?.trim() || "eu-north-1";
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey, region } : null;
}

export function sesConfigured(): boolean {
  return sesConfig() !== null;
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

/** Sends one email through SES. Never throws; the error says what SES answered. */
export async function sendViaSes(email: SesEmail): Promise<SesResult> {
  const config = sesConfig();
  if (!config) return { ok: false, error: "Amazon SES is not configured (SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY)" };

  const host = `email.${config.region}.amazonaws.com`;
  const path = "/v2/email/outbound-emails";
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
      },
    },
  });

  try {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20261120T101500Z
    const day = amzDate.slice(0, 8);
    const scope = `${day}/${config.region}/ses/aws4_request`;
    const payloadHash = await sha256Hex(body);
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      "POST",
      path,
      "",
      `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");

    let key = await hmac(encoder.encode(`AWS4${config.secretAccessKey}`), day);
    for (const part of [config.region, "ses", "aws4_request"]) key = await hmac(key, part);
    const signature = toHex(await hmac(key, stringToSign));

    const response = await fetch(`https://${host}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body,
    });
    const text = await response.text();
    let json: { MessageId?: string; message?: string; Message?: string } = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      // SES answers JSON; anything else is reported as text below
    }
    if (!response.ok) {
      const kind = response.headers.get("x-amzn-errortype")?.split(":")[0];
      return { ok: false, error: `SES ${response.status}${kind ? ` ${kind}` : ""}: ${json.message || json.Message || text.slice(0, 200)}` };
    }
    return { ok: true, messageId: json.MessageId };
  } catch (error) {
    return { ok: false, error: `SES request failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
