import type { NextRequest } from "next/server";
import { authenticatePartner, logPartnerRequest } from "@/lib/partner-api/auth";
import { callPartnerGateway } from "@/lib/partner-api/gateway";
import { apiError, apiJson, coreError, internalError, listBody, parseIsoParam, parseLimit, readJsonObject } from "@/lib/partner-api/http";
import { errorBody, runIdempotent } from "@/lib/partner-api/idempotency";
import { validateReferralCreate } from "@/lib/partner-api/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_STATUSES = ["received", "contacted", "booked", "in_treatment", "completed", "not_suitable", "cancelled", "closed"];

/** POST /v1/partners/referrals — create a referral. */
export async function POST(req: NextRequest) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;
  const { partner, ctx } = auth;

  const parsed = await readJsonObject(req);
  if (!parsed.ok) {
    return logPartnerRequest(req, auth, apiError(ctx, 400, "invalid_json", "The request body must be a JSON object."), {
      eventType: "api.referral_create",
      errorCode: "invalid_json",
    });
  }

  const response = await runIdempotent(req, partner, ctx, "POST /partners/referrals", parsed.value, async () => {
    const validation = validateReferralCreate(parsed.value);
    if (!validation.ok) {
      return errorBody(ctx, 422, validation.code ?? "validation_error", validation.message, { param: validation.param });
    }
    const result = await callPartnerGateway("createReferral", {
      partnerCode: partner.code,
      environment: partner.environment,
      input: validation.input,
    });
    if (!result?.ok) {
      return errorBody(ctx, result?.status ?? 500, result?.code ?? "internal_error", result?.message ?? "Referral could not be created.", {
        param: result?.param,
        existing: result?.existing,
      });
    }
    return { status: 201, body: result.referral };
  });

  let trackingCode: string | undefined;
  let errorCode: string | undefined;
  try {
    const body = await response.clone().json();
    trackingCode = body?.tracking_code;
    errorCode = body?.error?.code;
  } catch {
    /* non-JSON */
  }
  return logPartnerRequest(req, auth, response, { eventType: "api.referral_create", trackingCode, errorCode });
}

/** GET /v1/partners/referrals — list referrals (cursor pagination). */
export async function GET(req: NextRequest) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;
  const { partner, ctx } = auth;
  const params = req.nextUrl.searchParams;

  const limit = parseLimit(params.get("limit"));
  if (limit === null) return apiError(ctx, 400, "invalid_parameter", "limit must be an integer between 1 and 100.", { param: "limit" });
  const status = params.get("status") || undefined;
  if (status && !PUBLIC_STATUSES.includes(status)) {
    return apiError(ctx, 400, "invalid_parameter", `status must be one of: ${PUBLIC_STATUSES.join(", ")}.`, { param: "status" });
  }
  const createdAfter = parseIsoParam(params.get("created_after"));
  const createdBefore = parseIsoParam(params.get("created_before"));
  if (createdAfter === null) return apiError(ctx, 400, "invalid_parameter", "created_after must be an ISO-8601 timestamp.", { param: "created_after" });
  if (createdBefore === null) return apiError(ctx, 400, "invalid_parameter", "created_before must be an ISO-8601 timestamp.", { param: "created_before" });
  const cursor = params.get("cursor") || undefined;
  if (cursor && cursor.length > 2000) return apiError(ctx, 400, "invalid_parameter", "cursor is invalid.", { param: "cursor" });

  try {
    const result = await callPartnerGateway("listReferrals", {
      partnerCode: partner.code,
      environment: partner.environment,
      limit,
      cursor,
      status,
      partnerReference: params.get("partner_reference") || undefined,
      createdAfter,
      createdBefore,
    });
    const response = result?.ok ? apiJson(ctx, listBody(result.data, result.hasMore, result.nextCursor)) : coreError(ctx, result);
    return logPartnerRequest(req, auth, response, { eventType: "api.referral_list" });
  } catch (error) {
    return logPartnerRequest(req, auth, internalError(ctx, error), { eventType: "api.referral_list", errorCode: "internal_error" });
  }
}
