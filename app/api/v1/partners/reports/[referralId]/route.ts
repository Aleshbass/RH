import type { NextRequest } from "next/server";
import { authenticatePartner, logPartnerRequest } from "@/lib/partner-api/auth";
import { callPartnerGateway } from "@/lib/partner-api/gateway";
import { apiError, apiJson, coreError, internalError } from "@/lib/partner-api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /v1/partners/reports/{id} — progress report (milestones and session counts, no clinical notes). */
export async function GET(req: NextRequest, props: { params: Promise<{ referralId: string }> }) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;
  const { partner, ctx } = auth;
  const identifier = ((await props.params).referralId ?? "").trim();
  if (!identifier || identifier.length > 200) {
    return apiError(ctx, 400, "invalid_parameter", "A referral id, tracking code or partner_reference is required.", { param: "id" });
  }
  try {
    const result = await callPartnerGateway("getReport", { partnerCode: partner.code, environment: partner.environment, identifier });
    const response = result?.ok ? apiJson(ctx, result.report) : coreError(ctx, result);
    return logPartnerRequest(req, auth, response, {
      eventType: "api.report_get",
      trackingCode: result?.report?.referral?.tracking_code,
      errorCode: result?.ok ? undefined : result?.code,
    });
  } catch (error) {
    return logPartnerRequest(req, auth, internalError(ctx, error), { eventType: "api.report_get", errorCode: "internal_error" });
  }
}
