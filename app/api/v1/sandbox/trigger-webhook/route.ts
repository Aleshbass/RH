import { NextRequest, NextResponse } from "next/server";
import { authenticatePartner } from "@/lib/partner-auth";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";

export async function POST(req: NextRequest) {
  const { partner, response, requestId, traceId } = await authenticatePartner(req);
  if (!partner) return response!;

  try {
    const body = await req.json();
    const eventType = body.event || body.eventType || "session.completed";
    const targetUrl = (body.target_url || body.targetUrl || "").trim();

    if (!targetUrl) {
      return NextResponse.json(
        {
          error: {
            code: "missing_target_url",
            message: "Target webhook URL is required ('target_url').",
            request_id: requestId,
            trace_id: traceId,
          },
        },
        { status: 400 }
      );
    }

    const payload = body.payload || {
      id: `evt_sandbox_${Date.now()}`,
      event: eventType,
      environment: partner.environment,
      created_at: Math.floor(Date.now() / 1000),
      data: {
        referral_id: "ref_sandbox_72941",
        tracking_code: "RHB-72941",
        patient_name: "Adeola Balogun (Sandbox Test)",
        status: "completed",
        assigned_physiotherapist: {
          name: "Dr. Babatunde Adeyemi (PT)",
          license_number: "MRTBN/PT/2018/4821",
        },
        sessions: {
          completed: 6,
          total: 6,
        },
      },
    };

    const convex = getConvexClient();
    const result = await convex.action(api["actions/partners/dispatchWebhook"].dispatchWebhookEvent, {
      partnerId: partner.code,
      environment: partner.environment,
      eventType,
      targetUrl,
      secret: "whsec_test_mock_secret_key_4411",
      payload,
      trackingCode: "RHB-72941",
      patientName: "Adeola Balogun",
      requestId,
    });

    return NextResponse.json(
      {
        status: result.success ? "delivered" : "delivery_failed",
        status_code: result.statusCode,
        latency_ms: result.latencyMs,
        event_id: result.eventId,
        target_url: result.deliveredTo,
        response_data: result.responsePayload,
        error: result.errorMessage || null,
        request_id: requestId,
        trace_id: traceId,
      },
      {
        status: result.success ? 200 : 502,
        headers: {
          "X-Rehabify-Request-Id": requestId,
          "X-Rehabify-Trace-Id": traceId,
          "X-Rehabify-Environment": partner.environment,
        },
      }
    );
  } catch (error) {
    console.error("Sandbox webhook trigger failed:", error);
    return NextResponse.json(
      {
        error: {
          code: "trigger_failed",
          message: error instanceof Error ? error.message : "Internal server error",
          request_id: requestId,
          trace_id: traceId,
        },
      },
      { status: 500 }
    );
  }
}
