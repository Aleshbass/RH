import type { NextRequest } from "next/server";
import { authenticatePartner } from "@/lib/partner-api/auth";
import { apiError } from "@/lib/partner-api/http";
import { GET as listLinks, POST as createLink } from "@/app/api/v1/partners/referral-links/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Legacy path kept for early integrations: /v1/admin/partners/{partnerId}/referral-links.
 * It now behaves exactly like /v1/partners/referral-links and only ever acts on the
 * caller's own organisation — a key can never create or read another partner's links.
 */
async function guard(req: NextRequest, partnerId: string): Promise<Response | null> {
  const auth = await authenticatePartner(req.clone() as NextRequest);
  if (!auth.ok) return auth.response;
  if (auth.partner.code !== partnerId) {
    // Another organisation's links are indistinguishable from non-existent ones.
    return apiError(auth.ctx, 404, "resource_not_found", "Unknown endpoint for this API key. Use /v1/partners/referral-links.");
  }
  return null;
}

export async function POST(req: NextRequest, props: { params: Promise<{ partnerId: string }> }) {
  const denied = await guard(req, (await props.params).partnerId);
  return denied ?? createLink(req);
}

export async function GET(req: NextRequest, props: { params: Promise<{ partnerId: string }> }) {
  const denied = await guard(req, (await props.params).partnerId);
  return denied ?? listLinks(req);
}
