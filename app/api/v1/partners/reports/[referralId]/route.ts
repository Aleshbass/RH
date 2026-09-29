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
    const report = await convex.query(api.partners.getPartnerClinicalReport, {
      identifier: decodeURIComponent(referralId),
      partnerCode: partner.code,
    });

    if (!report) {
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

    const host = req.headers.get("host") || "physioaroundme.com";
    const protocol = host.includes("localhost") ? "http" : "https";

    return NextResponse.json({
      status: "success",
      ...report,
      pdf_download_url: `${protocol}://${host}/api/v1/partners/reports/${report.tracking_code}/pdf`,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Clinical report fetch error:", error);
    return NextResponse.json(
      {
        error: {
          code: "report_fetch_failed",
          message:
            error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 }
    );
  }
}
