/**
 * Secret that lets our Next.js server routes call Convex functions reserved for server
 * callers (convex/helpers/serverSecret.ts). Same value as CONVEX_SERVER_SECRET in Convex.
 */
export function convexServerSecret(): string {
  const secret = process.env.CONVEX_SERVER_SECRET;
  if (!secret || secret.length < 32) throw new Error("CONVEX_SERVER_SECRET is not configured");
  return secret;
}
