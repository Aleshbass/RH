import type { NextRequest } from "next/server";
import { authenticatePartner, logPartnerRequest } from "@/lib/partner-api/auth";
import { callPartnerGateway } from "@/lib/partner-api/gateway";
import { apiError, apiJson, coreError, internalError, listBody, parseLimit } from "@/lib/partner-api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["pending", "approved", "paid", "reversed", "cancelled"];

/** GET /v1/partners/commissions — commission ledger (sandbox always returns an empty list). */
export async function GET(req: NextRequest) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;
  const { partner, ctx } = auth;
  const params = req.nextUrl.searchParams;
  const limit = parseLimit(params.get("limit"));
  if (limit === null) return apiError(ctx, 400, "invalid_parameter", "limit must be an integer between 1 and 100.", { param: "limit" });
  const status = params.get("status") || undefined;
  if (status && !STATUSES.includes(status)) {
    return apiError(ctx, 400, "invalid_parameter", `status must be one of: ${STATUSES.join(", ")}.`, { param: "status" });
  }
  const billingPeriod = params.get("billing_period") || undefined;
  if (billingPeriod && !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingPeriod)) {
    return apiError(ctx, 400, "invalid_parameter", "billing_period must be YYYY-MM.", { param: "billing_period" });
  }
  try {
    const result = await callPartnerGateway("listCommissions", {
      partnerCode: partner.code,
      environment: partner.environment,
      status,
      billingPeriod,
      limit,
      cursor: params.get("cursor") || undefined,
    });
    const response = result?.ok ? apiJson(ctx, listBody(result.data, result.hasMore, result.nextCursor)) : coreError(ctx, result);
    return logPartnerRequest(req, auth, response, { eventType: "api.commissions_list" });
  } catch (error) {
    return logPartnerRequest(req, auth, internalError(ctx, error), { eventType: "api.commissions_list", errorCode: "internal_error" });
  }
}
