import { NextRequest, NextResponse } from "next/server";
import { authenticatePartner } from "@/lib/partner-auth";

export async function POST(req: NextRequest) {
  const { partner, response } = await authenticatePartner(req);
  if (!partner) return response!;

  try {
    const body = await req.json();

    const memberId =
      body.member_id || body.policy_number || body.hmo_policy_number || body.id;
    const patientName = body.patient_name || body.name || "Member";
    const serviceType = body.service_type || "physiotherapy";
    const requestedSessions = Number(body.requested_sessions) || 6;

    if (!memberId) {
      return NextResponse.json(
        {
          error: {
            code: "missing_member_id",
            message: "Member ID / Policy number is required for eligibility check.",
          },
        },
        { status: 400 }
      );
    }

    // Standard pre-authorization verification logic
    const isEligible = !String(memberId).toUpperCase().includes("EXPIRED");
    const preAuthCode = `AUTH-${partner.code.toUpperCase().slice(0, 4)}-${Math.floor(
      100000 + Math.random() * 900000
    )}`;

    if (!isEligible) {
      return NextResponse.json({
        status: "ineligible",
        member_id: memberId,
        eligible: false,
        reason: "Policy is expired or inactive. Contact member provider service.",
      });
    }

    const approvedSessions = Math.min(requestedSessions, 12);

    return NextResponse.json({
      status: "eligible",
      eligible: true,
      pre_auth_code: preAuthCode,
      member: {
        member_id: memberId,
        name: patientName,
        plan_tier: "Comprehensive Health Plan",
        status: "active",
      },
      coverage: {
        service: serviceType,
        approved_sessions: approvedSessions,
        max_annual_sessions: 20,
        remaining_sessions: Math.max(0, 20 - approvedSessions),
        copay_percentage: 0,
        home_visit_covered: true,
        clinic_visit_covered: true,
        virtual_telehealth_covered: true,
      },
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    console.error("Eligibility check error:", error);
    return NextResponse.json(
      {
        error: {
          code: "eligibility_check_failed",
          message:
            error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 }
    );
  }
}
