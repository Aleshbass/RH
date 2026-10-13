/**
 * REMOVED. This module used a different, insecure signing scheme (body-only HMAC with a
 * default secret, no timestamp) and was never wired in.
 *
 * Partner webhooks are delivered only by the durable outbox in Convex:
 *   convex/helpers/partnerEvents.ts        (enqueue)
 *   convex/actions/partners/dispatchWebhook.ts (signed delivery + retries)
 */
export function dispatchPartnerWebhook(): never {
  throw new Error("dispatchPartnerWebhook was removed; use the Convex partner webhook outbox (convex/helpers/partnerEvents.ts).");
}
