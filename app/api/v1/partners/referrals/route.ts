import { NextRequest, NextResponse } from "next/server";
import { authenticatePartner } from "@/lib/partner-auth";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const { partner, response, requestId, traceId } = await authenticatePartner(req);
  if (!partner) return response!;

  try {
    const body = await req.json();

    // Support both nested object format and flat format
    const patientFirstName =
      body.patient?.first_name || body.patientFirstName || body.first_name;
    const patientLastName =
      body.patient?.last_name || body.patientLastName || body.last_name;
    const patientPhone =
      body.patient?.phone || body.patientPhone || body.phone;
    const patientEmail =
      body.patient?.email || body.patientEmail || body.email;
    const city = body.patient?.city || body.city || "Lagos";
    const area = body.patient?.area || body.area;

    const condition =
      body.clinical_notes?.diagnosis ||
      body.clinical_notes?.condition ||
      body.diagnosis ||
      body.condition ||
      "General Musculoskeletal Rehabilitation";
    const clinicalNotes =
      body.clinical_notes?.notes ||
      body.clinical_notes?.diagnosis ||
      body.clinicalNotes;
    const recommendedSessions =
      body.clinical_notes?.recommended_sessions ||
      body.recommendedSessions ||
      4;
    const priority =
      body.clinical_notes?.priority || body.priority || "standard";
    const referringDoctor =
      body.clinical_notes?.referring_doctor ||
      body.referringDoctor ||
      partner.name;

    const partnerExternalId =
      body.partner_reference ||
      body.partner_patient_id ||
      body.external_id ||
      body.external_reference ||
      body.patient?.id ||
      body.partnerExternalId;

    const billingMode =
      body.billing_mode || body.billingMode || "patient_self_pay";
    const callbackUrl = body.callback_url || body.callbackUrl;

    // Validation
    if (!patientFirstName || !patientLastName) {
      return NextResponse.json(
        {
          error: {
            code: "missing_patient_name",
            message: "Both patient first name and last name are required.",
            request_id: requestId,
            trace_id: traceId,
          },
        },
        {
          status: 400,
          headers: {
            "X-Rehabify-Request-Id": requestId,
            "X-Rehabify-Trace-Id": traceId,
            "X-Rehabify-Environment": partner.environment,
          },
        }
      );
    }

    if (!patientPhone) {
      return NextResponse.json(
        {
          error: {
            code: "missing_patient_phone",
            message:
              "Patient phone number is required for WhatsApp intake dispatch.",
            request_id: requestId,
            trace_id: traceId,
          },
        },
        {
          status: 400,
          headers: {
            "X-Rehabify-Request-Id": requestId,
            "X-Rehabify-Trace-Id": traceId,
            "X-Rehabify-Environment": partner.environment,
          },
        }
    const normalizedPhone = String(patientPhone).replace(/\s+/g, "");

    // Sandbox Test Scenario 4: Policy Ineligible Simulation
    if (partner.environment === "sandbox" && normalizedPhone.endsWith("8000000004")) {
      return NextResponse.json(
        {
          error: {
            code: "ineligible_policy",
            message: "Patient insurance policy is expired or ineligible for coverage.",
            request_id: requestId,
            trace_id: traceId,
          },
        },
        {
          status: 400,
          headers: {
            "X-Rehabify-Request-Id": requestId,
            "X-Rehabify-Trace-Id": traceId,
            "X-Rehabify-Environment": partner.environment,
          },
        }
      );
    }

    const convex = getConvexClient();
    const result = await convex.mutation(api.partners.createPartnerReferral, {
      partnerCode: partner.code,
      partnerExternalId: partnerExternalId ? String(partnerExternalId).trim() : undefined,
      patientFirstName: String(patientFirstName).trim(),
      patientLastName: String(patientLastName).trim(),
      patientPhone: String(patientPhone).trim(),
      patientEmail: patientEmail ? String(patientEmail).trim() : undefined,
      city: String(city).trim(),
      area: area ? String(area).trim() : undefined,
      hospitalClinic: referringDoctor ? String(referringDoctor).trim() : partner.name,
      condition: String(condition).trim(),
      clinicalNotes: clinicalNotes ? String(clinicalNotes).trim() : undefined,
      priority: String(priority).trim(),
      recommendedSessions: Number(recommendedSessions) || 4,
      billingMode: String(billingMode).trim(),
      callbackUrl: callbackUrl ? String(callbackUrl).trim() : undefined,
      environment: partner.environment,
    });

    const latencyMs = Math.max(1, Date.now() - startTime);

    // Asynchronously record inbound audit trail in partnerActivityLogs
    convex
      .mutation(api.partners.logPartnerActivity, {
        partnerId: partner.code,
        environment: partner.environment,
        eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        eventType: "referral.created",
        direction: "inbound",
        url: req.nextUrl.pathname,
        method: "POST",
        statusCode: 201,
        latencyMs,
        status: "success",
        requestId,
        traceId,
        trackingCode: result.trackingCode,
        patientName: `${patientFirstName} ${patientLastName}`,
        requestPayload: {
          patient: { firstName: patientFirstName, lastName: patientLastName, phone: patientPhone },
          condition,
          priority,
          recommendedSessions,
        },
        responsePayload: {
          status: "success",
          referral_id: result.referralId,
          tracking_code: result.trackingCode,
        },
        occurredAt: Date.now(),
      })
      .catch((err) => console.error("Failed to log activity:", err));

    const host = req.headers.get("host") || "physioaroundme.com";
    const protocol = host.includes("localhost") ? "http" : "https";
    const trackingUrl = `${protocol}://${host}/track/${result.trackingCode}`;
    const whatsappIntakeUrl = `https://wa.me/2348061525811?text=REHAB_REF_${encodeURIComponent(result.trackingCode)}`;

    return NextResponse.json(
      {
        status: "success",
        environment: partner.environment,
        referral_id: result.referralId,
        tracking_code: result.trackingCode,
        partner_reference: result.partnerExternalId || null,
        tracking_url: trackingUrl,
        whatsapp_intake_url: whatsappIntakeUrl,
        whatsapp_phone: "+2348061525811",
        intake_status: "pending_whatsapp_response",
        patient: {
          name: `${patientFirstName} ${patientLastName}`,
          phone: patientPhone,
        },
        created_at: result.createdAt,
        request_id: requestId,
        trace_id: traceId,
      },
      {
        status: 201,
        headers: {
          "X-Rehabify-Request-Id": requestId,
          "X-Rehabify-Trace-Id": traceId,
          "X-Rehabify-Environment": partner.environment,
        },
      }
    );
  } catch (error) {
    console.error("Failed to create referral:", error);

    const convex = getConvexClient();
    convex
      .mutation(api.partners.logPartnerActivity, {
        partnerId: partner.code,
        environment: partner.environment,
        eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        eventType: "referral.created",
        direction: "inbound",
        url: req.nextUrl.pathname,
        method: "POST",
        statusCode: 500,
        latencyMs: Math.max(1, Date.now() - startTime),
        status: "error",
        requestId,
        traceId,
        errorMessage: error instanceof Error ? error.message : "Internal server error",
        occurredAt: Date.now(),
      })
      .catch((err) => console.error("Failed to log error activity:", err));

    return NextResponse.json(
      {
        error: {
          code: "referral_creation_failed",
          message:
            error instanceof Error ? error.message : "Internal server error",
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

export async function GET(req: NextRequest) {
  const { partner, response, requestId, traceId } = await authenticatePartner(req);
  if (!partner) return response!;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const limit = Number(searchParams.get("limit")) || 50;

    const convex = getConvexClient();
    const referrals = await convex.query(api.partners.listPartnerReferrals, {
      partnerCode: partner.code,
      environment: partner.environment,
      status,
      limit,
    });

    return NextResponse.json(
      {
        status: "success",
        environment: partner.environment,
        count: referrals.length,
        partner: partner.name,
        referrals,
        request_id: requestId,
        trace_id: traceId,
      },
      {
        headers: {
          "X-Rehabify-Request-Id": requestId,
          "X-Rehabify-Trace-Id": traceId,
          "X-Rehabify-Environment": partner.environment,
        },
      }
    );
  } catch (error) {
    console.error("Failed to list referrals:", error);
    return NextResponse.json(
      {
        error: {
          code: "referral_list_failed",
          message:
            error instanceof Error ? error.message : "Internal server error",
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
