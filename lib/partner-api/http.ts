import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";

/**
 * Response helpers implementing the documented partner API conventions:
 * one error shape, X-Request-Id on every response, list envelopes, ISO dates.
 */

export type ErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "not_found_error"
  | "conflict_error"
  | "rate_limit_error"
  | "api_error";

const TYPE_FOR_STATUS: Record<number, ErrorType> = {
  400: "invalid_request_error",
  401: "authentication_error",
  403: "permission_error",
  404: "not_found_error",
  409: "conflict_error",
  410: "invalid_request_error",
  422: "invalid_request_error",
  429: "rate_limit_error",
};

export const DOCS_ERRORS_URL = "https://docs.physioaroundme.com/getting-started/errors";

export function newRequestId(): string {
  return `req_${randomBytes(12).toString("hex")}`;
}

export type ResponseContext = {
  requestId: string;
  environment?: "sandbox" | "live";
  headers?: Record<string, string>;
};

function baseHeaders(ctx: ResponseContext): Record<string, string> {
  return {
    "X-Request-Id": ctx.requestId,
    "Cache-Control": "no-store",
    ...(ctx.environment ? { "X-Rehabify-Environment": ctx.environment } : {}),
    ...(ctx.headers ?? {}),
  };
}

export function apiJson(ctx: ResponseContext, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...baseHeaders(ctx), ...extraHeaders } });
}

export function apiError(
  ctx: ResponseContext,
  status: number,
  code: string,
  message: string,
  extra: { param?: string; existing?: unknown; headers?: Record<string, string>; type?: ErrorType } = {}
) {
  const error: Record<string, unknown> = {
    type: extra.type ?? TYPE_FOR_STATUS[status] ?? "api_error",
    code,
    message,
  };
  if (extra.param) error.param = extra.param;
  if (extra.existing) error.existing = extra.existing;
  error.request_id = ctx.requestId;
  error.doc_url = `${DOCS_ERRORS_URL}#${code}`;
  return NextResponse.json({ error }, { status, headers: { ...baseHeaders(ctx), ...(extra.headers ?? {}) } });
}

/** Converts a Convex core result `{ ok:false, status, code, message, param?, existing? }`. */
export function coreError(ctx: ResponseContext, result: { status: number; code: string; message: string; param?: string; existing?: unknown }) {
  return apiError(ctx, result.status, result.code, result.message, { param: result.param, existing: result.existing });
}

export function internalError(ctx: ResponseContext, error: unknown) {
  console.error("partner_api_internal_error", {
    requestId: ctx.requestId,
    error: error instanceof Error ? error.message : String(error),
  });
  const unavailable = (error as { status?: number })?.status === 503;
  return unavailable
    ? apiError(ctx, 503, "service_unavailable", "The service is temporarily unavailable. Retry with exponential backoff.")
    : apiError(ctx, 500, "internal_error", "An unexpected error occurred. It is safe to retry with the same Idempotency-Key.");
}

export function listBody<T>(data: T[], hasMore: boolean, nextCursor: string | null) {
  return { object: "list", data, has_more: hasMore, next_cursor: nextCursor };
}

/** Parses a JSON object body; returns null when the body is not a JSON object. */
export async function readJsonObject(req: Request): Promise<{ ok: true; value: Record<string, unknown>; raw: string } | { ok: false }> {
  const raw = await req.text();
  if (raw.length > 256 * 1024) return { ok: false };
  try {
    const value = JSON.parse(raw || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
    return { ok: true, value, raw };
  } catch {
    return { ok: false };
  }
}

/** Stable hash of a JSON value (key order independent) for idempotency comparisons. */
export function hashJson(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object") {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = canonical((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function parseLimit(raw: string | null, fallback = 25): number | null {
  if (raw === null || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= 100 ? n : null;
}

/** Parses an ISO-8601 timestamp query parameter; undefined when absent, null when invalid. */
export function parseIsoParam(raw: string | null): number | undefined | null {
  if (raw === null || raw === "") return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}
