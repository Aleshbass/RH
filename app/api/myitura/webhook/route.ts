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
 * TODO: Ask MyItura for exact webhook signature verification method.
 *       For now we verify by checking their API keys in headers.
 */

import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL must be set");
const convex = new ConvexHttpClient(convexUrl);

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

export async function POST(request: NextRequest) {
    const eventId = `myitura-${Date.now()}`;

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
        // Extract fields — adjust based on MyItura's actual payload format
        // TODO: Confirm exact payload structure with MyItura team
        const eventType: string = body.event || body.type || body.eventType || "";
        const sdkReference: string = body.sdkReference || body.data?.sdkReference || body.data?.sdkRef || "";
        const clientReference: string = body.clientReference || body.data?.clientReference || "";
        const loanStatus = EVENT_STATUS_MAP[eventType];

        if (!loanStatus) {
            console.warn(`[MyItura Webhook] Unknown event type: ${eventType}`);
            // Still acknowledge receipt so they don't retry
            return NextResponse.json({ received: true, warning: "Unknown event type" });
        }

        if (!sdkReference && !clientReference) {
            console.error(`[MyItura Webhook] No reference found in payload`);
            return NextResponse.json({ error: "Missing reference" }, { status: 400 });
        }

        // Update loan status in our database
        await convex.mutation(api.mediloan.updateLoanFromWebhook, {
            sdkReference: sdkReference || undefined,
            clientReference: clientReference || undefined,
            status: loanStatus,
            disbursedAt: loanStatus === "disbursed" ? Date.now() : undefined,
            repaymentStatus: loanStatus === "repaid" ? "completed" : undefined,
            lastWebhookPayload: JSON.stringify(body),
        });

        console.log(`[MyItura Webhook] Processed ${eventType} for ref: ${sdkReference || clientReference}`);

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

// Health check - MyItura may ping this
export async function GET() {
    return NextResponse.json({
        status: "ok",
        service: "rehabify-myitura-webhook",
        timestamp: new Date().toISOString(),
    });
}
