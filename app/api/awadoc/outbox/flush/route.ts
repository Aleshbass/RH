/**
 * Sends queued AwaDoc callbacks (doctor_assigned, scheduled, session.started/completed,
 * followup.required, plan.completed). Convex queues them in awadocOutbox and calls this route
 * (convex/awadoc.ts kickOutbox) because only this server holds the AwaDoc signing secret.
 *
 * Auth: x-server-secret must equal CONVEX_SERVER_SECRET.
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex-client";
import { convexServerSecret } from "@/lib/convex-server-secret";
import { postCallback, type AwadocEnv } from "@/lib/awadoc/awadoc";

const awadoc = (api as any).awadoc;

function secretMatches(provided: string | null): boolean {
    const expected = process.env.CONVEX_SERVER_SECRET ?? "";
    if (!provided || expected.length < 32 || provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
    if (!secretMatches(request.headers.get("x-server-secret"))) {
        return NextResponse.json({ error: "unauthorised" }, { status: 401 });
    }
    const convex = getConvexClient() as any;
    const serverSecret = convexServerSecret();
    const claimed: Array<{ id: string; env: AwadocEnv; eventType: string; therapyId: string; body: unknown }> =
        await convex.mutation(awadoc.outboxClaim, { serverSecret });

    let sent = 0;
    const blocked = new Set<string>();
    for (const row of claimed) {
        // Keep a booking's events in order: after a failure, the rest wait for the retry
        if (blocked.has(row.therapyId)) continue;
        const result = await postCallback(row.env, row.body);
        if (result.ok) sent++;
        else blocked.add(row.therapyId);
        await convex.mutation(awadoc.outboxResult, {
            serverSecret,
            id: row.id,
            ok: result.ok,
            httpStatus: result.status,
            error: result.error,
            responseText: result.responseText,
        });
    }
    return NextResponse.json({ claimed: claimed.length, sent, failed: blocked.size });
}
