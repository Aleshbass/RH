"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import crypto from "crypto";
import { lookup } from "dns/promises";
import { isPrivateAddress, validateWebhookUrl } from "../../helpers/partnerShared";

const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2048;

async function readSnippet(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (received < MAX_RESPONSE_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, MAX_RESPONSE_BYTES).toString("utf8");
}

/** DNS-level SSRF guard: every resolved address must be public. */
async function assertPublicHost(hostname: string): Promise<void> {
  if (isPrivateAddress(hostname)) throw new Error("Endpoint resolves to a private address");
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error("Endpoint hostname did not resolve");
  for (const entry of addresses) {
    if (isPrivateAddress(entry.address)) throw new Error("Endpoint resolves to a private address");
  }
}

/**
 * Delivers one outbox event (one attempt). Retries are scheduled by
 * partnerWebhooks.completeDeliveryAttempt. Signature: HMAC-SHA256 hex of
 * "<timestamp>.<raw body>", sent as `X-Rehabify-Signature: t=<ts>,v1=<hex>`.
 */
export const deliverPartnerWebhook = internalAction({
  args: { deliveryId: v.id("partnerWebhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const claim = await ctx.runMutation(internal.partnerWebhooks.beginDeliveryAttempt, { deliveryId });
    if (!claim.proceed) return;

    const started = Date.now();
    let ok = false;
    let statusCode: number | undefined;
    let error: string | undefined;
    let responseSnippet: string | undefined;

    try {
      const checked = validateWebhookUrl(claim.url);
      if (!checked.ok) throw new Error(`Endpoint rejected: ${checked.error}`);
      const url = new URL(checked.url);
      await assertPublicHost(url.hostname);

      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto.createHmac("sha256", claim.secret).update(`${timestamp}.${claim.payload}`, "utf8").digest("hex");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: "POST",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Rehabify-Webhooks/1.0",
            "X-Rehabify-Event-Id": claim.eventId,
            "X-Rehabify-Event-Type": claim.eventType,
            "X-Rehabify-Environment": claim.environment,
            "X-Rehabify-Delivery-Attempt": String(claim.attempt),
            "X-Rehabify-Timestamp": String(timestamp),
            "X-Rehabify-Signature": `t=${timestamp},v1=${signature}`,
          },
          body: claim.payload,
        });
        statusCode = response.status;
        // The timeout keeps running while the (bounded) body is read.
        responseSnippet = await readSnippet(response);
        if (response.status >= 200 && response.status < 300) {
          ok = true;
        } else if (response.status >= 300 && response.status < 400) {
          error = `Endpoint responded with a redirect (HTTP ${response.status}); redirects are not followed`;
        } else {
          error = `Endpoint responded with HTTP ${response.status}`;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const e = err as { name?: string; message?: string };
      error = e?.name === "AbortError" ? `Timed out after ${TIMEOUT_MS / 1000}s` : `Delivery failed: ${e?.message ?? String(err)}`;
    }

    await ctx.runMutation(internal.partnerWebhooks.completeDeliveryAttempt, {
      deliveryId,
      ok,
      statusCode,
      error,
      responseSnippet,
      latencyMs: Math.max(1, Date.now() - started),
    });
  },
});
