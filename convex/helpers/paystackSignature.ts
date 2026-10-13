/**
 * Verifies a Paystack webhook signature (x-paystack-signature = hex HMAC-SHA512 of the
 * raw body with the account secret key). Used by public Convex mutations that accept
 * Paystack webhooks, so only genuine Paystack events can change payment state.
 */
export async function verifyPaystackSignature(rawBody: string, signature: string): Promise<boolean> {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const actual = signature.trim().toLowerCase();
  if (expected.length !== actual.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return mismatch === 0;
}
