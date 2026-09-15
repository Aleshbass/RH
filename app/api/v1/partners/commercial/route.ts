import { NextRequest, NextResponse } from "next/server";
import { authenticatePartner } from "@/lib/partner-auth";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";

/**
 * GET /api/v1/partners/commercial
 *
 * Returns active commercial contract details, payment terms, and commission tiers.
 */
export async function GET(req: NextRequest) {
  const { partner, response } = await authenticatePartner(req);
  if (!partner) return response!;

  try {
    const convex = getConvexClient();
    const contract = await convex.query(api.commercialTerms.getActivePartnerContract, {
      partnerId: partner.code,
    });

    const summary = await convex.query(api.commercialTerms.getPartnerCommercialSummary, {
      partnerId: partner.code,
    });

    return NextResponse.json({
      status: "success",
      partner_id: partner.code,
      contract: {
        contract_number: contract.contractNumber,
        model_type: contract.modelType,
        currency: contract.payoutCurrency,
        payment_terms: `Net-${contract.paymentTermsDays}`,
        effective_from: new Date(contract.effectiveFrom).toISOString(),
        pricing: {
          base_booking_fee_ngn: ((contract.baseFeePerBooking || 500000) / 100).toFixed(2),
          revenue_share_percent: `${contract.revenueSharePercent || 15}%`,
          activation_bonus_ngn: ((contract.activationBonusPerPatient || 200000) / 100).toFixed(2),
          withholding_tax_percent: `${contract.withholdingTaxPercent || 5}%`,
          vat_applicable: contract.vatApplicable || false,
        },
        volume_tiers: (contract.tiers || []).map((t: any) => ({
          tier_name: t.tierName,
          min_referrals: t.minReferrals,
          max_referrals: t.maxReferrals || "Unlimited",
          fee_per_referral_ngn: t.feePerReferral ? (t.feePerReferral / 100).toFixed(2) : null,
          revenue_share_percent: t.revenueSharePercent ? `${t.revenueSharePercent}%` : null,
        })),
      },
      current_performance: {
        tier: summary.tierProgress.currentTierName,
        total_referrals: summary.tierProgress.currentReferrals,
        percent_to_next_tier: `${summary.tierProgress.percentToNextTier}%`,
        earnings_summary: summary.kpis,
      },
    });
  } catch (error) {
    console.error("Commercial terms fetch error:", error);
    return NextResponse.json(
      {
        error: {
          code: "commercial_fetch_failed",
          message: error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 }
    );
  }
}
