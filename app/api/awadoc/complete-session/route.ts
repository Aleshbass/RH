/**
 * AwaDoc Session Completion API
 *
 * Called when a physiotherapist ends an AwaDoc therapy session.
 * Marks the session as completed and sends a callback to AwaDoc.
 */

import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { sendCallbackEvent } from "@/lib/awadoc/awadoc";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
    throw new Error("[AwaDoc] NEXT_PUBLIC_CONVEX_URL must be set");
}
const convex = new ConvexHttpClient(convexUrl);

export async function POST(request: NextRequest) {
    let body: {
        therapyId: string;
        notes?: string;
        actualDurationMinutes?: number;
    };

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { therapyId, notes, actualDurationMinutes } = body;

    if (!therapyId) {
        return NextResponse.json(
            { error: "Missing therapyId" },
            { status: 400 }
        );
    }

    try {
        // Look up session first for details
        const session = await convex.query(api.awadoc.getSessionByTherapyId, {
            therapyId,
        });

        if (!session) {
            return NextResponse.json(
                { error: `Session not found: ${therapyId}` },
                { status: 404 }
            );
        }

        // Mark session as completed in Convex
        await convex.mutation(api.awadoc.completeSession, {
            therapyId,
            notes,
            actualDurationMinutes,
        });

        // Get physio details for the callback
        let doctorName = "Physiotherapist";
        if (session.physiotherapistId) {
            try {
                const user = await convex.query(api.awadoc.getUserById, {
                    userId: session.physiotherapistId,
                });
                if (user) {
                    doctorName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "Physiotherapist";
                }
            } catch {
                // Non-fatal, use default name
            }
        }

        // Calculate actual duration
        const now = Date.now();
        const duration = actualDurationMinutes
            ?? (session.scheduledTime
                ? Math.round(((session.endTime ?? now) - session.scheduledTime) / 60000)
                : 60);

        // Send therapy.session.completed callback to AwaDoc
        const callbackResult = await sendCallbackEvent("therapy.session.completed", {
            request_id: session.requestId ?? "",
            therapy_id: therapyId,
            event: "therapy.session.completed",
            completed_at: new Date().toISOString(),
            summary: notes ?? `Session completed. Duration: ${duration} minutes.`,
            context: {
                therapy: {
                    id: therapyId,
                    status: "completed",
                    completed_at: new Date().toISOString(),
                    duration_minutes: duration,
                    pricing: {
                        amount: session.grossAmount ? session.grossAmount / 100 : 0,
                        currency: session.currency ?? "NGN",
                    },
                },
                doctor: {
                    id: session.physiotherapistId ?? "unknown",
                    name: doctorName,
                },
            },
        });

        // Log the outbound event
        try {
            await convex.mutation(api.awadoc.logEvent, {
                eventId: `evt-rh-completed-${therapyId}`,
                eventType: "therapy.session.completed",
                direction: "outbound",
                payload: { therapyId, duration, notes: notes ? "[REDACTED]" : undefined },
                responsePayload: callbackResult,
                status: callbackResult.success ? "success" : "error",
                errorMessage: callbackResult.error,
            });
        } catch {
            // Non-fatal
        }

        return NextResponse.json({
            success: true,
            therapyId,
            completedAt: new Date().toISOString(),
            callbackSent: callbackResult.success,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[AwaDoc] Complete session error:", message);
        return NextResponse.json(
            { error: `Failed to complete session: ${message}` },
            { status: 500 }
        );
    }
}
