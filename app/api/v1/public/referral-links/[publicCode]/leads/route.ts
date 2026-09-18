import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";

interface RouteParams {
  params: Promise<{ publicCode: string }>;
}

/**
 * POST /api/v1/public/referral-links/{publicCode}/leads
 *
 * Public endpoint — no auth required.
 * Submits a lead from the partner landing page.
 * Creates a referral, consent record, audit event, and outreach task.
 */
export async function POST(req: NextRequest, props: RouteParams) {
  const { publicCode } = await props.params;

  try {
    const body = await req.json();

    // Support both nested and flat formats
    const firstName = body.patient?.first_name || body.first_name || body.firstName;
    const lastName = body.patient?.last_name || body.last_name || body.lastName;
    const phone = body.patient?.phone || body.phone;
    const email = body.patient?.email || body.email;
    const city = body.patient?.city || body.city;
    const state = body.patient?.state || body.state;
    const preferredLanguage = body.patient?.preferred_language || body.preferred_language || "en";

    const reason = body.need?.reason || body.reason;
    const preferredCareMode = body.need?.preferred_care_mode || body.preferred_care_mode || "patient_choice";

    const nextStep = body.next_step?.type || body.next_step || "contact_me";
    const preferredContactChannel = body.next_step?.preferred_channel || body.preferred_channel || "whatsapp";

    const consentGranted = body.consent?.contact_allowed ?? body.consent_granted ?? true;
    const privacyNoticeVersion = body.consent?.privacy_notice_version || body.privacy_notice_version || "2026-09-01";
    const sessionId = body.session_id;

    // Validation
    if (!firstName) {
      return NextResponse.json(
        {
          error: { code: "missing_first_name", message: "Patient first name is required." },
        },
        { status: 400 }
      );
    }

    if (!phone && !email) {
      return NextResponse.json(
        {
          error: {
            code: "missing_contact",
            message: "At least one contact method (phone or email) is required.",
          },
        },
        { status: 400 }
      );
    }

    const convex = getConvexClient();
    const result = await convex.mutation(api.partnerLinks.submitLead, {
      publicCode: decodeURIComponent(publicCode),
      sessionId,
      firstName: String(firstName).trim(),
      lastName: lastName ? String(lastName).trim() : undefined,
      phone: phone ? String(phone).trim() : undefined,
      email: email ? String(email).trim() : undefined,
      city: city ? String(city).trim() : undefined,
      state: state ? String(state).trim() : undefined,
      preferredLanguage,
      reason: reason ? String(reason).trim() : undefined,
      preferredCareMode,
      nextStep,
      preferredContactChannel,
      consentGranted: Boolean(consentGranted),
      privacyNoticeVersion,
    });

    const host = req.headers.get("host") || "physioaroundme.com";
    const protocol = host.includes("localhost") ? "http" : "https";

    return NextResponse.json(
      {
        status: "success",
        referral_id: result.referralId,
        tracking_code: result.trackingCode,
        referral_status: result.status,
        duplicate: result.isDuplicate,
        next_action: result.nextAction,
        joy_session_url: result.joySessionUrl
          ? `${protocol}://${host}${result.joySessionUrl}`
          : undefined,
        contact_request_id: result.contactRequestId,
        tracking_url: `${protocol}://${host}/track/${result.trackingCode}`,
        created_at: new Date().toISOString(),
      },
      { status: result.isDuplicate ? 200 : 201 }
    );
  } catch (error) {
    console.error("Lead submission failed:", error);
    const message = error instanceof Error ? error.message : "Internal server error";

    if (message.includes("no longer active") || message.includes("expired")) {
      return NextResponse.json(
        { error: { code: "link_inactive", message } },
        { status: 410 }
      );
    }

    return NextResponse.json(
      { error: { code: "lead_submission_failed", message } },
      { status: 500 }
    );
  }
}
