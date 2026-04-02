/**
 * AwaDoc Guest Token Validation API
 *
 * Validates a guest token for an AwaDoc therapy session and returns
 * a Stream Video token so the guest can join the call.
 */

import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
    throw new Error("[AwaDoc] NEXT_PUBLIC_CONVEX_URL must be set");
}
const convex = new ConvexHttpClient(convexUrl);

export async function POST(request: NextRequest) {
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
        const result = await convex.query(api.awadoc.validateGuestToken, {
            therapyId,
            guestToken,
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
