import { NextRequest, NextResponse } from "next/server";
import { authenticatePartner } from "@/lib/partner-auth";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";

/**
 * GET /api/v1/partners/commissions
 *
 * Returns itemized per-transaction commission ledger for partner earnings.
 */
export async function GET(req: NextRequest) {
  const { partner, response } = await authenticatePartner(req);
  if (!partner) return response!;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") || "all";
  const limitParam = parseInt(url.searchParams.get("limit") || "100", 10);

  try {
    const convex = getConvexClient();
    const ledger = await convex.query(api.commercialTerms.listPartnerCommissions, {
      partnerId: partner.code,
      status: statusParam,
      limit: limitParam,
    });

    const summary = await convex.query(api.commercialTerms.getPartnerCommercialSummary, {
      partnerId: partner.code,
    });

    return NextResponse.json({
      status: "success",
      partner_id: partner.code,
      kpis: summary.kpis,
      count: ledger.length,
      commissions: (ledger as any[]).map((c: any) => ({
        commission_id: c._id,
        referral_id: c.referralId,
        tracking_code: c.trackingCode,
        patient_name: c.patientName,
        event_trigger: c.eventType,
        gross_transaction_ngn: (c.grossTransactionAmount / 100).toFixed(2),
        commission_rate: typeof c.commissionRate === "number" && c.commissionRate > 100
          ? `₦${(c.commissionRate / 100).toFixed(2)} fixed`
          : `${c.commissionRate}%`,
        commission_earned_ngn: (c.commissionAmount / 100).toFixed(2),
        net_payable_ngn: (c.netPayable / 100).toFixed(2),
        status: c.status,
        settlement_id: c.settlementId || null,
        notes: c.notes || null,
        earned_at: c.earnedAtIso,
      })),
    });
  } catch (error) {
    console.error("Commissions fetch error:", error);
    return NextResponse.json(
      {
        error: {
          code: "commissions_fetch_failed",
          message: error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 }
    );
  }
}
