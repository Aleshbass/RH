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
    let rawBody: string;

    try {
        rawBody = await request.text();
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const timestamp = timestampHeader ? parseInt(timestampHeader, 10) : 0;

    // ── Verify signature (use raw body string to avoid JSON re-serialization differences) ──
    const verification = verifyInboundSignature(rawBody, timestamp, signature);
    
    if (!verification.valid) {
        console.warn("[AwaDoc] Invalid signature for event:", eventId, verification.debug);
        await logEvent(eventId, body?.event_type ?? "unknown", "inbound", body, null, "error", "Signature verification failed");
        return NextResponse.json({ 
            error: "Invalid signature", 
            debug_info: verification.debug 
        }, { status: 401 });
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
    const rawServiceArea: string = body.context?.service_area ?? "ALL";
    // Treat placeholder / empty values as "ALL" so we don't filter on them
    const PLACEHOLDER_VALUES = ["string", "", "any", "all"];
    const serviceArea = PLACEHOLDER_VALUES.includes(rawServiceArea.toLowerCase().trim())
        ? "ALL"
        : rawServiceArea;
    const rawPreferredMode: string | null = body.context?.schedule?.preferred_mode ?? null;
    const preferredMode = rawPreferredMode && rawPreferredMode.toLowerCase() !== "any"
        ? rawPreferredMode
        : null;

    console.log("[AwaDoc] Availability query params:", { queryId, serviceArea, rawServiceArea, preferredMode, rawPreferredMode });

    // Fetch available physios from Convex
    const physios = await convex.query(api.awadoc.getAvailablePhysios, {
        serviceArea,
        preferredMode: preferredMode ?? undefined,
    });

    console.log(`[AwaDoc] Found ${physios.length} available physios`);

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

    // Get a suitable physio using weighted matching
    const physios = await convex.query(api.awadoc.getAvailablePhysios, {
        serviceArea: "ALL",
        preferredMode: preferredMode === "virtual" ? "virtual" : "physical",
    });

    const selectedPhysio = selectBestPhysio(physios);
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://physioaroundme.com";

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
        meeting: {
            mode: preferredMode,
            start_time: new Date(scheduledTime).toISOString(),
            end_time: new Date(endTime).toISOString(),
            duration: "01:00:00",
            link: `${appUrl}/video-call/${consultationId}`,
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

    // First verify the session exists before updating
    const existingSession = await convex.query(api.awadoc.getSessionByConsultationId, {
        consultationId,
    });

    if (!existingSession) {
        console.error("[AwaDoc] Session not found for confirmation", {
            consultationId,
            requestId,
        });
        return {
            status: "error",
            error: `Session not found for consultation: ${consultationId}`,
            acknowledged_at: new Date().toISOString(),
        };
    }

    // Update session to confirmed
    try {
        await convex.mutation(api.awadoc.updateSessionStatus, {
            consultationId,
            status: "confirmed",
            grossAmount: body.context?.consultation?.pricing?.amount
                ? Math.round(body.context.consultation.pricing.amount * 100) // Naira → kobo
                : undefined,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[AwaDoc] Failed to update session status:", {
            consultationId,
            requestId,
            error: message,
        });
        return {
            status: "error",
            error: `Failed to update session: ${message}`,
            acknowledged_at: new Date().toISOString(),
        };
    }

    // Send doctor_assigned callback to AwaDoc (async, don't block response)
    if (existingSession.physiotherapistId) {
        sendDoctorAssignedCallback(consultationId, existingSession).catch((err) =>
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
 * Select the best-matching physiotherapist using a weighted scoring approach.
 *
 * Weights:
 *  - Average rating:       50%
 *  - Years of experience:  30%
 *  - Competitive rate:     20% (lower rate scores higher for patient value)
 */
function selectBestPhysio(physios: any[]): any | null {
    if (!physios || physios.length === 0) return null;
    if (physios.length === 1) return physios[0];

    // Normalise values to 0-1 range for scoring
    const maxRate = Math.max(...physios.map((p) => p.hourlyRate ?? 0)) || 1;
    const maxExp = Math.max(...physios.map((p) => p.yearsOfExperience ?? 0)) || 1;

    const scored = physios.map((p) => {
        const ratingScore = (p.averageRating ?? 0) / 5;            // 0–1
        const expScore = (p.yearsOfExperience ?? 0) / maxExp;      // 0–1
        const rateScore = 1 - (p.hourlyRate ?? 0) / maxRate;       // 0–1 (lower = better)

        const total = ratingScore * 0.5 + expScore * 0.3 + rateScore * 0.2;
        return { physio: p, score: total };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].physio;
}

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
 * Also generates a guest access token for the AwaDoc patient to join the video call.
 */
async function sendDoctorAssignedCallback(consultationId: string, session: any) {
    // Fetch real physio details
    const doctor = await getPhysioDetails(session.physiotherapistId);

    // Generate a secure guest token for the patient to join the video call
    const guestToken = crypto.randomUUID();
    const guestTokenExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    let guestTokenStored = false;

    // Store the guest token on the session
    try {
        await convex.mutation(api.awadoc.setGuestToken, {
            consultationId,
            guestToken,
            guestTokenExpiresAt,
        });
        guestTokenStored = true;
    } catch (err) {
        console.error("[AwaDoc] Failed to store guest token — guest link will not be sent:", err);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://physioaroundme.com";
    // Guest meeting link — only include if token was persisted successfully
    const guestMeetingLink = (guestTokenStored && (session.mode ?? "virtual") === "virtual")
        ? `${appUrl}/video-call/${consultationId}/guest?guest=${guestToken}`
        : undefined;

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

    // Also send consultation.scheduled with the guest meeting link
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
                link: guestMeetingLink,
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
