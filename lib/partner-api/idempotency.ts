import { callPartnerGateway } from "./gateway";
import { apiError, apiJson, hashJson, internalError, type ResponseContext } from "./http";
import type { AuthenticatedPartner } from "./auth";

/**
 * Idempotency-Key support for POST endpoints (keys kept 24 hours per environment).
 *  - same key + same body → original response replayed (Idempotent-Replayed: true)
 *  - same key + different body → 422 idempotency_key_reused
 *  - same key while the first request is still running → 409 idempotency_request_in_progress
 * 5xx outcomes are not stored, so a retry with the same key re-executes.
 */
export async function runIdempotent(
  req: Request,
  partner: AuthenticatedPartner,
  ctx: ResponseContext,
  route: string,
  body: unknown,
  execute: () => Promise<{ status: number; body: unknown }>
): Promise<Response> {
  const key = req.headers.get("idempotency-key");
  if (key === null) {
    try {
      const result = await execute();
      return apiJson(ctx, result.body, result.status);
    } catch (error) {
      return internalError(ctx, error);
    }
  }
  if (!key.trim() || key.length > 255 || /[\u0000-\u001f]/.test(key)) {
    return apiError(ctx, 400, "invalid_parameter", "Idempotency-Key must be 1–255 printable characters.", { param: "Idempotency-Key" });
  }

  const scope = { partnerCode: partner.code, environment: partner.environment, key };
  let begin: { state: "new" | "replay" | "mismatch" | "in_progress"; status?: number; body?: string };
  try {
    begin = await callPartnerGateway("idempotencyBegin", { ...scope, route, requestHash: hashJson(body) });
  } catch (error) {
    return internalError(ctx, error);
  }
  if (begin.state === "replay") {
    return new Response(begin.body ?? "{}", {
      status: begin.status ?? 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Request-Id": ctx.requestId,
        "Idempotent-Replayed": "true",
        ...(ctx.environment ? { "X-Rehabify-Environment": ctx.environment } : {}),
        ...(ctx.headers ?? {}),
      },
    });
  }
  if (begin.state === "mismatch") {
    return apiError(ctx, 422, "idempotency_key_reused", "This Idempotency-Key was already used with a different request.", { param: "Idempotency-Key" });
  }
  if (begin.state === "in_progress") {
    return apiError(ctx, 409, "idempotency_request_in_progress", "A request with this Idempotency-Key is still being processed. Retry shortly.");
  }

  let result: { status: number; body: unknown };
  try {
    result = await execute();
  } catch (error) {
    await callPartnerGateway("idempotencyRelease", scope).catch(() => undefined);
    return internalError(ctx, error);
  }
  if (result.status >= 500) {
    await callPartnerGateway("idempotencyRelease", scope).catch(() => undefined);
  } else {
    await callPartnerGateway("idempotencyComplete", { ...scope, responseStatus: result.status, responseBody: JSON.stringify(result.body) }).catch(
      () => undefined
    );
  }
  return apiJson(ctx, result.body, result.status);
}

/** Builds the documented error body (used when an idempotent handler returns an error). */
export function errorBody(ctx: ResponseContext, status: number, code: string, message: string, extra: { param?: string; existing?: unknown } = {}) {
  const type =
    status === 401 ? "authentication_error" : status === 403 ? "permission_error" : status === 404 ? "not_found_error" : status === 409 ? "conflict_error" : status === 429 ? "rate_limit_error" : status >= 500 ? "api_error" : "invalid_request_error";
  return {
    status,
    body: {
      error: {
        type,
        code,
        message,
        ...(extra.param ? { param: extra.param } : {}),
        ...(extra.existing ? { existing: extra.existing } : {}),
        request_id: ctx.requestId,
        doc_url: `https://docs.physioaroundme.com/getting-started/errors#${code}`,
      },
    },
  };
}
