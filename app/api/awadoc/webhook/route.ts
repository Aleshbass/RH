/**
 * AwaDoc webhook (Platform → Provider), per AwaDoc's Therapy Provider Guide.
 *
 *   *.availability.query  → the visit types we offer and the price
 *   *.request             → confirmed / declined / reschedule_proposed
 *   *.confirmed           → paid: we auto-assign a physio (callbacks follow via the outbox)
 *   *.session.assigned    → AwaDoc confirmed a follow-up session
 *   *.scheduled           → AwaDoc set or changed the time
 *
 * "*" is therapy. AwaDoc still sends some events as consultation.*; those are read the same way,
 * and everything we answer or send is therapy.*. Every request must carry a valid X-Signature (production or test key) and is logged in awadocEventLog.
 * The business logic lives in convex/awadoc.ts.
 */

import crypto from "crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex-client";
import { convexServerSecret } from "@/lib/convex-server-secret";
import { verifyInbound } from "@/lib/awadoc/awadoc";

// Untyped: the generated api type is too deep for tsc to instantiate in route handlers
const convex = () => getConvexClient() as any;
const awadoc = (api as any).awadoc;

type Answer = { httpStatus?: number; body: Record<string, unknown> };

const str = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);

function logLater(entry: {
    eventId: string;
    eventType: string;
    payload: unknown;
    response?: unknown;
    ok: boolean;
    error?: string;
}) {
    after(async () => {
        try {
            await convex().mutation(awadoc.logEvent, {
                eventId: entry.eventId,
                eventType: entry.eventType || "unknown",
                direction: "inbound",
                payload: entry.payload ?? null,
                responsePayload: entry.response,
                status: entry.ok ? "success" : "error",
                errorMessage: entry.error,
                serverSecret: convexServerSecret(),
            });
        } catch (err) {
            console.error("[AwaDoc] Failed to log event:", err instanceof Error ? err.message : err);
        }
    });
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    let body: any;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "invalid_payload", message: "Body is not valid JSON" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
        return NextResponse.json({ error: "invalid_payload", message: "Body must be a JSON object" }, { status: 400 });
    }

    const eventId = str(request.headers.get("x-event-id")) ?? str(body.event_id) ?? `unknown-${Date.now()}`;
    const eventType = str(body.event_type) ?? str(body.event) ?? "";

    const check = verifyInbound(rawBody, request.headers.get("x-timestamp"), request.headers.get("x-signature"));
    if (!check.ok) {
        console.warn("[AwaDoc] Rejected webhook:", eventId, check.reason);
        // Prefixed so an unsigned request can never overwrite a genuine event's log row
        logLater({ eventId: `rejected:${eventId.slice(0, 120)}`, eventType, payload: { rejected: check.reason, ...check.detail }, ok: false, error: check.reason });
        return NextResponse.json({ error: "invalid_signature", message: "Signature verification failed" }, { status: 401 });
    }

    const [prefix, ...rest] = eventType.split(".");
    const action = rest.join(".");
    const serverSecret = convexServerSecret();
    const context = body.context ?? {};
    const meta = body.meta ?? {};

    let answer: Answer;
    try {
        switch (action) {
            case "availability.query":
                answer = {
                    body: await convex().query(awadoc.availability, {
                        serverSecret,
                        queryId: str(meta.query_id) ?? "",
                        preferredMode: str(context.schedule?.preferred_mode),
                        specialistType: str(context.specialist_type),
                    }),
                };
                break;

            case "request": {
                const requestId = str(meta.request_id) ?? str(body.request_id);
                if (!requestId) {
                    answer = { httpStatus: 400, body: { error: "invalid_payload", message: "meta.request_id missing" } };
                    break;
                }
                answer = await convex().mutation(awadoc.receiveRequest, {
                    serverSecret,
                    env: check.env,
                    newTherapyId: `thp-${crypto.randomBytes(6).toString("hex")}`,
                    newGuestToken: crypto.randomBytes(24).toString("base64url"),
                    eventId: str(body.event_id) ?? eventId,
                    requestId,
                    traceId: str(meta.trace_id),
                    userId: str(body.user?.id) ?? "unknown",
                    userName: str(body.user?.name) ?? "AwaDoc patient",
                    userPhone: str(body.user?.phone),
                    specialistType: str(context.specialist_type),
                    sessionType: str(context.session_type),
                    preferredMode: str(context.schedule?.preferred_mode),
                    preferredTime: str(context.schedule?.preferred_time),
                    preferredLang: str(context.schedule?.preferred_lang),
                    complaint: str(context.notes),
                    address: str(context.location?.address) ?? str(context.address),
                });
                break;
            }

            case "confirmed": {
                const therapy = context.therapy ?? context.consultation ?? {};
                const amount = Number(therapy.pricing?.amount);
                answer = await convex().mutation(awadoc.receiveConfirmed, {
                    serverSecret,
                    therapyId: str(therapy.id),
                    requestId: str(meta.request_id) ?? str(body.request_id),
                    preferredTime: str(therapy.schedule?.preferred_time),
                    amount: Number.isFinite(amount) ? amount : undefined,
                });
                break;
            }

            case "session.assigned":
                answer = await convex().mutation(awadoc.receiveSessionAssigned, {
                    serverSecret,
                    therapyId: str(body.therapy_id) ?? str(context.therapy?.id),
                    requestId: str(body.request_id) ?? str(meta.request_id),
                    therapistId: str(body.therapist?.id) ?? str(context.therapist?.id),
                });
                break;

            case "scheduled": {
                const therapy = context.therapy ?? context.consultation ?? {};
                answer = await convex().mutation(awadoc.receiveScheduled, {
                    serverSecret,
                    therapyId: str(therapy.id) ?? str(body.therapy_id),
                    requestId: str(meta.request_id) ?? str(body.request_id),
                    startTime: str(context.meeting?.start_time) ?? str(therapy.schedule?.preferred_time),
                    endTime: str(context.meeting?.end_time),
                });
                break;
            }

            default:
                answer = { body: { status: "ignored", message: `Event type not handled: ${eventType || "(none)"}` } };
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[AwaDoc] ${eventType} failed:`, message);
        logLater({ eventId, eventType, payload: body, ok: false, error: message.slice(0, 300) });
        return NextResponse.json({ error: "internal_error", message: "Could not process the event, please retry" }, { status: 500 });
    }

    const status = answer.httpStatus ?? 200;
    logLater({
        eventId: check.env === "test" ? `test:${eventId}` : eventId,
        eventType,
        payload: body,
        response: answer.body,
        ok: status < 400,
        error: status < 400 ? undefined : String(answer.body.message ?? answer.body.error ?? `HTTP ${status}`),
    });
    return NextResponse.json(answer.body, { status });
}
