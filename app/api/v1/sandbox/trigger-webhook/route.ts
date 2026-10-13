import type { NextRequest } from "next/server";
import { authenticatePartner, logPartnerRequest } from "@/lib/partner-api/auth";
import { callPartnerGateway } from "@/lib/partner-api/gateway";
import { apiError, apiJson, coreError, internalError, readJsonObject } from "@/lib/partner-api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /v1/sandbox/trigger-webhook — sends a real, signed test event to YOUR configured
 * sandbox endpoint (signed with your sandbox secret). Sandbox keys only; there is no
 * arbitrary target URL.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;
  const { partner, ctx } = auth;
  if (partner.environment !== "sandbox") {
    return apiError(ctx, 403, "sandbox_only", "This endpoint is available with sandbox (sk_test_) keys only.");
  }
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return apiError(ctx, 400, "invalid_json", "The request body must be a JSON object.");
  const type = typeof parsed.value.type === "string" ? parsed.value.type : typeof parsed.value.event === "string" ? parsed.value.event : "ping";
  const referralId = typeof parsed.value.referral_id === "string" ? parsed.value.referral_id.trim().slice(0, 200) : undefined;
  try {
    const result = await callPartnerGateway("sandboxTriggerWebhook", { partnerCode: partner.code, type, referralIdentifier: referralId || undefined });
    const response = result?.ok ? apiJson(ctx, result.result, 202) : coreError(ctx, result);
    return logPartnerRequest(req, auth, response, { eventType: "api.sandbox_trigger_webhook", errorCode: result?.ok ? undefined : result?.code });
  } catch (error) {
    return logPartnerRequest(req, auth, internalError(ctx, error), { eventType: "api.sandbox_trigger_webhook", errorCode: "internal_error" });
  }
}
