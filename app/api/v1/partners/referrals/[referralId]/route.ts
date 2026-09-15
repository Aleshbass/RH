import { NextRequest, NextResponse } from "next/server";
import { authenticatePartner } from "@/lib/partner-auth";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";

interface RouteParams {
  params: Promise<{ referralId: string }>;
}

export async function GET(req: NextRequest, props: RouteParams) {
  const { partner, response } = await authenticatePartner(req);
  if (!partner) return response!;

  const { referralId } = await props.params;

  if (!referralId) {
    return NextResponse.json(
      {
        error: {
          code: "missing_referral_id",
          message: "Referral ID or partner reference ID is required in the path.",
        },
      },
      { status: 400 }
    );
  }

  try {
    const convex = getConvexClient();
    const referral = await convex.query(api.partners.getReferralDetails, {
      identifier: decodeURIComponent(referralId),
      partnerCode: partner.code,
    });

    if (!referral) {
      return NextResponse.json(
        {
          error: {
            code: "referral_not_found",
            message: `No referral found matching ID or reference '${referralId}'.`,
          },
        },
        { status: 404 }
      );
    }

    const host = req.headers.get("host") || "physioaroundme.com";
    const protocol = host.includes("localhost") ? "http" : "https";
    const trackingUrl = `${protocol}://${host}/track/${referral.trackingCode}`;

    return NextResponse.json({
      status: "success",
      referral_id: referral._id,
      tracking_code: referral.trackingCode,
      partner_reference: referral.partnerExternalId || null,
      tracking_url: trackingUrl,
      current_status: referral.status,
      patient: referral.patient,
      clinical_notes: referral.clinicalNotes,
      billing_mode: referral.billingMode,
      assigned_physiotherapist: referral.assignedPhysiotherapist,
      sessions_completed: referral.sessions.completed,
      sessions_total: referral.sessions.total,
      last_session_at: referral.sessions.lastSessionAt
        ? new Date(referral.sessions.lastSessionAt).toISOString()
        : null,
      next_session_at: referral.sessions.nextSessionAt
        ? new Date(referral.sessions.nextSessionAt).toISOString()
        : null,
      created_at: new Date(referral.createdAt).toISOString(),
      updated_at: new Date(referral.updatedAt).toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch referral status:", error);
    return NextResponse.json(
      {
        error: {
          code: "fetch_referral_failed",
          message:
            error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 }
    );
  }
}
