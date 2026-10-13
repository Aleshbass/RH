import type { NextRequest } from "next/server";
import { authenticatePartner, logPartnerRequest } from "@/lib/partner-api/auth";
import { callPartnerGateway } from "@/lib/partner-api/gateway";
import { apiError, apiJson, internalError, listBody, parseLimit } from "@/lib/partner-api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /v1/partners/providers — approved physiotherapists accepting patients. */
export async function GET(req: NextRequest) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;
  const { ctx } = auth;
  const params = req.nextUrl.searchParams;
  const limit = parseLimit(params.get("limit"));
  if (limit === null) return apiError(ctx, 400, "invalid_parameter", "limit must be an integer between 1 and 100.", { param: "limit" });
  const mode = params.get("mode") || undefined;
  if (mode && mode !== "virtual" && mode !== "in_person") {
    return apiError(ctx, 400, "invalid_parameter", "mode must be one of: virtual, in_person.", { param: "mode" });
  }
  const text = (name: string) => {
    const value = params.get(name)?.trim();
    return value ? value.slice(0, 100) : undefined;
  };
  try {
    const result = await callPartnerGateway("listProviders", {
      city: text("city"),
      state: text("state"),
      specialty: text("specialty"),
      mode,
      limit,
    });
    return logPartnerRequest(req, auth, apiJson(ctx, listBody(result.data, result.hasMore, null)), { eventType: "api.providers_list" });
  } catch (error) {
    return logPartnerRequest(req, auth, internalError(ctx, error), { eventType: "api.providers_list", errorCode: "internal_error" });
  }
}
