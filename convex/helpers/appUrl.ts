const PRODUCTION_HOST = "physioaroundme.com";

/**
 * Base URL for every link Convex sends (emails, WhatsApp via Joy, invites).
 * Only the bare domain has DNS: www.physioaroundme.com does not resolve, so a
 * "www." base from the environment is corrected here instead of being mailed
 * out as a dead link. Returns an origin with no trailing slash.
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

/** Absolute link for emails: a relative app path ("/dashboard/...") is put on publicAppUrl(). */
export function appLink(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${publicAppUrl()}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}
