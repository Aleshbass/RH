import { NextRequest, NextResponse } from "next/server";
import { authenticatePartner } from "@/lib/partner-auth";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";

/**
 * GET /api/v1/partners/sessions
 *
 * Lists clinical sessions, appointments, and attendance tracking for partner referrals.
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const { partner, response, requestId, traceId } = await authenticatePartner(req);
  if (!partner) return response!;

  try {
    const { searchParams } = new URL(req.url);
    const referralId = searchParams.get("referral_id") || undefined;
    const patientPhone = searchParams.get("patient_phone") || undefined;
    const status = searchParams.get("status") || undefined;
    const limit = Number(searchParams.get("limit")) || 50;

    const convex = getConvexClient();
    const sessions = await convex.query(api.partners.listPartnerSessions, {
      partnerCode: partner.code,
      environment: partner.environment,
      referralId,
      patientPhone,
      status,
      limit,
    });

    const latencyMs = Math.max(1, Date.now() - startTime);

    // Audit log in partnerActivityLogs
    convex
      .mutation(api.partners.logPartnerActivity, {
        partnerId: partner.code,
        environment: partner.environment,
        eventId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        eventType: "sessions.listed",
        direction: "inbound",
        url: req.nextUrl.pathname,
        method: "GET",
        statusCode: 200,
        latencyMs,
        status: "success",
        requestId,
        traceId,
        requestPayload: { referralId, patientPhone, status, limit },
        responsePayload: { count: sessions.length },
        occurredAt: Date.now(),
      })
      .catch((err) => console.error("Failed to log sessions query activity:", err));

    return NextResponse.json(
      {
        status: "success",
        environment: partner.environment,
        total_sessions: sessions.length,
        sessions,
        request_id: requestId,
        trace_id: traceId,
      },
      {
        status: 200,
        headers: {
          "X-Rehabify-Request-Id": requestId,
          "X-Rehabify-Trace-Id": traceId,
          "X-Rehabify-Environment": partner.environment,
        },
      }
    );
  } catch (error) {
    console.error("Sessions fetch error:", error);
    return NextResponse.json(
      {
        error: {
          code: "sessions_fetch_failed",
          message: error instanceof Error ? error.message : "Internal server error",
          request_id: requestId,
          trace_id: traceId,
        },
      },
      {
        status: 500,
        headers: {
          "X-Rehabify-Request-Id": requestId,
          "X-Rehabify-Trace-Id": traceId,
          "X-Rehabify-Environment": partner.environment,
        },
      }
    );
  }
}
