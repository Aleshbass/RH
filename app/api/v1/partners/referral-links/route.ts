import type { NextRequest } from "next/server";
import { authenticatePartner, logPartnerRequest } from "@/lib/partner-api/auth";
import { callPartnerGateway } from "@/lib/partner-api/gateway";
import { apiError, apiJson, coreError, internalError, listBody, parseLimit, readJsonObject } from "@/lib/partner-api/http";
import { errorBody, runIdempotent } from "@/lib/partner-api/idempotency";
import { validateLinkCreate } from "@/lib/partner-api/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /v1/partners/referral-links — create a no-code referral link (inherits the key's environment). */
export async function POST(req: NextRequest) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;
  const { partner, ctx } = auth;
  // Every field is optional, so an empty body is accepted.
  const raw = (await req.text()).trim();
  let body: Record<string, unknown> = {};
  if (raw) {
    const parsed = await readJsonObject(new Request("http://local", { method: "POST", body: raw }));
    if (!parsed.ok) return apiError(ctx, 400, "invalid_json", "The request body must be a JSON object.");
    body = parsed.value;
  }
  const response = await runIdempotent(req, partner, ctx, "POST /partners/referral-links", body, async () => {
    const validation = validateLinkCreate(body);
    if (!validation.ok) return errorBody(ctx, 422, "validation_error", validation.message, { param: validation.param });
    const result = await callPartnerGateway("createReferralLink", {
      partnerCode: partner.code,
      environment: partner.environment,
      ...validation.input,
      createdBy: `api:${partner.keyPrefix}`,
    });
    if (!result?.ok) return errorBody(ctx, result?.status ?? 500, result?.code ?? "internal_error", result?.message ?? "Could not create the link.", { param: result?.param });
    return { status: 201, body: result.link };
  });
  return logPartnerRequest(req, auth, response, { eventType: "api.referral_link_create" });
}

/** GET /v1/partners/referral-links — list your links with stats. */
export async function GET(req: NextRequest) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;
  const { partner, ctx } = auth;
  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
  if (limit === null) return apiError(ctx, 400, "invalid_parameter", "limit must be an integer between 1 and 100.", { param: "limit" });
  try {
    const result = await callPartnerGateway("listReferralLinks", {
      partnerCode: partner.code,
      environment: partner.environment,
      limit,
      cursor: req.nextUrl.searchParams.get("cursor") || undefined,
    });
    const response = result?.ok ? apiJson(ctx, listBody(result.data, result.hasMore, result.nextCursor)) : coreError(ctx, result);
    return logPartnerRequest(req, auth, response, { eventType: "api.referral_link_list" });
  } catch (error) {
    return logPartnerRequest(req, auth, internalError(ctx, error), { eventType: "api.referral_link_list", errorCode: "internal_error" });
  }
}
