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
 * Security: We verify the incoming request by checking that MyItura sends
 * our public key in the X-API-Public-Key header. This ensures only MyItura
 * (who knows our public key) can trigger status updates.
 *
 * TODO: Ask MyItura if they support HMAC webhook signatures for an additional
 *       layer of security, and implement signature verification if so.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
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

/**
 * Validates that the incoming webhook request is genuinely from MyItura
 * by checking that the X-API-Public-Key header matches our configured key.
 */
function isAuthorizedWebhook(request: NextRequest): boolean {
    const expectedPublicKey = process.env.MYITURA_PUBLIC_KEY;
    if (!expectedPublicKey) {
        // If env var is missing, block all webhooks to prevent accidental open door
        console.error("[MyItura Webhook] MYITURA_PUBLIC_KEY env var is not set — rejecting all incoming webhooks.");
        return false;
    }

    const incomingPublicKey =
        request.headers.get("x-api-public-key") ||
        request.headers.get("X-API-Public-Key");
    if (!incomingPublicKey) return false;

    const expected = Buffer.from(expectedPublicKey);
    const received = Buffer.from(incomingPublicKey);
    return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function POST(request: NextRequest) {
    const convex = getConvexClient();

    // --- Security Check ---
    if (!isAuthorizedWebhook(request)) {
        console.warn("[MyItura Webhook] Unauthorized request — invalid or missing API key header.");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: any;
    try {
        const rawBody = await request.text();
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
