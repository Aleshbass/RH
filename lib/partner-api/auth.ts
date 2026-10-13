import type { NextRequest } from "next/server";
import { createHash } from "crypto";
import { after } from "next/server";
import { checkRateLimit, getClientIp, getRateLimitHeaders, type RateLimitTier } from "@/lib/rate-limiter";
import { callPartnerGateway, isPartnerGatewayConfigured } from "./gateway";
import { apiError, newRequestId, type ResponseContext } from "./http";
import { bumpCounter, firstWithin, readCounter } from "./limits";

export type PartnerEnvironment = "sandbox" | "live";

export interface AuthenticatedPartner {
  code: string;
  name: string;
  type: string;
  tier: string;
  environment: PartnerEnvironment;
  keyId: string;
  keyPrefix: string;
}

export type PartnerAuthResult =
  | { ok: true; partner: AuthenticatedPartner; ctx: ResponseContext; startedAt: number }
  | { ok: false; response: Response; ctx: ResponseContext };

const KEY_PATTERN = /^sk_(test|live)_[A-Za-z0-9]{24,128}$/;
const MAX_AUTH_FAILURES = 30; // per IP per 10 minutes
const AUTH_FAILURE_WINDOW_SECONDS = 600;

function extractKey(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header && /^bearer\s+/i.test(header)) return header.replace(/^bearer\s+/i, "").trim();
  const apiKey = req.headers.get("x-api-key");
  return apiKey ? apiKey.trim() : null;
}

function tierFor(environment: PartnerEnvironment, tier: string): RateLimitTier {
  if (environment === "sandbox") return "sandbox";
  return tier === "enterprise" ? "enterprise" : "standard";
}

/**
 * Authenticates a partner API request (Authorization: Bearer sk_… or X-API-Key).
 * Keys are hashed before leaving this process; only the hash is looked up in Convex.
 */
export async function authenticatePartner(req: NextRequest): Promise<PartnerAuthResult> {
  const startedAt = Date.now();
  const ctx: ResponseContext = { requestId: newRequestId() };
  const failureKey = `partner-auth-fail:${getClientIp(req)}`;

  // Throttle repeated authentication FAILURES per IP (credential stuffing).
  // Successful requests never count towards this limit.
  if ((await readCounter(failureKey)) >= MAX_AUTH_FAILURES) {
    return {
      ok: false,
      ctx,
      response: apiError(ctx, 429, "rate_limit_exceeded", "Too many failed authentication attempts from this IP address. Retry in 10 minutes.", {
        headers: { "Retry-After": String(AUTH_FAILURE_WINDOW_SECONDS) },
      }),
    };
  }
  const fail = async (response: Response): Promise<PartnerAuthResult> => {
    await bumpCounter(failureKey, AUTH_FAILURE_WINDOW_SECONDS);
    return { ok: false, ctx, response };
  };

  const key = extractKey(req);
  if (!key) {
    return fail(
      apiError(ctx, 401, "missing_api_key", 'Provide your secret key in the Authorization header: "Authorization: Bearer sk_test_…".', {
        headers: { "WWW-Authenticate": 'Bearer realm="Rehabify Partner API"' },
      })
    );
  }
  if (!KEY_PATTERN.test(key)) {
    return fail(apiError(ctx, 401, "invalid_api_key", "The API key is invalid or has been revoked."));
  }
  if (!isPartnerGatewayConfigured()) {
    console.error("partner_api_misconfigured: CONVEX_PARTNER_GATEWAY_SECRET missing");
    return { ok: false, ctx, response: apiError(ctx, 503, "service_unavailable", "The partner API is temporarily unavailable.") };
  }

  let auth: any;
  try {
    auth = await callPartnerGateway("authenticate", { keyHash: createHash("sha256").update(key, "utf8").digest("hex") });
  } catch {
    return {
      ok: false,
      ctx,
      response: apiError(ctx, 503, "service_unavailable", "Unable to verify API credentials right now. Retry shortly."),
    };
  }

  if (!auth?.ok) {
    const code: string = auth?.code ?? "invalid_api_key";
    if (code === "partner_inactive") {
      return { ok: false, ctx, response: apiError(ctx, 403, code, "Your partner organisation is not active. Contact partners@physioaroundme.com.") };
    }
    if (code === "production_access_required") {
      return {
        ok: false,
        ctx,
        response: apiError(ctx, 403, code, "Production access is not approved for this organisation. Use a sandbox key or request go-live in the Partner Portal."),
      };
    }
    return fail(apiError(ctx, 401, "invalid_api_key", "The API key is invalid or has been revoked."));
  }

  const partner: AuthenticatedPartner = {
    code: auth.partnerCode,
    name: auth.partnerName,
    type: auth.partnerType,
    tier: auth.tier,
    environment: auth.environment,
    keyId: auth.keyId,
    keyPrefix: auth.keyPrefix,
  };
  ctx.environment = partner.environment;

  const limit = await checkRateLimit(`partner:${partner.code}:${partner.environment}`, tierFor(partner.environment, partner.tier));
  ctx.headers = getRateLimitHeaders(limit);
  if (!limit.success) {
    return { ok: false, ctx, response: apiError(ctx, 429, "rate_limit_exceeded", `Rate limit exceeded. Retry after ${limit.retryAfter}s.`) };
  }

  // Record "last used" at most once a minute per key, after the response is sent.
  after(async () => {
    try {
      if (await firstWithin(`key-touch:${partner.keyId}`, 60)) {
        await callPartnerGateway("touchApiKey", { keyId: partner.keyId });
      }
    } catch {
      /* best effort */
    }
  });

  return { ok: true, partner, ctx, startedAt };
}

/** Logs the request to the partner's API activity log after the response is sent. */
export function logPartnerRequest(
  req: NextRequest,
  auth: { partner: AuthenticatedPartner; ctx: ResponseContext; startedAt: number },
  response: Response,
  details: { eventType: string; trackingCode?: string; errorCode?: string }
): Response {
  const path = new URL(req.url).pathname;
  const documentedPath = path.startsWith("/api/v1") ? path : `/api${path}`;
  after(async () => {
    try {
      await callPartnerGateway("logApiRequest", {
        partnerCode: auth.partner.code,
        environment: auth.partner.environment,
        method: req.method,
        path: documentedPath,
        statusCode: response.status,
        latencyMs: Date.now() - auth.startedAt,
        requestId: auth.ctx.requestId,
        eventType: details.eventType,
        trackingCode: details.trackingCode,
        errorCode: details.errorCode,
      });
    } catch {
      /* best effort */
    }
  });
  return response;
}
