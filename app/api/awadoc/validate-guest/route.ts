/**
 * AwaDoc Guest Token Validation API
 *
 * Validates a guest token for an AwaDoc therapy session and returns
 * a Stream Video token so the guest can join the call.
 */

import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex-client";
import { convexServerSecret } from "@/lib/convex-server-secret";

export async function POST(request: NextRequest) {
    // Untyped client: the full generated api type is too deep for tsc to instantiate here
    const convex = getConvexClient() as any;
    let body: { therapyId: string; guestToken: string };

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { therapyId, guestToken } = body;

    if (!therapyId || !guestToken) {
        return NextResponse.json(
            { error: "Missing therapyId or guestToken" },
            { status: 400 }
        );
    }

    try {
        // Validate the guest token against Convex
        const serverSecret = convexServerSecret();
        const result = await convex.query(api.awadoc.validateGuestToken, {
            therapyId,
            guestToken,
            serverSecret,
        });

        if (!result.valid) {
            return NextResponse.json(
                { error: result.error ?? "Invalid or expired token" },
                { status: 401 }
            );
        }

        // Generate a guest Stream token
        const guestUserId = `awadoc-guest-${therapyId}`;
        const guestUserName = result.session?.patientName ?? "AwaDoc Patient";

        const streamResult = await convex.action(api.stream.getGuestStreamToken, {
            guestUserId,
            guestUserName,
            serverSecret,
        });

        return NextResponse.json({
            valid: true,
            session: result.session,
            stream: {
                token: streamResult.token,
                apiKey: streamResult.apiKey,
                userId: streamResult.userId,
                userName: guestUserName,
            },
        });
    } catch (err) {
        console.error("[AwaDoc] Guest validation error:", err);
        return NextResponse.json(
            { error: "Failed to validate guest token" },
            { status: 500 }
        );
    }
}
