import { NextRequest, NextResponse } from "next/server";
import { authenticatePartner } from "@/lib/partner-auth";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";

export async function GET(req: NextRequest) {
  const { partner, response } = await authenticatePartner(req);
  if (!partner) return response!;

  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city") || undefined;
    const specialty = searchParams.get("specialty") || undefined;
    const limit = Number(searchParams.get("limit")) || 20;

    const convex = getConvexClient();
    const providers = await convex.query(api.partners.searchVerifiedProviders, {
      city,
      specialty,
      limit,
    });

    return NextResponse.json({
      status: "success",
      count: providers.length,
      city_filter: city || "all",
      specialty_filter: specialty || "all",
      providers,
    });
  } catch (error) {
    console.error("Provider search error:", error);
    return NextResponse.json(
      {
        error: {
          code: "provider_search_failed",
          message:
            error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 }
    );
  }
}
