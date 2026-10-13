/**
 * AwaDoc Webhook Endpoint
 *
 * Receives inbound events from AwaDoc:
 *  - therapy.availability.query  → return available physios
 *  - therapy.request             → confirm booking
 *  - therapy.confirmed           → acknowledge payment
 *  - therapy.session.assigned    → follow-up therapist assignment
 *
 * All requests are HMAC-verified. Every event is audit-logged.
 */

import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-client";
import { convexServerSecret } from "@/lib/convex-server-secret";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import crypto from "crypto";
import {
    verifyInboundSignature,
    sendCallbackEvent,
    AWADOC_SPECIALIST_TYPE,
    AWADOC_SPECIALIST_TYPES,
    AwadocSpecialistType,
    DEFAULT_AWADOC_SPECIALIST_TYPE,
    normalizeAwadocSpecialistType,
    mapToAwadocSpecialistType,
    toAwadocAvailabilityMode,
    toDayString,
} from "@/lib/awadoc/awadoc";

const convex = {
    query: (...args: any[]) => (getConvexClient().query as any)(...args),
    mutation: (...args: any[]) => (getConvexClient().mutation as any)(...args),
    action: (...args: any[]) => (getConvexClient().action as any)(...args),
};

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
    const eventType: string = body.event_type ?? "";

    // ── Verify signature (use raw body string to avoid JSON re-serialization differences) ──
    try {
        const verification = verifyInboundSignature(rawBody, timestamp, signature);

        if (!verification.valid) {
            // Never echo verification details to the caller: they would let anyone forge a signature.
            console.warn("[AwaDoc] Invalid signature for event:", eventId, verification.debug);
            // Record the rejection without storing the unverified body. Prefixed id so an
            // unverified request cannot overwrite the log entry of a genuine event.
            await logEvent(
                `rejected:${eventId.slice(0, 120)}`,
                String(body?.event_type ?? "unknown").slice(0, 120),
                "inbound",
                { rejected: "invalid signature", bodyLength: rawBody.length },
                null,
                "error",
                verification.debug?.error ?? "Signature verification failed"
            );
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }
    } catch (sigErr) {
        console.error("[AwaDoc] Signature verification threw:", sigErr);
        return NextResponse.json(
            { error: "Signature verification error", event_type: eventType },
            { status: 401 }
        );
    }

    console.log(`[AwaDoc] Received event: ${eventType} (${eventId})`);

    try {
        let response: Record<string, unknown>;

        switch (eventType) {
            case "therapy.availability.query":
            case "consultation.availability.query":
                response = await handleAvailabilityQuery(body);
                break;
            case "therapy.request":
            case "consultation.request":
                response = await handleTherapyRequest(body);
                break;
            case "therapy.confirmed":
            case "consultation.confirmed":
                response = await handleTherapyConfirmed(body);
                break;
            case "therapy.session.assigned":
            case "consultation.session.assigned":
                response = await handleSessionAssigned(body);
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
        console.error(`[AwaDoc] Error handling ${eventType}:`, {
            eventId,
            error: message,
            stack,
            bodyKeys: body ? Object.keys(body) : [],
        });

        await logEvent(eventId, eventType, "inbound", body, null, "error", message);

        // Return the event_type so AwaDoc can report which handler failed
        // The error_code helps us diagnose without leaking sensitive internals
        const errorCode = categoriseError(message);
        return NextResponse.json(
            {
                error: "Internal server error",
                event_type: eventType,
                error_code: errorCode,
                event_id: eventId,
            },
            { status: 500 }
        );
    }
}

/**
 * Categorise an internal error into a safe, reportable error code.
 * Never exposes stack traces or sensitive details externally.
 */
function categoriseError(message: string): string {
    const msg = message.toLowerCase();
    if (msg.includes("not found")) return "RESOURCE_NOT_FOUND";
    if (msg.includes("convex") || msg.includes("network") || msg.includes("fetch"))
        return "BACKEND_UNAVAILABLE";
    if (msg.includes("timeout") || msg.includes("abort")) return "TIMEOUT";
    if (msg.includes("invalid") || msg.includes("parse")) return "INVALID_PAYLOAD";
    return "PROCESSING_ERROR";
}

// ── Event handlers ──────────────────────────────────────

/**
 * therapy.availability.query / consultation.availability.query
 *
 * AwaDoc user is searching for available therapy/physiotherapy specialists.
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
    let preferredMode: string | undefined = undefined;
    if (rawPreferredMode) {
        const modeClean = rawPreferredMode.toLowerCase().trim();
        if (modeClean === "home_visit" || modeClean === "physical" || modeClean === "in_person") {
            preferredMode = "physical";
        } else if (modeClean === "virtual" || modeClean === "telehealth" || modeClean === "online") {
            preferredMode = "virtual";
        } else if (modeClean === "any" || modeClean === "both" || modeClean === "all") {
            preferredMode = undefined;
        } else {
            preferredMode = rawPreferredMode;
        }
    }

    // Extract and normalize requested specialist type if provided in query context
    const rawSpecialistType = body.context?.specialist_type
        ?? body.context?.specialistType
        ?? body.context?.type
        ?? body.specialist_type
        ?? null;
    const requestedSpecialistType = normalizeAwadocSpecialistType(rawSpecialistType);

    console.log("[AwaDoc] Availability query params:", {
        queryId,
        serviceArea,
        rawServiceArea,
        preferredMode,
        rawPreferredMode,
        rawSpecialistType,
        requestedSpecialistType,
    });

    // Fetch available physios from Convex
    let physios: any[] = [];
    try {
        physios = await convex.query(api.awadoc.getAvailablePhysios, {
            serviceArea,
            preferredMode: preferredMode ?? undefined,
            serverSecret: convexServerSecret(),
        });
    } catch (queryErr) {
        console.error("[AwaDoc] Failed to query physios for availability:", queryErr);
        return {
            status: "error",
            query_id: queryId,
            error: "Unable to query available therapists at this time",
            error_code: "BACKEND_UNAVAILABLE",
        };
    }

    // Filter by requested specialist type if specified
    if (requestedSpecialistType) {
        physios = physios.filter((p: any) => {
            const therapistType = mapToAwadocSpecialistType(p.specializations);
            return therapistType === requestedSpecialistType;
        });
    }

    console.log(`[AwaDoc] Found ${physios.length} available physios for type: ${requestedSpecialistType ?? "all"}`);

    // Map to AwaDoc specialist format
    const specialists = physios.map((p: any) => {
        const availabilityMode = toAwadocAvailabilityMode(
            p.offersOnlineSessions,
            p.offersInPersonSessions
        );

        // Build doctor_time from availability schedule if available
        const doctorTime = buildDoctorTime(p.availabilitySchedule);

        // Determine specialist type: strictly one of "physiotherapist" | "occupational-therapist" | "speech-therapist"
        const specialistType = requestedSpecialistType ?? mapToAwadocSpecialistType(p.specializations);

        return {
            type: specialistType,
            name: `${p.firstName} ${p.lastName}`.trim() || "Therapist",
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
        status: specialists.length > 0 ? "available" : "unavailable",
        query_id: queryId,
        queried_at: new Date().toISOString(),
        specialists,
    };
}

/**
 * therapy.request / consultation.request
 *
 * AwaDoc user selected a physio and wants to book a therapy session.
 * We create an awadocSession and respond with confirmation + pricing.
 */
async function handleTherapyRequest(body: any) {
    const requestId: string = body.meta?.request_id ?? "";
    const userId: string = body.user?.id ?? "";
    const userName: string = body.user?.name ?? "";
    const rawSpecialistType = body.context?.specialist_type
        ?? body.context?.specialistType
        ?? body.context?.type
        ?? null;
    const specialistType: AwadocSpecialistType = normalizeAwadocSpecialistType(rawSpecialistType) ?? DEFAULT_AWADOC_SPECIALIST_TYPE;
    const rawMode = (body.context?.schedule?.preferred_mode ?? "home_visit").toLowerCase().trim();
    const isVirtual = ["virtual", "telehealth", "online"].includes(rawMode);
    const preferredMode = isVirtual ? "virtual" : "physical";
    const preferredTime: string = body.context?.schedule?.preferred_time ?? "";
    const preferredLang: string = body.context?.schedule?.preferred_lang ?? "en";

    // Generate a unique therapy ID
    const therapyId = `thp-${crypto.randomUUID().slice(0, 8)}`;

    // Parse preferred time
    const scheduledTime = preferredTime ? new Date(preferredTime).getTime() : Date.now() + 3600000;
    const endTime = scheduledTime + 3600000; // 60 minute sessions

    // Get a suitable physio using weighted matching
    let physios: any[] = [];
    try {
        physios = await convex.query(api.awadoc.getAvailablePhysios, {
            serviceArea: "ALL",
            preferredMode,
            serverSecret: convexServerSecret(),
        });
    } catch (queryErr) {
        console.error("[AwaDoc] Failed to query available physios:", queryErr);
        return {
            status: "error",
            request_id: requestId,
            error: "Unable to query available therapists at this time",
            error_code: "BACKEND_UNAVAILABLE",
        };
    }

    // Filter by specialistType if specified, falling back to all if none match
    if (specialistType) {
        const matching = physios.filter((p: any) => mapToAwadocSpecialistType(p.specializations) === specialistType);
        if (matching.length > 0) {
            physios = matching;
        }
    }

    const selectedPhysio = selectBestPhysio(physios);

    // If no therapists are available on the marketplace, inform AwaDoc gracefully
    if (!selectedPhysio) {
        console.warn("[AwaDoc] No available therapists for request:", {
            requestId,
            preferredMode,
            physioCount: physios.length,
        });
        return {
            status: "no_availability",
            request_id: requestId,
            message: "No therapists are currently available for this request",
            queried_at: new Date().toISOString(),
        };
    }

    const sessionRate = selectedPhysio.hourlyRate ?? 1500000; // Default ₦15,000 in kobo

    // Create session record in Convex
    try {
        await convex.mutation(api.awadoc.createSession, {
            therapyId,
            requestId,
            eventId: body.event_id,
            awadocUserId: userId,
            awadocUserName: userName,
            status: "requested",
            mode: preferredMode,
            specialistType,
            scheduledTime,
            endTime,
            preferredLang,
            grossAmount: sessionRate,
            currency: "NGN",
            physiotherapistId: selectedPhysio.userId,
            serverSecret: convexServerSecret(),
        });
    } catch (mutErr) {
        console.error("[AwaDoc] Failed to create session:", {
            therapyId,
            requestId,
            error: mutErr instanceof Error ? mutErr.message : String(mutErr),
        });
        return {
            status: "error",
            request_id: requestId,
            error: "Failed to create therapy session",
            error_code: "SESSION_CREATE_FAILED",
        };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://physioaroundme.com";

    return {
        status: "confirmed",
        request_id: requestId,
        confirmed_at: new Date().toISOString(),
        therapy: {
            id: therapyId,
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
            link: `${appUrl}/video-call/${therapyId}`,
        },
    };
}

/**
 * therapy.confirmed
 *
 * Payment has been made on AwaDoc's side.
 * We acknowledge and update the session status, then send doctor_assigned callback.
 */
async function handleTherapyConfirmed(body: any) {
    const requestId: string = body.meta?.request_id ?? "";
    const therapyId: string = body.context?.therapy?.id ?? "";

    // Reject if therapyId is missing — don't silently acknowledge
    if (!therapyId) {
        console.warn("[AwaDoc] therapy.confirmed received without therapyId", {
            requestId,
            payload: body.context,
        });
        return {
            status: "error",
            error: "Missing therapy ID in payload",
            acknowledged_at: new Date().toISOString(),
        };
    }

    // First verify the session exists before updating
    const existingSession = await convex.query(api.awadoc.getSessionByTherapyId, {
        therapyId,
        serverSecret: convexServerSecret(),
    });

    if (!existingSession) {
        console.error("[AwaDoc] Session not found for confirmation", {
            therapyId,
            requestId,
        });
        return {
            status: "error",
            error: `Session not found for therapy: ${therapyId}`,
            acknowledged_at: new Date().toISOString(),
        };
    }

    // Update session to confirmed
    try {
        await convex.mutation(api.awadoc.updateSessionStatus, {
            therapyId,
            status: "confirmed",
            grossAmount: body.context?.therapy?.pricing?.amount
                ? Math.round(body.context.therapy.pricing.amount * 100) // Naira → kobo
                : undefined,
            serverSecret: convexServerSecret(),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[AwaDoc] Failed to update session status:", {
            therapyId,
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
        sendDoctorAssignedCallback(therapyId, existingSession).catch((err) =>
            console.error("[AwaDoc] Failed to send doctor_assigned callback:", err)
        );
    }

    return {
        status: "acknowledged",
        acknowledged_at: new Date().toISOString(),
    };
}

/**
 * therapy.session.assigned
 *
 * Platform confirms therapist assignment for a follow-up session.
 * We acknowledge and update our internal records.
 */
async function handleSessionAssigned(body: any) {
    const requestId: string = body.request_id ?? "";
    const therapyId: string = body.therapy_id ?? "";

    if (!therapyId) {
        return {
            status: "error",
            error: "Missing therapy_id in payload",
        };
    }

    console.log("[AwaDoc] Session assigned for follow-up:", { requestId, therapyId });

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
            serverSecret: convexServerSecret(),
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
 * Send the therapy.doctor_assigned and therapy.scheduled callbacks to AwaDoc.
 * Also generates a guest access token for the AwaDoc patient to join the video call.
 */
async function sendDoctorAssignedCallback(therapyId: string, session: any) {
    // Fetch real physio details
    const doctor = await getPhysioDetails(session.physiotherapistId);

    // Generate a secure guest token for the patient to join the video call
    const guestToken = crypto.randomUUID();
    const guestTokenExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    let guestTokenStored = false;

    // Store the guest token on the session
    try {
        await convex.mutation(api.awadoc.setGuestToken, {
            therapyId,
            guestToken,
            guestTokenExpiresAt,
            serverSecret: convexServerSecret(),
        });
        guestTokenStored = true;
    } catch (err) {
        console.error("[AwaDoc] Failed to store guest token — guest link will not be sent:", err);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://physioaroundme.com";
    // Guest meeting link — only include if token was persisted successfully
    const guestMeetingLink = (guestTokenStored && (session.mode ?? "virtual") === "virtual")
        ? `${appUrl}/video-call/${therapyId}/guest?guest=${guestToken}`
        : undefined;

    await sendCallbackEvent("therapy.doctor_assigned", {
        context: {
            therapy: {
                id: therapyId,
                schedule: {
                    preferred_mode: session.mode ?? "home_visit",
                    preferred_time: session.scheduledTime
                        ? new Date(session.scheduledTime).toISOString()
                        : undefined,
                },
                pricing: {
                    amount: session.grossAmount ? session.grossAmount / 100 : 0,
                    currency: session.currency ?? "NGN",
                },
            },
            doctor: {
                ...doctor,
                specialist_type: normalizeAwadocSpecialistType(session.specialistType) ?? DEFAULT_AWADOC_SPECIALIST_TYPE,
            },
        },
    });

    // Also send therapy.scheduled with the guest meeting link
    await sendCallbackEvent("therapy.scheduled", {
        context: {
            therapy: {
                id: therapyId,
                schedule: {
                    preferred_mode: session.mode ?? "home_visit",
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
                mode: session.mode ?? "home_visit",
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
        `evt-rh-assigned-${therapyId}`,
        "therapy.doctor_assigned",
        "outbound",
        { therapyId },
        null,
        "success"
    );
    await logEvent(
        `evt-rh-scheduled-${therapyId}`,
        "therapy.scheduled",
        "outbound",
        { therapyId },
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
            serverSecret: convexServerSecret(),
        });
    } catch (err) {
        console.error("[AwaDoc] Failed to log event:", err);
    }
}
