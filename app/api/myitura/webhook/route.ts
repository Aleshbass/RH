/**
 * MyItura MediLoan webhook receiver.
 *
 * POST /api/myitura/webhook
 *
 * Register this URL in the MyItura dashboard (Api Key → webhook) for each environment, and put
 * that environment's signing secret (whsec_test_… / whsec_live_…) in MYITURA_WEBHOOK_SECRET.
 * Every delivery is verified (lib/myitura/webhook.ts): X-MyItura-Signature-V2 over
 * "<timestamp>.<raw body>", with the timestamp within five minutes. A ?token=… on the URL is
 * optional (checked against MYITURA_WEBHOOK_TOKEN when present). With no secret configured,
 * every request is refused.
 *
 * Register: https://physioaroundme.com/api/myitura/webhook
 *
 * Events and how they change our loan: convex/helpers/mediloanStatus.ts. On loan.disbursed the
 * invoice the loan pays for is marked paid (convex/mediloan.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex-client";
import { convexServerSecret } from "@/lib/convex-server-secret";
import { verifyMyIturaWebhook, webhookReferences } from "@/lib/myitura/webhook";

/**
 * The signature is what authenticates a delivery. A ?token=… on the URL is optional (older
 * registrations used one); when one is sent it must still be the right one.
 */
function tokenMatches(request: NextRequest): boolean {
    const token = process.env.MYITURA_WEBHOOK_TOKEN;
    const provided = request.nextUrl.searchParams.get("token") || request.headers.get("x-webhook-token") || "";
    if (!token || !provided) return true;
    const a = Buffer.from(token);
    const b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();

    const verification = verifyMyIturaWebhook({
        rawBody,
        headers: request.headers,
        secret: process.env.MYITURA_WEBHOOK_SECRET,
    });
    if (!verification.ok || !tokenMatches(request)) {
        const reason = verification.ok ? "bad_token" : verification.reason;
        if (reason === "not_configured") console.error("[MyItura Webhook] MYITURA_WEBHOOK_SECRET is not set; refusing all deliveries.");
        else console.warn(`[MyItura Webhook] Rejected delivery: ${reason}`);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, any>;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const refs = webhookReferences(body);
    const event = refs.event || request.headers.get("x-myitura-event") || "";
    const deliveryId = request.headers.get("x-myitura-delivery-id") || undefined;
    if (!refs.sdkReference && !refs.clientReference && !refs.loanId) {
        // Nothing to match it to; acknowledge so MyItura doesn't retry forever
        console.warn(`[MyItura Webhook] ${event} without a loan reference; ignored.`);
        return NextResponse.json({ received: true, ignored: "no_reference" });
    }

    try {
        const result = await getConvexClient().mutation(api.mediloan.applyMediLoanUpdate, {
            sdkReference: refs.sdkReference,
            clientReference: refs.clientReference,
            myituraLoanId: refs.loanId,
            event,
            deliveryId,
            amountApprovedKobo: refs.amountApprovedKobo,
            payload: rawBody,
            serverSecret: convexServerSecret(),
        });
        // References and statuses only: no patient details in the logs
        console.log(`[MyItura Webhook] ${event} (${verification.scheme}) → ${JSON.stringify(result)}`);
        return NextResponse.json({ received: true, ...result });
    } catch (error) {
        console.error(`[MyItura Webhook] Processing ${event} failed:`, (error as Error).message);
        // A 5xx makes MyItura retry with backoff
        return NextResponse.json({ error: "Internal processing error" }, { status: 500 });
    }
}

/** Lets MyItura (or us) check the endpoint is up. */
export async function GET() {
    return NextResponse.json({ status: "ok", service: "rehabify-myitura-webhook", timestamp: new Date().toISOString() });
}
