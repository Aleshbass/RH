/**
 * AwaDoc Integration — HMAC Security & HTTP Utilities
 *
 * Handles:
 *  - Verifying inbound webhook signatures from AwaDoc
 *  - Signing outbound callback payloads to AwaDoc
 *  - Sending callback events (doctor_assigned, scheduled)
 */

import crypto from "crypto";

// ── Config ──────────────────────────────────────────────

const VALID_ENVIRONMENTS = ["test", "production"] as const;
type AwadocEnvironment = (typeof VALID_ENVIRONMENTS)[number];

function parseEnvironment(value: string | undefined): AwadocEnvironment {
    if (value && VALID_ENVIRONMENTS.includes(value as AwadocEnvironment)) {
        return value as AwadocEnvironment;
    }
    return "test";
}

/**
 * AWADOC_SECRET_KEY may hold several comma-separated secrets so a key rotation can
 * overlap: inbound requests verify against any of them, outbound uses the first.
 * Values are trimmed — a pasted trailing newline would otherwise break every HMAC.
 */
function parseSecretKeys(value: string | undefined): string[] {
    return (value ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Non-reversible fingerprint of a secret, safe to log so both sides can confirm
 * they hold the same key without sharing it.
 */
export function secretFingerprint(secret: string): string {
    const fp = crypto.createHash("sha256").update(secret).digest("hex").slice(0, 8);
    return `fp ${fp}, len ${secret.length}`;
}

export function getAwadocConfig() {
    const secretKeys = parseSecretKeys(process.env.AWADOC_SECRET_KEY);
    return {
        apiKey: process.env.AWADOC_API_KEY ?? "",
        secretKey: secretKeys[0] ?? "",
        secretKeys,
        partnerId: process.env.AWADOC_PARTNER_ID ?? "69764afe2c6108f861514a29",
        baseUrl: process.env.AWADOC_BASE_URL ?? "https://partners-staging.awadoc.com",
        environment: parseEnvironment(process.env.AWADOC_ENVIRONMENT),
    };
}

// ── Signature helpers ───────────────────────────────────

/**
 * Build the HMAC SHA256 signature for a given body + timestamp.
 *
 * Canonical string:  sha256(JSON body) + "\n" + timestamp
 * Signed with the environment-specific secret key.
 */
export function buildSignature(
    body: unknown,
    timestamp: number,
    secret: string
): string {
    const bodyHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(body))
        .digest("hex");

    const canonical = `${bodyHash}\n${timestamp}`;

    return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

/**
 * Build the HMAC SHA256 signature from a raw body string + timestamp.
 *
 * Use this for INBOUND verification to avoid JSON parse/re-stringify
 * differences (whitespace, key ordering) that would break the hash.
 */
export function buildSignatureFromRaw(
    rawBody: string,
    timestamp: number,
    secret: string
): string {
    const bodyHash = crypto
        .createHash("sha256")
        .update(rawBody)
        .digest("hex");

    const canonical = `${bodyHash}\n${timestamp}`;

    return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

/**
 * Verify an inbound webhook signature from AwaDoc.
 *
 * Accepts the RAW body string to avoid JSON parse/re-stringify differences.
 * Returns `true` if the signature matches AND the timestamp
 * is within ±5 minutes of the current server time.
 */
export interface SignatureVerificationResult {
    valid: boolean;
    debug?: {
        rawBodyLength: number;
        rawBodyPreview: string;
        bodyHash: string;
        timestamp: number;
        receivedSignature: string;
        error?: string;
    };
}

export function verifyInboundSignature(
    rawBody: string,
    timestamp: number,
    signature: string
): SignatureVerificationResult {
    const config = getAwadocConfig();

    const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");
    // Diagnostics for server logs only. Never include the expected signature: anyone who
    // saw it could replay the request with a valid signature.
    const debug = {
        rawBodyLength: rawBody.length,
        rawBodyPreview: rawBody.substring(0, 200),
        bodyHash,
        timestamp,
        receivedSignature: signature,
    };

    // Fail closed: an empty key would make every signature forgeable
    if (!config.secretKey) {
        console.error("[AwaDoc] AWADOC_SECRET_KEY is not set — rejecting inbound webhook");
        return { valid: false, debug: { ...debug, error: "webhook secret not configured" } };
    }

    // Clock-skew guard (±5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > 300) {
        console.warn("[AwaDoc] Signature rejected: timestamp skew too large", {
            now,
            received: timestamp,
            diff: Math.abs(now - timestamp),
        });
        return { valid: false, debug: { ...debug, error: "timestamp skew too large" } };
    }

    // Tolerate an optional "sha256=" prefix and upper-case hex
    const received = signature.trim().toLowerCase().replace(/^sha256=/, "");
    if (!/^[0-9a-f]{64}$/.test(received)) {
        return {
            valid: false,
            debug: { ...debug, error: `malformed signature header (length ${signature.length})` },
        };
    }
    const receivedBuf = Buffer.from(received, "hex");

    // Timing-safe comparison against each configured secret (supports key rotation)
    for (const secret of config.secretKeys) {
        const expected = Buffer.from(buildSignatureFromRaw(rawBody, timestamp, secret), "hex");
        if (crypto.timingSafeEqual(expected, receivedBuf)) {
            return { valid: true, debug };
        }
    }

    const keys = config.secretKeys.map(secretFingerprint).join("; ");
    return { valid: false, debug: { ...debug, error: `signature mismatch (our key: ${keys})` } };
}

// ── TEMPORARY: signature diagnostics ────────────────────
// Remove once AwaDoc signatures verify in production (Oct 2026).

const sha256Hex = (input: string) => crypto.createHash("sha256").update(input).digest("hex");

/** Headers that must never be stored, even in a diagnostic log. */
const UNLOGGED_HEADERS = new Set(["cookie", "authorization", "proxy-authorization"]);

export interface SignatureDiagnostics {
    receivedAt: string;
    serverUnixSeconds: number;
    timestampHeader: string | null;
    timestampSkewSeconds: number | null;
    receivedSignature: string;
    headers: Array<{ name: string; value: string }>;
    rawBodyLength: number;
    rawBody: string;
    rawBodyTruncated: boolean;
    bodySha256: string;
    /** sha256 of the body re-serialised as compact JSON, to spot formatting differences */
    compactJsonSha256: string | null;
    prettyJsonSha256: string | null;
    keys: Array<{ label: string; fingerprint: string }>;
    /** Which (canonical string, key, encoding) combinations reproduce the received signature */
    matchingVariants: string[];
    variantsTried: number;
}

/**
 * Explain why an inbound signature failed, for the admin AwaDoc dashboard.
 * Never records the secret or any signature we computed: only whether a
 * candidate scheme reproduces the one AwaDoc sent.
 */
export function diagnoseInboundSignature(
    rawBody: string,
    timestampHeader: string | null,
    signature: string,
    headers: Headers
): SignatureDiagnostics {
    const config = getAwadocConfig();
    const now = Math.floor(Date.now() / 1000);
    const ts = timestampHeader ?? "";
    const tsNum = Number(timestampHeader);

    let compact: string | null = null;
    let pretty: string | null = null;
    try {
        const parsed = JSON.parse(rawBody);
        compact = JSON.stringify(parsed);
        pretty = JSON.stringify(parsed, null, 2);
    } catch {
        // Not JSON — leave the re-serialised hashes empty
    }

    const bodyHash = sha256Hex(rawBody);
    const compactHash = compact === null ? null : sha256Hex(compact);

    const canonicals: Array<[string, string]> = [
        ["sha256(body)+\\n+ts (ours)", `${bodyHash}\n${ts}`],
        ["sha256(body)+ts", `${bodyHash}${ts}`],
        ["sha256(body)+.+ts", `${bodyHash}.${ts}`],
        ["ts+\\n+sha256(body)", `${ts}\n${bodyHash}`],
        ["ts+.+sha256(body)", `${ts}.${bodyHash}`],
        ["sha256(body)", bodyHash],
        ["body", rawBody],
        ["ts+.+body", `${ts}.${rawBody}`],
        ["ts+body", `${ts}${rawBody}`],
        ["body+ts", `${rawBody}${ts}`],
        ["ts+\\n+body", `${ts}\n${rawBody}`],
    ];
    if (compact !== null && compactHash !== null && compact !== rawBody) {
        canonicals.push(
            ["sha256(compactJson)+\\n+ts", `${compactHash}\n${ts}`],
            ["compactJson", compact],
            ["ts+.+compactJson", `${ts}.${compact}`]
        );
    }

    const keys: Array<{ label: string; value: string }> = config.secretKeys.map((value, i) => ({
        label: `AWADOC_SECRET_KEY[${i}]`,
        value,
    }));
    if (config.apiKey) keys.push({ label: "AWADOC_API_KEY", value: config.apiKey });

    const received = signature.trim().replace(/^sha256=/i, "");
    const matchingVariants: string[] = [];
    for (const [name, canonical] of canonicals) {
        for (const key of keys) {
            const mac = crypto.createHmac("sha256", key.value).update(canonical).digest();
            if (received.toLowerCase() === mac.toString("hex")) matchingVariants.push(`${name} | ${key.label} | hex`);
            if (received === mac.toString("base64")) matchingVariants.push(`${name} | ${key.label} | base64`);
        }
    }

    const headerList: Array<{ name: string; value: string }> = [];
    headers.forEach((value, name) => {
        if (!UNLOGGED_HEADERS.has(name.toLowerCase())) headerList.push({ name, value });
    });

    const MAX_BODY = 20_000;
    return {
        receivedAt: new Date().toISOString(),
        serverUnixSeconds: now,
        timestampHeader,
        timestampSkewSeconds: Number.isFinite(tsNum) && timestampHeader ? now - tsNum : null,
        receivedSignature: signature,
        headers: headerList,
        rawBodyLength: rawBody.length,
        rawBody: rawBody.slice(0, MAX_BODY),
        rawBodyTruncated: rawBody.length > MAX_BODY,
        bodySha256: bodyHash,
        compactJsonSha256: compactHash,
        prettyJsonSha256: pretty === null ? null : sha256Hex(pretty),
        keys: keys.map((k) => ({ label: k.label, fingerprint: secretFingerprint(k.value) })),
        matchingVariants,
        variantsTried: canonicals.length * keys.length,
    };
}

/**
 * Sign an outbound payload before sending to AwaDoc's callback endpoint.
 */
export function signOutboundPayload(
    body: unknown,
    timestamp: number
): string {
    const config = getAwadocConfig();
    return buildSignature(body, timestamp, config.secretKey);
}

// ── Outbound HTTP ───────────────────────────────────────

/** Default timeout for outbound requests (15 seconds). */
const DEFAULT_TIMEOUT_MS = 15_000;

export interface AwadocCallbackResult {
    success: boolean;
    status?: number;
    data?: unknown;
    error?: string;
}

/**
 * Send a signed callback event to AwaDoc.
 *
 * Endpoint: POST {baseUrl}/api/partners/{partnerId}/callback
 */
export async function sendCallbackEvent(
    eventType: string,
    payload: Record<string, unknown>
): Promise<AwadocCallbackResult> {
    const config = getAwadocConfig();
    const url = `${config.baseUrl}/api/partners/${config.partnerId}/callback`;

    const timestamp = Math.floor(Date.now() / 1000);

    // Spread payload first, then override core fields so they cannot be spoofed
    const { event_id: _eid, event_type: _et, timestamp: _ts, ...safePayload } = payload;
    const body = {
        event_id: `evt-rh-${crypto.randomUUID()}`,
        event_type: eventType,
        timestamp: new Date().toISOString(),
        ...safePayload,
    };

    const signature = signOutboundPayload(body, timestamp);

    // Set up abort controller for timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-timestamp": String(timestamp),
                "x-signature": signature,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        clearTimeout(timer);

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            console.error("[AwaDoc] Callback failed:", {
                status: response.status,
                eventType,
                data,
            });
            return {
                success: false,
                status: response.status,
                error: `HTTP ${response.status}`,
                data,
            };
        }

        console.log("[AwaDoc] Callback sent:", { eventType, status: response.status });
        return { success: true, status: response.status, data };
    } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === "AbortError") {
            console.error("[AwaDoc] Callback timed out:", { eventType, timeoutMs: DEFAULT_TIMEOUT_MS });
            return { success: false, error: `Request timed out after ${DEFAULT_TIMEOUT_MS}ms` };
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[AwaDoc] Callback error:", message);
        return { success: false, error: message };
    }
}

// ── Specialist type mapping ─────────────────────────────

/**
 * Allowed specialist types for AwaDoc marketplace integration.
 * AwaDoc accepts: physiotherapist, occupational-therapist, speech-therapist.
 */
export const AWADOC_SPECIALIST_TYPES = [
    "physiotherapist",
    "occupational-therapist",
    "speech-therapist",
] as const;

export type AwadocSpecialistType = (typeof AWADOC_SPECIALIST_TYPES)[number];

export const DEFAULT_AWADOC_SPECIALIST_TYPE: AwadocSpecialistType = "physiotherapist";

/**
 * Default specialist_type slug registered with AwaDoc.
 * Defaults to "physiotherapist" (one of the 3 supported types).
 */
export const AWADOC_SPECIALIST_TYPE: AwadocSpecialistType = "physiotherapist";

/**
 * Validates and normalizes an incoming specialist type string to one of the 3 supported AwaDoc types:
 * - "physiotherapist"
 * - "occupational-therapist"
 * - "speech-therapist"
 * Returns null if the type cannot be mapped.
 */
export function normalizeAwadocSpecialistType(raw?: string | null): AwadocSpecialistType | null {
    if (!raw || typeof raw !== "string") return null;
    const clean = raw.toLowerCase().trim().replace(/[_\s]+/g, "-");

    if (
        clean === "physiotherapist" ||
        clean === "physiotherapy" ||
        clean === "physical-therapist" ||
        clean === "physical-therapy" ||
        clean === "pt"
    ) {
        return "physiotherapist";
    }
    if (
        clean === "occupational-therapist" ||
        clean === "occupational-therapy" ||
        clean === "occupational" ||
        clean === "ot"
    ) {
        return "occupational-therapist";
    }
    if (
        clean === "speech-therapist" ||
        clean === "speech-therapy" ||
        clean === "speech-and-language-therapist" ||
        clean === "speech-language-pathologist" ||
        clean === "speech" ||
        clean === "slt" ||
        clean === "slp"
    ) {
        return "speech-therapist";
    }
    return null;
}

/**
 * Maps a therapist's profile specializations to one of the 3 supported AwaDoc types.
 * Strictly guarantees returning: "physiotherapist" | "occupational-therapist" | "speech-therapist".
 */
export function mapToAwadocSpecialistType(specializations?: string[] | null): AwadocSpecialistType {
    if (!specializations || !Array.isArray(specializations) || specializations.length === 0) {
        return "physiotherapist";
    }

    const joined = specializations.join(" ").toLowerCase();
    if (joined.includes("speech") || joined.includes("language path")) {
        return "speech-therapist";
    }
    if (joined.includes("occupational")) {
        return "occupational-therapist";
    }
    return "physiotherapist";
}

/**
 * Map Rehabify session modes to AwaDoc availability_mode values.
 */
export function toAwadocAvailabilityMode(
    offersOnline: boolean,
    offersInPerson: boolean
): "virtual" | "physical" | "both" {
    if (offersOnline && offersInPerson) return "both";
    if (offersOnline) return "virtual";
    return "physical";
}

/**
 * Map day-of-week number (0=Sun … 6=Sat) to AwaDoc day string.
 * Throws RangeError for invalid inputs instead of silently defaulting.
 */
const DAY_MAP: Record<number, string> = {
    0: "SUN",
    1: "MON",
    2: "TUE",
    3: "WED",
    4: "THU",
    5: "FRI",
    6: "SAT",
};

export function toDayString(dayOfWeek: number): string {
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        throw new RangeError(`Invalid dayOfWeek: ${dayOfWeek}. Expected 0-6.`);
    }
    return DAY_MAP[dayOfWeek];
}
