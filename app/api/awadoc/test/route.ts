/**
 * AwaDoc Test API — Simulate Webhook Events
 *
 * Server-side route that creates properly signed payloads and
 * sends them to our own webhook endpoint for testing.
 *
 * Only available in test/development environments.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { buildSignature, getAwadocConfig } from "@/lib/awadoc/awadoc";

export async function POST(request: NextRequest) {
    const config = getAwadocConfig();

    // Block in production unless explicitly allowed
    if (config.environment === "production") {
        return NextResponse.json(
            { error: "Test endpoint disabled in production" },
            { status: 403 }
        );
    }

    let input: { eventType: string; consultationId?: string };
    try {
        input = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { eventType, consultationId } = input;

    // Build test payload for the given event type
    const eventId = `test-${crypto.randomUUID().slice(0, 8)}`;
    const testConsultationId = consultationId ?? `cns-test-${crypto.randomUUID().slice(0, 6)}`;
    let payload: Record<string, unknown>;

    switch (eventType) {
        case "consultation.availability.query":
            payload = {
                event_id: eventId,
                event_type: eventType,
                timestamp: new Date().toISOString(),
                meta: { query_id: `qry-test-${Date.now()}` },
                context: {
                    service_area: "ALL",
                    schedule: {
                        preferred_mode: "virtual",
                    },
                },
            };
            break;

        case "consultation.request":
            payload = {
                event_id: eventId,
                event_type: eventType,
                timestamp: new Date().toISOString(),
                meta: { request_id: `req-test-${Date.now()}` },
                user: {
                    id: "awadoc-test-user",
                    name: "Test Patient (AwaDoc)",
                },
                context: {
                    specialist_type: "physiotherapist",
                    schedule: {
                        preferred_mode: "virtual",
                        preferred_time: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
                        preferred_lang: "en",
                    },
                },
            };
            break;

        case "consultation.confirmed":
            payload = {
                event_id: eventId,
                event_type: eventType,
                timestamp: new Date().toISOString(),
                meta: { request_id: `req-test-${Date.now()}` },
                context: {
                    consultation: {
                        id: testConsultationId,
                        pricing: {
                            amount: 15000, // ₦15,000
                            currency: "NGN",
                        },
                    },
                },
            };
            break;

        default:
            return NextResponse.json(
                { error: `Unknown event type: ${eventType}` },
                { status: 400 }
            );
    }

    // Sign the payload with HMAC just like AwaDoc would
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = buildSignature(payload, timestamp, config.secretKey);

    // Determine our own webhook URL from the incoming request's origin
    // This ensures it works in any environment (localhost, Vercel preview, production)
    const requestUrl = new URL(request.url);
    const appUrl = `${requestUrl.protocol}//${requestUrl.host}`;
    const webhookUrl = `${appUrl}/api/awadoc/webhook`;

    try {
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-event-id": eventId,
                "x-timestamp": String(timestamp),
                "x-signature": signature,
            },
            body: JSON.stringify(payload),
        });

        const responseData = await res.json().catch(() => null);

        return NextResponse.json({
            success: res.ok,
            status: res.status,
            eventId,
            eventType,
            payload,
            response: responseData,
        });
    } catch (err) {
        return NextResponse.json(
            {
                success: false,
                error: err instanceof Error ? err.message : "Failed to call webhook",
                eventId,
                eventType,
                payload,
            },
            { status: 500 }
        );
    }
}
