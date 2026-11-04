/**
 * AwaDoc patient video link: checks the guest token for the room and returns a Stream token
 * so the patient can join without a Rehabify account. The link is sent to AwaDoc in
 * therapy.scheduled (meeting.link).
 */

import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex-client";
import { convexServerSecret } from "@/lib/convex-server-secret";

export async function POST(request: NextRequest) {
    // Untyped client: the full generated api type is too deep for tsc to instantiate here
    const convex = getConvexClient() as any;
    let body: { therapyId?: string; callId?: string; guestToken?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const callId = (body.callId ?? body.therapyId ?? "").trim();
    const guestToken = (body.guestToken ?? "").trim();
    if (!callId || !guestToken || callId.length > 80 || guestToken.length > 200) {
        return NextResponse.json({ error: "This session link is incomplete." }, { status: 400 });
    }

    try {
        const serverSecret = convexServerSecret();
        const result = await convex.query((api as any).awadoc.guestJoin, { serverSecret, callId, guestToken });
        if (!result.valid) {
            return NextResponse.json({ error: result.error ?? "This session link isn't valid." }, { status: 401 });
        }

        const guestUserId = `awadoc-guest-${callId}`;
        const guestUserName = result.session.patientName ?? "AwaDoc patient";
        const stream = await convex.action((api as any).stream.getGuestStreamToken, { guestUserId, guestUserName, serverSecret });

        return NextResponse.json({
            valid: true,
            session: result.session,
            stream: { token: stream.token, apiKey: stream.apiKey, userId: stream.userId, userName: guestUserName },
        });
    } catch (err) {
        console.error("[AwaDoc] Guest validation error:", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Couldn't open your session. Please try again." }, { status: 500 });
    }
}
