/**
 * AwaDoc Session Completion API
 *
 * Called when a physiotherapist ends an AwaDoc therapy session.
 * Marks the session as completed and sends a callback to AwaDoc.
 * Only the physiotherapist assigned to the session (or an admin) may call it.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { sendCallbackEvent } from "@/lib/awadoc/awadoc";
import { getConvexClient } from "@/lib/convex-client";
import { convexServerSecret } from "@/lib/convex-server-secret";

export async function POST(request: NextRequest) {
    // Act as the signed-in user so Convex can check they are the session's physio (or an admin)
    const { userId, getToken } = await auth();
    const token = userId ? await getToken({ template: "convex" }) : null;
    if (!token) {
        return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    }
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
        return NextResponse.json({ error: "Convex is not configured" }, { status: 500 });
    }
    const asUser = new ConvexHttpClient(convexUrl);
    asUser.setAuth(token);
    const convex = getConvexClient();
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
        // Look up the session as the signed-in user: null unless they are its physio or an admin
        const session = await asUser.query(api.awadoc.getSessionByTherapyId, {
            therapyId,
        });

        if (!session) {
            return NextResponse.json(
                { error: `Session not found: ${therapyId}` },
                { status: 404 }
            );
        }

        const serverSecret = convexServerSecret();

        // Mark session as completed in Convex
        await convex.mutation(api.awadoc.completeSession, {
            therapyId,
            notes,
            actualDurationMinutes,
            serverSecret,
        });

        // Get physio details for the callback
        let doctorName = "Physiotherapist";
        if (session.physiotherapistId) {
            try {
                const user = await convex.query(api.awadoc.getUserById, {
                    userId: session.physiotherapistId,
                    serverSecret,
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
                serverSecret,
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
