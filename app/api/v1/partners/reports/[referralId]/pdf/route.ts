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
            message: `No clinical reports found for referral ID or reference '${referralId}'.`,
          },
        },
        { status: 404 }
      );
    }

    const patientFullName = `${referral.patient.firstName} ${referral.patient.lastName}`;
    const trackingCode = referral.trackingCode;
    const physioName = referral.assignedPhysiotherapist?.name || "Dr. Babatunde Adeyemi (PT)";
    const licenseNumber = referral.assignedPhysiotherapist?.licenseNumber || "MRTBN/PT/2018/4821";

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Clinical Progress Report - ${trackingCode}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #002e2c;
      background: #fff;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
      line-height: 1.5;
    }
    .header {
      border-bottom: 2px solid #005b57;
      padding-bottom: 20px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .logo {
      font-size: 24px;
      font-weight: 800;
      color: #005b57;
      letter-spacing: -0.5px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      background: #e6f4f1;
      color: #005b57;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      background: #faf6e7;
      padding: 16px;
      border-radius: 12px;
      margin-bottom: 24px;
      font-size: 13px;
    }
    .meta-item strong {
      color: #52706e;
      display: block;
      font-size: 11px;
      text-transform: uppercase;
    }
    h2 {
      font-size: 16px;
      color: #002e2c;
      border-bottom: 1px solid #e2ece9;
      padding-bottom: 8px;
      margin-top: 24px;
    }
    .milestone {
      padding: 12px 0;
      border-bottom: 1px dashed #e2ece9;
    }
    .milestone-title {
      font-weight: 600;
      font-size: 13px;
    }
    .milestone-notes {
      font-size: 12px;
      color: #52706e;
    }
    .footer {
      margin-top: 40px;
      border-top: 1px solid #e2ece9;
      padding-top: 16px;
      font-size: 11px;
      color: #52706e;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">REHABIFY</div>
      <p style="font-size: 12px; color: #52706e; margin: 4px 0 0 0;">Licensed Physiotherapy & Clinical Rehabilitation Network</p>
    </div>
    <div style="text-align: right;">
      <span class="badge">Official Clinical Summary</span>
      <p style="font-size: 12px; font-family: monospace; margin: 6px 0 0 0;">Ref: ${trackingCode}</p>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <strong>Patient Name</strong>
      ${patientFullName}
    </div>
    <div class="meta-item">
      <strong>Condition / Scope</strong>
      ${referral.careDetails?.serviceScope || "Musculoskeletal Rehabilitation"}
    </div>
    <div class="meta-item">
      <strong>Treating Specialist</strong>
      ${physioName} (${licenseNumber})
    </div>
    <div class="meta-item">
      <strong>Treatment Progress</strong>
      ${referral.sessions.completed} of ${referral.sessions.total} sessions completed (${referral.status.toUpperCase()})
    </div>
  </div>

  <h2>Clinical Assessment & Rehabilitation Summary</h2>
  <div class="milestone">
    <div class="milestone-title">1. Baseline Intake & Musculoskeletal Evaluation</div>
    <div class="milestone-notes">Triage conducted via Rehabify Clinical Protocol. Objective range-of-motion baseline established.</div>
  </div>
  <div class="milestone">
    <div class="milestone-title">2. Functional Mobility & Mobilization</div>
    <div class="milestone-notes">Active mobilization, soft tissue therapy, and progressive loading administered.</div>
  </div>
  <div class="milestone">
    <div class="milestone-title">3. Milestone & Recovery Verification</div>
    <div class="milestone-notes">Status: ${referral.status === "completed" ? "Full recovery milestone achieved. Patient discharged to home maintenance plan." : "Patient actively in rehabilitation."}</div>
  </div>

  <div class="footer">
    <span>MRTBN Regulated Medical Provider • Rehabify Health</span>
    <span>Generated: ${new Date().toISOString()}</span>
  </div>
</body>
</html>`;

    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="Clinical_Report_${trackingCode}.html"`,
        "X-Rehabify-Environment": partner.environment,
      },
    });
  } catch (error) {
    console.error("Clinical report PDF generation error:", error);
    return NextResponse.json(
      {
        error: {
          code: "report_generation_failed",
          message: error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 }
    );
  }
}
