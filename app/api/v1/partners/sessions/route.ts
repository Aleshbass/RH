import type { NextRequest } from "next/server";
import { authenticatePartner, logPartnerRequest } from "@/lib/partner-api/auth";
import { callPartnerGateway } from "@/lib/partner-api/gateway";
import { apiError, apiJson, coreError, internalError, listBody, parseIsoParam, parseLimit } from "@/lib/partner-api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["scheduled", "completed", "cancelled", "no_show"];

/** GET /v1/partners/sessions — appointments for your referrals (no clinical notes). */
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
  const from = parseIsoParam(params.get("from"));
  const to = parseIsoParam(params.get("to"));
  if (from === null) return apiError(ctx, 400, "invalid_parameter", "from must be an ISO-8601 timestamp.", { param: "from" });
  if (to === null) return apiError(ctx, 400, "invalid_parameter", "to must be an ISO-8601 timestamp.", { param: "to" });

  try {
    const result = await callPartnerGateway("listSessions", {
      partnerCode: partner.code,
      environment: partner.environment,
      referralIdentifier: params.get("referral_id")?.trim() || undefined,
      status,
      from,
      to,
      limit,
    });
    const response = result?.ok ? apiJson(ctx, listBody(result.data, result.hasMore, null)) : coreError(ctx, result);
    return logPartnerRequest(req, auth, response, { eventType: "api.sessions_list", errorCode: result?.ok ? undefined : result?.code });
  } catch (error) {
    return logPartnerRequest(req, auth, internalError(ctx, error), { eventType: "api.sessions_list", errorCode: "internal_error" });
  }
}
