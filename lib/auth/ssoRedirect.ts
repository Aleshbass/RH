/**
 * Build Clerk OAuth URLs from a same-origin application route.
 *
 * Clerk OAuth redirects must be absolute. Keeping the requested destination in
 * the callback query string also lets our callback recover if Clerk omits the
 * final redirect during a provider round-trip.
 */
export function toSafeInternalPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  return value;
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
