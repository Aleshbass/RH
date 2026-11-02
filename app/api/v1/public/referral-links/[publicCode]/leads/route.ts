import type { NextRequest } from "next/server";
import { checkRateLimit, getClientIp, getRateLimitHeaders } from "@/lib/rate-limiter";
import { callPartnerGateway } from "@/lib/partner-api/gateway";
import { apiError, apiJson, coreError, internalError, newRequestId, readJsonObject, type ResponseContext } from "@/lib/partner-api/http";
import { validateLead } from "@/lib/partner-api/validation";
import { publicAppUrl } from "@/lib/public-app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function joyNumber(): string {
  return (process.env.NEXT_PUBLIC_JOY_WHATSAPP_NUMBER || "2348122615453").replace(/\D/g, "");
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * POST /v1/public/referral-links/{public_code}/leads — no-code lead capture.
 * Public (no key), CORS-enabled, rate limited per IP (5 per 10 minutes), explicit
 * consent required. Duplicate submissions never reveal an existing tracking code.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ publicCode: string }> }) {
  const ctx: ResponseContext = { requestId: newRequestId(), headers: CORS };
  const publicCode = ((await props.params).publicCode ?? "").trim();
  if (!publicCode || publicCode.length > 64 || !/^[A-Za-z0-9_-]+$/.test(publicCode)) {
    return apiError(ctx, 404, "referral_link_not_found", "This referral link does not exist.");
  }

  const limit = await checkRateLimit(`lead:${getClientIp(req)}`, "public_form");
  if (!limit.success) {
    return apiError(ctx, 429, "rate_limit_exceeded", "Too many submissions. Please try again in a few minutes.", {
      headers: getRateLimitHeaders(limit),
    });
  }

  const parsed = await readJsonObject(req);
  if (!parsed.ok) return apiError(ctx, 400, "invalid_json", "The request body must be a JSON object.");
  // Honeypot: real visitors never fill the hidden "website" field.
  if (typeof parsed.value.website === "string" && parsed.value.website.trim() !== "") {
    return apiJson(ctx, { object: "lead", tracking_code: null, status: null, duplicate: true, tracking_url: null, whatsapp_intake_url: null }, 200);
  }
  const validation = validateLead(parsed.value);
  if (!validation.ok) {
    return apiError(ctx, 422, validation.code ?? "validation_error", validation.message, { param: validation.param });
  }

  try {
    const result = await callPartnerGateway("submitLead", { publicCode, input: validation.input });
    if (!result?.ok) return coreError(ctx, result);
    if (result.duplicate) {
      return apiJson(ctx, { object: "lead", tracking_code: null, status: null, duplicate: true, tracking_url: null, whatsapp_intake_url: null }, 200);
    }
    const code: string = result.trackingCode;
    return apiJson(
      ctx,
      {
        object: "lead",
        tracking_code: code,
        status: "received",
        duplicate: false,
        tracking_url: `${publicAppUrl()}/track/${encodeURIComponent(code)}`,
        whatsapp_intake_url: `https://wa.me/${joyNumber()}?text=${encodeURIComponent(`START ${code}`)}`,
      },
      201
    );
  } catch (error) {
    return internalError(ctx, error);
  }
}
