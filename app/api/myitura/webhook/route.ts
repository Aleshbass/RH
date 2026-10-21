/**
 * MyItura MediLoan — Webhook Receiver
 *
 * POST /api/myitura/webhook
 *
 * Receives status updates from MyItura about loan applications:
 *  - loan.approved    → Patient's loan was approved
 *  - loan.declined    → Patient's loan was denied
 *  - loan.disbursed   → Funds released to Rehabify
 *  - loan.expired     → Application window lapsed
 *  - loan.repaid      → Patient fully repaid
 *
 * Security (all configured checks must pass; with neither secret set, every request is refused):
 *  - MYITURA_WEBHOOK_TOKEN: a long random secret in the webhook URL registered with MyItura
 *    (https://physioaroundme.com/api/myitura/webhook?token=…) or an X-Webhook-Token header.
 *    The public key alone is not a secret, so it can't authenticate a webhook.
 *  - MYITURA_WEBHOOK_SECRET: when MyItura issues a signing secret, the HMAC of the raw body
 *    (hex SHA-256 or SHA-512, optional "sha256=" prefix) in X-MyItura-Signature / X-Signature.
 *  - The X-API-Public-Key header must still match MYITURA_PUBLIC_KEY.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex-client";
import { convexServerSecret } from "@/lib/convex-server-secret";

// Map MyItura event types to our internal statuses
const EVENT_STATUS_MAP: Record<string, string> = {
    "loan.approved": "approved",
    "loan.declined": "declined",
    "loan.disbursed": "disbursed",
    "loan.expired": "expired",
    "loan.repaid": "repaid",
    "loan.pending": "pending",
    "loan.failed": "failed",
};

function safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
}

/** Whether the HMAC header matches the raw body (SHA-256 or SHA-512, hex). */
function hasValidSignature(request: NextRequest, rawBody: string, secret: string): boolean {
    const header = (request.headers.get("x-myitura-signature") || request.headers.get("x-signature") || "").trim();
    if (!header) return false;
    const signature = header.replace(/^sha(256|512)=/i, "").toLowerCase();
    const algorithm = signature.length === 128 ? "sha512" : "sha256";
    const expected = createHmac(algorithm, secret).update(rawBody, "utf8").digest("hex");
    return safeEqual(expected, signature);
}

/**
 * Validates that the incoming webhook request is genuinely from MyItura (see the security notes
 * above). Fails closed: a missing configuration rejects every request.
 */
function isAuthorizedWebhook(request: NextRequest, rawBody: string): boolean {
    const expectedPublicKey = process.env.MYITURA_PUBLIC_KEY;
    const token = process.env.MYITURA_WEBHOOK_TOKEN;
    const signingSecret = process.env.MYITURA_WEBHOOK_SECRET;
    if (!expectedPublicKey || (!token && !signingSecret)) {
        console.error("[MyItura Webhook] Set MYITURA_PUBLIC_KEY and MYITURA_WEBHOOK_TOKEN (or MYITURA_WEBHOOK_SECRET) — rejecting all incoming webhooks.");
        return false;
    }

    const incomingPublicKey = request.headers.get("x-api-public-key") || "";
    if (!safeEqual(expectedPublicKey, incomingPublicKey)) return false;

    if (token) {
        const incomingToken = request.nextUrl.searchParams.get("token") || request.headers.get("x-webhook-token") || "";
        if (!safeEqual(token, incomingToken)) return false;
    }
    if (signingSecret && !hasValidSignature(request, rawBody, signingSecret)) return false;
    return true;
}

export async function POST(request: NextRequest) {
    const convex = getConvexClient();

    // --- Security Check (needs the raw body for the signature) ---
    const rawBody = await request.text();
    if (!isAuthorizedWebhook(request, rawBody)) {
        console.warn("[MyItura Webhook] Unauthorized request — token, signature or API key header did not match.");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: any;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Log only non-sensitive fields to avoid PII exposure
    console.log(`[MyItura Webhook] Event received:`, {
        event: body.event || body.type || body.eventType,
        sdkReference: body.sdkReference || body.data?.sdkReference,
        clientReference: body.clientReference || body.data?.clientReference,
    });

    try {
        // Extract fields — normalized from common MyItura payload shapes
        const eventType: string = body.event || body.type || body.eventType || "";
        const sdkReference: string =
            body.sdkReference || body.data?.sdkReference || body.data?.sdkRef || "";
        const clientReference: string =
            body.clientReference || body.data?.clientReference || "";
        const loanStatus = EVENT_STATUS_MAP[eventType];

        if (!loanStatus) {
            console.warn(`[MyItura Webhook] Unknown event type: "${eventType}" — acknowledged without action.`);
            // Still return 200 so MyItura doesn't endlessly retry unknown events
            return NextResponse.json({ received: true, warning: `Unknown event type: ${eventType}` });
        }

        if (!sdkReference && !clientReference) {
            console.error(`[MyItura Webhook] No reference found in payload`);
            return NextResponse.json({ error: "Missing sdkReference or clientReference" }, { status: 400 });
        }

        // Update loan status in our database
        await convex.mutation(api.mediloan.updateLoanFromWebhook, {
            sdkReference: sdkReference || undefined,
            clientReference: clientReference || undefined,
            status: loanStatus,
            disbursedAt: loanStatus === "disbursed" ? Date.now() : undefined,
            repaymentStatus: loanStatus === "repaid" ? "completed" : undefined,
            lastWebhookPayload: JSON.stringify(body),
            serverSecret: convexServerSecret(),
        });

        console.log(
            `[MyItura Webhook] ✅ Processed "${eventType}" → status "${loanStatus}" for ref: ${sdkReference || clientReference}`
        );

        return NextResponse.json({
            received: true,
            eventType,
            status: loanStatus,
        });
    } catch (error: any) {
        console.error(`[MyItura Webhook] Processing error:`, error);
        return NextResponse.json(
            { error: "Internal processing error" },
            { status: 500 }
        );
    }
}

// Health check — MyItura may ping this to verify the endpoint is live
export async function GET() {
    return NextResponse.json({
        status: "ok",
        service: "rehabify-myitura-webhook",
        timestamp: new Date().toISOString(),
    });
}
