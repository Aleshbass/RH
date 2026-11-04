/**
 * AwaDoc partner integration: signing, verification and the signed callback POST.
 * Spec: AwaDoc "Therapy Provider Guide" (partners.awadoc.com/api-documentation/therapy-provider-guide).
 *
 * Signature (both directions): HMAC_SHA256( sha256(body) + "\n" + timestamp, secret ) as hex,
 * timestamp in Unix seconds, ±5 minutes allowed.
 *
 * AwaDoc has a test and a production environment, each with its own secret and callback base
 * URL. An inbound event is checked against both secrets; the one that matches says which
 * environment it came from, and every callback for that booking goes back to the same one.
 *
 * Server only (reads secrets). Env vars live in Vercel:
 *   AWADOC_PARTNER_ID        partner id in the callback path
 *   AWADOC_SECRET_KEY        production secret (comma-separated to overlap a rotation)
 *   AWADOC_BASE_URL          production API base (default https://partners-api.awadoc.com; the guide's
 *                            partners-prod-001 host does not exist, checked Nov 2026)
 *   AWADOC_TEST_SECRET_KEY   optional sandbox secret
 *   AWADOC_TEST_BASE_URL     sandbox API base (default https://partners-staging.awadoc.com)
 *   AWADOC_TEST_PARTNER_ID   optional, when the sandbox partner id differs
 */

import crypto from "crypto";

export type AwadocEnv = "production" | "test";

const MAX_SKEW_SECONDS = 300;
const CALLBACK_TIMEOUT_MS = 15_000;

function secretList(value: string | undefined): string[] {
    return (value ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

function stripTrailingSlash(url: string): string {
    return url.replace(/\/+$/, "");
}

export function awadocEnvConfig(env: AwadocEnv) {
    const partnerId = process.env.AWADOC_PARTNER_ID?.trim() ?? "";
    if (env === "test") {
        return {
            secrets: secretList(process.env.AWADOC_TEST_SECRET_KEY),
            baseUrl: stripTrailingSlash(process.env.AWADOC_TEST_BASE_URL?.trim() || "https://partners-staging.awadoc.com"),
            partnerId: process.env.AWADOC_TEST_PARTNER_ID?.trim() || partnerId,
        };
    }
    return {
        secrets: secretList(process.env.AWADOC_SECRET_KEY),
        baseUrl: stripTrailingSlash(process.env.AWADOC_BASE_URL?.trim() || "https://partners-api.awadoc.com"),
        partnerId,
    };
}

const sha256Hex = (input: string) => crypto.createHash("sha256").update(input).digest("hex");

/** Signature over the exact body string that is sent or received. */
export function signBody(rawBody: string, timestamp: number | string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(`${sha256Hex(rawBody)}\n${timestamp}`).digest("hex");
}

/** Non-reversible fingerprint of a secret, safe to log so both sides can compare keys. */
export function secretFingerprint(secret: string): string {
    return `fp ${sha256Hex(secret).slice(0, 8)}, len ${secret.length}`;
}

export type InboundCheck =
    | { ok: true; env: AwadocEnv }
    | { ok: false; reason: string; detail: Record<string, unknown> };

/**
 * Checks X-Signature / X-Timestamp on an inbound webhook against the production and test
 * secrets. Fails closed when no secret is configured.
 */
export function verifyInbound(rawBody: string, timestampHeader: string | null, signatureHeader: string | null): InboundCheck {
    const production = awadocEnvConfig("production").secrets;
    const test = awadocEnvConfig("test").secrets;
    const now = Math.floor(Date.now() / 1000);
    const ts = Number(timestampHeader);
    const received = (signatureHeader ?? "").trim().toLowerCase().replace(/^sha256=/, "");
    const detail = {
        timestamp: timestampHeader,
        skewSeconds: Number.isFinite(ts) ? now - ts : null,
        bodySha256: sha256Hex(rawBody),
        bodyLength: rawBody.length,
        receivedSignature: received.slice(0, 64),
        ourKeys: [
            ...production.map((s) => `production ${secretFingerprint(s)}`),
            ...test.map((s) => `test ${secretFingerprint(s)}`),
        ],
    };

    if (production.length === 0 && test.length === 0) {
        return { ok: false, reason: "AWADOC_SECRET_KEY is not set", detail };
    }
    if (!timestampHeader || !Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_SECONDS) {
        return { ok: false, reason: "timestamp missing or outside ±5 minutes", detail };
    }
    if (!/^[0-9a-f]{64}$/.test(received)) {
        return { ok: false, reason: "malformed signature header", detail };
    }

    const receivedBuf = Buffer.from(received, "hex");
    const matches = (secret: string) =>
        crypto.timingSafeEqual(Buffer.from(signBody(rawBody, timestampHeader, secret), "hex"), receivedBuf);
    if (production.some(matches)) return { ok: true, env: "production" };
    if (test.some(matches)) return { ok: true, env: "test" };
    return { ok: false, reason: "signature does not match our production or test key", detail };
}

export interface CallbackResult {
    ok: boolean;
    status?: number;
    responseText?: string;
    error?: string;
}

/**
 * POST one signed event to AwaDoc: {baseUrl}/api/partners/{partnerId}/callback.
 * The body is serialised once so the bytes signed are the bytes sent.
 */
export async function postCallback(env: AwadocEnv, body: unknown): Promise<CallbackResult> {
    const config = awadocEnvConfig(env);
    if (config.secrets.length === 0) return { ok: false, error: `No ${env} AwaDoc secret configured` };
    if (!config.partnerId) return { ok: false, error: "AWADOC_PARTNER_ID is not set" };

    const rawBody = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALLBACK_TIMEOUT_MS);
    try {
        const response = await fetch(`${config.baseUrl}/api/partners/${encodeURIComponent(config.partnerId)}/callback`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-timestamp": String(timestamp),
                "x-signature": signBody(rawBody, timestamp, config.secrets[0]),
            },
            body: rawBody,
            signal: controller.signal,
        });
        const responseText = (await response.text().catch(() => "")).slice(0, 1000);
        if (!response.ok) return { ok: false, status: response.status, responseText, error: `HTTP ${response.status}` };
        // AwaDoc answers 201 even when it couldn't use the event: the outcome is in the body
        // ({ success, data: { status: "acknowledged" | "unacknowledged", reason } })
        let parsed: any = null;
        try {
            parsed = JSON.parse(responseText);
        } catch {
            // not JSON: trust the HTTP status
        }
        const outcome = parsed?.data?.status ?? parsed?.status;
        if (parsed?.success === false || (typeof outcome === "string" && outcome !== "acknowledged")) {
            const reason = parsed?.data?.reason ?? parsed?.message ?? outcome;
            return { ok: false, status: response.status, responseText, error: `AwaDoc: ${outcome ?? "failed"}${reason && reason !== outcome ? ` (${reason})` : ""}` };
        }
        return { ok: true, status: response.status, responseText };
    } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        return { ok: false, error: aborted ? `Timed out after ${CALLBACK_TIMEOUT_MS / 1000}s` : err instanceof Error ? err.message : String(err) };
    } finally {
        clearTimeout(timer);
    }
}
