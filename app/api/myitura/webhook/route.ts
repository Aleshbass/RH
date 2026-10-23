/**
 * MyItura MediLoan webhook receiver.
 *
 * POST /api/myitura/webhook
 *
 * Two ways to trust a delivery:
 *  - With MYITURA_WEBHOOK_SECRET (the whsec_test_… / whsec_live_… signing secret from the
 *    MyItura dashboard, Api Key): X-MyItura-Signature-V2 over "<timestamp>.<raw body>", within
 *    five minutes (lib/myitura/webhook.ts), and the event is applied as sent.
 *  - Without it: the delivery is only a nudge. We fetch the loan from MyItura's API with our
 *    own keys and apply the status MyItura reports, so a forged request can't change anything.
 * A ?token=… on the URL is optional (checked against MYITURA_WEBHOOK_TOKEN when present).
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
import { MyIturaError, findMediLoansByClientReference, getMediLoan, mediLoanId, type MediLoanRecord } from "@/lib/myitura/myitura";

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
    const secret = process.env.MYITURA_WEBHOOK_SECRET;

    let body: Record<string, any>;
    const parse = () => {
        try {
            body = JSON.parse(rawBody);
            return true;
        } catch {
            return false;
        }
    };

    if (!secret) {
        // No signing secret on file: the delivery is only a nudge. We read the loan's real
        // status from MyItura's API with our own keys, so a forged request can't change anything.
        if (!tokenMatches(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!parse()) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        return applyByLookup(webhookReferences(body!), request.headers.get("x-myitura-event") || "");
    }

    const verification = verifyMyIturaWebhook({ rawBody, headers: request.headers, secret });
    if (!verification.ok || !tokenMatches(request)) {
        console.warn(`[MyItura Webhook] Rejected delivery: ${verification.ok ? "bad_token" : verification.reason}`);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!parse()) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const refs = webhookReferences(body!);
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

/**
 * Unsigned mode: look the loan up at MyItura and apply the status MyItura reports. Only
 * references from MyItura's own record are used to find our loan, never the request's.
 */
async function applyByLookup(refs: ReturnType<typeof webhookReferences>, headerEvent: string) {
    const event = refs.event || headerEvent;
    try {
        let record: MediLoanRecord | null = null;
        if (refs.loanId) {
            record = await getMediLoan(refs.loanId).catch((error) => {
                if (error instanceof MyIturaError && error.httpStatus === 404) return null;
                throw error;
            });
        }
        if (!record && refs.clientReference) {
            const matches = await findMediLoansByClientReference(refs.clientReference);
            record = matches.find((m) => m.clientReference === refs.clientReference) ?? null;
        }
        const clientReference = typeof record?.clientReference === "string" ? record.clientReference : undefined;
        const sdkReference = typeof record?.sdkReference === "string" ? record.sdkReference : undefined;
        if (!record || (!clientReference && !sdkReference)) {
            // Usually loan.initiated: the patient hasn't applied, so MyItura has no loan yet
            console.log(`[MyItura Webhook] ${event} (lookup) → no loan at MyItura yet`);
            return NextResponse.json({ received: true, verified: "lookup", result: "no_loan_yet" });
        }
        const result = await getConvexClient().mutation(api.mediloan.applyMediLoanUpdate, {
            clientReference,
            sdkReference,
            myituraLoanId: mediLoanId(record),
            myituraStatus: typeof record.status === "string" ? record.status : undefined,
            amountApprovedKobo: typeof record.amountApproved === "number" ? record.amountApproved : undefined,
            serverSecret: convexServerSecret(),
        });
        console.log(`[MyItura Webhook] ${event} (lookup: ${record.status}) → ${JSON.stringify(result)}`);
        return NextResponse.json({ received: true, verified: "lookup", ...result });
    } catch (error) {
        console.error(`[MyItura Webhook] Lookup for ${event} failed:`, (error as Error).message);
        // MyItura's own error (status, code, message) helps fix configuration; it holds no secrets
        const detail =
            error instanceof MyIturaError
                ? { source: "myitura", httpStatus: error.httpStatus, code: error.code ?? null, message: error.message }
                : { source: "server", message: (error as Error).message?.split("\n")[0]?.slice(0, 200) ?? "unknown" };
        return NextResponse.json({ error: "Internal processing error", detail }, { status: 500 });
    }
}

/** Lets MyItura (or us) check the endpoint is up. */
export async function GET() {
    return NextResponse.json({ status: "ok", service: "rehabify-myitura-webhook", timestamp: new Date().toISOString() });
}
