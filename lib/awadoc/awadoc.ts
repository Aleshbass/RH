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

export function getAwadocConfig() {
    return {
        apiKey: process.env.AWADOC_API_KEY ?? "",
        secretKey: process.env.AWADOC_SECRET_KEY ?? "",
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
 * Verify an inbound webhook signature from AwaDoc.
 *
 * Returns `true` if the signature matches AND the timestamp
 * is within ±5 minutes of the current server time.
 */
export function verifyInboundSignature(
    body: unknown,
    timestamp: number,
    signature: string
): boolean {
    const config = getAwadocConfig();

    // Clock-skew guard (±5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
        console.warn("[AwaDoc] Signature rejected: timestamp skew too large", {
            now,
            received: timestamp,
            diff: Math.abs(now - timestamp),
        });
        return false;
    }

    const expected = buildSignature(body, timestamp, config.secretKey);
    // Timing-safe comparison
    try {
        return crypto.timingSafeEqual(
            Buffer.from(expected, "hex"),
            Buffer.from(signature, "hex")
        );
    } catch {
        return false;
    }
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
 * The specialist_type slug we register with AwaDoc.
 * Update this once confirmed with the AwaDoc integrations team.
 */
export const AWADOC_SPECIALIST_TYPE = "physiotherapist";

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
