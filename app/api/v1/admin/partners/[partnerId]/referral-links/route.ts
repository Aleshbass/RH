import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";
import { authenticatePartner } from "@/lib/partner-auth";

interface RouteParams {
  params: Promise<{ partnerId: string }>;
}

/**
 * POST /api/v1/admin/partners/{partnerId}/referral-links
 * Creates a new trackable partner referral link.
 */
export async function POST(req: NextRequest, props: RouteParams) {
  // Admin or partner-scoped auth
  const { partner, response } = await authenticatePartner(req);
  if (!partner) return response!;

  const { partnerId } = await props.params;

  // Ensure a partner can only create links for themselves unless sandbox
  if (!partner.isSandbox && partner.code !== partnerId && partner.tier !== "enterprise") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "You can only create links for your own partner account." } },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    const convex = getConvexClient();
    const result = await convex.mutation(api.partnerLinks.createReferralLink, {
      partnerId,
      campaignName: body.campaign_name || body.campaignName,
      serviceScope: body.service_scope || body.serviceScope || "all_rehabilitation",
      defaultCareMode: body.default_care_mode || body.defaultCareMode || "patient_choice",
      expiresAt: body.expires_at ? new Date(body.expires_at).getTime() : undefined,
    });

    const host = req.headers.get("host") || "physioaroundme.com";
    const protocol = host.includes("localhost") ? "http" : "https";

    return NextResponse.json(
      {
        referral_link_id: result.referralLinkId,
        public_code: result.publicCode,
        url: `${protocol}://${host}/r/${result.publicCode}`,
        status: "active",
        created_at: result.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create referral link:", error);
    return NextResponse.json(
      {
        error: {
          code: "link_creation_failed",
          message: error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 }
    );
  }
}

interface ReferralLinkItem {
  _id: string;
  publicCode: string;
  campaignName?: string;
  serviceScope?: string;
  defaultCareMode?: string;
  status: string;
  expiresAt?: number;
  clicks?: number;
  leads?: number;
  joyStarts?: number;
  bookings?: number;
  payments?: number;
  conversionRate?: number;
  createdAt: number;
}

/**
 * GET /api/v1/admin/partners/{partnerId}/referral-links
 * Lists all referral links for a partner.
 */
export async function GET(req: NextRequest, props: RouteParams) {
  const { partner, response } = await authenticatePartner(req);
  if (!partner) return response!;

  const { partnerId } = await props.params;

  try {
    const convex = getConvexClient();
    const rawLinks = await convex.query(api.partnerLinks.listReferralLinks, {
      partnerId,
    });
    const links = (rawLinks || []) as ReferralLinkItem[];

    const host = req.headers.get("host") || "physioaroundme.com";
    const protocol = host.includes("localhost") ? "http" : "https";

    return NextResponse.json({
      status: "success",
      count: links.length,
      links: links.map((l: ReferralLinkItem) => ({
        referral_link_id: l._id,
        public_code: l.publicCode,
        url: `${protocol}://${host}/r/${l.publicCode}`,
        campaign_name: l.campaignName,
        service_scope: l.serviceScope,
        default_care_mode: l.defaultCareMode,
        status: l.status,
        expires_at: l.expiresAt ? new Date(l.expiresAt).toISOString() : null,
        performance: {
          clicks: l.clicks || 0,
          leads: l.leads || 0,
          joy_starts: l.joyStarts || 0,
          bookings: l.bookings || 0,
          payments: l.payments || 0,
          conversion_rate: l.conversionRate,
        },
        created_at: new Date(l.createdAt).toISOString(),
      })),
    });
  } catch (error) {
    console.error("Failed to list referral links:", error);
    return NextResponse.json(
      {
        error: {
          code: "list_failed",
          message: error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 }
    );
  }
}
