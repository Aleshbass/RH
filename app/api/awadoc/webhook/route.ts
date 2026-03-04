/**
 * AwaDoc Webhook Endpoint
 *
 * Receives inbound events from AwaDoc:
 *  - consultation.availability.query  → return available physios
 *  - consultation.request             → confirm booking
 *  - consultation.confirmed           → acknowledge payment
 *
 * All requests are HMAC-verified. Every event is audit-logged.
 */

import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import crypto from "crypto";
import {
    verifyInboundSignature,
    sendCallbackEvent,
    AWADOC_SPECIALIST_TYPE,
    toAwadocAvailabilityMode,
    toDayString,
} from "@/lib/awadoc/awadoc";

// ── Convex client (validated) ───────────────────────────

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
    throw new Error("[AwaDoc] NEXT_PUBLIC_CONVEX_URL must be set");
}
const convex = new ConvexHttpClient(convexUrl);

// ── POST handler ────────────────────────────────────────

export async function POST(request: NextRequest) {
    const eventId = request.headers.get("x-event-id") ?? `unknown-${Date.now()}`;
    const timestampHeader = request.headers.get("x-timestamp");
    const signature = request.headers.get("x-signature") ?? "";

    let body: any;

    try {
        const rawBody = await request.text();
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const timestamp = timestampHeader ? parseInt(timestampHeader, 10) : 0;

    // ── Verify signature ──
    if (!verifyInboundSignature(body, timestamp, signature)) {
        console.warn("[AwaDoc] Invalid signature for event:", eventId);
        await logEvent(eventId, body?.event_type ?? "unknown", "inbound", body, null, "error", "Signature verification failed");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const eventType: string = body.event_type ?? "";
    console.log(`[AwaDoc] Received event: ${eventType} (${eventId})`);

    try {
        let response: Record<string, unknown>;

        switch (eventType) {
            case "consultation.availability.query":
                response = await handleAvailabilityQuery(body);
                break;
            case "consultation.request":
                response = await handleConsultationRequest(body);
                break;
            case "consultation.confirmed":
                response = await handleConsultationConfirmed(body);
                break;
            default:
                console.log(`[AwaDoc] Unhandled event type: ${eventType}`);
                response = { status: "ignored", message: `Unknown event type: ${eventType}` };
        }

        // Log success
        await logEvent(eventId, eventType, "inbound", body, response, "success");
        return NextResponse.json(response);
    } catch (err) {
        // Log full error details internally
        const message = err instanceof Error ? err.message : "Internal error";
        const stack = err instanceof Error ? err.stack : undefined;
        console.error(`[AwaDoc] Error handling ${eventType}:`, err);
        if (stack) console.error("[AwaDoc] Stack:", stack);
        await logEvent(eventId, eventType, "inbound", body, null, "error", message);
        // Return generic message to client — never leak internals
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// ── Event handlers ──────────────────────────────────────

/**
 * consultation.availability.query
 *
 * AwaDoc user is searching for available specialists in a service area.
 * We return our available physios formatted as AwaDoc specialists.
 */
async function handleAvailabilityQuery(body: any) {
    const queryId: string = body.meta?.query_id ?? "";
    const serviceArea: string = body.context?.service_area ?? "ALL";
    const preferredMode: string | null = body.context?.schedule?.preferred_mode ?? null;

    // Fetch available physios from Convex
    const physios = await convex.query(api.awadoc.getAvailablePhysios, {
        serviceArea,
        preferredMode: preferredMode ?? undefined,
    });

    // Map to AwaDoc specialist format
    const specialists = physios.map((p: any) => {
        const availabilityMode = toAwadocAvailabilityMode(
            p.offersOnlineSessions,
            p.offersInPersonSessions
        );

        // Build doctor_time from availability schedule if available
        const doctorTime = buildDoctorTime(p.availabilitySchedule);

        return {
            type: AWADOC_SPECIALIST_TYPE,
            name: `${p.firstName} ${p.lastName}`.trim() || "Physiotherapist",
            availability_mode: availabilityMode,
            scheduling_mode: "patient_choice" as const,
            pricing: {
                amount: p.hourlyRate / 100, // Convert from kobo to Naira
                currency: "NGN",
            },
            ...(doctorTime.length > 0 ? { doctor_time: doctorTime } : {}),
            // Extra metadata for our internal use
            _rehabify_user_id: p.userId,
            _rehabify_profile_id: p.profileId,
        };
    });

    return {
        status: "available",
        query_id: queryId,
        queried_at: new Date().toISOString(),
        specialists,
    };
}

/**
 * consultation.request
 *
 * AwaDoc user selected a physio and wants to book.
 * We create an awadocSession and respond with confirmation + pricing.
 */
async function handleConsultationRequest(body: any) {
    const requestId: string = body.meta?.request_id ?? "";
    const userId: string = body.user?.id ?? "";
    const userName: string = body.user?.name ?? "";
    const specialistType: string = body.context?.specialist_type ?? AWADOC_SPECIALIST_TYPE;
    const preferredMode: string = body.context?.schedule?.preferred_mode ?? "virtual";
    const preferredTime: string = body.context?.schedule?.preferred_time ?? "";
    const preferredLang: string = body.context?.schedule?.preferred_lang ?? "en";

    // Generate a unique consultation ID
    const consultationId = `cns-${crypto.randomUUID().slice(0, 8)}`;

    // Parse preferred time
    const scheduledTime = preferredTime ? new Date(preferredTime).getTime() : Date.now() + 3600000;
    const endTime = scheduledTime + 3600000; // 60 minute sessions

    // Get a suitable physio (first available for now — can be smarter later)
    const physios = await convex.query(api.awadoc.getAvailablePhysios, {
        serviceArea: "ALL",
        preferredMode: preferredMode === "virtual" ? "virtual" : "physical",
    });

    const selectedPhysio = physios[0]; // Simple selection for now
    const sessionRate = selectedPhysio?.hourlyRate ?? 1500000; // Default ₦15,000 in kobo

    // Create session record in Convex
    await convex.mutation(api.awadoc.createSession, {
        consultationId,
        requestId,
        eventId: body.event_id,
        awadocUserId: userId,
        awadocUserName: userName,
        status: "requested",
        mode: preferredMode === "virtual" ? "virtual" : "physical",
        specialistType,
        scheduledTime,
        endTime,
        preferredLang,
        grossAmount: sessionRate,
        currency: "NGN",
        physiotherapistId: selectedPhysio?.userId,
    });

    return {
        status: "confirmed",
        request_id: requestId,
        confirmed_at: new Date().toISOString(),
        consultation: {
            id: consultationId,
            schedule: {
                preferred_mode: preferredMode,
                preferred_time: new Date(scheduledTime).toISOString(),
                preferred_lang: preferredLang,
            },
            pricing: {
                amount: sessionRate / 100, // Convert kobo → Naira
                currency: "NGN",
            },
        },
    };
}

/**
 * consultation.confirmed
 *
 * Payment has been made on AwaDoc's side.
 * We acknowledge and update the session status, then send doctor_assigned callback.
 */
async function handleConsultationConfirmed(body: any) {
    const requestId: string = body.meta?.request_id ?? "";
    const consultationId: string = body.context?.consultation?.id ?? "";

    // Reject if consultationId is missing — don't silently acknowledge
    if (!consultationId) {
        console.warn("[AwaDoc] consultation.confirmed received without consultationId", {
            requestId,
            payload: body.context,
        });
        return {
            status: "error",
            error: "Missing consultation ID in payload",
            acknowledged_at: new Date().toISOString(),
        };
    }

    // Update session to confirmed
    await convex.mutation(api.awadoc.updateSessionStatus, {
        consultationId,
        status: "confirmed",
        grossAmount: body.context?.consultation?.pricing?.amount
            ? Math.round(body.context.consultation.pricing.amount * 100) // Naira → kobo
            : undefined,
    });

    // Retrieve the session to get physio details
    const session = await convex.query(api.awadoc.getSessionByConsultationId, {
        consultationId,
    });

    if (!session) {
        console.error("[AwaDoc] Session not found after confirmation", {
            consultationId,
            requestId,
        });
        return {
            status: "error",
            error: "Session not found after confirmation",
            acknowledged_at: new Date().toISOString(),
        };
    }

    // Send doctor_assigned callback to AwaDoc (async, don't block response)
    if (session.physiotherapistId) {
        sendDoctorAssignedCallback(consultationId, session).catch((err) =>
            console.error("[AwaDoc] Failed to send doctor_assigned callback:", err)
        );
    }

    return {
        status: "acknowledged",
        acknowledged_at: new Date().toISOString(),
    };
}

// ── Helpers ─────────────────────────────────────────────

/**
 * Build AwaDoc doctor_time array from our availability schedule.
 */
function buildDoctorTime(
    schedule: any
): Array<{ timezone: string; days: string[]; hours: { start: string; end: string } }> {
    if (!schedule || !Array.isArray(schedule)) return [];

    try {
        // Group schedule entries by time range
        const grouped: Record<string, { days: string[]; start: string; end: string }> = {};

        for (const slot of schedule) {
            const key = `${slot.startTime}-${slot.endTime}`;
            if (!grouped[key]) {
                grouped[key] = {
                    days: [],
                    start: slot.startTime ?? "09:00",
                    end: slot.endTime ?? "17:00",
                };
            }
            grouped[key].days.push(toDayString(slot.dayOfWeek ?? 1));
        }

        return Object.values(grouped).map((g) => ({
            timezone: "Africa/Lagos",
            days: g.days,
            hours: { start: g.start, end: g.end },
        }));
    } catch (err) {
        console.warn("[AwaDoc] Failed to parse availability schedule:", {
            error: err instanceof Error ? err.message : String(err),
            scheduleType: typeof schedule,
            scheduleLength: Array.isArray(schedule) ? schedule.length : "N/A",
        });
        return [];
    }
}

/**
 * Fetch real physiotherapist details for the doctor_assigned callback.
 */
async function getPhysioDetails(physiotherapistId: string) {
    // Validate Convex ID format (alphanumeric + common Convex ID chars) before casting
    if (!physiotherapistId || !/^[a-zA-Z0-9_-]+$/.test(physiotherapistId)) {
        console.warn("[AwaDoc] Invalid physiotherapist ID format, skipping lookup:", physiotherapistId);
        return { id: physiotherapistId, name: null, email: null };
    }

    try {
        const user = await convex.query(api.awadoc.getUserById, {
            userId: physiotherapistId as Id<"users">,
        });
        if (user) {
            return {
                id: physiotherapistId,
                name: `${user.firstName} ${user.lastName}`.trim() || null,
                email: user.email || null,
                avatar_url: user.imageUrl || undefined,
            };
        }
    } catch (err) {
        console.warn("[AwaDoc] Failed to fetch physio details:", {
            physiotherapistId,
            error: err instanceof Error ? err.message : String(err),
        });
    }
    return {
        id: physiotherapistId,
        name: null,
        email: null,
    };
}

/**
 * Send the consultation.doctor_assigned and consultation.scheduled callbacks to AwaDoc.
 */
async function sendDoctorAssignedCallback(consultationId: string, session: any) {
    // Fetch real physio details
    const doctor = await getPhysioDetails(session.physiotherapistId);

    await sendCallbackEvent("consultation.doctor_assigned", {
        context: {
            consultation: {
                id: consultationId,
                schedule: {
                    preferred_mode: session.mode ?? "virtual",
                    preferred_time: session.scheduledTime
                        ? new Date(session.scheduledTime).toISOString()
                        : undefined,
                },
                pricing: {
                    amount: session.grossAmount ? session.grossAmount / 100 : 0,
                    currency: session.currency ?? "NGN",
                },
            },
            doctor,
        },
    });

    // Also send consultation.scheduled
    await sendCallbackEvent("consultation.scheduled", {
        context: {
            consultation: {
                id: consultationId,
                schedule: {
                    preferred_mode: session.mode ?? "virtual",
                    preferred_time: session.scheduledTime
                        ? new Date(session.scheduledTime).toISOString()
                        : undefined,
                },
                pricing: {
                    amount: session.grossAmount ? session.grossAmount / 100 : 0,
                    currency: session.currency ?? "NGN",
                },
            },
            meeting: {
                mode: session.mode ?? "virtual",
                start_time: session.scheduledTime
                    ? new Date(session.scheduledTime).toISOString()
                    : undefined,
                end_time: session.endTime
                    ? new Date(session.endTime).toISOString()
                    : undefined,
                duration: "01:00:00",
                link: session.mode === "virtual"
                    ? `https://app.rehabifyhealth.com/call/${consultationId}`
                    : undefined,
            },
        },
    });

    // Log both outbound events
    await logEvent(
        `evt-rh-assigned-${consultationId}`,
        "consultation.doctor_assigned",
        "outbound",
        { consultationId },
        null,
        "success"
    );
    await logEvent(
        `evt-rh-scheduled-${consultationId}`,
        "consultation.scheduled",
        "outbound",
        { consultationId },
        null,
        "success"
    );
}

/**
 * Helper to log events to Convex.
 */
async function logEvent(
    eventId: string,
    eventType: string,
    direction: "inbound" | "outbound",
    payload: any,
    responsePayload: any,
    status: "success" | "error",
    errorMessage?: string
) {
    try {
        await convex.mutation(api.awadoc.logEvent, {
            eventId,
            eventType,
            direction,
            payload,
            responsePayload,
            status,
            errorMessage,
        });
    } catch (err) {
        console.error("[AwaDoc] Failed to log event:", err);
    }
}
