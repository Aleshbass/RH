import type { NextRequest } from "next/server";
import { authenticatePartner, logPartnerRequest } from "@/lib/partner-api/auth";
import { apiError, apiJson, readJsonObject } from "@/lib/partner-api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /v1/partners/eligibility — COMING SOON.
 * Live keys receive 501 until real HMO eligibility checks exist (no simulated answers
 * are ever returned in live). Sandbox keys get a clearly-labelled simulated preview.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;
  const { partner, ctx } = auth;

  if (partner.environment === "live") {
    return logPartnerRequest(
      req,
      auth,
      apiError(ctx, 501, "feature_not_available", "Real-time eligibility checks are coming soon. Contact partners@physioaroundme.com to join the pilot.", {
        type: "api_error",
      }),
      { eventType: "api.eligibility_check", errorCode: "feature_not_available" }
    );
  }

  const parsed = await readJsonObject(req);
  if (!parsed.ok) return apiError(ctx, 400, "invalid_json", "The request body must be a JSON object.");
  const memberId = typeof parsed.value.member_id === "string" ? parsed.value.member_id.trim() : "";
  if (!memberId || memberId.length > 100) {
    return apiError(ctx, 422, "validation_error", "member_id is required (1–100 characters).", { param: "member_id" });
  }
  const requested = parsed.value.requested_sessions;
  if (requested !== undefined && (typeof requested !== "number" || !Number.isInteger(requested) || requested < 1 || requested > 52)) {
    return apiError(ctx, 422, "validation_error", "requested_sessions must be an integer between 1 and 52.", { param: "requested_sessions" });
  }
  const eligible = !memberId.toUpperCase().includes("EXPIRED");
  const response = apiJson(ctx, {
    object: "eligibility_check",
    simulated: true,
    eligible,
    member_id: memberId,
    approved_sessions: eligible ? (typeof requested === "number" ? requested : 6) : 0,
    reason: eligible ? null : "policy_inactive",
  });
  return logPartnerRequest(req, auth, response, { eventType: "api.eligibility_check" });
}
