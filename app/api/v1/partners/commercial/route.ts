import type { NextRequest } from "next/server";
import { authenticatePartner, logPartnerRequest } from "@/lib/partner-api/auth";
import { callPartnerGateway } from "@/lib/partner-api/gateway";
import { apiJson, internalError } from "@/lib/partner-api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /v1/partners/commercial — contract terms and earnings summary (live earnings only). */
export async function GET(req: NextRequest) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;
  const { partner, ctx } = auth;
  try {
    const result = await callPartnerGateway("getCommercial", { partnerCode: partner.code, environment: partner.environment });
    return logPartnerRequest(req, auth, apiJson(ctx, result.terms), { eventType: "api.commercial_get" });
  } catch (error) {
    return logPartnerRequest(req, auth, internalError(ctx, error), { eventType: "api.commercial_get", errorCode: "internal_error" });
  }
}
