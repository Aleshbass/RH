/**
 * Build Clerk OAuth URLs from a same-origin application route.
 *
 * Clerk OAuth redirects must be absolute. Keeping the requested destination in
 * the callback query string also lets our callback recover if Clerk omits the
 * final redirect during a provider round-trip.
 */
export function toSafeInternalPath(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  // Clerk sends full addresses (https://myrehabifyhealth.com/dashboard/...): keep the path when
  // it's this site (or one of its subdomains, e.g. learn. or admin.), so deep links survive sign-in
  return sameSitePath(value) ?? fallback;
}

/** "/path?query#hash" of an absolute URL on this site, else null. */
function sameSitePath(value: string): string | null {
  if (typeof window === "undefined") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const site = (host: string) => host.replace(/^(www|learn|admin)\./, "");
  if (url.origin !== window.location.origin && site(url.host) !== site(window.location.host)) return null;
  const path = `${url.pathname}${url.search}${url.hash}`;
  return path.startsWith("//") ? null : path;
}

export function buildSsoRedirectUrls(target: string) {
  const safeTarget = toSafeInternalPath(target, "/");
  const callbackUrl = new URL("/sso-callback", window.location.origin);
  callbackUrl.searchParams.set("post_auth_redirect", safeTarget);

  return {
    redirectUrl: callbackUrl.toString(),
    redirectUrlComplete: new URL(safeTarget, window.location.origin).toString(),
  };
}
