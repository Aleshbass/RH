const PRODUCTION_HOST = "physioaroundme.com";

/**
 * Base URL for links the Next.js server hands out (tracking links, referral links,
 * payment callbacks). Mirrors convex/helpers/appUrl.ts: www.physioaroundme.com has no
 * DNS, so a "www." base is rewritten to the apex. Never derive links from the request
 * Host header — on api./partners. subdomains that produces broken URLs.
 */
export function publicAppUrl(): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || `https://${PRODUCTION_HOST}`;
  try {
    const url = new URL(configured);
    if (url.hostname === `www.${PRODUCTION_HOST}`) url.hostname = PRODUCTION_HOST;
    return url.origin;
  } catch {
    return `https://${PRODUCTION_HOST}`;
  }
}

/** Public base URL of the partner REST API (documented). */
export function partnerApiBaseUrl(): string {
  return (process.env.PARTNER_API_BASE_URL || "https://api.physioaroundme.com/v1").replace(/\/$/, "");
}
