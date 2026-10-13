import type { NextRequest } from "next/server";
import { authenticatePartner, logPartnerRequest } from "@/lib/partner-api/auth";
import { callPartnerGateway } from "@/lib/partner-api/gateway";
import { apiError, apiJson, coreError, internalError, readJsonObject } from "@/lib/partner-api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /v1/partners/referral-links/{id} — activate or deactivate a link. */
export async function PATCH(req: NextRequest, props: { params: Promise<{ linkId: string }> }) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;
  const { partner, ctx } = auth;
  const { linkId } = await props.params;
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return apiError(ctx, 400, "invalid_json", "The request body must be a JSON object.");
  const status = parsed.value.status;
  if (status !== "active" && status !== "inactive") {
    return apiError(ctx, 422, "validation_error", "status must be one of: active, inactive.", { param: "status" });
  }
  try {
    const result = await callPartnerGateway("updateReferralLinkStatus", {
      partnerCode: partner.code,
      environment: partner.environment,
      linkId: String(linkId ?? "").slice(0, 64),
      status,
    });
    const response = result?.ok ? apiJson(ctx, result.link) : coreError(ctx, result);
    return logPartnerRequest(req, auth, response, { eventType: "api.referral_link_update", errorCode: result?.ok ? undefined : result?.code });
  } catch (error) {
    return logPartnerRequest(req, auth, internalError(ctx, error), { eventType: "api.referral_link_update", errorCode: "internal_error" });
  }
}
