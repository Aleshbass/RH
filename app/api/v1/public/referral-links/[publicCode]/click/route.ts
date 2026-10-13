import type { NextRequest } from "next/server";
import { createHash } from "crypto";
import { getClientIp } from "@/lib/rate-limiter";
import { callPartnerGateway } from "@/lib/partner-api/gateway";
import { firstWithin, isLikelyBot } from "@/lib/partner-api/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records a landing-page visit for a referral link. Counted once per visitor per
 * 30 minutes (IP + user agent), bots and link-preview crawlers excluded. Always 204 so
 * the landing page never depends on it.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ publicCode: string }> }) {
  const publicCode = ((await props.params).publicCode ?? "").trim();
  const userAgent = req.headers.get("user-agent");
  if (publicCode && publicCode.length <= 64 && /^[A-Za-z0-9_-]+$/.test(publicCode) && !isLikelyBot(userAgent)) {
    const visitor = createHash("sha256").update(`${getClientIp(req)}|${userAgent}`).digest("hex").slice(0, 32);
    try {
      if (await firstWithin(`link-click:${publicCode}:${visitor}`, 30 * 60)) {
        await callPartnerGateway("recordLinkClick", { publicCode });
      }
    } catch (error) {
      console.warn("referral_link_click_failed", error instanceof Error ? error.message : error);
    }
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
