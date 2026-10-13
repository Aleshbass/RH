import type { NextRequest } from "next/server";
import { authenticatePartner, logPartnerRequest } from "@/lib/partner-api/auth";
import { callPartnerGateway } from "@/lib/partner-api/gateway";
import { apiError, apiJson, coreError, internalError, readJsonObject } from "@/lib/partner-api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGETS = ["contacted", "booked", "in_treatment", "completed", "not_suitable", "cancelled", "closed"];

/**
 * POST /v1/sandbox/referrals/{id}/advance — move a sandbox referral forward through its
 * lifecycle. Fires exactly the webhooks a real transition fires.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ referralId: string }> }) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;
  const { partner, ctx } = auth;
  if (partner.environment !== "sandbox") {
    return apiError(ctx, 403, "sandbox_only", "This endpoint is available with sandbox (sk_test_) keys only.");
  }
  const identifier = ((await props.params).referralId ?? "").trim();
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return apiError(ctx, 400, "invalid_json", "The request body must be a JSON object.");
  const status = parsed.value.status;
  if (typeof status !== "string" || !TARGETS.includes(status)) {
    return apiError(ctx, 422, "validation_error", `status must be one of: ${TARGETS.join(", ")}.`, { param: "status" });
  }
  try {
    const result = await callPartnerGateway("sandboxAdvanceReferral", { partnerCode: partner.code, identifier, status });
    const response = result?.ok ? apiJson(ctx, result.referral) : coreError(ctx, result);
    return logPartnerRequest(req, auth, response, {
      eventType: "api.sandbox_advance",
      trackingCode: result?.referral?.tracking_code,
      errorCode: result?.ok ? undefined : result?.code,
    });
  } catch (error) {
    return logPartnerRequest(req, auth, internalError(ctx, error), { eventType: "api.sandbox_advance", errorCode: "internal_error" });
  }
}
